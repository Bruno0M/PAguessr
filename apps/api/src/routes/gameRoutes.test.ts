import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { resetTestDatabase } from '../test/fixtures.js';

describe('Game Routes Integration', () => {
  const app = buildApp();

  beforeAll(async () => {
    process.env.LOG_LEVEL = 'silent';
    await resetTestDatabase();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/games cria nova partida com 5 rodadas sem expor coordenadas', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/games',
    });

    expect(res.statusCode).toBe(201);
    const data = JSON.parse(res.body);
    expect(data).toHaveProperty('id');
    expect(data.rounds).toHaveLength(5);
    for (const r of data.rounds) {
      expect(r).toHaveProperty('id');
      expect(r).toHaveProperty('ordem');
      expect(r).not.toHaveProperty('lat');
      expect(r).not.toHaveProperty('lng');
      expect(r).not.toHaveProperty('location');
      expect(r).not.toHaveProperty('pano_id');
    }
  });

  it('POST /api/games aceita header application/json sem corpo', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/games',
      headers: {
        'content-type': 'application/json',
      },
    });

    expect(res.statusCode).toBe(201);
  });

  it('GET /api/rounds/:id/image retorna imagem placeholder quando sem chave do Google', async () => {
    const origKey = process.env.GOOGLE_STREET_VIEW_API_KEY;
    const origMapsKey = process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.GOOGLE_STREET_VIEW_API_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY;

    try {
      const gameRes = await app.inject({
        method: 'POST',
        url: '/api/games',
      });
      const game = JSON.parse(gameRes.body);
      const roundId = game.rounds[0].id;

      const imgRes = await app.inject({
        method: 'GET',
        url: `/api/rounds/${roundId}/image`,
      });

      expect(imgRes.statusCode).toBe(200);
      expect(imgRes.headers['content-type']).toContain('image/svg+xml');
      expect(imgRes.body).toContain('<svg');
      expect(imgRes.body).toContain('PAguessr');
    } finally {
      if (origKey !== undefined) process.env.GOOGLE_STREET_VIEW_API_KEY = origKey;
      if (origMapsKey !== undefined) process.env.GOOGLE_MAPS_API_KEY = origMapsKey;
    }
  });

  it('POST /api/rounds/:id/guess calcula distância, pontos e rejeita segundo palpite', async () => {
    const gameRes = await app.inject({
      method: 'POST',
      url: '/api/games',
    });
    const game = JSON.parse(gameRes.body);
    const roundId = game.rounds[0].id;

    const guessRes = await app.inject({
      method: 'POST',
      url: `/api/rounds/${roundId}/guess`,
      payload: {
        lat: -9.4064,
        lng: -38.2147,
      },
    });

    expect(guessRes.statusCode).toBe(200);
    const guessData = JSON.parse(guessRes.body);
    expect(guessData).toHaveProperty('distancia');
    expect(guessData).toHaveProperty('pontos');
    expect(guessData.pontos).toBeGreaterThanOrEqual(0);
    expect(guessData.pontos).toBeLessThanOrEqual(5000);
    expect(guessData).toHaveProperty('location');
    expect(guessData.location).toHaveProperty('lat');
    expect(guessData.location).toHaveProperty('lng');

    const secondGuess = await app.inject({
      method: 'POST',
      url: `/api/rounds/${roundId}/guess`,
      payload: {
        lat: -9.4,
        lng: -38.2,
      },
    });
    expect(secondGuess.statusCode).toBe(409);
  });

  it('POST /api/rounds/:id/guess valida esquema de entrada', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/rounds/1/guess',
      payload: {
        lat: 200,
        lng: -38.2,
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('GET /api/games/:id retorna resumo completo da partida', async () => {
    const gameRes = await app.inject({
      method: 'POST',
      url: '/api/games',
    });
    const game = JSON.parse(gameRes.body);

    await app.inject({
      method: 'POST',
      url: `/api/rounds/${game.rounds[0].id}/guess`,
      payload: {
        lat: -9.4064,
        lng: -38.2147,
      },
    });

    const summaryRes = await app.inject({
      method: 'GET',
      url: `/api/games/${game.id}`,
    });

    expect(summaryRes.statusCode).toBe(200);
    const summary = JSON.parse(summaryRes.body);
    expect(summary.id).toBe(game.id);
    expect(summary.rounds).toHaveLength(5);
    expect(summary.rounds[0].distancia).not.toBeNull();
    expect(summary.rounds[0].location).toHaveProperty('lat');
    expect(summary.rounds[1].distancia).toBeNull();
    expect(summary.rounds[1].location).toBeUndefined();
  });
});
