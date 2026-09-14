import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildApp } from '../app.js';
import { resetTestDatabase } from '../test/fixtures.js';
import { extractSessionCookie, registerUser } from '../test/authHelpers.js';
import { db } from '../db/index.js';
import { locations, rounds } from '../db/schema.js';

async function locationIdsOf(gameId: string): Promise<number[]> {
  const gameRounds = await db.select().from(rounds).where(eq(rounds.game_id, gameId));
  return gameRounds.map((r) => r.location_id);
}

async function loginNewUser(app: ReturnType<typeof buildApp>, nick: string): Promise<string> {
  const res = await registerUser(app, { nick });
  return extractSessionCookie(res.headers['set-cookie']);
}

async function createAuthenticatedGame(app: ReturnType<typeof buildApp>, cookie: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/games',
    headers: { cookie },
  });
  return JSON.parse(res.body);
}

describe('Game Routes Integration', () => {
  const app = buildApp();
  let authCookie: string;

  beforeAll(async () => {
    process.env.LOG_LEVEL = 'silent';
    await resetTestDatabase();
    authCookie = await loginNewUser(app, 'jogadorpadrao');
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/games sem sessão retorna 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/games' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/games cria nova partida com 5 rodadas, sem coordenadas, só a 1ª com cronômetro ativo', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/games',
      headers: { cookie: authCookie },
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
    expect(data.rounds[0].startedAt).toEqual(expect.any(String));
    for (const r of data.rounds.slice(1)) {
      expect(r.startedAt).toBeNull();
    }
  });

  it('POST /api/games aceita header application/json sem corpo', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/games',
      headers: {
        'content-type': 'application/json',
        cookie: authCookie,
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
      const game = await createAuthenticatedGame(app, authCookie);
      const roundId = game.rounds[0].id;

      const imgRes = await app.inject({
        method: 'GET',
        url: `/api/rounds/${roundId}/image`,
        headers: { cookie: authCookie },
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

  it('POST /api/rounds/:id/guess calcula distância, pontos, ativa a próxima rodada e rejeita segundo palpite', async () => {
    const game = await createAuthenticatedGame(app, authCookie);
    const roundId = game.rounds[0].id;

    const guessRes = await app.inject({
      method: 'POST',
      url: `/api/rounds/${roundId}/guess`,
      headers: { cookie: authCookie },
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
    expect(guessData.nextRound).toEqual({
      id: game.rounds[1].id,
      started_at: expect.any(String),
      startedAt: expect.any(String),
    });

    const secondGuess = await app.inject({
      method: 'POST',
      url: `/api/rounds/${roundId}/guess`,
      headers: { cookie: authCookie },
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
      headers: { cookie: authCookie },
      payload: {
        lat: 200,
        lng: -38.2,
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('POST /api/rounds/:id/guess rejeita corpo com só lat ou só lng', async () => {
    const game = await createAuthenticatedGame(app, authCookie);

    const res = await app.inject({
      method: 'POST',
      url: `/api/rounds/${game.rounds[0].id}/guess`,
      headers: { cookie: authCookie },
      payload: { lat: -9.4064 },
    });

    expect(res.statusCode).toBe(400);
  });

  it('POST /api/rounds/:id/guess sem sessão retorna 401', async () => {
    const game = await createAuthenticatedGame(app, authCookie);

    const res = await app.inject({
      method: 'POST',
      url: `/api/rounds/${game.rounds[0].id}/guess`,
      payload: { lat: -9.4064, lng: -38.2147 },
    });

    expect(res.statusCode).toBe(401);
  });

  it('rodada de outro jogador não é acessível: 404 em guess, imagem e resumo da partida', async () => {
    const owner = await createAuthenticatedGame(app, authCookie);
    const intruderCookie = await loginNewUser(app, 'jogadorintruso');

    const guessRes = await app.inject({
      method: 'POST',
      url: `/api/rounds/${owner.rounds[0].id}/guess`,
      headers: { cookie: intruderCookie },
      payload: { lat: -9.4064, lng: -38.2147 },
    });
    expect(guessRes.statusCode).toBe(404);

    const imageRes = await app.inject({
      method: 'GET',
      url: `/api/rounds/${owner.rounds[0].id}/image`,
      headers: { cookie: intruderCookie },
    });
    expect(imageRes.statusCode).toBe(404);

    const summaryRes = await app.inject({
      method: 'GET',
      url: `/api/games/${owner.id}`,
      headers: { cookie: intruderCookie },
    });
    expect(summaryRes.statusCode).toBe(404);
  });

  it('POST /api/rounds/:id/guess numa rodada ainda não iniciada retorna 409', async () => {
    const game = await createAuthenticatedGame(app, authCookie);
    const notStartedRoundId = game.rounds[1].id;

    const res = await app.inject({
      method: 'POST',
      url: `/api/rounds/${notStartedRoundId}/guess`,
      headers: { cookie: authCookie },
      payload: { lat: -9.4064, lng: -38.2147 },
    });

    expect(res.statusCode).toBe(409);
  });

  it('POST /api/rounds/:id/guess sem coords conta como timeout: 0 pontos, sem distância, local revelado', async () => {
    const game = await createAuthenticatedGame(app, authCookie);

    const res = await app.inject({
      method: 'POST',
      url: `/api/rounds/${game.rounds[0].id}/guess`,
      headers: { cookie: authCookie },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.pontos).toBe(0);
    expect(data.distancia).toBeNull();
    expect(data.location).toHaveProperty('lat');
    expect(data.nextRound.id).toBe(game.rounds[1].id);
  });

  it('POST /api/rounds/:id/guess com coords mas fora do prazo pontua 0, ainda registrando a distância', async () => {
    const game = await createAuthenticatedGame(app, authCookie);
    const roundId = game.rounds[0].id;

    await db
      .update(rounds)
      .set({ started_at: new Date(Date.now() - 61_000) })
      .where(eq(rounds.id, roundId));

    const res = await app.inject({
      method: 'POST',
      url: `/api/rounds/${roundId}/guess`,
      headers: { cookie: authCookie },
      payload: { lat: -9.4064, lng: -38.2147 },
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.pontos).toBe(0);
    expect(data.distancia).not.toBeNull();
  });

  it('dois palpites concorrentes na mesma rodada: só um vale, o outro é rejeitado', async () => {
    const game = await createAuthenticatedGame(app, authCookie);
    const roundId = game.rounds[0].id;

    const [first, second] = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/rounds/${roundId}/guess`,
        headers: { cookie: authCookie },
        payload: { lat: -9.4064, lng: -38.2147 },
      }),
      app.inject({
        method: 'POST',
        url: `/api/rounds/${roundId}/guess`,
        headers: { cookie: authCookie },
        payload: { lat: -9.4, lng: -38.2 },
      }),
    ]);

    const statuses = [first.statusCode, second.statusCode].sort();
    expect(statuses).toEqual([200, 409]);
  });

  it('GET /api/games/:id retorna resumo completo da partida', async () => {
    const game = await createAuthenticatedGame(app, authCookie);

    await app.inject({
      method: 'POST',
      url: `/api/rounds/${game.rounds[0].id}/guess`,
      headers: { cookie: authCookie },
      payload: {
        lat: -9.4064,
        lng: -38.2147,
      },
    });

    const summaryRes = await app.inject({
      method: 'GET',
      url: `/api/games/${game.id}`,
      headers: { cookie: authCookie },
    });

    expect(summaryRes.statusCode).toBe(200);
    const summary = JSON.parse(summaryRes.body);
    expect(summary.id).toBe(game.id);
    expect(summary.rounds).toHaveLength(5);
    expect(summary.rounds[0].distancia).not.toBeNull();
    expect(summary.rounds[0].location).toHaveProperty('lat');
    expect(summary.rounds[1].distancia).toBeNull();
    expect(summary.rounds[1].location).toBeUndefined();
    expect(summary.rounds[1].startedAt).toEqual(expect.any(String));
  });

  it('POST /api/games evita repetir locais das últimas partidas do mesmo jogador quando o pool permite', async () => {
    // Com pool grande o bastante, o sorteio deve excluir os locais das
    // últimas partidas do jogador em vez de só embaralhar tudo de novo.
    await db.insert(locations).values(
      Array.from({ length: 10 }, (_, i) => ({
        pano_id: `test-no-repeat-${i}`,
        lat: -9.4 + i * 0.001,
        lng: -38.2 + i * 0.001,
        source: 'test',
      }))
    );

    const cookie = await loginNewUser(app, 'semrepeticao');

    const firstGame = await createAuthenticatedGame(app, cookie);
    const secondGame = await createAuthenticatedGame(app, cookie);

    const firstLocationIds = await locationIdsOf(firstGame.id);
    const secondLocationIds = await locationIdsOf(secondGame.id);

    const overlap = secondLocationIds.filter((id) => firstLocationIds.includes(id));
    expect(overlap).toHaveLength(0);
  });
});
