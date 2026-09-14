export type RankingPeriod = 'semana' | 'geral';

export interface ApiRankingEntry {
  userId: string;
  nick: string;
  avatarId: number;
  score: number;
  achievedAt: string;
  position: number;
}

export interface ApiRankingResponse {
  period: RankingPeriod;
  total: number;
  entries: ApiRankingEntry[];
  me: { position: number; score: number } | null;
}

export async function getRanking(
  period: RankingPeriod,
  limit = 20,
  offset = 0
): Promise<ApiRankingResponse> {
  const res = await fetch(`/api/ranking?period=${period}&limit=${limit}&offset=${offset}`);

  if (!res.ok) {
    throw new Error(`Falha ao carregar o ranking (${res.status} ${res.statusText})`);
  }

  return res.json();
}
