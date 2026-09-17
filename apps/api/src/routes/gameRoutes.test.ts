import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildApp } from '../app.js';
import { resetTestDatabase } from '../test/fixtures.js';
import { extractSessionCookie, registerUser } from '../test/authHelpers.js';
import { db } from '../db/index.js';
import { locations, rounds } from '../db/schema.js';
import { MAX_IMAGE_FETCHES_PER_ROUND } from './gameRoutes.js';

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
      expect(r).toHaveProperty('streetview_mode', 'static');
      expect(r).toHaveProperty('duration_seconds', 60);
      expect(r).toHaveProperty('durationSeconds', 60);
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

  // Nenhuma chamada real ao Google: a chave é falsa e o fetch global é trocado
  // por um JPEG mínimo, pra contar quantas vezes o proxy tentaria buscar.
  describe('proxy de imagem com chave do Google configurada', () => {
    let fetchSpy: MockInstance<typeof fetch>;
    const origKey = process.env.GOOGLE_STREET_VIEW_API_KEY;

    beforeEach(() => {
      process.env.GOOGLE_STREET_VIEW_API_KEY = 'chave-falsa-de-teste';
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
        async () =>
          new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
            status: 200,
            headers: { 'content-type': 'image/jpeg' },
          })
      );
    });

    afterEach(() => {
      fetchSpy.mockRestore();
      if (origKey === undefined) delete process.env.GOOGLE_STREET_VIEW_API_KEY;
      else process.env.GOOGLE_STREET_VIEW_API_KEY = origKey;
    });

    const getImage = (roundId: number) =>
      app.inject({
        method: 'GET',
        url: `/api/rounds/${roundId}/image`,
        headers: { cookie: authCookie },
      });

    it(`busca no Google no máximo ${MAX_IMAGE_FETCHES_PER_ROUND} vezes por rodada, depois só placeholder`, async () => {
      const game = await createAuthenticatedGame(app, authCookie);
      const roundId = game.rounds[0].id;

      for (let i = 0; i < MAX_IMAGE_FETCHES_PER_ROUND; i++) {
        const res = await getImage(roundId);
        expect(res.headers['content-type']).toContain('image/jpeg');
        expect(res.headers['cache-control']).toBe('private, max-age=300');
      }
      expect(fetchSpy).toHaveBeenCalledTimes(MAX_IMAGE_FETCHES_PER_ROUND);

      const extra = await getImage(roundId);
      expect(extra.headers['content-type']).toContain('image/svg+xml');
      expect(extra.headers['cache-control']).toBe('no-store');
      expect(fetchSpy).toHaveBeenCalledTimes(MAX_IMAGE_FETCHES_PER_ROUND);
    });

    it('não busca imagem de rodada ainda não iniciada', async () => {
      const game = await createAuthenticatedGame(app, authCookie);
      const res = await getImage(game.rounds[1].id);
      expect(res.headers['content-type']).toContain('image/svg+xml');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('não busca imagem de rodada já respondida', async () => {
      const game = await createAuthenticatedGame(app, authCookie);
      const roundId = game.rounds[0].id;
      await app.inject({
        method: 'POST',
        url: `/api/rounds/${roundId}/guess`,
        headers: { cookie: authCookie },
        payload: { lat: -9.4064, lng: -38.2147 },
      });

      const res = await getImage(roundId);
      expect(res.headers['content-type']).toContain('image/svg+xml');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('não busca imagem de rodada com tempo esgotado', async () => {
      const game = await createAuthenticatedGame(app, authCookie);
      const roundId = game.rounds[0].id;
      await db
        .update(rounds)
        .set({ started_at: new Date(Date.now() - 5 * 60 * 1000) })
        .where(eq(rounds.id, roundId));

      const res = await getImage(roundId);
      expect(res.headers['content-type']).toContain('image/svg+xml');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('falha do Google consome a tentativa e cai no placeholder sem cache', async () => {
      fetchSpy.mockImplementation(async () => new Response('erro', { status: 403 }));
      const game = await createAuthenticatedGame(app, authCookie);
      const roundId = game.rounds[0].id;

      const res = await getImage(roundId);
      expect(res.headers['content-type']).toContain('image/svg+xml');
      expect(res.headers['cache-control']).toBe('no-store');

      const [row] = await db.select().from(rounds).where(eq(rounds.id, roundId));
      expect(row.image_fetches).toBe(1);
    });

    it('respeita a janela do proxy (duration + 10s) para rodada de 10s', async () => {
      const game = await createAuthenticatedGame(app, authCookie);
      const roundId = game.rounds[0].id;

      await db
        .update(rounds)
        .set({ duration_seconds: 10, started_at: new Date(Date.now() - 19_000) })
        .where(eq(rounds.id, roundId));

      const resInside = await getImage(roundId);
      expect(resInside.headers['content-type']).toContain('image/jpeg');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      await db
        .update(rounds)
        .set({ started_at: new Date(Date.now() - 21_000) })
        .where(eq(rounds.id, roundId));

      fetchSpy.mockClear();
      const resOutside = await getImage(roundId);
      expect(resOutside.headers['content-type']).toContain('image/svg+xml');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('respeita a janela do proxy (duration + 10s) para rodada de 300s', async () => {
      const game = await createAuthenticatedGame(app, authCookie);
      const roundId = game.rounds[0].id;

      await db
        .update(rounds)
        .set({ duration_seconds: 300, started_at: new Date(Date.now() - 309_000) })
        .where(eq(rounds.id, roundId));

      const resInside = await getImage(roundId);
      expect(resInside.headers['content-type']).toContain('image/jpeg');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      await db
        .update(rounds)
        .set({ started_at: new Date(Date.now() - 311_000) })
        .where(eq(rounds.id, roundId));

      fetchSpy.mockClear();
      const resOutside = await getImage(roundId);
      expect(resOutside.headers['content-type']).toContain('image/svg+xml');
      expect(fetchSpy).not.toHaveBeenCalled();
    });
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

  it('isLate zera pontuação para rodada de 10s aos 11s, mas pontua aos 9s', async () => {
    const game = await createAuthenticatedGame(app, authCookie);
    const round1Id = game.rounds[0].id;
    const round2Id = game.rounds[1].id;

    // 9s em rodada de 10s: pontua
    await db
      .update(rounds)
      .set({ duration_seconds: 10, started_at: new Date(Date.now() - 9_000) })
      .where(eq(rounds.id, round1Id));

    const resValid = await app.inject({
      method: 'POST',
      url: `/api/rounds/${round1Id}/guess`,
      headers: { cookie: authCookie },
      payload: { lat: -9.4064, lng: -38.2147 },
    });
    expect(resValid.statusCode).toBe(200);
    const dataValid = JSON.parse(resValid.body);
    expect(dataValid.pontos).toBeGreaterThan(0);

    // 11s em rodada de 10s: zera
    await db
      .update(rounds)
      .set({ duration_seconds: 10, started_at: new Date(Date.now() - 11_000) })
      .where(eq(rounds.id, round2Id));

    const resLate = await app.inject({
      method: 'POST',
      url: `/api/rounds/${round2Id}/guess`,
      headers: { cookie: authCookie },
      payload: { lat: -9.4064, lng: -38.2147 },
    });
    expect(resLate.statusCode).toBe(200);
    const dataLate = JSON.parse(resLate.body);
    expect(dataLate.pontos).toBe(0);
  });

  it('isLate zera pontuação para rodada de 300s aos 301s, mas pontua aos 299s', async () => {
    const game = await createAuthenticatedGame(app, authCookie);
    const round1Id = game.rounds[0].id;
    const round2Id = game.rounds[1].id;

    // 299s em rodada de 300s: pontua
    await db
      .update(rounds)
      .set({ duration_seconds: 300, started_at: new Date(Date.now() - 299_000) })
      .where(eq(rounds.id, round1Id));

    const resValid = await app.inject({
      method: 'POST',
      url: `/api/rounds/${round1Id}/guess`,
      headers: { cookie: authCookie },
      payload: { lat: -9.4064, lng: -38.2147 },
    });
    expect(resValid.statusCode).toBe(200);
    const dataValid = JSON.parse(resValid.body);
    expect(dataValid.pontos).toBeGreaterThan(0);

    // 301s em rodada de 300s: zera
    await db
      .update(rounds)
      .set({ duration_seconds: 300, started_at: new Date(Date.now() - 301_000) })
      .where(eq(rounds.id, round2Id));

    const resLate = await app.inject({
      method: 'POST',
      url: `/api/rounds/${round2Id}/guess`,
      headers: { cookie: authCookie },
      payload: { lat: -9.4064, lng: -38.2147 },
    });
    expect(resLate.statusCode).toBe(200);
    const dataLate = JSON.parse(resLate.body);
    expect(dataLate.pontos).toBe(0);
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
    expect(summary.rounds[0].duration_seconds).toBe(60);
    expect(summary.rounds[0].durationSeconds).toBe(60);
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

  it('GET /api/rounds/:id/panorama sem sessão retorna 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/rounds/1/panorama' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/rounds/:id/panorama retorna 404 para rodada de outro usuário ou inexistente', async () => {
    const cookieA = await loginNewUser(app, 'panousera');
    const cookieB = await loginNewUser(app, 'panouserb');

    const gameA = await createAuthenticatedGame(app, cookieA);

    const resOther = await app.inject({
      method: 'GET',
      url: `/api/rounds/${gameA.rounds[0].id}/panorama`,
      headers: { cookie: cookieB },
    });
    expect(resOther.statusCode).toBe(404);

    const resNonExistent = await app.inject({
      method: 'GET',
      url: '/api/rounds/999999/panorama',
      headers: { cookie: cookieA },
    });
    expect(resNonExistent.statusCode).toBe(404);
  });

  it('GET /api/rounds/:id/panorama retorna 409 quando o modo é static', async () => {
    const cookie = await loginNewUser(app, 'panouserstatic');
    const game = await createAuthenticatedGame(app, cookie);

    const res = await app.inject({
      method: 'GET',
      url: `/api/rounds/${game.rounds[0].id}/panorama`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toContain('modo panorama');
  });

  it('cria partida com panorama e devolve pano_id apenas enquanto não respondida', async () => {
    const origEnabled = process.env.STREETVIEW_PANORAMA_ENABLED;
    const origBudget = process.env.STREETVIEW_PANORAMA_MONTHLY_BUDGET;
    process.env.STREETVIEW_PANORAMA_ENABLED = 'true';
    process.env.STREETVIEW_PANORAMA_MONTHLY_BUDGET = '2';

    try {
      const cookie = await loginNewUser(app, 'panouserbudget');
      const game = await createAuthenticatedGame(app, cookie);

      expect(game.rounds[0].streetview_mode).toBe('panorama');
      expect(game.rounds[1].streetview_mode).toBe('panorama');
      expect(game.rounds[2].streetview_mode).toBe('static');
      expect(game.rounds[3].streetview_mode).toBe('static');
      expect(game.rounds[4].streetview_mode).toBe('static');

      const panoRes = await app.inject({
        method: 'GET',
        url: `/api/rounds/${game.rounds[0].id}/panorama`,
        headers: { cookie },
      });
      expect(panoRes.statusCode).toBe(200);
      const panoData = JSON.parse(panoRes.body);
      expect(panoData).toHaveProperty('pano_id');
      expect(typeof panoData.pano_id).toBe('string');

      await app.inject({
        method: 'POST',
        url: `/api/rounds/${game.rounds[0].id}/guess`,
        headers: { cookie },
        payload: { lat: -9.4, lng: -38.2 },
      });

      const afterGuessRes = await app.inject({
        method: 'GET',
        url: `/api/rounds/${game.rounds[0].id}/panorama`,
        headers: { cookie },
      });
      expect(afterGuessRes.statusCode).toBe(409);
    } finally {
      process.env.STREETVIEW_PANORAMA_ENABLED = origEnabled;
      process.env.STREETVIEW_PANORAMA_MONTHLY_BUDGET = origBudget;
    }
  });
});
