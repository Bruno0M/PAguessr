import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildApp } from '../app.js';
import { resetTestDatabase } from '../test/fixtures.js';
import { extractSessionCookie, registerUser } from '../test/authHelpers.js';
import { db } from '../db/index.js';
import {
  championships,
  championshipParticipants,
  championshipMatches,
  users,
} from '../db/schema.js';

async function loginNewUser(app: ReturnType<typeof buildApp>, nick: string): Promise<{ cookie: string; userId: string }> {
  const res = await registerUser(app, { nick });
  if (res.statusCode !== 201) {
    throw new Error(`Failed to register user ${nick}: ${res.statusCode} ${res.body}`);
  }
  const cookie = extractSessionCookie(res.headers['set-cookie']);
  const [user] = await db.select().from(users).where(eq(users.nick, nick));
  return { cookie, userId: user.id };
}

async function createChampionship(creatorId: string, maxParticipants: number = 4) {
  const [champ] = await db
    .insert(championships)
    .values({
      title: `Torneio de ${maxParticipants}`,
      max_participants: maxParticipants,
      rounds_per_match: 5,
      round_duration_seconds: 60,
      phase_interval_seconds: 3600,
      status: 'inscricoes',
      created_by: creatorId,
    })
    .returning();
  return champ;
}

