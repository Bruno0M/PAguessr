import {
  DUEL_REVEAL_SECONDS,
  phasesFor,
  type ChampionshipSize,
  type ChampionshipStatus,
} from '@paguessr/shared';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db, type Tx } from '../db/index.js';
import {
  championships,
  championshipMatches,
  championshipParticipants,
  games,
  rounds,
  type Championship,
  type ChampionshipMatch,
} from '../db/schema.js';
import { resolveDuel, getNextMatchDestination, type DuelPlayerInput } from './bracket.js';
import { matchEndTime, plannedMatchEnd } from './timeline.js';

export interface AdvanceOptions {
  force?: boolean;
  now?: Date;
}

export interface AdvanceResult {
  championship: Championship;
  advanced: boolean;
  status: ChampionshipStatus;
  currentPhase: number;
  resolvedMatchesCount: number;
  promotedCount: number;
}

async function getPlayerDuelStats(
  tx: Tx,
  gameId: string | null,
  userId: string | null,
  seed: number
): Promise<DuelPlayerInput> {
  if (!userId) {
    return {
      userId: '',
      seed: 999,
      totalScore: 0,
      totalDistanceMeters: Infinity,
      guessesCount: 0,
      hasGuessedAtLeastOnce: false,
      lastGuessAt: null,
    };
  }

  if (!gameId) {
    return {
      userId,
      seed,
      totalScore: 0,
      totalDistanceMeters: Infinity,
      guessesCount: 0,
      hasGuessedAtLeastOnce: false,
      lastGuessAt: null,
    };
  }

  const [game] = await tx.select().from(games).where(eq(games.id, gameId));
  const gameRounds = await tx.select().from(rounds).where(eq(rounds.game_id, gameId));

  const validGuesses = gameRounds.filter(
    (r) => r.pontos !== null || r.guess_lat !== null || r.distancia !== null
  );

  const hasGuessed = validGuesses.length > 0;
  const totalScore = game?.total_score ?? validGuesses.reduce((sum, r) => sum + (r.pontos ?? 0), 0);
  const totalDistance = hasGuessed
    ? validGuesses.reduce((sum, r) => sum + (r.distancia ?? 0), 0)
    : Infinity;

  return {
    userId,
    seed,
    totalScore,
    totalDistanceMeters: totalDistance,
    guessesCount: validGuesses.length,
    hasGuessedAtLeastOnce: hasGuessed,
    lastGuessAt: game?.finished_at ?? null,
  };
}

// Fim real do duelo (ver `timeline.matchEndTime`): os horários das rodadas já vêm
// com os adiantamentos de quando os dois responderam, e `games.finished_at` diz
// quando cada lado terminou tudo. Sem partida criada (ninguém entrou), vale o
// fim planejado.
async function realMatchEnd(tx: Tx, champ: Championship, match: ChampionshipMatch): Promise<Date> {
  const opensAt = match.opens_at!;
  const planned = plannedMatchEnd(
    opensAt,
    champ.rounds_per_match,
    champ.round_duration_seconds,
    DUEL_REVEAL_SECONDS
  );

  const gameIds = [match.game_a_id, match.game_b_id].filter((id): id is string => id !== null);
  if (gameIds.length === 0) return planned;

  const lastRounds = await tx
    .select({ startedAt: rounds.started_at })
    .from(rounds)
    .where(and(inArray(rounds.game_id, gameIds), eq(rounds.ordem, champ.rounds_per_match)));
  const lastStarts = lastRounds.flatMap((r) => (r.startedAt ? [r.startedAt.getTime()] : []));
  if (lastStarts.length === 0) return planned;

  const finished = async (gameId: string | null): Promise<Date | null> => {
    if (!gameId) return null;
    const [game] = await tx
      .select({ finishedAt: games.finished_at })
      .from(games)
      .where(eq(games.id, gameId));
    return game?.finishedAt ?? null;
  };

  return matchEndTime({
    lastRoundStart: new Date(Math.max(...lastStarts)),
    durationSeconds: champ.round_duration_seconds,
    finishedA: await finished(match.game_a_id),
    finishedB: await finished(match.game_b_id),
  });
}

async function resolveSingleMatch(
  tx: Tx,
  champ: Championship,
  match: ChampionshipMatch,
  totalPhases: number,
  resolvedAt: Date
): Promise<void> {
  const participantIds = [match.player_a_id, match.player_b_id].filter(Boolean) as string[];
  const participants =
    participantIds.length > 0
      ? await tx
          .select()
          .from(championshipParticipants)
          .where(
            and(
              eq(championshipParticipants.championship_id, champ.id),
              inArray(championshipParticipants.user_id, participantIds)
            )
          )
      : [];

  const partMap = new Map<string, { seed: number | null }>(participants.map((p) => [p.user_id, p]));

  const statsA = await getPlayerDuelStats(
    tx,
    match.game_a_id,
    match.player_a_id,
    partMap.get(match.player_a_id ?? '')?.seed ?? 0
  );

  const statsB = await getPlayerDuelStats(
    tx,
    match.game_b_id,
    match.player_b_id,
    partMap.get(match.player_b_id ?? '')?.seed ?? 1
  );

  let winnerId: string | null = null;
  let loserId: string | null = null;

  if (match.player_a_id && match.player_b_id) {
    const duelResult = resolveDuel(statsA, statsB);
    winnerId = duelResult.winnerId;
    loserId = winnerId === match.player_a_id ? match.player_b_id : match.player_a_id;
  } else if (match.player_a_id) {
    winnerId = match.player_a_id;
  } else if (match.player_b_id) {
    winnerId = match.player_b_id;
  }

  await tx
    .update(championshipMatches)
    .set({
      score_a: statsA.totalScore,
      score_b: statsB.totalScore,
      winner_id: winnerId,
      resolved_at: resolvedAt,
    })
    .where(eq(championshipMatches.id, match.id));

  if (loserId) {
    await tx
      .update(championshipParticipants)
      .set({ eliminated_in_phase: match.phase })
      .where(
        and(
          eq(championshipParticipants.championship_id, champ.id),
          eq(championshipParticipants.user_id, loserId)
        )
      );
  }

  if (winnerId && match.phase < totalPhases) {
    const dest = getNextMatchDestination(match.phase, match.slot);
    await tx
      .update(championshipMatches)
      .set(dest.side === 'player_a' ? { player_a_id: winnerId } : { player_b_id: winnerId })
      .where(
        and(
          eq(championshipMatches.championship_id, champ.id),
          eq(championshipMatches.phase, dest.phase),
          eq(championshipMatches.slot, dest.slot)
        )
      );
  }
}

