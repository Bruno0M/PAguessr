import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { AVATAR_COUNT, NICK_PATTERN_SOURCE } from '@paguessr/shared';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { hashSecret, verifySecret } from '../auth/crypto.js';
import { containsBlockedWord, normalizeNick } from '../auth/nickname.js';
import { generateRecoveryCode, normalizeRecoveryCode } from '../auth/recoveryCode.js';
import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  createSession,
  deleteAllSessionsForUser,
  deleteSessionByToken,
  getSessionUser,
  setSessionCookie,
} from '../auth/session.js';

const PASSWORD_MIN_LENGTH = 6;
const PASSWORD_MAX_LENGTH = 72;

// Rotas que verificam uma credencial (senha ou código de recuperação) contra
// um valor já existente precisam de limite de tentativas — sem isso, um
// ataque de força bruta pode testar senhas/códigos sem restrição (apontado
// pelo CodeQL). Ajustável por env pra não travar a suíte de testes, que bate
// nessas rotas várias vezes seguidas a partir do mesmo IP (ver .env.test).
const AUTH_RATE_LIMIT = {
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 10),
  timeWindow: '1 minute',
};

const PUBLIC_USER_COLUMNS = {
  id: users.id,
  nick: users.nick,
  avatarId: users.avatar_id,
};

function toPublicUser(user: { id: string; nick: string; avatar_id: number }) {
  return { id: user.id, nick: user.nick, avatarId: user.avatar_id };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === '23505'
  );
}

const registerBodySchema = {
  type: 'object',
  required: ['nick', 'password', 'avatarId'],
  properties: {
    nick: { type: 'string', pattern: NICK_PATTERN_SOURCE },
    password: { type: 'string', minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH },
    avatarId: { type: 'integer', minimum: 1, maximum: AVATAR_COUNT },
  },
} as const;

const loginBodySchema = {
  type: 'object',
  required: ['nick', 'password'],
  properties: {
    nick: { type: 'string' },
    password: { type: 'string' },
  },
} as const;

const recoverPasswordBodySchema = {
  type: 'object',
  required: ['nick', 'recoveryCode', 'newPassword'],
  properties: {
    nick: { type: 'string' },
    recoveryCode: { type: 'string' },
    newPassword: {
      type: 'string',
      minLength: PASSWORD_MIN_LENGTH,
      maxLength: PASSWORD_MAX_LENGTH,
    },
  },
} as const;

export const authRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post('/auth/register', { schema: { body: registerBodySchema } }, async (request, reply) => {
    const { nick, password, avatarId } = request.body as {
      nick: string;
      password: string;
      avatarId: number;
    };

    if (containsBlockedWord(nick)) {
      return reply.status(400).send({ error: 'Esse nick não é permitido' });
    }

    const nickNormalizado = normalizeNick(nick);

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.nick_normalizado, nickNormalizado));
    if (existing) {
      return reply.status(409).send({ error: 'Esse nick já está em uso' });
    }

    const passwordHash = await hashSecret(password);
    const recoveryCode = generateRecoveryCode();
    const recoveryCodeHash = await hashSecret(normalizeRecoveryCode(recoveryCode));

    let created;
    try {
      [created] = await db
        .insert(users)
        .values({
          nick,
          nick_normalizado: nickNormalizado,
          password_hash: passwordHash,
          recovery_code_hash: recoveryCodeHash,
          avatar_id: avatarId,
        })
        .returning(PUBLIC_USER_COLUMNS);
    } catch (err) {
      if (isUniqueViolation(err)) {
        return reply.status(409).send({ error: 'Esse nick já está em uso' });
      }
      throw err;
    }

    const { token, expiresAt } = await createSession(created.id);
    setSessionCookie(reply, request, token, expiresAt);

    return reply.status(201).send({ user: created, recoveryCode });
  });

  app.post(
    '/auth/login',
    { schema: { body: loginBodySchema }, config: { rateLimit: AUTH_RATE_LIMIT } },
    async (request, reply) => {
      const { nick, password } = request.body as { nick: string; password: string };
      const genericError = { error: 'Nick ou senha incorretos' };

      const nickNormalizado = normalizeNick(nick);
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.nick_normalizado, nickNormalizado));

      if (!user) {
        return reply.status(401).send(genericError);
      }

      const senhaValida = await verifySecret(password, user.password_hash);
      if (!senhaValida) {
        return reply.status(401).send(genericError);
      }

      const { token, expiresAt } = await createSession(user.id);
      setSessionCookie(reply, request, token, expiresAt);

      return reply.send({ user: toPublicUser(user) });
    }
  );

  app.post('/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE_NAME];
    if (token) {
      await deleteSessionByToken(token);
    }
    clearSessionCookie(reply, request);
    return reply.send({ ok: true });
  });

  app.get('/auth/me', async (request, reply) => {
    const user = await getSessionUser(request);
    return reply.send({ user });
  });

  app.post(
    '/auth/recover-password',
    {
      schema: { body: recoverPasswordBodySchema },
      config: { rateLimit: AUTH_RATE_LIMIT },
    },
    async (request, reply) => {
      const { nick, recoveryCode, newPassword } = request.body as {
        nick: string;
        recoveryCode: string;
        newPassword: string;
      };
      const genericError = { error: 'Nick ou código de recuperação inválidos' };

      const nickNormalizado = normalizeNick(nick);
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.nick_normalizado, nickNormalizado));

      if (!user) {
        return reply.status(400).send(genericError);
      }

      const codigoValido = await verifySecret(
        normalizeRecoveryCode(recoveryCode),
        user.recovery_code_hash
      );
      if (!codigoValido) {
        return reply.status(400).send(genericError);
      }

      const newPasswordHash = await hashSecret(newPassword);
      await db.update(users).set({ password_hash: newPasswordHash }).where(eq(users.id, user.id));
      await deleteAllSessionsForUser(user.id);

      const { token, expiresAt } = await createSession(user.id);
      setSessionCookie(reply, request, token, expiresAt);

      return reply.send({ user: toPublicUser(user) });
    }
  );
};
