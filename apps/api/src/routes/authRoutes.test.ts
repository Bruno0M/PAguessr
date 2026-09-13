import { beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { resetTestDatabase } from '../test/fixtures.js';
import { extractSessionCookie, registerUser } from '../test/authHelpers.js';

describe('Auth Routes Integration', () => {
  const app = buildApp();

  beforeAll(async () => {
    process.env.LOG_LEVEL = 'silent';
    await resetTestDatabase();
  });

  describe('POST /api/auth/register', () => {
    it('cria uma conta, retorna o código de recuperação uma vez e seta o cookie de sessão', async () => {
      const res = await registerUser(app, { nick: 'novoJogador' });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.user).toEqual({ id: expect.any(String), nick: 'novoJogador', avatarId: 1 });
      expect(body.recoveryCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect(body.user).not.toHaveProperty('password_hash');
      expect(body.user).not.toHaveProperty('recovery_code_hash');

      const cookie = extractSessionCookie(res.headers['set-cookie']);
      expect(cookie).toContain('pag_session=');
      const rawSetCookie = res.headers['set-cookie'];
      const setCookieText = Array.isArray(rawSetCookie) ? rawSetCookie.join(';') : rawSetCookie;
      expect(setCookieText).toContain('HttpOnly');
    });

    it('rejeita nick fora do formato permitido', async () => {
      const res = await registerUser(app, { nick: 'ab' });
      expect(res.statusCode).toBe(400);
    });

    it('rejeita senha muito curta', async () => {
      const res = await registerUser(app, { nick: 'senhacurta', password: '123' });
      expect(res.statusCode).toBe(400);
    });

    it('rejeita avatarId fora do intervalo 1-8', async () => {
      const res = await registerUser(app, { nick: 'avatarinvalido', avatarId: 9 });
      expect(res.statusCode).toBe(400);
    });

    it('rejeita nick com palavrão bloqueado', async () => {
      const res = await registerUser(app, { nick: 'admin123' });
      expect(res.statusCode).toBe(400);
    });

    it('rejeita nick duplicado, mesmo com capitalização diferente', async () => {
      await registerUser(app, { nick: 'duplicado' });
      const res = await registerUser(app, { nick: 'DUPLICADO' });
      expect(res.statusCode).toBe(409);
    });
  });

  describe('POST /api/auth/login', () => {
    it('faz login com sucesso e seta cookie de sessão', async () => {
      await registerUser(app, { nick: 'loginok', password: 'senhaCerta1' });

      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { nick: 'loginok', password: 'senhaCerta1' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.user.nick).toBe('loginok');
      expect(extractSessionCookie(res.headers['set-cookie'])).toContain('pag_session=');
    });

    it('aceita nick com capitalização diferente da usada no cadastro', async () => {
      await registerUser(app, { nick: 'CaseTeste', password: 'senhaCerta1' });

      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { nick: 'caseteste', password: 'senhaCerta1' },
      });

      expect(res.statusCode).toBe(200);
    });

    it('rejeita senha errada com mensagem genérica', async () => {
      await registerUser(app, { nick: 'senhaerrada', password: 'senhaCerta1' });

      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { nick: 'senhaerrada', password: 'senhaErrada' },
      });

      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error).toBe('Nick ou senha incorretos');
    });

    it('rejeita nick inexistente com a mesma mensagem genérica', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { nick: 'naoexiste', password: 'qualquercoisa' },
      });

      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error).toBe('Nick ou senha incorretos');
    });
  });

  describe('GET /api/auth/me', () => {
    it('retorna user: null quando não há cookie de sessão', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ user: null });
    });

    it('retorna os dados do usuário quando o cookie de sessão é válido', async () => {
      const registerRes = await registerUser(app, { nick: 'sessaovalida' });
      const cookie = extractSessionCookie(registerRes.headers['set-cookie']);

      const res = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).user).toEqual({
        id: expect.any(String),
        nick: 'sessaovalida',
        avatarId: 1,
      });
    });

    it('retorna user: null para um cookie inválido/aleatório', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { cookie: 'pag_session=token-invalido-qualquer' },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ user: null });
    });
  });

  describe('POST /api/auth/logout', () => {
    it('invalida a sessão: /auth/me deixa de reconhecer o cookie depois do logout', async () => {
      const registerRes = await registerUser(app, { nick: 'logoutteste' });
      const cookie = extractSessionCookie(registerRes.headers['set-cookie']);

      const logoutRes = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: { cookie },
      });
      expect(logoutRes.statusCode).toBe(200);
      expect(JSON.parse(logoutRes.body)).toEqual({ ok: true });

      const meRes = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { cookie },
      });
      expect(JSON.parse(meRes.body)).toEqual({ user: null });
    });

    it('não quebra ao fazer logout sem estar logado', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/auth/logout' });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('POST /api/auth/recover-password', () => {
    it('troca a senha com o código correto, loga automaticamente e invalida sessões antigas', async () => {
      const registerRes = await registerUser(app, {
        nick: 'recuperaveltest',
        password: 'senhaAntiga1',
      });
      const oldCookie = extractSessionCookie(registerRes.headers['set-cookie']);
      const { recoveryCode } = JSON.parse(registerRes.body);

      const recoverRes = await app.inject({
        method: 'POST',
        url: '/api/auth/recover-password',
        payload: {
          nick: 'recuperaveltest',
          recoveryCode,
          newPassword: 'senhaNova123',
        },
      });

      expect(recoverRes.statusCode).toBe(200);
      const newCookie = extractSessionCookie(recoverRes.headers['set-cookie']);

      const oldSessionCheck = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { cookie: oldCookie },
      });
      expect(JSON.parse(oldSessionCheck.body)).toEqual({ user: null });

      const newSessionCheck = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { cookie: newCookie },
      });
      expect(JSON.parse(newSessionCheck.body).user.nick).toBe('recuperaveltest');

      const oldPasswordLogin = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { nick: 'recuperaveltest', password: 'senhaAntiga1' },
      });
      expect(oldPasswordLogin.statusCode).toBe(401);

      const newPasswordLogin = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { nick: 'recuperaveltest', password: 'senhaNova123' },
      });
      expect(newPasswordLogin.statusCode).toBe(200);
    });

    it('rejeita código de recuperação incorreto com mensagem genérica', async () => {
      await registerUser(app, { nick: 'codigoerrado', password: 'senha123' });

      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/recover-password',
        payload: {
          nick: 'codigoerrado',
          recoveryCode: 'ZZZZ-ZZZZ-ZZZZ',
          newPassword: 'outraSenha1',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toBe('Nick ou código de recuperação inválidos');
    });

    it('rejeita nick inexistente com a mesma mensagem genérica', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/recover-password',
        payload: {
          nick: 'naoexisteusuario',
          recoveryCode: 'ZZZZ-ZZZZ-ZZZZ',
          newPassword: 'outraSenha1',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toBe('Nick ou código de recuperação inválidos');
    });
  });
});