export async function advanceChampionship(
  championshipId: string,
  options?: AdvanceOptions
): Promise<AdvanceResult> {
  return await db.transaction(async (tx) => {
    const [champ] = await tx
      .select()
      .from(championships)
      .where(eq(championships.id, championshipId))
      .for('update');

    if (!champ) {
      throw new Error(`Campeonato não encontrado: ${championshipId}`);
    }

    if (champ.status !== 'em_andamento') {
      return {
        championship: champ,
        advanced: false,
        status: champ.status,
        currentPhase: 0,
        resolvedMatchesCount: 0,
        promotedCount: 0,
      };
    }

    const totalPhases = phasesFor(champ.max_participants as ChampionshipSize);
    const now = options?.now ?? new Date();

    const phase1Matches = await tx
      .select()
      .from(championshipMatches)
      .where(
        and(
          eq(championshipMatches.championship_id, championshipId),
          eq(championshipMatches.phase, 1)
        )
      );

    if (phase1Matches.length > 0 && phase1Matches.some((m) => m.opens_at === null)) {
      const phase1OpensAt = champ.started_at ?? now;
      await tx
        .update(championshipMatches)
        .set({ opens_at: phase1OpensAt })
        .where(
          and(
            eq(championshipMatches.championship_id, championshipId),
            eq(championshipMatches.phase, 1),
            isNull(championshipMatches.opens_at)
          )
        );
    }

    let resolvedMatchesCount = 0;
    let promotedCount = 0;
    let anyAdvanced = false;
    let currentPhase = 1;

    for (let phase = 1; phase <= totalPhases; phase++) {
      currentPhase = phase;
      const phaseMatches = await tx
        .select()
        .from(championshipMatches)
        .where(
          and(
            eq(championshipMatches.championship_id, championshipId),
            eq(championshipMatches.phase, phase)
          )
        )
        .orderBy(asc(championshipMatches.slot));

      if (phaseMatches.length === 0) {
        break;
      }

      const openedMatches = phaseMatches.filter((m) => m.opens_at !== null);
      if (openedMatches.length === 0) {
        break;
      }

      for (const match of phaseMatches) {
        if (match.resolved_at !== null) {
          continue;
        }

        if (!match.opens_at) {
          continue;
        }

        const matchEnd = await realMatchEnd(tx, champ, match);
        const isExpired = now.getTime() >= matchEnd.getTime();

        if (!isExpired && !options?.force) {
          continue;
        }

        const resolvedAtTimestamp =
          options?.force && now.getTime() < matchEnd.getTime() ? now : matchEnd;

        await resolveSingleMatch(tx, champ, match, totalPhases, resolvedAtTimestamp);

        resolvedMatchesCount++;
        promotedCount++;
        anyAdvanced = true;
      }

      const updatedPhaseMatches = await tx
        .select()
        .from(championshipMatches)
        .where(
          and(
            eq(championshipMatches.championship_id, championshipId),
            eq(championshipMatches.phase, phase)
          )
        );

      const allResolved =
        updatedPhaseMatches.length > 0 && updatedPhaseMatches.every((m) => m.resolved_at !== null);

      if (!allResolved) {
        break;
      }

      const maxResolvedAtMs = Math.max(
        ...updatedPhaseMatches.map((m) => new Date(m.resolved_at!).getTime())
      );
      const maxResolvedAt = new Date(maxResolvedAtMs);

      if (phase < totalPhases) {
        const nextOpensAt = new Date(maxResolvedAtMs + champ.phase_interval_seconds * 1000);

        await tx
          .update(championshipMatches)
          .set({ opens_at: nextOpensAt })
          .where(
            and(
              eq(championshipMatches.championship_id, championshipId),
              eq(championshipMatches.phase, phase + 1),
              isNull(championshipMatches.opens_at)
            )
          );

        const nextPhaseEndTime = plannedMatchEnd(
          nextOpensAt,
          champ.rounds_per_match,
          champ.round_duration_seconds,
          DUEL_REVEAL_SECONDS
        );
        if (now.getTime() < nextPhaseEndTime.getTime() && !options?.force) {
          break;
        }
      } else {
        await tx
          .update(championships)
          .set({
            status: 'finalizado',
            finished_at: maxResolvedAt,
          })
          .where(eq(championships.id, championshipId));

        anyAdvanced = true;
        break;
      }
    }

    const [latestChamp] = await tx
      .select()
      .from(championships)
      .where(eq(championships.id, championshipId));

    return {
      championship: latestChamp,
      advanced: anyAdvanced,
      status: latestChamp.status,
      currentPhase,
      resolvedMatchesCount,
      promotedCount,
    };
  });
}
