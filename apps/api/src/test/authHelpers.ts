import { buildApp } from '../app.js';

export function extractSessionCookie(setCookieHeader: string | string[] | undefined): string {
  const headers = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : setCookieHeader
      ? [setCookieHeader]
      : [];
  const sessionHeader = headers.find((h) => h.startsWith('pag_session='));
  if (!sessionHeader) {
    throw new Error('Nenhum cookie pag_session encontrado na resposta');
  }
  return sessionHeader.split(';')[0];
}

export async function registerUser(
  app: ReturnType<typeof buildApp>,
  overrides: Partial<{ nick: string; password: string; avatarId: number }> = {}
) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      nick: overrides.nick ?? 'usuarioteste',
      password: overrides.password ?? 'senha123',
      avatarId: overrides.avatarId ?? 1,
    },
  });
  return res;
}
