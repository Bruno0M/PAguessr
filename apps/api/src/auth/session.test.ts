import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sessions, users } from '../db/schema.js';
import { resetTestDatabase } from '../test/fixtures.js';
import {
  createSession,
  deleteAllSessionsForUser,
  deleteSessionByToken,
  getUserBySessionToken,
} from './session.js';

async function createTestUser(nick: string) {
  const [user] = await db
    .insert(users)
    .values({
      nick,
      nick_normalizado: nick.toLowerCase(),
      password_hash: 'scrypt:16384:8:1:aa:bb',
      recovery_code_hash: 'scrypt:16384:8:1:aa:bb',
      avatar_id: 1,
    })
    .returning();
  return user;
}

describe('auth/session', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  });

  it('cria uma sessão válida e resolve o usuário público a partir do token', async () => {
    const user = await createTestUser('sessuser1');
    const { token, expiresAt } = await createSession(user.id);

    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

    const resolved = await getUserBySessionToken(token);
    expect(resolved).toEqual({ id: user.id, nick: user.nick, avatarId: user.avatar_id });
  });

  it('retorna null para um token desconhecido', async () => {
    const resolved = await getUserBySessionToken('token-que-nao-existe');
    expect(resolved).toBeNull();
  });

  it('retorna null e remove a sessão quando ela já expirou', async () => {
    const user = await createTestUser('sessuser2');
    const expiredToken = 'expired-token-123';
    await db.insert(sessions).values({
      id: expiredToken,
      user_id: user.id,
      expires_at: new Date(Date.now() - 1000),
    });

    const resolved = await getUserBySessionToken(expiredToken);
    expect(resolved).toBeNull();

    const [remaining] = await db.select().from(sessions).where(eq(sessions.id, expiredToken));
    expect(remaining).toBeUndefined();
  });

  it('deleteSessionByToken invalida só a sessão indicada', async () => {
    const user = await createTestUser('sessuser3');
    const { token } = await createSession(user.id);

    await deleteSessionByToken(token);

    expect(await getUserBySessionToken(token)).toBeNull();
  });

  it('deleteAllSessionsForUser remove todas as sessões do usuário, sem afetar outros', async () => {
    const userA = await createTestUser('sessuser4');
    const userB = await createTestUser('sessuser5');
    const sessionA1 = await createSession(userA.id);
    const sessionA2 = await createSession(userA.id);
    const sessionB = await createSession(userB.id);

    await deleteAllSessionsForUser(userA.id);

    expect(await getUserBySessionToken(sessionA1.token)).toBeNull();
    expect(await getUserBySessionToken(sessionA2.token)).toBeNull();
    expect(await getUserBySessionToken(sessionB.token)).not.toBeNull();
  });
});
