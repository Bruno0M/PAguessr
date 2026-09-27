import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, asc, eq } from 'drizzle-orm';
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
import { getChampionshipRanking } from '../routes/championshipRankingRoutes.js';
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

  /**
   * Cria a partida de um lado do confronto, com um palpite, e liga a partida no
   * confronto — é o que faz o lado valer como "presente" na consolidação.
   * `withGuess: false` simula quem entrou mas só deixou o cronômetro zerar
   * (timeout em todas as rodadas): zerou, mas não jogou.
   */
  async function playDuelSide(
    match: { id: string; player_a_id: string | null; player_b_id: string | null },
    side: 'a' | 'b',
    options: { pontos: number; distancia?: number | null; withGuess?: boolean }
  ) {
    const userId = side === 'a' ? match.player_a_id : match.player_b_id;
    const withGuess = options.withGuess ?? true;
    const distancia = options.distancia ?? 50;

    const [game] = await db
      .insert(games)
      .values({
        user_id: userId!,
        championship_match_id: match.id,
        total_score: options.pontos,
        finished_at: new Date(Date.now() - 1000 * 1000),
      })
      .returning();

    await db.insert(rounds).values({
      game_id: game.id,
      location_id: 1,
      ordem: 1,
      distancia: withGuess ? distancia : null,
      pontos: options.pontos,
      guess_lat: withGuess ? -9.4 : null,
      guess_lng: withGuess ? -38.2 : null,
    });

    await db
      .update(championshipMatches)
      .set(side === 'a' ? { game_a_id: game.id } : { game_b_id: game.id })
      .where(eq(championshipMatches.id, match.id));

    return game;
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
    // Intervalo de 1 h: a final fica esperando, e este teste é só sobre a fase 1.
    const champ = await createTestChampionship(4, 3600);

    const phase1Matches = await db
      .select()
      .from(championshipMatches)
      .where(
        and(eq(championshipMatches.championship_id, champ.id), eq(championshipMatches.phase, 1))
      );

    const match0 = phase1Matches.find((m) => m.slot === 0)!;
    const match1 = phase1Matches.find((m) => m.slot === 1)!;

    // Os quatro lados jogam de verdade (quem não joga não ganha o confronto, ver
    // o teste de W.O. logo abaixo): no slot 0 ganha o player_a, no slot 1 o
    // player_b, para os dois lados de chegada na final serem distintos.
    await playDuelSide(match0, 'a', { pontos: 4000, distancia: 50 });
    await playDuelSide(match0, 'b', { pontos: 1000, distancia: 900 });
    await playDuelSide(match1, 'a', { pontos: 1000, distancia: 900 });
    await playDuelSide(match1, 'b', { pontos: 4000, distancia: 50 });

    const result = await advanceChampionship(champ.id);
    expect(result.advanced).toBe(true);
    expect(result.resolvedMatchesCount).toBe(2);
    expect(result.promotedCount).toBe(2);

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

    expect(updatedMatch0.winner_id).toBe(match0.player_a_id);
    expect(updatedMatch1.winner_id).toBe(match1.player_b_id);

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

  it('quando a final é jogada e resolvida, status do campeonato vira finalizado com o campeão', async () => {
    // Campeonato de 4 jogadores; a fase 1 abriu há 30 min e a final só abre
    // depois de 1 h de intervalo, então dá para jogar a final antes dela abrir.
    const champ = await createTestChampionship(4, 3600, 60, 5);

    const phase1Matches = await db
      .select()
      .from(championshipMatches)
      .where(
        and(eq(championshipMatches.championship_id, champ.id), eq(championshipMatches.phase, 1))
      )
      .orderBy(asc(championshipMatches.slot));

    // Os quatro jogam: sem palpite de verdade não há vencedor para promover.
    for (const match of phase1Matches) {
      await playDuelSide(match, 'a', { pontos: 4200, distancia: 30 });
      await playDuelSide(match, 'b', { pontos: 900, distancia: 1500 });
    }

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
    expect(finalMatch.player_a_id).toBe(phase1Matches[0].player_a_id);
    expect(finalMatch.player_b_id).toBe(phase1Matches[1].player_a_id);
    expect(finalMatch.resolved_at).toBeNull();

    // Final jogada de verdade pelo vencedor do primeiro slot.
    await playDuelSide(finalMatch, 'a', { pontos: 4800, distancia: 20 });
    await playDuelSide(finalMatch, 'b', { pontos: 200, distancia: 3000 });
    // A final abriu depois do intervalo, e o relógio dela já venceu.
    await db
      .update(championshipMatches)
      .set({ opens_at: new Date(Date.now() - 1800 * 1000) })
      .where(eq(championshipMatches.id, finalMatch.id));

    // `force` é o atalho do admin ("Avançar"): avalia a fase atual mesmo com o
    // intervalo de 1 h ainda por correr.
    const result = await advanceChampionship(champ.id, { force: true });
    expect(result.status).toBe('finalizado');

    const [updatedChamp] = await db
      .select()
      .from(championships)
      .where(eq(championships.id, champ.id));

    expect(updatedChamp.status).toBe('finalizado');
    expect(updatedChamp.finished_at).not.toBeNull();

    const [resolvedFinal] = await db
      .select()
      .from(championshipMatches)
      .where(eq(championshipMatches.id, finalMatch.id));

    expect(resolvedFinal.resolved_at).not.toBeNull();
    expect(resolvedFinal.winner_id).toBe(phase1Matches[0].player_a_id);
    expect(new Date(updatedChamp.finished_at!).getTime()).toBe(
      new Date(resolvedFinal.resolved_at!).getTime()
    );
  });

  it('NÃO COROA CAMPEÃO: nobody entra na final, o campeonato termina sem vencedor nenhum', async () => {
    // Regressão do bug reportado: quando ninguém jogou nada, o avanço antigo
    // resolvia cada confronto por W.O. (menor seed) e consagrava um campeão
    // com 0 ponto e 0 rodada disputada. Ninguém joga, ninguém ganha.
    const champ = await createTestChampionship(4, 10, 60, 5);

    // A fase 1 inteira passa do tempo sem ninguém entrar em nenhum confronto.
    const result = await advanceChampionship(champ.id, { force: true });
    expect(result.status).toBe('finalizado');
    expect(result.resolvedMatchesCount).toBe(3);
    expect(result.promotedCount).toBe(0);

    const matches = await db
      .select()
      .from(championshipMatches)
      .where(eq(championshipMatches.championship_id, champ.id));

    // Todo confronto resolvido, nenhum com vencedor, todo mundo 0 a 0.
    expect(matches.every((m) => m.resolved_at !== null)).toBe(true);
    expect(matches.every((m) => m.winner_id === null)).toBe(true);
    expect(matches.every((m) => m.score_a === 0 && m.score_b === 0)).toBe(true);

    // Ninguém promovido para a final e ninguém eliminado.
    const finalMatch = matches.find((m) => m.phase === 2)!;
    expect(finalMatch.player_a_id).toBeNull();
    expect(finalMatch.player_b_id).toBeNull();

    const participants = await db
      .select()
      .from(championshipParticipants)
      .where(eq(championshipParticipants.championship_id, champ.id));
    expect(participants).toHaveLength(4);
    expect(participants.every((p) => p.eliminated_in_phase === null)).toBe(true);

    // E o ranking não mostra ninguém como campeão: todo mundo ficou na fase 1.
    const ranking = await getChampionshipRanking(champ.id);
    expect(ranking).toHaveLength(4);
    expect(ranking.every((entry) => entry.phaseReached === 1)).toBe(true);
    expect(ranking.every((entry) => entry.totalScore === 0)).toBe(true);
  });

  it('só dá W.O. quando alguém realmente jogou: quem só deu timeout não ganha nada', async () => {
    const champ = await createTestChampionship(4, 10, 60, 5);

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

    // Os dois entram no confronto, mas os dois só deixam o cronômetro zerar:
    // tem partida criada, tem 0 ponto, e nenhum deles palpitou.
    await playDuelSide(match0, 'a', { pontos: 0, withGuess: false });
    await playDuelSide(match0, 'b', { pontos: 0, withGuess: false });

    await advanceChampionship(champ.id);

    const [resolved] = await db
      .select()
      .from(championshipMatches)
      .where(eq(championshipMatches.id, match0.id));
    expect(resolved.resolved_at).not.toBeNull();
    expect(resolved.winner_id).toBeNull();
  });

  it('W.O. de um lado só: quem jogou leva o confronto e é promovido', async () => {
    const champ = await createTestChampionship(4, 10, 60, 5);

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

    // Só o lado A entra e palpite; o adversário nem chegou a abrir partida.
    await playDuelSide(match0, 'a', { pontos: 3000, distancia: 120 });

    const result = await advanceChampionship(champ.id);
    expect(result.promotedCount).toBeGreaterThanOrEqual(1);

    const [resolved] = await db
      .select()
      .from(championshipMatches)
      .where(eq(championshipMatches.id, match0.id));
    expect(resolved.winner_id).toBe(match0.player_a_id);
    expect(resolved.score_b).toBe(0);

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
    expect(finalMatch.player_a_id).toBe(match0.player_a_id);

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

  it('partida marcada perde o duelo (score 0 e distância infinita)', async () => {
    const champ = await createTestChampionship(4);

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
        total_score: 5000,
        flagged_reason: 'tempo_desumano',
        finished_at: new Date(Date.now() - 1000 * 1000),
      })
      .returning();

    await db.insert(rounds).values({
      game_id: gameA.id,
      location_id: 1,
      ordem: 1,
      distancia: 10,
      pontos: 5000,
      guess_lat: -9.4,
      guess_lng: -38.2,
    });

    const [gameB] = await db
      .insert(games)
      .values({
        user_id: match0.player_b_id!,
        championship_match_id: match0.id,
        total_score: 1000,
        flagged_reason: null,
        finished_at: new Date(Date.now() - 1000 * 1000),
      })
      .returning();

    await db.insert(rounds).values({
      game_id: gameB.id,
      location_id: 1,
      ordem: 1,
      distancia: 500,
      pontos: 1000,
      guess_lat: -9.41,
      guess_lng: -38.21,
    });

    await db
      .update(championshipMatches)
      .set({ game_a_id: gameA.id, game_b_id: gameB.id })
      .where(eq(championshipMatches.id, match0.id));

    const result = await advanceChampionship(champ.id);
    expect(result.advanced).toBe(true);

    const [updatedMatch0] = await db
      .select()
      .from(championshipMatches)
      .where(eq(championshipMatches.id, match0.id));

    expect(updatedMatch0.score_a).toBe(0);
    expect(updatedMatch0.score_b).toBe(1000);
    expect(updatedMatch0.winner_id).toBe(match0.player_b_id);
  });
});
