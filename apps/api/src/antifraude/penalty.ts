export interface PenaltyMatch {
  totalScore?: number;
  total_score?: number;
  flaggedReason?: string | null;
  flagged_reason?: string | null;
  championshipMatchId?: string | null;
  championship_match_id?: string | null;
  finishedAt?: Date | string | null;
  finished_at?: Date | string | null;
}

export interface DebtCalculationResult {
  debt: number;
  lastChangedAt: Date | null;
}

function getScore(g: PenaltyMatch): number {
  return Number(g.totalScore ?? g.total_score ?? 0);
}

function isFlagged(g: PenaltyMatch): boolean {
  const reason = g.flaggedReason ?? g.flagged_reason;
  return reason !== null && reason !== undefined && reason !== '';
}

function isChampionship(g: PenaltyMatch): boolean {
  const matchId = g.championshipMatchId ?? g.championship_match_id;
  return matchId !== null && matchId !== undefined && matchId !== '';
}

function getFinishedAt(g: PenaltyMatch): Date | null {
  const dt = g.finishedAt ?? g.finished_at;
  if (!dt) return null;
  return dt instanceof Date ? dt : new Date(dt);
}

export function calculateDebt(games: PenaltyMatch[]): DebtCalculationResult {
  const finished = games
    .filter((g) => getFinishedAt(g) !== null)
    .sort((a, b) => getFinishedAt(a)!.getTime() - getFinishedAt(b)!.getTime());

  let debt = 0;
  let lastChangedAt: Date | null = null;

  for (const game of finished) {
    const score = getScore(game);
    const finishedAt = getFinishedAt(game)!;
    const prevDebt = debt;

    if (isFlagged(game)) {
      debt += score;
    } else if (!isChampionship(game)) {
      debt = Math.max(0, debt - score);
    }

    if (debt !== prevDebt) {
      lastChangedAt = finishedAt;
    }
  }

  return { debt, lastChangedAt };
}
