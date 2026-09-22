import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, sql } from '../db/index.js';
import {
  championships,
  championshipMatches,
  championshipParticipants,
  games,
  rounds,
  users,
} from '../db/schema.js';
import { resetTestDatabase } from '../test/fixtures.js';
import { createInitialBracket } from './bracket.js';
import { advanceChampionship } from './advance.js';

describe('Avanço Preguiçoso de Campeonatos (advanceChampionship)', () => {
  let userIds: string[] = [];

  beforeAll(async () => {
    await resetTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();

    // Cria 8 usuários de teste com nicks válidos (sem palavras bloqueadas)
    userIds = [];
    for (let i = 0; i < 8; i++) {
      const [u] = await db
        .insert(users)
        .values({
          nick: `competidor${i}`,
          nick_normalizado: `competidor${i}`,
          password_hash: 'hash',
          recovery_code_hash: 'rec',
          avatar_id: i,
        })
        .returning();
      userIds.push(u.id);
    }
  });

  afterAll(async () => {
    await sql.end();
  });

  async function createTestChampionship(
    size: 4 | 8 = 4,
    intervalSeconds = 120,
    roundDuration = 60,
    roundsCount = 5
  ) {
    const creatorId = userIds[0];
    const [champ] = await db
      .insert(championships)
      .values({
        title: `Campeonato Teste ${size}`,
        max_participants: size,
        rounds_per_match: roundsCount,
        round_duration_seconds: roundDuration,
        phase_interval_seconds: intervalSeconds,
        status: 'em_andamento',
        created_by: creatorId,
        started_at: new Date(Date.now() - 3600 * 1000), // iniciado há 1 hora
      })
      .returning();

    const selectedUsers = userIds.slice(0, size).map((id) => ({ userId: id }));
    const { seededParticipants, matches } = createInitialBracket(selectedUsers, size);

    for (const p of seededParticipants) {
      await db.insert(championshipParticipants).values({
        championship_id: champ.id,
        user_id: p.userId,
        seed: p.seed,
      });
    }

    // Na largada, a fase 1 recebe opens_at
    const phase1OpensAt = new Date(Date.now() - 1800 * 1000); // 30 min atrás
    for (const m of matches) {
      await db.insert(championshipMatches).values({
        championship_id: champ.id,
        phase: m.phase,
        slot: m.slot,
        player_a_id: m.playerAId,
        player_b_id: m.playerBId,
        opens_at: m.phase === 1 ? phase1OpensAt : null,
      });
    }

    return champ;
  }

  it('consolida confronto da fase atual com tempo esgotado e promove vencedor', async () => {
    const champ = await createTestChampionship(4); // 4 participantes -> 2 fases (fase 1: 2 jogos, fase 2: final)

    // Cria um game e rounds para o player A do slot 0 para ele pontuar
    const [match0] = await db
      .select()
      .from(championshipMatches)
      .where(
        and(
          eq(championshipMatches.championship_id, champ.id),
          eq(championshipMatches.phase, 1),
          eq(championshipMatches.slot, 0)
        )
      );

    const [gameA] = await db
      .insert(games)
      .values({
        user_id: match0.player_a_id!,
        championship_match_id: match0.id,
        total_score: 4500,
        finished_at: new Date(Date.now() - 1000 * 1000),
      })
      .returning();

    await db.insert(rounds).values({
      game_id: gameA.id,
      location_id: 1,
      ordem: 1,
      distancia: 50,
      pontos: 4500,
      guess_lat: -9.4,
      guess_lng: -38.2,
    });

    await db
      .update(championshipMatches)
      .set({ game_a_id: gameA.id })
      .where(eq(championshipMatches.id, match0.id));

    const result = await advanceChampionship(champ.id);
    expect(result.advanced).toBe(true);

    const updatedMatches = await db
      .select()
      .from(championshipMatches)
      .where(eq(championshipMatches.championship_id, champ.id));

    const updatedMatch0 = updatedMatches.find((m) => m.phase === 1 && m.slot === 0);
    expect(updatedMatch0?.resolved_at).not.toBeNull();
    expect(updatedMatch0?.winner_id).toBe(match0.player_a_id);
    expect(updatedMatch0?.score_a).toBe(4500);

    // O perdedor deve ter sido marcado com eliminated_in_phase = 1
    const [eliminated] = await db
      .select()
      .from(championshipParticipants)
      .where(
        and(
          eq(championshipParticipants.championship_id, champ.id),
          eq(championshipParticipants.user_id, match0.player_b_id!)
        )
      );
    expect(eliminated.eliminated_in_phase).toBe(1);

    // O vencedor do slot 0 deve ter sido promovido para a fase 2, slot 0, lado player_a
    const finalMatch = updatedMatches.find((m) => m.phase === 2 && m.slot === 0);
    expect(finalMatch?.player_a_id).toBe(match0.player_a_id);
  });

  it('promove os vencedores da fase 1 para os slots e lados corretos da fase seguinte', async () => {
    const champ = await createTestChampionship(4);

    const phase1Matches = await db
      .select()
      .from(championshipMatches)
      .where(
        and(eq(championshipMatches.championship_id, champ.id), eq(championshipMatches.phase, 1))
      );

    const match0 = phase1Matches.find((m) => m.slot === 0)!;
    const match1 = phase1Matches.find((m) => m.slot === 1)!;

    // Resolve ambos por W.O. simulado (seeds determinam vencedor)
    await advanceChampionship(champ.id);

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

    const updatedMatch0 = (
      await db.select().from(championshipMatches).where(eq(championshipMatches.id, match0.id))
    )[0];
    const updatedMatch1 = (
      await db.select().from(championshipMatches).where(eq(championshipMatches.id, match1.id))
    )[0];

    // slot 0 vai para player_a, slot 1 vai para player_b
    expect(finalMatch.player_a_id).toBe(updatedMatch0.winner_id);
    expect(finalMatch.player_b_id).toBe(updatedMatch1.winner_id);
  });

  it('quando toda a fase é resolvida, abre a fase seguinte com opens_at = max(resolved_at) + phase_interval_seconds', async () => {
    const intervalSeconds = 300; // 5 minutos
    const champ = await createTestChampionship(4, intervalSeconds);

    const result = await advanceChampionship(champ.id);
    expect(result.advanced).toBe(true);

    const phase1Matches = await db
      .select()
      .from(championshipMatches)
      .where(
        and(eq(championshipMatches.championship_id, champ.id), eq(championshipMatches.phase, 1))
      );

    const maxResolvedAtMs = Math.max(
      ...phase1Matches.map((m) => new Date(m.resolved_at!).getTime())
    );
    const expectedOpensAt = new Date(maxResolvedAtMs + intervalSeconds * 1000);

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

    expect(finalMatch.opens_at).not.toBeNull();
    expect(new Date(finalMatch.opens_at!).getTime()).toBe(expectedOpensAt.getTime());
  });

  it('quando a final é resolvida, status do campeonato vira finalizado', async () => {
    // Cria campeonato de 4 jogadores onde a fase 1 abriu há 2 horas
    const champ = await createTestChampionship(4, 60, 60, 5);

    // Avança tudo: tempo atual é bem posterior a ambas as fases
    const result = await advanceChampionship(champ.id);
    expect(result.status).toBe('finalizado');

    const [updatedChamp] = await db
      .select()
      .from(championships)
      .where(eq(championships.id, champ.id));

    expect(updatedChamp.status).toBe('finalizado');
    expect(updatedChamp.finished_at).not.toBeNull();

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

    expect(finalMatch.resolved_at).not.toBeNull();
    expect(finalMatch.winner_id).not.toBeNull();
    expect(new Date(updatedChamp.finished_at!).getTime()).toBe(
      new Date(finalMatch.resolved_at!).getTime()
    );
  });

  it('IDEMPOTÊNCIA OBRIGATÓRIA: rodar o avanço duas vezes (ou dez) produz exatamente o mesmo resultado sem duplicar nada', async () => {
    const champ = await createTestChampionship(4);

    const firstRun = await advanceChampionship(champ.id);
    expect(firstRun.advanced).toBe(true);

    const matchesAfterFirst = await db
      .select()
      .from(championshipMatches)
      .where(eq(championshipMatches.championship_id, champ.id));
    const participantsAfterFirst = await db
      .select()
      .from(championshipParticipants)
      .where(eq(championshipParticipants.championship_id, champ.id));
    const [champAfterFirst] = await db
      .select()
      .from(championships)
      .where(eq(championships.id, champ.id));

    // Segunda execução
    const secondRun = await advanceChampionship(champ.id);
    expect(secondRun.status).toBe(firstRun.status);

    const matchesAfterSecond = await db
      .select()
      .from(championshipMatches)
      .where(eq(championshipMatches.championship_id, champ.id));
    const participantsAfterSecond = await db
      .select()
      .from(championshipParticipants)
      .where(eq(championshipParticipants.championship_id, champ.id));
    const [champAfterSecond] = await db
      .select()
      .from(championships)
      .where(eq(championships.id, champ.id));

    expect(matchesAfterSecond.length).toBe(matchesAfterFirst.length);
    expect(participantsAfterSecond.length).toBe(participantsAfterFirst.length);
    expect(champAfterSecond.status).toBe(champAfterFirst.status);
    expect(champAfterSecond.finished_at).toEqual(champAfterFirst.finished_at);

    for (let i = 0; i < matchesAfterFirst.length; i++) {
      expect(matchesAfterSecond[i].id).toBe(matchesAfterFirst[i].id);
      expect(matchesAfterSecond[i].winner_id).toBe(matchesAfterFirst[i].winner_id);
      expect(matchesAfterSecond[i].player_a_id).toBe(matchesAfterFirst[i].player_a_id);
      expect(matchesAfterSecond[i].player_b_id).toBe(matchesAfterFirst[i].player_b_id);
      expect(matchesAfterSecond[i].resolved_at).toEqual(matchesAfterFirst[i].resolved_at);
      expect(matchesAfterSecond[i].opens_at).toEqual(matchesAfterFirst[i].opens_at);
    }

    // Executa mais 8 vezes para totalizar 10 execuções
    for (let i = 0; i < 8; i++) {
      await advanceChampionship(champ.id);
    }

    const matchesAfterTenth = await db
      .select()
      .from(championshipMatches)
      .where(eq(championshipMatches.championship_id, champ.id));
    expect(matchesAfterTenth.length).toBe(matchesAfterFirst.length);
  });

  it('não consolida confronto cujo tempo ainda não se esgotou (quando não forçado)', async () => {
    const creatorId = userIds[0];
    const [champ] = await db
      .insert(championships)
      .values({
        title: 'Campeonato no futuro',
        max_participants: 4,
        rounds_per_match: 5,
        round_duration_seconds: 60,
        phase_interval_seconds: 60,
        status: 'em_andamento',
        created_by: creatorId,
        started_at: new Date(),
      })
      .returning();

    const selectedUsers = userIds.slice(0, 4).map((id) => ({ userId: id }));
    const { seededParticipants, matches } = createInitialBracket(selectedUsers, 4);

    for (const p of seededParticipants) {
      await db.insert(championshipParticipants).values({
        championship_id: champ.id,
        user_id: p.userId,
        seed: p.seed,
      });
    }

    // opens_at agora mesmo! Com 5 rodadas de 60s, o confronto dura 300s (5min no futuro)
    const phase1OpensAt = new Date();
    for (const m of matches) {
      await db.insert(championshipMatches).values({
        championship_id: champ.id,
        phase: m.phase,
        slot: m.slot,
        player_a_id: m.playerAId,
        player_b_id: m.playerBId,
        opens_at: m.phase === 1 ? phase1OpensAt : null,
      });
    }

    const result = await advanceChampionship(champ.id);
    expect(result.advanced).toBe(false);

    const phase1Matches = await db
      .select()
      .from(championshipMatches)
      .where(
        and(eq(championshipMatches.championship_id, champ.id), eq(championshipMatches.phase, 1))
      );

    expect(phase1Matches.every((m) => m.resolved_at === null)).toBe(true);
    expect(phase1Matches.every((m) => m.winner_id === null)).toBe(true);
  });

  it('opção force avança confronto mesmo antes do tempo esgotar', async () => {
    const creatorId = userIds[0];
    const [champ] = await db
      .insert(championships)
      .values({
        title: 'Campeonato forçado',
        max_participants: 4,
        rounds_per_match: 5,
        round_duration_seconds: 60,
        phase_interval_seconds: 60,
        status: 'em_andamento',
        created_by: creatorId,
        started_at: new Date(),
      })
      .returning();

    const selectedUsers = userIds.slice(0, 4).map((id) => ({ userId: id }));
    const { seededParticipants, matches } = createInitialBracket(selectedUsers, 4);

    for (const p of seededParticipants) {
      await db.insert(championshipParticipants).values({
        championship_id: champ.id,
        user_id: p.userId,
        seed: p.seed,
      });
    }

    for (const m of matches) {
      await db.insert(championshipMatches).values({
        championship_id: champ.id,
        phase: m.phase,
        slot: m.slot,
        player_a_id: m.playerAId,
        player_b_id: m.playerBId,
        opens_at: m.phase === 1 ? new Date() : null,
      });
    }

    const result = await advanceChampionship(champ.id, { force: true });
    expect(result.advanced).toBe(true);

    const phase1Matches = await db
      .select()
      .from(championshipMatches)
      .where(
        and(eq(championshipMatches.championship_id, champ.id), eq(championshipMatches.phase, 1))
      );

    expect(phase1Matches.every((m) => m.resolved_at !== null)).toBe(true);
  });
});
