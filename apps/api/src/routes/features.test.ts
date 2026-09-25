import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { resetTestDatabase } from '../test/fixtures.js';
import { extractSessionCookie, registerUser } from '../test/authHelpers.js';

describe('Feature Flags and Route Guards', () => {
  const app = buildApp();
  const origMode = process.env.CHAMPIONSHIPS_MODE;
  const origAdmins = process.env.ADMIN_NICKS;

  let commonCookie: string;
  let adminCookie: string;

  beforeAll(async () => {
    process.env.LOG_LEVEL = 'silent';
    process.env.ADMIN_NICKS = 'chefe';
    await resetTestDatabase();

    const commonReg = await registerUser(app, { nick: 'player_common' });
    commonCookie = extractSessionCookie(commonReg.headers['set-cookie']);

    const adminReg = await registerUser(app, { nick: 'chefe' });
    adminCookie = extractSessionCookie(adminReg.headers['set-cookie']);
  });

  afterAll(async () => {
    process.env.CHAMPIONSHIPS_MODE = origMode;
    process.env.ADMIN_NICKS = origAdmins;
    await app.close();
  });

  describe('GET /features e GET /api/features nos três modos', () => {
    describe('modo off', () => {
      beforeEach(() => {
        process.env.CHAMPIONSHIPS_MODE = 'off';
      });

      it('sem sessão retorna { championships: false }', async () => {
        const res = await app.inject({ method: 'GET', url: '/features' });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body)).toEqual({ championships: false });

        const apiRes = await app.inject({ method: 'GET', url: '/api/features' });
        expect(apiRes.statusCode).toBe(200);
        expect(JSON.parse(apiRes.body)).toEqual({ championships: false });
      });

      it('com usuário comum retorna { championships: false }', async () => {
        const res = await app.inject({
          method: 'GET',
          url: '/api/features',
          headers: { cookie: commonCookie },
        });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body)).toEqual({ championships: false });
      });

      it('com admin retorna { championships: false }', async () => {
        const res = await app.inject({
          method: 'GET',
          url: '/api/features',
          headers: { cookie: adminCookie },
        });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body)).toEqual({ championships: false });
      });
    });

    describe('modo admin', () => {
      beforeEach(() => {
        process.env.CHAMPIONSHIPS_MODE = 'admin';
      });

      it('sem sessão retorna { championships: false }', async () => {
        const res = await app.inject({ method: 'GET', url: '/api/features' });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body)).toEqual({ championships: false });
      });

      it('com usuário comum retorna { championships: false }', async () => {
        const res = await app.inject({
          method: 'GET',
          url: '/api/features',
          headers: { cookie: commonCookie },
        });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body)).toEqual({ championships: false });
      });

      it('com admin retorna { championships: true }', async () => {
        const res = await app.inject({
          method: 'GET',
          url: '/api/features',
          headers: { cookie: adminCookie },
        });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body)).toEqual({ championships: true });
      });
    });

    describe('modo public', () => {
      beforeEach(() => {
        process.env.CHAMPIONSHIPS_MODE = 'public';
      });

      it('sem sessão retorna { championships: true }', async () => {
        const res = await app.inject({ method: 'GET', url: '/api/features' });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body)).toEqual({ championships: true });
      });

      it('com usuário comum retorna { championships: true }', async () => {
        const res = await app.inject({
          method: 'GET',
          url: '/api/features',
          headers: { cookie: commonCookie },
        });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body)).toEqual({ championships: true });
      });

      it('com admin retorna { championships: true }', async () => {
        const res = await app.inject({
          method: 'GET',
          url: '/api/features',
          headers: { cookie: adminCookie },
        });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body)).toEqual({ championships: true });
      });
    });

    describe('modo ausente ou inválido cai em off', () => {
      it('ausente -> championships: false', async () => {
        delete process.env.CHAMPIONSHIPS_MODE;
        const res = await app.inject({
          method: 'GET',
          url: '/api/features',
          headers: { cookie: adminCookie },
        });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body)).toEqual({ championships: false });
      });

      it('inválido -> championships: false', async () => {
        process.env.CHAMPIONSHIPS_MODE = 'outro_valor';
        const res = await app.inject({
          method: 'GET',
          url: '/api/features',
          headers: { cookie: adminCookie },
        });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body)).toEqual({ championships: false });
      });
    });
  });

  describe('Guardas de rota de campeonato', () => {
    describe('modo off', () => {
      beforeEach(() => {
        process.env.CHAMPIONSHIPS_MODE = 'off';
      });

      it('404 no modo off para rotas de usuário (mesmo com admin)', async () => {
        const commonRes = await app.inject({
          method: 'GET',
          url: '/api/championships',
          headers: { cookie: commonCookie },
        });
        expect(commonRes.statusCode).toBe(404);

        const adminRes = await app.inject({
          method: 'GET',
          url: '/api/championships',
          headers: { cookie: adminCookie },
        });
        expect(adminRes.statusCode).toBe(404);

        const rankingRes = await app.inject({
          method: 'GET',
          url: '/api/championships/00000000-0000-0000-0000-000000000000/ranking',
          headers: { cookie: adminCookie },
        });
        expect(rankingRes.statusCode).toBe(404);
      });

      it('404 no modo off para rotas de admin (mesmo com admin)', async () => {
        const adminRes = await app.inject({
          method: 'GET',
          url: '/api/admin/championships',
          headers: { cookie: adminCookie },
        });
        expect(adminRes.statusCode).toBe(404);

        const commonRes = await app.inject({
          method: 'GET',
          url: '/api/admin/championships',
          headers: { cookie: commonCookie },
        });
        expect(commonRes.statusCode).toBe(404);
      });
    });

    describe('modo admin', () => {
      beforeEach(() => {
        process.env.CHAMPIONSHIPS_MODE = 'admin';
      });

      it('404 para não-admin no modo admin', async () => {
        const res = await app.inject({
          method: 'GET',
          url: '/api/championships',
          headers: { cookie: commonCookie },
        });
        expect(res.statusCode).toBe(404);

        const rankingRes = await app.inject({
          method: 'GET',
          url: '/api/championships/00000000-0000-0000-0000-000000000000/ranking',
          headers: { cookie: commonCookie },
        });
        expect(rankingRes.statusCode).toBe(404);
      });

      it('200 para admin no modo admin', async () => {
        const res = await app.inject({
          method: 'GET',
          url: '/api/championships',
          headers: { cookie: adminCookie },
        });
        expect(res.statusCode).toBe(200);

        const adminRes = await app.inject({
          method: 'GET',
          url: '/api/admin/championships',
          headers: { cookie: adminCookie },
        });
        expect(adminRes.statusCode).toBe(200);
      });
    });

    describe('modo public', () => {
      beforeEach(() => {
        process.env.CHAMPIONSHIPS_MODE = 'public';
      });

      it('200 para qualquer usuário autenticado nas rotas públicas de campeonato', async () => {
        const commonRes = await app.inject({
          method: 'GET',
          url: '/api/championships',
          headers: { cookie: commonCookie },
        });
        expect(commonRes.statusCode).toBe(200);

        const adminRes = await app.inject({
          method: 'GET',
          url: '/api/championships',
          headers: { cookie: adminCookie },
        });
        expect(adminRes.statusCode).toBe(200);
      });
    });
  });
});
