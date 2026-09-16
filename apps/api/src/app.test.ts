import { beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

describe('API App', () => {
  beforeAll(() => {
    process.env.LOG_LEVEL = 'silent';
  });
  it('responde na rota /health com status esperado', async () => {
    const app = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect([200, 503]).toContain(response.statusCode);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('database');
    await app.close();
  });

  it('responde também na rota /api/health', async () => {
    const app = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect([200, 503]).toContain(response.statusCode);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('database');
    await app.close();
  });

  it('retorna erro ao receber um corpo JSON malformado', async () => {
    const app = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/games',
      headers: { 'content-type': 'application/json' },
      payload: '{ isto não é json',
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    await app.close();
  });

  it('responde na rota pública /api/config com googleMapsBrowserKey', async () => {
    process.env.GOOGLE_MAPS_BROWSER_KEY = 'test-browser-key';
    const app = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/config',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toEqual({ googleMapsBrowserKey: 'test-browser-key' });
    await app.close();
    delete process.env.GOOGLE_MAPS_BROWSER_KEY;
  });

  it('responde na rota pública /config com googleMapsBrowserKey vazio por padrão', async () => {
    delete process.env.GOOGLE_MAPS_BROWSER_KEY;
    const app = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/config',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toEqual({ googleMapsBrowserKey: '' });
    await app.close();
  });
});