describe('Championship Routes Integration (Fatia 4: Inscrição e Sorteio)', () => {
  const app = buildApp();

  beforeAll(async () => {
    process.env.LOG_LEVEL = 'silent';
    await resetTestDatabase();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/championships/:id/join sem sessão retorna 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/championships/00000000-0000-0000-0000-000000000001/join',
    });
    expect(res.statusCode).toBe(401);
  });

  it('DELETE /api/championships/:id/join sem sessão retorna 401', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/championships/00000000-0000-0000-0000-000000000001/join',
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/championships/:id/join retorna 404 para campeonato inexistente', async () => {
    const user = await loginNewUser(app, 'join_inex');
    const res = await app.inject({
      method: 'POST',
      url: '/api/championships/00000000-0000-0000-0000-000000000001/join',
      headers: { cookie: user.cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it('permite entrar e sair de um campeonato em período de inscrições', async () => {
    const admin = await loginNewUser(app, 'host_join');
    const player = await loginNewUser(app, 'player_join');
    const champ = await createChampionship(admin.userId, 4);

    // Entra no campeonato
    const joinRes = await app.inject({
      method: 'POST',
      url: `/api/championships/${champ.id}/join`,
      headers: { cookie: player.cookie },
    });
    expect(joinRes.statusCode).toBe(200);
    const joinData = JSON.parse(joinRes.body);
    expect(joinData.status).toBe('inscricoes');
    expect(joinData.seeded).toBe(false);

    // Tentativa de entrar novamente retorna 409
    const secondJoinRes = await app.inject({
      method: 'POST',
      url: `/api/championships/${champ.id}/join`,
      headers: { cookie: player.cookie },
    });
    expect(secondJoinRes.statusCode).toBe(409);

    // Sai do campeonato
    const leaveRes = await app.inject({
      method: 'DELETE',
      url: `/api/championships/${champ.id}/join`,
      headers: { cookie: player.cookie },
    });
    expect(leaveRes.statusCode).toBe(204);

    // Conferir que saiu no banco
    const participants = await db
      .select()
      .from(championshipParticipants)
      .where(eq(championshipParticipants.championship_id, champ.id));
    expect(participants).toHaveLength(0);

    // Pode se inscrever de novo
    const rejoinRes = await app.inject({
      method: 'POST',
      url: `/api/championships/${champ.id}/join`,
      headers: { cookie: player.cookie },
    });
    expect(rejoinRes.statusCode).toBe(200);
  });

  it('DELETE /api/championships/:id/join recusa saída após o sorteio das chaves (409)', async () => {
    const admin = await loginNewUser(app, 'host_chave');
    const champ = await createChampionship(admin.userId, 4);

    const players = await Promise.all([
      loginNewUser(app, 'chave_p1'),
      loginNewUser(app, 'chave_p2'),
      loginNewUser(app, 'chave_p3'),
      loginNewUser(app, 'chave_p4'),
    ]);

    for (const p of players) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/championships/${champ.id}/join`,
        headers: { cookie: p.cookie },
      });
      expect(res.statusCode).toBe(200);
    }

    // Tentar sair agora que está chaveado retorna 409
    const leaveRes = await app.inject({
      method: 'DELETE',
      url: `/api/championships/${champ.id}/join`,
      headers: { cookie: players[0].cookie },
    });
    expect(leaveRes.statusCode).toBe(409);
  });

  it('sorteio com 4 participantes gera chave completa de 2 fases', async () => {
    const admin = await loginNewUser(app, 'host_s4');
    const champ = await createChampionship(admin.userId, 4);

    const p1 = await loginNewUser(app, 's4_1');
    const p2 = await loginNewUser(app, 's4_2');
    const p3 = await loginNewUser(app, 's4_3');
    const p4 = await loginNewUser(app, 's4_4');

    for (const p of [p1, p2, p3]) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/championships/${champ.id}/join`,
        headers: { cookie: p.cookie },
      });
      expect(JSON.parse(res.body).status).toBe('inscricoes');
    }

    // O 4º preenche a última vaga e dispara o sorteio
    const lastRes = await app.inject({
      method: 'POST',
      url: `/api/championships/${champ.id}/join`,
      headers: { cookie: p4.cookie },
    });
    expect(lastRes.statusCode).toBe(200);
    const lastData = JSON.parse(lastRes.body);
    expect(lastData.status).toBe('chaveado');
    expect(lastData.seeded).toBe(true);

    // Verifica campeonato no banco
    const [updatedChamp] = await db
      .select()
      .from(championships)
      .where(eq(championships.id, champ.id));
    expect(updatedChamp.status).toBe('chaveado');
    expect(updatedChamp.seeded_at).not.toBeNull();

    // Verifica participantes e seeds de 0 a 3
    const participants = await db
      .select()
      .from(championshipParticipants)
      .where(eq(championshipParticipants.championship_id, champ.id));
    expect(participants).toHaveLength(4);
    const seeds = participants.map((p) => p.seed).sort();
    expect(seeds).toEqual([0, 1, 2, 3]);

    // Total de confrontos = 3 (Fase 1 com 2 confrontos, Fase 2 com 1 confronto)
    const matches = await db
      .select()
      .from(championshipMatches)
      .where(eq(championshipMatches.championship_id, champ.id))
      .orderBy(championshipMatches.phase, championshipMatches.slot);

    expect(matches).toHaveLength(3);

    const phase1 = matches.filter((m) => m.phase === 1);
    expect(phase1).toHaveLength(2);
    expect(phase1[0].player_a_id).not.toBeNull();
    expect(phase1[0].player_b_id).not.toBeNull();
    expect(phase1[1].player_a_id).not.toBeNull();
    expect(phase1[1].player_b_id).not.toBeNull();

    const phase2 = matches.filter((m) => m.phase === 2);
    expect(phase2).toHaveLength(1);
    expect(phase2[0].player_a_id).toBeNull();
    expect(phase2[0].player_b_id).toBeNull();
  });

  it('sorteio com 8 participantes gera chave completa de 3 fases e 7 confrontos', async () => {
    const admin = await loginNewUser(app, 'host_s8');
    const champ = await createChampionship(admin.userId, 8);

    for (let i = 0; i < 8; i++) {
      const user = await loginNewUser(app, `s8_${i}`);
      const res = await app.inject({
        method: 'POST',
        url: `/api/championships/${champ.id}/join`,
        headers: { cookie: user.cookie },
      });
      expect(res.statusCode).toBe(200);
    }

    const [updatedChamp] = await db
      .select()
      .from(championships)
      .where(eq(championships.id, champ.id));
    expect(updatedChamp.status).toBe('chaveado');

    const matches = await db
      .select()
      .from(championshipMatches)
      .where(eq(championshipMatches.championship_id, champ.id));

    expect(matches).toHaveLength(7);
    expect(matches.filter((m) => m.phase === 1)).toHaveLength(4);
    expect(matches.filter((m) => m.phase === 2)).toHaveLength(2);
    expect(matches.filter((m) => m.phase === 3)).toHaveLength(1);
  });

  it('sorteio com 16 participantes gera chave completa de 4 fases e 15 confrontos', async () => {
    const admin = await loginNewUser(app, 'host_s16');
    const champ = await createChampionship(admin.userId, 16);

    for (let i = 0; i < 16; i++) {
      const user = await loginNewUser(app, `s16_${i}`);
      await app.inject({
        method: 'POST',
        url: `/api/championships/${champ.id}/join`,
        headers: { cookie: user.cookie },
      });
    }

    const [updatedChamp] = await db
      .select()
      .from(championships)
      .where(eq(championships.id, champ.id));
    expect(updatedChamp.status).toBe('chaveado');

    const matches = await db
      .select()
      .from(championshipMatches)
      .where(eq(championshipMatches.championship_id, champ.id));

    expect(matches).toHaveLength(15);
    expect(matches.filter((m) => m.phase === 1)).toHaveLength(8);
    expect(matches.filter((m) => m.phase === 2)).toHaveLength(4);
    expect(matches.filter((m) => m.phase === 3)).toHaveLength(2);
    expect(matches.filter((m) => m.phase === 4)).toHaveLength(1);
  });

  it('sorteio com 32 participantes gera chave completa de 5 fases e 31 confrontos', async () => {
    const admin = await loginNewUser(app, 'host_s32');
    const champ = await createChampionship(admin.userId, 32);

    for (let i = 0; i < 32; i++) {
      const user = await loginNewUser(app, `s32_${i}`);
      await app.inject({
        method: 'POST',
        url: `/api/championships/${champ.id}/join`,
        headers: { cookie: user.cookie },
      });
    }

    const [updatedChamp] = await db
      .select()
      .from(championships)
      .where(eq(championships.id, champ.id));
    expect(updatedChamp.status).toBe('chaveado');

    const matches = await db
      .select()
      .from(championshipMatches)
      .where(eq(championshipMatches.championship_id, champ.id));

    expect(matches).toHaveLength(31);
    expect(matches.filter((m) => m.phase === 1)).toHaveLength(16);
    expect(matches.filter((m) => m.phase === 2)).toHaveLength(8);
    expect(matches.filter((m) => m.phase === 3)).toHaveLength(4);
    expect(matches.filter((m) => m.phase === 4)).toHaveLength(2);
    expect(matches.filter((m) => m.phase === 5)).toHaveLength(1);
  });

  it('corrida da última vaga: duas inscrições concorrentes não geram dois sorteios nem passam de max_participants', async () => {
    const admin = await loginNewUser(app, 'host_race');
    const champ = await createChampionship(admin.userId, 4);

    const p1 = await loginNewUser(app, 'race_1');
    const p2 = await loginNewUser(app, 'race_2');
    const p3 = await loginNewUser(app, 'race_3');

    // Preenche as 3 primeiras vagas
    for (const p of [p1, p2, p3]) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/championships/${champ.id}/join`,
        headers: { cookie: p.cookie },
      });
      expect(res.statusCode).toBe(200);
    }

    // Dois usuários concorrentes disputam a 4ª e última vaga
    const candidateA = await loginNewUser(app, 'race_cand_a');
    const candidateB = await loginNewUser(app, 'race_cand_b');

    const [resA, resB] = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/championships/${champ.id}/join`,
        headers: { cookie: candidateA.cookie },
      }),
      app.inject({
        method: 'POST',
        url: `/api/championships/${champ.id}/join`,
        headers: { cookie: candidateB.cookie },
      }),
    ]);

    const statuses = [resA.statusCode, resB.statusCode].sort();
    expect(statuses).toEqual([200, 409]);

    // O campeonato foi chaveado com exatamente 4 participantes
    const participants = await db
      .select()
      .from(championshipParticipants)
      .where(eq(championshipParticipants.championship_id, champ.id));
    expect(participants).toHaveLength(4);

    // Exatamente 3 confrontos gerados
    const matches = await db
      .select()
      .from(championshipMatches)
      .where(eq(championshipMatches.championship_id, champ.id));
    expect(matches).toHaveLength(3);

    const [finalChamp] = await db
      .select()
      .from(championships)
      .where(eq(championships.id, champ.id));
    expect(finalChamp.status).toBe('chaveado');
  });
});
