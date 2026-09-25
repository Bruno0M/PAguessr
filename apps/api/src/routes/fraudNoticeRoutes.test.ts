import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildApp } from '../app.js';
import { resetTestDatabase } from '../test/fixtures.js';
import { extractSessionCookie, registerUser } from '../test/authHelpers.js';
import { db } from '../db/index.js';
import { games, locations, rounds, users } from '../db/schema.js';

async function loginNewUser(app: ReturnType<typeof buildApp>, nick: string): Promise<string> {
  const res = await registerUser(app, { nick });
  return extractSessionCookie(res.headers['set-cookie']);
}

async function finishGame(
  app: ReturnType<typeof buildApp>,
  cookie: string,
  exactRounds: number,
  flaggedReason?: string | null
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

  if (flaggedReason !== undefined) {
    await db.update(games).set({ flagged_reason: flaggedReason }).where(eq(games.id, game.id));
  } else {
    await db.update(games).set({ flagged_reason: null }).where(eq(games.id, game.id));
  }

  return { id: game.id };
}

describe('Fraud Notice Routes Integration', () => {
  const app = buildApp();

  beforeAll(async () => {
    process.env.LOG_LEVEL = 'silent';
    await resetTestDatabase();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET e POST sem sessão retornam 401', async () => {
    const getRes = await app.inject({ method: 'GET', url: '/api/me/fraud-notice' });
    expect(getRes.statusCode).toBe(401);

    const postRes = await app.inject({ method: 'POST', url: '/api/me/fraud-notice/ack' });
    expect(postRes.statusCode).toBe(401);
  });

  it('GET retorna { pending: false } quando jogador não possui fraudes', async () => {
    const cookie = await loginNewUser(app, 'jogadornormal');
    await finishGame(app, cookie, 3);

    const res = await app.inject({
      method: 'GET',
      url: '/api/me/fraud-notice',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ pending: false });
  });

  it('GET retorna pending: true com detalhes de penalty, before, after, entries e gap', async () => {
    // Cria alguns outros jogadores honestos para povoar o ranking
    const cookieOutro1 = await loginNewUser(app, 'honesto1');
    await finishGame(app, cookieOutro1, 4); // 20000

    const cookieOutro2 = await loginNewUser(app, 'honesto2');
    await finishGame(app, cookieOutro2, 2); // 10000

    const cookieCheater = await loginNewUser(app, 'cheater1');
    const [cheaterUser] = await db.select().from(users).where(eq(users.nick, 'cheater1'));

    // Partida com fraude: 25000 pontos
    await finishGame(app, cookieCheater, 5, 'offset_constante');

    const res = await app.inject({
      method: 'GET',
      url: '/api/me/fraud-notice',
      headers: { cookie: cookieCheater },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.pending).toBe(true);
    expect(body.penalty).toBe(25000);
    expect(body.before).toEqual({ position: 1, score: 25000 });
    expect(body.after.score).toBe(-25000);
    expect(body.after.position).toBe(body.total);
    expect(body.gap).toBe(false);
    expect(Array.isArray(body.entries)).toBe(true);
    expect(
      body.entries.find((e: { userId: string }) => e.userId === cheaterUser.id)
    ).toBeUndefined();
  });

  it('POST /api/me/fraud-notice/ack marca partidas e subsequente GET retorna pending: false', async () => {
    const cookie = await loginNewUser(app, 'ackcheater');
    await finishGame(app, cookie, 5, 'tempo_desumano');

    const beforeAckRes = await app.inject({
      method: 'GET',
      url: '/api/me/fraud-notice',
      headers: { cookie },
    });
    expect(JSON.parse(beforeAckRes.body).pending).toBe(true);

    const ackRes = await app.inject({
      method: 'POST',
      url: '/api/me/fraud-notice/ack',
      headers: { cookie },
    });
    expect(ackRes.statusCode).toBe(204);

    const afterAckRes = await app.inject({
      method: 'GET',
      url: '/api/me/fraud-notice',
      headers: { cookie },
    });
    expect(JSON.parse(afterAckRes.body)).toEqual({ pending: false });

    // Idempotente: chamar ack novamente retorna 204
    const secondAckRes = await app.inject({
      method: 'POST',
      url: '/api/me/fraud-notice/ack',
      headers: { cookie },
    });
    expect(secondAckRes.statusCode).toBe(204);
  });

  it('entries limita a 60 com gap: true quando há mais de 60 posições no intervalo', async () => {
    const cookieCheater = await loginNewUser(app, 'cheatergap');
    const [cheaterUser] = await db.select().from(users).where(eq(users.nick, 'cheatergap'));

    // Cria 65 usuários intermediários para ultrapassar 60
    for (let i = 0; i < 65; i++) {
      const [u] = await db
        .insert(users)
        .values({
          nick: `usergap${i}`,
          nick_normalizado: `usergap${i}`,
          password_hash: 'hash',
          recovery_code_hash: 'rec',
          avatar_id: 1,
        })
        .returning();

      await db.insert(games).values({
        user_id: u.id,
        total_score: 5000 + i,
        finished_at: new Date('2026-09-01T10:00:00Z'),
      });
    }

    // Cheater com 25000 pontos
    await finishGame(app, cookieCheater, 5, 'offset_constante');

    const res = await app.inject({
      method: 'GET',
      url: '/api/me/fraud-notice',
      headers: { cookie: cookieCheater },
    });

    const body = JSON.parse(res.body);
    expect(body.pending).toBe(true);
    expect(body.gap).toBe(true);
    expect(body.entries).toHaveLength(60);
    expect(
      body.entries.find((e: { userId: string }) => e.userId === cheaterUser.id)
    ).toBeUndefined();
  });
});
