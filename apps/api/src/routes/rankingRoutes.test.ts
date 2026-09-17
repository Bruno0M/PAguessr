import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildApp } from '../app.js';
import { resetTestDatabase } from '../test/fixtures.js';
import { extractSessionCookie, registerUser } from '../test/authHelpers.js';
import { db } from '../db/index.js';
import { championships, championshipMatches, games, locations, rounds, users } from '../db/schema.js';

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

  it('offset pagina a lista completa sem pular nem repetir jogador, e total conta todos', async () => {
    const cookie = await loginNewUser(app, 'paginacao');
    await finishGame(app, cookie, 2);

    const fullRes = await app.inject({
      method: 'GET',
      url: '/api/ranking?period=geral&limit=100',
      headers: { cookie },
    });
    const full = JSON.parse(fullRes.body);
    expect(full.total).toBe(full.entries.length);
    expect(full.total).toBeGreaterThanOrEqual(3);

    const pages: Array<{ userId: string; position: number }> = [];
    for (let offset = 0; offset < full.total; offset += 2) {
      const pageRes = await app.inject({
        method: 'GET',
        url: `/api/ranking?period=geral&limit=2&offset=${offset}`,
        headers: { cookie },
      });
      const page = JSON.parse(pageRes.body);
      expect(page.total).toBe(full.total);
      pages.push(...page.entries);
    }

    expect(pages.map((e) => e.userId)).toEqual(
      full.entries.map((e: { userId: string }) => e.userId)
    );
    expect(pages.map((e) => e.position)).toEqual(pages.map((_, idx) => idx + 1));

    const pastEndRes = await app.inject({
      method: 'GET',
      url: `/api/ranking?period=geral&limit=10&offset=${full.total}`,
      headers: { cookie },
    });
    const pastEnd = JSON.parse(pastEndRes.body);
    expect(pastEnd.entries).toEqual([]);
    expect(pastEnd.me.score).toBe(10000);
  });

  it('offset negativo é rejeitado', async () => {
    const cookie = await loginNewUser(app, 'offsetnegativo');
    const res = await app.inject({
      method: 'GET',
      url: '/api/ranking?period=geral&offset=-1',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
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

  it('partida de campeonato finalizada não entra no ranking geral nem no da semana', async () => {
    const cookie = await loginNewUser(app, 'campeaonick');
    const [user] = await db.select().from(users).where(eq(users.nick, 'campeaonick'));

    const [champ] = await db
      .insert(championships)
      .values({
        title: 'Torneio Teste',
        max_participants: 4,
        rounds_per_match: 5,
        round_duration_seconds: 60,
        phase_interval_seconds: 3600,
        status: 'em_andamento',
        created_by: user.id,
      })
      .returning();

    const [match] = await db
      .insert(championshipMatches)
      .values({
        championship_id: champ.id,
        phase: 1,
        slot: 0,
        player_a_id: user.id,
      })
      .returning();

    await finishGame(app, cookie, 1);

    const champGame = await finishGame(app, cookie, 5);
    await db
      .update(games)
      .set({ championship_match_id: match.id })
      .where(eq(games.id, champGame.id));

    const geralRes = await app.inject({
      method: 'GET',
      url: '/api/ranking?period=geral',
      headers: { cookie },
    });
    const geralBody = JSON.parse(geralRes.body);
    expect(geralBody.me.score).toBe(5000);
    const geralEntry = geralBody.entries.find((e: { nick: string }) => e.nick === 'campeaonick');
    expect(geralEntry.score).toBe(5000);

    const semanaRes = await app.inject({
      method: 'GET',
      url: '/api/ranking?period=semana',
      headers: { cookie },
    });
    const semanaBody = JSON.parse(semanaRes.body);
    expect(semanaBody.me.score).toBe(5000);
    const semanaEntry = semanaBody.entries.find((e: { nick: string }) => e.nick === 'campeaonick');
    expect(semanaEntry.score).toBe(5000);
  });
});
