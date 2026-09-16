import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { resetTestDatabase } from '../test/fixtures.js';
import { extractSessionCookie, registerUser } from '../test/authHelpers.js';

describe('Admin Routes Integration', () => {
  const app = buildApp();
  const origAdminNicks = process.env.ADMIN_NICKS;

  beforeAll(async () => {
    process.env.LOG_LEVEL = 'silent';
    process.env.ADMIN_NICKS = 'chefe,bruno';
    await resetTestDatabase();
  });

  afterAll(async () => {
    process.env.ADMIN_NICKS = origAdminNicks;
    await app.close();
  });

  it('GET /api/admin/locations sem sessão retorna 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/locations',
    });

    expect(res.statusCode).toBe(401);
  });

  it('GET /api/admin/locations com usuário não admin retorna 403', async () => {
    const reg = await registerUser(app, { nick: 'comum' });
    const cookie = extractSessionCookie(reg.headers['set-cookie']);

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/locations',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('error');
  });

  it('GET /api/admin/locations com usuário admin retorna 200 com todas as locations', async () => {
    const reg = await registerUser(app, { nick: 'chefe' });
    const cookie = extractSessionCookie(reg.headers['set-cookie']);

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/locations',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);

    const first = data[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('lat');
    expect(first).toHaveProperty('lng');
    expect(first).toHaveProperty('source');
    expect(first).toHaveProperty('captured_at');
    expect(first).toHaveProperty('pano_id');
  });

  it('GET /admin/locations (sem prefixo) também responde para admin', async () => {
    const reg = await registerUser(app, { nick: 'bruno' });
    const cookie = extractSessionCookie(reg.headers['set-cookie']);

    const res = await app.inject({
      method: 'GET',
      url: '/admin/locations',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(Array.isArray(data)).toBe(true);
  });
});
