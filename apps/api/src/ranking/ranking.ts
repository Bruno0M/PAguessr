import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import { type RankingEntry, type RankingPeriod } from '@paguessr/shared';
import { db } from '../db/index.js';
import { games, users } from '../db/schema.js';
import { getWeekStartBRT } from './period.js';
import { calculateDebt } from '../antifraude/penalty.js';

export interface CalculateRankingOptions {
  unflagGameIds?: Set<string>;
}

export async function calculateRanking(
  period: RankingPeriod,
  options?: CalculateRankingOptions
): Promise<RankingEntry[]> {
  const unflagIds = options?.unflagGameIds;
  const hasUnflags = Boolean(unflagIds && unflagIds.size > 0);

  const flagCondition = hasUnflags
    ? or(isNull(games.flagged_reason), inArray(games.id, Array.from(unflagIds!)))
    : isNull(games.flagged_reason);

  const bestPerUser = await db
    .selectDistinctOn([games.user_id], {
      userId: games.user_id,
      score: games.total_score,
      achievedAt: games.finished_at,
      nick: users.nick,
      avatarId: users.avatar_id,
    })
    .from(games)
    .innerJoin(users, eq(games.user_id, users.id))
    .where(
      and(
        isNotNull(games.finished_at),
        flagCondition,
        isNull(games.championship_match_id),
        period === 'semana' ? gte(games.finished_at, getWeekStartBRT()) : undefined
      )
    )
    .orderBy(games.user_id, desc(games.total_score), asc(games.finished_at));

  const flaggedUserGames = await db
    .select({
      id: games.id,
      userId: games.user_id,
    })
    .from(games)
    .where(and(isNotNull(games.finished_at), isNotNull(games.flagged_reason)));

  const actuallyFlaggedGames = hasUnflags
    ? flaggedUserGames.filter((g) => !unflagIds!.has(g.id))
    : flaggedUserGames;

  const candidateDebtUserIds = Array.from(new Set(actuallyFlaggedGames.map((g) => g.userId)));

  const usersWithDebt: Array<{
    userId: string;
    nick: string;
    avatarId: number;
    score: number;
    achievedAt: Date;
  }> = [];
  const debtUserIds = new Set<string>();

  if (candidateDebtUserIds.length > 0) {
    const allGamesForCandidates = await db
      .select({
        id: games.id,
        userId: games.user_id,
        totalScore: games.total_score,
        flaggedReason: games.flagged_reason,
        championshipMatchId: games.championship_match_id,
        finishedAt: games.finished_at,
      })
      .from(games)
      .where(and(inArray(games.user_id, candidateDebtUserIds), isNotNull(games.finished_at)))
      .orderBy(asc(games.finished_at));

    const candidateProfiles = await db
      .select({
        id: users.id,
        nick: users.nick,
        avatarId: users.avatar_id,
      })
      .from(users)
      .where(inArray(users.id, candidateDebtUserIds));

    const profileMap = new Map(candidateProfiles.map((p) => [p.id, p]));

    const gamesByUser = new Map<string, typeof allGamesForCandidates>();
    for (const g of allGamesForCandidates) {
      const list = gamesByUser.get(g.userId) ?? [];
      list.push(g);
      gamesByUser.set(g.userId, list);
    }

    for (const [userId, userGames] of gamesByUser.entries()) {
      const penaltyGames = userGames.map((g) => ({
        totalScore: g.totalScore,
        flaggedReason: hasUnflags && unflagIds!.has(g.id) ? null : g.flaggedReason,
        championshipMatchId: g.championshipMatchId,
        finishedAt: g.finishedAt,
      }));

      const debtResult = calculateDebt(penaltyGames);
      if (debtResult.debt > 0) {
        debtUserIds.add(userId);
        const profile = profileMap.get(userId);
        if (profile && debtResult.lastChangedAt) {
          usersWithDebt.push({
            userId,
            nick: profile.nick,
            avatarId: profile.avatarId,
            score: -debtResult.debt,
            achievedAt: debtResult.lastChangedAt,
          });
        }
      }
    }
  }

  const validEntries = bestPerUser
    .filter((r) => !debtUserIds.has(r.userId))
    .map((r) => ({
      userId: r.userId,
      nick: r.nick,
      avatarId: r.avatarId,
      score: r.score,
      achievedAt: r.achievedAt as Date,
    }));

  const allEntries = [...validEntries, ...usersWithDebt];

  return allEntries
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const diff = a.achievedAt.getTime() - b.achievedAt.getTime();
      if (diff !== 0) return diff;
      return a.userId.localeCompare(b.userId);
    })
    .map((r, idx) => ({
      userId: r.userId,
      nick: r.nick,
      avatarId: r.avatarId,
      score: r.score,
      achievedAt: r.achievedAt.toISOString(),
      position: idx + 1,
    }));
}
