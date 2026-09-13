export interface PublicUser {
  id: string;
  nick: string;
  avatarId: number;
}

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const details = await res.json().catch(() => null);
    throw new Error(
      typeof details?.error === 'string' ? details.error : 'Não foi possível completar a ação.'
    );
  }

  return res.json();
}

export async function register(
  nick: string,
  password: string,
  avatarId: number
): Promise<{ user: PublicUser; recoveryCode: string }> {
  return postJson('/api/auth/register', { nick, password, avatarId });
}

export async function login(nick: string, password: string): Promise<{ user: PublicUser }> {
  return postJson('/api/auth/login', { nick, password });
}

export async function logout(): Promise<void> {
  await postJson('/api/auth/logout', {});
}

export async function me(): Promise<{ user: PublicUser | null }> {
  const res = await fetch('/api/auth/me', { credentials: 'include' });
  if (!res.ok) {
    return { user: null };
  }
  return res.json();
}

export async function recoverPassword(
  nick: string,
  recoveryCode: string,
  newPassword: string
): Promise<{ user: PublicUser }> {
  return postJson('/api/auth/recover-password', { nick, recoveryCode, newPassword });
}
