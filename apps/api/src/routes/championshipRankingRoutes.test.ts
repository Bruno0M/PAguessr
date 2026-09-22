import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildApp } from '../app.js';
import { db, sql } from '../db/index.js';
import {
  championships,
  championshipMatches,
  championshipParticipants,
  users,
} from '../db/schema.js';
import { resetTestDatabase } from '../test/fixtures.js';
import { extractSessionCookie, registerUser } from '../test/authHelpers.js';
import { championshipRankingRoutes } from './championshipRankingRoutes.js';
import { createInitialBracket } from '../championship/bracket.js';

describe('Championship Ranking Routes (GET /api/championships/:id/ranking)', () => {
  const app = buildApp();

  let sessionCookie: string;
  let registeredUsers: Array<{ id: string; nick: string }> = [];

  beforeAll(async () => {
    process.env.LOG_LEVEL = 'silent';
    await app.ready();
  });

  beforeEach(async () => {
    await resetTestDatabase();
    registeredUsers = [];

    // Registra 8 usuários com nicks válidos
    for (let i = 0; i < 8; i++) {
      const reg = await registerUser(app, { nick: `competidor${i}` });
      if (i === 0) {
        sessionCookie = extractSessionCookie(reg.headers['set-cookie']);
      }
      const body = JSON.parse(reg.body);
      registeredUsers.push({ id: body.user.id, nick: body.user.nick });
    }
  });

  afterAll(async () => {
    await app.close();
    await sql.end();
  });

  it('requer autenticação: sem sessão retorna 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/championships/00000000-0000-0000-0000-000000000000/ranking',
    });
    expect(res.statusCode).toBe(401);
  });

  it('retorna 404 para campeonato inexistente', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/championships/00000000-0000-0000-0000-000000000000/ranking',
      headers: { cookie: sessionCookie },
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('não encontrado');
  });

  it('ordena pelos 3 critérios da spec: fase alcançada, pontos totais e menor seed', async () => {
    // Cria campeonato de 4 jogadores (Fase 1: semi [2 jogos], Fase 2: final [1 jogo])
    const [champ] = await db
      .insert(championships)
      .values({
        title: 'Torneio Ranqueamento 4',
        max_participants: 4,
        rounds_per_match: 5,
        round_duration_seconds: 60,
        phase_interval_seconds: 60,
        status: 'finalizado',
        created_by: registeredUsers[0].id,
      })
      .returning();

    const p0 = registeredUsers[0].id; // seed 0
    const p1 = registeredUsers[1].id; // seed 1
    const p2 = registeredUsers[2].id; // seed 2
    const p3 = registeredUsers[3].id; // seed 3

    // Participantes:
    // p0: campeão (venceu semi e final), total score: 4000 + 4500 = 8500
    // p2: vice-campeão (eliminado na final [fase 2]), total score: 3000 + 4000 = 7000
    // p1: eliminado na semi [fase 1], total score: 3500, seed 1
    // p3: eliminado na semi [fase 1], total score: 2000, seed 3
    await db.insert(championshipParticipants).values([
      { championship_id: champ.id, user_id: p0, seed: 0, eliminated_in_phase: null },
      { championship_id: champ.id, user_id: p1, seed: 1, eliminated_in_phase: 1 },
      { championship_id: champ.id, user_id: p2, seed: 2, eliminated_in_phase: 2 },
      { championship_id: champ.id, user_id: p3, seed: 3, eliminated_in_phase: 1 },
    ]);

    // Confrontos da fase 1:
    // Slot 0: p0 x p1 (p0 venceu com 4000 x 3500)
    // Slot 1: p2 x p3 (p2 venceu com 3000 x 2000)
    await db.insert(championshipMatches).values([
      {
        championship_id: champ.id,
        phase: 1,
        slot: 0,
        player_a_id: p0,
        player_b_id: p1,
        score_a: 4000,
        score_b: 3500,
        winner_id: p0,
        resolved_at: new Date(),
      },
      {
        championship_id: champ.id,
        phase: 1,
        slot: 1,
        player_a_id: p2,
        player_b_id: p3,
        score_a: 3000,
        score_b: 2000,
        winner_id: p2,
        resolved_at: new Date(),
      },
      // Fase 2 (final): p0 x p2 (p0 venceu com 4500 x 4000)
      {
        championship_id: champ.id,
        phase: 2,
        slot: 0,
        player_a_id: p0,
        player_b_id: p2,
        score_a: 4500,
        score_b: 4000,
        winner_id: p0,
        resolved_at: new Date(),
      },
    ]);

    const res = await app.inject({
      method: 'GET',
      url: `/api/championships/${champ.id}/ranking`,
      headers: { cookie: sessionCookie },
    });

    expect(res.statusCode).toBe(200);
    const ranking = JSON.parse(res.body);

    expect(ranking.length).toBe(4);

    // 1º lugar: p0 (campeão, fase 3/fase final vencida, 8500 pontos)
    expect(ranking[0].userId).toBe(p0);
    expect(ranking[0].position).toBe(1);
    expect(ranking[0].totalScore).toBe(8500);
    expect(ranking[0].phaseReached).toBe(3);

    // 2º lugar: p2 (caiu na final [fase 2], 7000 pontos)
    expect(ranking[1].userId).toBe(p2);
    expect(ranking[1].position).toBe(2);
    expect(ranking[1].totalScore).toBe(7000);
    expect(ranking[1].phaseReached).toBe(2);

    // 3º lugar: p1 (caiu na fase 1 com 3500 pontos)
    expect(ranking[2].userId).toBe(p1);
    expect(ranking[2].position).toBe(3);
    expect(ranking[2].totalScore).toBe(3500);
    expect(ranking[2].phaseReached).toBe(1);

    // 4º lugar: p3 (caiu na fase 1 com 2000 pontos)
    expect(ranking[3].userId).toBe(p3);
    expect(ranking[3].position).toBe(4);
    expect(ranking[3].totalScore).toBe(2000);
    expect(ranking[3].phaseReached).toBe(1);
  });

  it('desempate por menor seed quando fase alcançada e pontos totais são iguais', async () => {
    const [champ] = await db
      .insert(championships)
      .values({
        title: 'Torneio Desempate Seed',
        max_participants: 4,
        rounds_per_match: 5,
        round_duration_seconds: 60,
        phase_interval_seconds: 60,
        status: 'em_andamento',
        created_by: registeredUsers[0].id,
      })
      .returning();

    const p0 = registeredUsers[0].id; // seed 0
    const p1 = registeredUsers[1].id; // seed 1
    const p2 = registeredUsers[2].id; // seed 2
    const p3 = registeredUsers[3].id; // seed 3

    // Ambos p1 e p3 foram eliminados na fase 1 e ambos pontuaram exatamente 2500 pontos
    await db.insert(championshipParticipants).values([
      { championship_id: champ.id, user_id: p0, seed: 0, eliminated_in_phase: null },
      { championship_id: champ.id, user_id: p1, seed: 1, eliminated_in_phase: 1 },
      { championship_id: champ.id, user_id: p2, seed: 2, eliminated_in_phase: null },
      { championship_id: champ.id, user_id: p3, seed: 3, eliminated_in_phase: 1 },
    ]);

    await db.insert(championshipMatches).values([
      {
        championship_id: champ.id,
        phase: 1,
        slot: 0,
        player_a_id: p0,
        player_b_id: p1,
        score_a: 3000,
        score_b: 2500,
        winner_id: p0,
        resolved_at: new Date(),
      },
      {
        championship_id: champ.id,
        phase: 1,
        slot: 1,
        player_a_id: p2,
        player_b_id: p3,
        score_a: 3000,
        score_b: 2500,
        winner_id: p2,
        resolved_at: new Date(),
      },
    ]);

    const res = await app.inject({
      method: 'GET',
      url: `/api/championships/${champ.id}/ranking`,
      headers: { cookie: sessionCookie },
    });

    expect(res.statusCode).toBe(200);
    const ranking = JSON.parse(res.body) as { userId: string }[];

    const posP1 = ranking.findIndex((r) => r.userId === p1);
    const posP3 = ranking.findIndex((r) => r.userId === p3);

    // p1 tem seed 1 e p3 tem seed 3 -> p1 deve vir antes de p3!
    expect(posP1).toBeLessThan(posP3);
  });
});
