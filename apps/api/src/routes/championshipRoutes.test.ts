import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { PAULO_AFONSO_CENTER } from '@paguessr/shared';
import { buildApp } from '../app.js';
import { resetTestDatabase } from '../test/fixtures.js';
import { createDuelHelpers, loginNewUser } from '../test/duelHelpers.js';
import { db } from '../db/index.js';
import { advanceChampionship } from '../championship/advance.js';
import {
  championships,
  championshipParticipants,
  championshipMatches,
  games,
  rounds,
  users,
} from '../db/schema.js';

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

  // Cadastrar 32 jogadores leva ~5 s, no limite padrão do Vitest: timeout maior só aqui.
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
  }, 20_000);

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

  describe('Fatia 5: Largada e Duelo', () => {
    const { setupActiveChampionship, enterMatch, guessRound, locationOfRound, getLive, sidesOf } =
      createDuelHelpers(app);

    it('POST /api/championships/:id/matches/:matchId/enter sem sessão retorna 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/championships/00000000-0000-0000-0000-000000000001/matches/00000000-0000-0000-0000-000000000002/enter',
      });
      expect(res.statusCode).toBe(401);
    });

    it('GET /api/championships/:id/matches/:matchId/live sem sessão retorna 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/championships/00000000-0000-0000-0000-000000000001/matches/00000000-0000-0000-0000-000000000002/live',
      });
      expect(res.statusCode).toBe(401);
    });

    it('POST .../enter recusa quando campeonato não está em andamento (409)', async () => {
      const host = await loginNewUser(app, 'e409_host');
      const p1 = await loginNewUser(app, 'e409_p1');
      const [champ] = await db
        .insert(championships)
        .values({
          title: 'Torneio Inscricoes',
          max_participants: 4,
          rounds_per_match: 3,
          phase_interval_seconds: 3600,
          status: 'inscricoes',
          created_by: host.userId,
        })
        .returning();

      const [match] = await db
        .insert(championshipMatches)
        .values({
          championship_id: champ.id,
          phase: 1,
          slot: 0,
          player_a_id: p1.userId,
        })
        .returning();

      const res = await app.inject({
        method: 'POST',
        url: `/api/championships/${champ.id}/matches/${match.id}/enter`,
        headers: { cookie: p1.cookie },
      });
      expect(res.statusCode).toBe(409);
    });

    it('POST .../enter recusa jogador que não faz parte do confronto (403)', async () => {
      const { champ, matches } = await setupActiveChampionship({ prefix: 'f5_403' });
      const match1 = matches[0];
      const outsider = await loginNewUser(app, 'f5_outsider');

      const res = await app.inject({
        method: 'POST',
        url: `/api/championships/${champ.id}/matches/${match1.id}/enter`,
        headers: { cookie: outsider.cookie },
      });
      expect(res.statusCode).toBe(403);
    });

    it('enter idempotente: chamar duas vezes devolve a mesma partida sem duplicar', async () => {
      const { champ, players, matches } = await setupActiveChampionship({ prefix: 'f5_idem' });
      const match = matches[0];
      const playerA = players.find((p) => p.userId === match.player_a_id)!;

      const res1 = await app.inject({
        method: 'POST',
        url: `/api/championships/${champ.id}/matches/${match.id}/enter`,
        headers: { cookie: playerA.cookie },
      });
      expect(res1.statusCode).toBe(200);
      const data1 = JSON.parse(res1.body) as { gameId: string; rounds: { id: string }[] };
      expect(data1.gameId).toBeDefined();
      expect(data1.rounds).toHaveLength(3);

      const res2 = await app.inject({
        method: 'POST',
        url: `/api/championships/${champ.id}/matches/${match.id}/enter`,
        headers: { cookie: playerA.cookie },
      });
      expect(res2.statusCode).toBe(200);
      const data2 = JSON.parse(res2.body) as { gameId: string; rounds: { id: string }[] };
      expect(data2.gameId).toBe(data1.gameId);
      expect(data2.rounds.map((r) => r.id)).toEqual(data1.rounds.map((r) => r.id));

      const allUserGames = await db
        .select()
        .from(games)
        .where(and(eq(games.championship_match_id, match.id), eq(games.user_id, playerA.userId)));
      expect(allUserGames).toHaveLength(1);
    });

    it('os dois lados recebem locais idênticos na mesma ordem e mesmo streetview_mode', async () => {
      const { champ, players, matches } = await setupActiveChampionship({ prefix: 'f5_locs' });
      const match = matches[0];
      const playerA = players.find((p) => p.userId === match.player_a_id)!;
      const playerB = players.find((p) => p.userId === match.player_b_id)!;

      const resA = await app.inject({
        method: 'POST',
        url: `/api/championships/${champ.id}/matches/${match.id}/enter`,
        headers: { cookie: playerA.cookie },
      });
      expect(resA.statusCode).toBe(200);
      const dataA = JSON.parse(resA.body);

      const resB = await app.inject({
        method: 'POST',
        url: `/api/championships/${champ.id}/matches/${match.id}/enter`,
        headers: { cookie: playerB.cookie },
      });
      expect(resB.statusCode).toBe(200);
      const dataB = JSON.parse(resB.body);

      expect(dataA.gameId).not.toBe(dataB.gameId);

      const roundsA = await db
        .select()
        .from(rounds)
        .where(eq(rounds.game_id, dataA.gameId))
        .orderBy(asc(rounds.ordem));

      const roundsB = await db
        .select()
        .from(rounds)
        .where(eq(rounds.game_id, dataB.gameId))
        .orderBy(asc(rounds.ordem));

      expect(roundsA).toHaveLength(roundsB.length);
      for (let i = 0; i < roundsA.length; i++) {
        expect(roundsA[i].location_id).toBe(roundsB[i].location_id);
        expect(roundsA[i].streetview_mode).toBe(roundsB[i].streetview_mode);
        expect(roundsA[i].duration_seconds).toBe(champ.round_duration_seconds);
      }
    });

    it('started_at das rodadas é derivado de opens_at, da duração e da revelação entre rodadas', async () => {
      const { champ, players, matches } = await setupActiveChampionship({
        prefix: 'f5_start',
        roundDurationSeconds: 45,
      });
      const match = matches[0];
      const playerA = players.find((p) => p.userId === match.player_a_id)!;

      const res = await app.inject({
        method: 'POST',
        url: `/api/championships/${champ.id}/matches/${match.id}/enter`,
        headers: { cookie: playerA.cookie },
      });
      const data = JSON.parse(res.body);

      const opensAtMs = new Date(match.opens_at!).getTime();
      expect(new Date(data.rounds[0].started_at).getTime()).toBe(opensAtMs);
      // Cada rodada dura 45 s e a próxima começa depois da revelação de 5 s.
      expect(new Date(data.rounds[1].started_at).getTime()).toBe(opensAtMs + 50 * 1000);
      expect(new Date(data.rounds[2].started_at).getTime()).toBe(opensAtMs + 100 * 1000);
    });

    it('live não vaza dados nem coordenadas do adversário antes da rodada fechar', async () => {
      const { champ, players, matches } = await setupActiveChampionship({ prefix: 'f5_live' });
      const match = matches[0];
      const playerA = players.find((p) => p.userId === match.player_a_id)!;
      const playerB = players.find((p) => p.userId === match.player_b_id)!;

      await app.inject({
        method: 'POST',
        url: `/api/championships/${champ.id}/matches/${match.id}/enter`,
        headers: { cookie: playerA.cookie },
      });

      const resB = await app.inject({
        method: 'POST',
        url: `/api/championships/${champ.id}/matches/${match.id}/enter`,
        headers: { cookie: playerB.cookie },
      });
      const dataB = JSON.parse(resB.body);

      await app.inject({
        method: 'POST',
        url: `/api/rounds/${dataB.rounds[0].id}/guess`,
        headers: { cookie: playerB.cookie },
        payload: { lat: -9.4064, lng: -38.2147 },
      });

      const liveRes = await app.inject({
        method: 'GET',
        url: `/api/championships/${champ.id}/matches/${match.id}/live`,
        headers: { cookie: playerA.cookie },
      });
      expect(liveRes.statusCode).toBe(200);
      const liveData = JSON.parse(liveRes.body);

      expect(liveData.opponentRoundsAnswered).toBe(1);
      expect(liveData.myScore).toBe(0);
      expect(liveData.currentRound).toBe(1);
      expect(liveData.resolvedAt).toBeNull();

      expect(liveData).not.toHaveProperty('guess');
      expect(liveData).not.toHaveProperty('guess_lat');
      expect(liveData).not.toHaveProperty('opponent_guess');

      // O adversário respondeu, mas a rodada segue aberta pra mim: nada dele aparece.
      expect(liveData.opponentScore).toBe(0);
      expect(liveData.rounds[0]).toEqual({
        order: 1,
        closed: false,
        myPoints: null,
        myDistance: null,
        opponentPoints: null,
        opponentDistance: null,
      });
    });

    it('live: os pontos do adversário entram quando a rodada fecha, pros dois lados', async () => {
      const setup = await setupActiveChampionship({ prefix: 'f6_close' });
      const { match, playerA, playerB } = sidesOf(setup);
      const { champ } = setup;

      const dataA = await enterMatch(champ.id, match.id, playerA);
      const dataB = await enterMatch(champ.id, match.id, playerB);
      const target = await locationOfRound(dataB.rounds[0].id);

      const guessB = await guessRound(playerB, dataB.rounds[0].id, target);
      expect(guessB.score).toBe(5000);

      const beforeClose = await getLive(champ.id, match.id, playerA);
      expect(beforeClose.opponentScore).toBe(0);
      expect(beforeClose.rounds[0].closed).toBe(false);
      expect(beforeClose.rounds[0].opponentPoints).toBeNull();

      const guessA = await guessRound(playerA, dataA.rounds[0].id, PAULO_AFONSO_CENTER);

      const liveA = await getLive(champ.id, match.id, playerA);
      expect(liveA.rounds[0]).toEqual({
        order: 1,
        closed: true,
        myPoints: guessA.score,
        myDistance: guessA.distancia,
        opponentPoints: 5000,
        opponentDistance: guessB.distancia,
      });
      expect(liveA.opponentScore).toBe(5000);
      expect(liveA.myScore).toBe(guessA.score);
      expect(liveA.rounds[1].closed).toBe(false);
      expect(liveA.rounds).toHaveLength(3);

      const liveB = await getLive(champ.id, match.id, playerB);
      expect(liveB.opponentScore).toBe(guessA.score);
      expect(liveB.rounds[0].opponentPoints).toBe(guessA.score);
      expect(liveB.rounds[0].myPoints).toBe(5000);
    });

    it('live: rodada com o tempo esgotado fecha sem os pontos de quem não respondeu', async () => {
      const setup = await setupActiveChampionship({ prefix: 'f6_time' });
      const { match, playerA, playerB } = sidesOf(setup);
      const { champ } = setup;

      const dataA = await enterMatch(champ.id, match.id, playerA);
      const dataB = await enterMatch(champ.id, match.id, playerB);
      const guessA = await guessRound(playerA, dataA.rounds[0].id, PAULO_AFONSO_CENTER);

      const past = new Date(Date.now() - 200 * 1000);
      await db
        .update(rounds)
        .set({ started_at: past })
        .where(and(inArray(rounds.game_id, [dataA.gameId, dataB.gameId]), eq(rounds.ordem, 1)));

      const liveA = await getLive(champ.id, match.id, playerA);
      expect(liveA.rounds[0]).toEqual({
        order: 1,
        closed: true,
        myPoints: guessA.score,
        myDistance: guessA.distancia,
        opponentPoints: null,
        opponentDistance: null,
      });
      expect(liveA.opponentScore).toBe(0);
      expect(liveA.rounds[1].closed).toBe(false);

      // Do outro lado: eu não respondi, então myPoints é nulo e o dele aparece.
      const liveB = await getLive(champ.id, match.id, playerB);
      expect(liveB.rounds[0]).toEqual({
        order: 1,
        closed: true,
        myPoints: null,
        myDistance: null,
        opponentPoints: guessA.score,
        opponentDistance: guessA.distancia,
      });
      expect(liveB.opponentScore).toBe(guessA.score);
    });

    it('live: duelo resolvido devolve o placar final consolidado do lado certo', async () => {
      const setup = await setupActiveChampionship({ prefix: 'f6_final' });
      const { match, playerA, playerB } = sidesOf(setup);
      const { champ } = setup;

      const dataA = await enterMatch(champ.id, match.id, playerA);
      const dataB = await enterMatch(champ.id, match.id, playerB);

      const beforeResolve = await getLive(champ.id, match.id, playerA);
      expect(beforeResolve.finalScore).toBeNull();

      // As rodadas seguintes só abrem depois da revelação; aqui todas ficam abertas
      // de uma vez pra o teste palpitar nas três em seguida.
      await db
        .update(rounds)
        .set({ started_at: new Date(Date.now() - 1000) })
        .where(inArray(rounds.game_id, [dataA.gameId, dataB.gameId]));

      let totalA = 0;
      let totalB = 0;
      for (let i = 0; i < dataA.rounds.length; i++) {
        const target = await locationOfRound(dataA.rounds[i].id);
        totalA += (await guessRound(playerA, dataA.rounds[i].id, target)).score;
        totalB += (await guessRound(playerB, dataB.rounds[i].id, PAULO_AFONSO_CENTER)).score;
      }

      await advanceChampionship(champ.id, { force: true });

      const [resolved] = await db
        .select()
        .from(championshipMatches)
        .where(eq(championshipMatches.id, match.id));
      expect(resolved.resolved_at).not.toBeNull();
      expect(resolved.score_a).toBe(totalA);
      expect(resolved.score_b).toBe(totalB);

      const liveA = await getLive(champ.id, match.id, playerA);
      expect(liveA.finalScore).toEqual({ me: totalA, opponent: totalB });
      expect(liveA.winnerId).toBe(playerA.userId);
      expect(liveA.opponentScore).toBe(totalB);

      const liveB = await getLive(champ.id, match.id, playerB);
      expect(liveB.finalScore).toEqual({ me: totalB, opponent: totalA });
      expect(liveB.opponentScore).toBe(totalA);
    });

    it('live: devolve o adversário com nick e avatar, do lado de cada jogador', async () => {
      const setup = await setupActiveChampionship({ prefix: 'f6_opp' });
      const { match, playerA, playerB } = sidesOf(setup);
      const { champ } = setup;

      await enterMatch(champ.id, match.id, playerA);
      await enterMatch(champ.id, match.id, playerB);

      const [rowA] = await db.select().from(users).where(eq(users.id, playerA.userId));
      const [rowB] = await db.select().from(users).where(eq(users.id, playerB.userId));

      const liveA = await getLive(champ.id, match.id, playerA);
      expect(liveA.opponent).toEqual({
        id: playerB.userId,
        nick: rowB.nick,
        avatarId: rowB.avatar_id,
      });

      const liveB = await getLive(champ.id, match.id, playerB);
      expect(liveB.opponent).toEqual({
        id: playerA.userId,
        nick: rowA.nick,
        avatarId: rowA.avatar_id,
      });
    });

    it('detalhe, enter e live devolvem serverTime em ISO, perto da hora do servidor', async () => {
      const setup = await setupActiveChampionship({ prefix: 'f6_clock' });
      const { match, playerA } = sidesOf(setup);
      const { champ } = setup;

      const expectServerTime = (value: unknown) => {
        expect(typeof value).toBe('string');
        const parsed = new Date(value as string);
        expect(parsed.toISOString()).toBe(value);
        expect(Math.abs(parsed.getTime() - Date.now())).toBeLessThan(5000);
      };

      const detailRes = await app.inject({
        method: 'GET',
        url: `/api/championships/${champ.id}`,
        headers: { cookie: playerA.cookie },
      });
      expect(detailRes.statusCode).toBe(200);
      expectServerTime(JSON.parse(detailRes.body).serverTime);

      const enterRes = await app.inject({
        method: 'POST',
        url: `/api/championships/${champ.id}/matches/${match.id}/enter`,
        headers: { cookie: playerA.cookie },
      });
      expect(enterRes.statusCode).toBe(200);
      expectServerTime(JSON.parse(enterRes.body).serverTime);

      expectServerTime((await getLive(champ.id, match.id, playerA)).serverTime);
    });

    it('enter antes da hora (opens_at no futuro) devolve as rodadas com os horários certos', async () => {
      const setup = await setupActiveChampionship({ prefix: 'f7_pre', roundDurationSeconds: 45 });
      const { match, playerA, playerB } = sidesOf(setup);
      const { champ } = setup;

      const opensAt = new Date(Date.now() + 60 * 1000);
      await db
        .update(championshipMatches)
        .set({ opens_at: opensAt })
        .where(eq(championshipMatches.id, match.id));

      const dataA = await enterMatch(champ.id, match.id, playerA);
      const dataB = await enterMatch(champ.id, match.id, playerB);
      expect(dataA.rounds).toHaveLength(3);

      const roundsA = await db
        .select()
        .from(rounds)
        .where(eq(rounds.game_id, dataA.gameId))
        .orderBy(asc(rounds.ordem));
      expect(roundsA.map((r) => r.started_at!.getTime())).toEqual([
        opensAt.getTime(),
        opensAt.getTime() + 50 * 1000,
        opensAt.getTime() + 100 * 1000,
      ]);
      expect(dataB.gameId).not.toBe(dataA.gameId);

      const live = await getLive(champ.id, match.id, playerA);
      expect(live.currentRound).toBe(1);
      expect(live.resolvedAt).toBeNull();
      expect(live.rounds).toHaveLength(3);
      expect(live.rounds.every((r: { closed: boolean }) => !r.closed)).toBe(true);
    });

    it('live informa a fase do confronto e o total de fases do campeonato', async () => {
      const setup = await setupActiveChampionship({ prefix: 'f7_phase' });
      const { match, playerA } = sidesOf(setup);

      const live = await getLive(setup.champ.id, match.id, playerA);
      expect(live.phase).toBe(1);
      expect(live.totalPhases).toBe(2);
    });

    it('consolidação de duelo: vitória por pontos promove o vencedor para a próxima fase', async () => {
      const { champ, players, matches } = await setupActiveChampionship({ prefix: 'f5_pts' });
      const match = matches[0];
      const playerA = players.find((p) => p.userId === match.player_a_id)!;
      const playerB = players.find((p) => p.userId === match.player_b_id)!;

      const past = new Date(Date.now() - 500 * 1000);
      await db
        .update(championshipMatches)
        .set({ opens_at: past })
        .where(eq(championshipMatches.id, match.id));

      const resA = await app.inject({
        method: 'POST',
        url: `/api/championships/${champ.id}/matches/${match.id}/enter`,
        headers: { cookie: playerA.cookie },
      });
      const resB = await app.inject({
        method: 'POST',
        url: `/api/championships/${champ.id}/matches/${match.id}/enter`,
        headers: { cookie: playerB.cookie },
      });
      const dataA = JSON.parse(resA.body);
      const dataB = JSON.parse(resB.body);

      await db
        .update(rounds)
        .set({ pontos: 4000, distancia: 100 })
        .where(eq(rounds.id, dataA.rounds[0].id));
      await db
        .update(rounds)
        .set({ pontos: 1000, distancia: 5000 })
        .where(eq(rounds.id, dataB.rounds[0].id));

      const liveRes = await app.inject({
        method: 'GET',
        url: `/api/championships/${champ.id}/matches/${match.id}/live`,
        headers: { cookie: playerA.cookie },
      });
      expect(liveRes.statusCode).toBe(200);
      const liveData = JSON.parse(liveRes.body);

      expect(liveData.resolvedAt).not.toBeNull();
      expect(liveData.winnerId).toBe(playerA.userId);

      const [finalMatch] = await db
        .select()
        .from(championshipMatches)
        .where(
          and(
            eq(championshipMatches.championship_id, champ.id),
            eq(championshipMatches.phase, 2),
            eq(championshipMatches.slot, 0)
          )
        );
      expect([finalMatch.player_a_id, finalMatch.player_b_id]).toContain(playerA.userId);

      const [eliminated] = await db
        .select()
        .from(championshipParticipants)
        .where(
          and(
            eq(championshipParticipants.championship_id, champ.id),
            eq(championshipParticipants.user_id, playerB.userId)
          )
        );
      expect(eliminated.eliminated_in_phase).toBe(1);
    });

    it('consolidação com W.O. de um lado (um jogou, outro não) declara vencedor o presente', async () => {
      const { champ, players, matches } = await setupActiveChampionship({ prefix: 'f5_wos' });
      const match = matches[0];
      const playerA = players.find((p) => p.userId === match.player_a_id)!;
      const playerB = players.find((p) => p.userId === match.player_b_id)!;

      const past = new Date(Date.now() - 500 * 1000);
      await db
        .update(championshipMatches)
        .set({ opens_at: past })
        .where(eq(championshipMatches.id, match.id));

      const resA = await app.inject({
        method: 'POST',
        url: `/api/championships/${champ.id}/matches/${match.id}/enter`,
        headers: { cookie: playerA.cookie },
      });
      const dataA = JSON.parse(resA.body);

      await db
        .update(rounds)
        .set({ pontos: 2500, distancia: 300 })
        .where(eq(rounds.id, dataA.rounds[0].id));

      const liveRes = await app.inject({
        method: 'GET',
        url: `/api/championships/${champ.id}/matches/${match.id}/live`,
        headers: { cookie: playerA.cookie },
      });
      const liveData = JSON.parse(liveRes.body);

      expect(liveData.resolvedAt).not.toBeNull();
      expect(liveData.winnerId).toBe(playerA.userId);
    });

    it('consolidação com W.O. dos dois lados (nenhum jogou) desempata por menor seed e não trava a chave', async () => {
      const { champ, players, matches } = await setupActiveChampionship({ prefix: 'f5_wob' });
      const match = matches[0];
      const playerA = players.find((p) => p.userId === match.player_a_id)!;

      const past = new Date(Date.now() - 500 * 1000);
      await db
        .update(championshipMatches)
        .set({ opens_at: past })
        .where(eq(championshipMatches.id, match.id));

      const liveRes = await app.inject({
        method: 'GET',
        url: `/api/championships/${champ.id}/matches/${match.id}/live`,
        headers: { cookie: playerA.cookie },
      });
      const liveData = JSON.parse(liveRes.body);

      expect(liveData.resolvedAt).not.toBeNull();
      expect(liveData.winnerId).not.toBeNull();
    });

    it('GET /api/championships lista campeonatos com status e flag joined', async () => {
      const { champ, players } = await setupActiveChampionship({ prefix: 'f5_list' });
      const p0 = players[0];

      const res = await app.inject({
        method: 'GET',
        url: '/api/championships',
        headers: { cookie: p0.cookie },
      });
      expect(res.statusCode).toBe(200);
      const list = JSON.parse(res.body) as {
        id: string;
        joined: boolean;
        participants: number;
      }[];
      const found = list.find((c) => c.id === champ.id);
      expect(found).toBeDefined();
      expect(found?.joined).toBe(true);
      expect(found?.participants).toBe(4);
    });

    it('GET /api/championships/:id retorna detalhe completo com chave, participantes e myStatus', async () => {
      const { champ, players } = await setupActiveChampionship({ prefix: 'f5_det' });
      const p0 = players[0];

      const res = await app.inject({
        method: 'GET',
        url: `/api/championships/${champ.id}`,
        headers: { cookie: p0.cookie },
      });
      expect(res.statusCode).toBe(200);
      const detail = JSON.parse(res.body);
      expect(detail.id).toBe(champ.id);
      expect(detail.participants).toHaveLength(4);
      expect(detail.matches).toHaveLength(3);
      expect(detail.joined).toBe(true);
      expect(detail.myStatus).toBe('ready_to_play');
      expect(detail.myMatch).not.toBeNull();
    });
  });
});
