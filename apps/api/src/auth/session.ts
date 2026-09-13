import { FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sessions, users } from '../db/schema.js';
import { generateSessionToken } from './crypto.js';

export const SESSION_COOKIE_NAME = 'pag_session';
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export interface PublicUser {
  id: string;
  nick: string;
  avatarId: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: PublicUser | null;
  }
}

const PUBLIC_USER_COLUMNS = {
  id: users.id,
  nick: users.nick,
  avatarId: users.avatar_id,
};

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await db.insert(sessions).values({ id: token, user_id: userId, expires_at: expiresAt });
  return { token, expiresAt };
}

function cookieOptions(request: FastifyRequest) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: request.protocol === 'https',
    path: '/',
  };
}

export function setSessionCookie(
  reply: FastifyReply,
  request: FastifyRequest,
  token: string,
  expiresAt: Date
): void {
  reply.setCookie(SESSION_COOKIE_NAME, token, { ...cookieOptions(request), expires: expiresAt });
}

export function clearSessionCookie(reply: FastifyReply, request: FastifyRequest): void {
  reply.clearCookie(SESSION_COOKIE_NAME, cookieOptions(request));
}

export async function getUserBySessionToken(token: string): Promise<PublicUser | null> {
  const [session] = await db.select().from(sessions).where(eq(sessions.id, token));
  if (!session) return null;

  if (session.expires_at.getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, token));
    return null;
  }

  const [user] = await db
    .select(PUBLIC_USER_COLUMNS)
    .from(users)
    .where(eq(users.id, session.user_id));
  return user ?? null;
}

export async function getSessionUser(request: FastifyRequest): Promise<PublicUser | null> {
  const token = request.cookies[SESSION_COOKIE_NAME];
  if (!token) return null;
  return getUserBySessionToken(token);
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = await getSessionUser(request);
  if (!user) {
    reply.status(401).send({ error: 'Sessão inválida ou expirada' });
    return;
  }
  request.authUser = user;
}

export async function deleteSessionByToken(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, token));
}

export async function deleteAllSessionsForUser(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.user_id, userId));
}
