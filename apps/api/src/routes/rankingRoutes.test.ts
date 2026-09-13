import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildApp } from '../app.js';
import { resetTestDatabase } from '../test/fixtures.js';
import { extractSessionCookie, registerUser } from '../test/authHelpers.js';
import { db } from '../db/index.js';
import { games, locations, rounds } from '../db/schema.js';

async function loginNewUser(app: ReturnType<typeof buildApp>, nick: string): Promise<string> {
  const res = await registerUser(app, { nick });
  return extractSessionCookie(res.headers['set-cookie']);
}

// Joga uma partida completa (5 rodadas) até `finished_at` ser setado. As
// primeiras `exactRounds` rodadas acertam a coordenada exata do local (5000
// pontos cada, via `score()`); o restante manda um palpite bem longe (~0
// pontos cada) — dá controle total sobre o total_score final pros testes
// (múltiplo de 5000), sem depender de qual local caiu em cada rodada.
async function finishGame(
  app: ReturnType<typeof buildApp>,
  cookie: string,
  exactRounds: number
): Promise<{ id: string }> {
  const gameRes = await app.inject({ method: 'POST', url: '/api/games', headers: { cookie } });
  const game = JSON.parse(gameRes.body);
  let roundId = game.rounds[0].id;

  for (let i = 0; i < 5; i++) {
    const [round] = await db.select().from(rounds).where(eq(rounds.id, roundId));
    const [loc] = await db.select().from(locations).where(eq(locations.id, round.location_id));
    const payload = i < exactRounds ? { lat: loc.lat, lng: loc.lng } : { lat: 0, lng: 0 };

    const res = await app.inject({
      method: 'POST',
      url: `/api/rounds/${roundId}/guess`,
      headers: { cookie },
      payload,
    });
    const data = JSON.parse(res.body);
    if (data.nextRound) roundId = data.nextRound.id;
  }

  return { id: game.id };
}

describe('Ranking Routes Integration', () => {
  const app = buildApp();

  beforeAll(async () => {
    process.env.LOG_LEVEL = 'silent';
    await resetTestDatabase();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/ranking sem sessão retorna 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/ranking' });
    expect(res.statusCode).toBe(401);
  });

  it('só a melhor partida do jogador conta pro ranking', async () => {
    const cookie = await loginNewUser(app, 'melhorpartida');

    await finishGame(app, cookie, 0); // ~0 pontos
    await finishGame(app, cookie, 5); // 25000 pontos — essa é a que deve valer

    const res = await app.inject({
      method: 'GET',
      url: '/api/ranking?period=geral',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.me.score).toBe(25000);
    const entry = body.entries.find((e: { nick: string }) => e.nick === 'melhorpartida');
    expect(entry.score).toBe(25000);
  });

  it('semana exclui partida da semana passada, geral inclui', async () => {
    const cookie = await loginNewUser(app, 'semanapassada');
    const game = await finishGame(app, cookie, 5);

    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    await db.update(games).set({ finished_at: twoWeeksAgo }).where(eq(games.id, game.id));

    const semanaRes = await app.inject({
      method: 'GET',
      url: '/api/ranking?period=semana',
      headers: { cookie },
    });
    expect(JSON.parse(semanaRes.body).me).toBeNull();

    const geralRes = await app.inject({
      method: 'GET',
      url: '/api/ranking?period=geral',
      headers: { cookie },
    });
    expect(JSON.parse(geralRes.body).me.score).toBe(25000);
  });

  it('posição do jogador correta dentro e fora do entries visível, respeitando o limit', async () => {
    const cookieA = await loginNewUser(app, 'rankingA');
    const cookieB = await loginNewUser(app, 'rankingB');
    const cookieC = await loginNewUser(app, 'rankingC');

    await finishGame(app, cookieA, 5); // 25000
    await finishGame(app, cookieB, 3); // 15000
    await finishGame(app, cookieC, 1); // 5000

    // Oráculo com a lista completa: os testes anteriores já colocaram outros
    // jogadores no mesmo banco (só um reset em beforeAll), então a posição
    // absoluta de B/C não pode ser um número fixo — comparamos contra o que
    // a própria API relata pra lista inteira.
    const oracleRes = await app.inject({
      method: 'GET',
      url: '/api/ranking?period=geral&limit=100',
      headers: { cookie: cookieA },
    });
    const oracleEntries = JSON.parse(oracleRes.body).entries as Array<{
      nick: string;
      position: number;
    }>;
    const positionOf = (nick: string) => oracleEntries.find((e) => e.nick === nick)!.position;

    const bRes = await app.inject({
      method: 'GET',
      url: '/api/ranking?period=geral&limit=20',
      headers: { cookie: cookieB },
    });
    const bBody = JSON.parse(bRes.body);
    expect(bBody.entries.length).toBeLessThanOrEqual(20);
    expect(bBody.me.position).toBe(positionOf('rankingB'));
    expect(bBody.me.score).toBe(15000);

    const cRes = await app.inject({
      method: 'GET',
      url: '/api/ranking?period=geral&limit=1',
      headers: { cookie: cookieC },
    });
    const cBody = JSON.parse(cRes.body);
    expect(cBody.entries).toHaveLength(1);
    expect(cBody.entries[0].position).toBe(1);
    expect(cBody.me.position).toBe(positionOf('rankingC'));
    expect(cBody.me.score).toBe(5000);
    expect(cBody.me.position).toBeGreaterThan(1); // fora do entries visível (limit=1)
  });

  it('empate de pontuação gera posições adjacentes, sem compartilhar posição', async () => {
    const cookieFirst = await loginNewUser(app, 'empateprimeiro');
    const cookieSecond = await loginNewUser(app, 'empatesegundo');

    await finishGame(app, cookieFirst, 5);
    await finishGame(app, cookieSecond, 5);

    const res = await app.inject({
      method: 'GET',
      url: '/api/ranking?period=geral&limit=100',
      headers: { cookie: cookieFirst },
    });
    const body = JSON.parse(res.body);
    const first = body.entries.find((e: { nick: string }) => e.nick === 'empateprimeiro');
    const second = body.entries.find((e: { nick: string }) => e.nick === 'empatesegundo');

    expect(first.score).toBe(second.score);
    expect(first.position).toBeLessThan(second.position);
    expect(second.position).toBe(first.position + 1);
  });
});
