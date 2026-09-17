export type ChampionshipStatus =
  | 'inscricoes'
  | 'chaveado'
  | 'em_andamento'
  | 'finalizado'
  | 'cancelado';

export interface ChampionshipListItem {
  id: string;
  title: string;
  description?: string | null;
  banner_url?: string | null;
  banner?: string | null;
  status: ChampionshipStatus;
  participants: number;
  max_participants: number;
  joined: boolean;
  rounds_per_match?: number;
  round_duration_seconds?: number;
  phase_interval_seconds?: number;
  winner_id?: string | null;
  winner_nick?: string | null;
  winner_avatar_id?: number | null;
  champion?: {
    nick: string;
    avatarId?: number;
  } | null;
}

export interface ChampionshipParticipant {
  userId: string;
  user_id?: string;
  nick: string;
  avatarId: number;
  avatar_id?: number;
  seed: number | null;
  joinedAt: string;
  joined_at?: string;
  eliminatedInPhase: number | null;
  eliminated_in_phase?: number | null;
}

export interface ChampionshipMatch {
  id: string;
  championshipId: string;
  championship_id?: string;
  phase: number;
  slot: number;
  playerAId: string | null;
  player_a_id?: string | null;
  playerBId: string | null;
  player_b_id?: string | null;
  playerA?: { id: string; nick: string; avatarId: number } | null;
  playerB?: { id: string; nick: string; avatarId: number } | null;
  gameAId?: string | null;
  game_a_id?: string | null;
  gameBId?: string | null;
  game_b_id?: string | null;
  scoreA?: number | null;
  score_a?: number | null;
  scoreB?: number | null;
  score_b?: number | null;
  winnerId?: string | null;
  winner_id?: string | null;
  opensAt?: string | null;
  opens_at?: string | null;
  resolvedAt?: string | null;
  resolved_at?: string | null;
}

export interface ChampionshipDetail {
  id: string;
  title: string;
  description?: string | null;
  banner_url?: string | null;
  banner?: string | null;
  status: ChampionshipStatus;
  max_participants: number;
  rounds_per_match: number;
  round_duration_seconds: number;
  phase_interval_seconds: number;
  created_by: string;
  created_at: string;
  seeded_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  participants: ChampionshipParticipant[];
  matches: ChampionshipMatch[];
  joined?: boolean;
  myMatch?: ChampionshipMatch | null;
  myStatus?:
    | 'not_joined'
    | 'waiting'
    | 'ready_to_play'
    | 'waiting_next_phase'
    | 'eliminated'
    | 'spectator';
}

export interface ChampionshipRankingEntry {
  userId: string;
  user_id?: string;
  nick: string;
  avatarId: number;
  avatar_id?: number;
  phaseReached: number;
  phase_reached?: number;
  totalScore: number;
  total_score?: number;
  seed: number | null;
  position: number;
}

export interface EnterMatchRound {
  id: string | number;
  order: number;
  startedAt?: string | null;
  started_at?: string | null;
  durationSeconds?: number;
  duration_seconds?: number;
  streetview_mode?: 'static' | 'panorama';
}

export interface EnterMatchResponse {
  gameId: string;
  game_id?: string;
  rounds: EnterMatchRound[];
}

export interface LiveMatchResponse {
  currentRound: number;
  current_round?: number;
  myScore: number;
  my_score?: number;
  opponentRoundsAnswered: number;
  opponent_rounds_answered?: number;
  resolvedAt: string | null;
  resolved_at?: string | null;
  winnerId: string | null;
  winner_id?: string | null;
}

export class ChampionshipApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ChampionshipApiError';
    this.status = status;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 204) {
    return {} as T;
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const message =
      typeof data?.error === 'string'
        ? data.error
        : typeof data?.message === 'string'
          ? data.message
          : `Falha na requisição (${res.status})`;
    throw new ChampionshipApiError(message, res.status);
  }
  return data as T;
}

export async function getChampionships(): Promise<ChampionshipListItem[]> {
  const res = await fetch('/api/championships', { credentials: 'include' });
  const data = await handleResponse<ChampionshipListItem[] | { championships: ChampionshipListItem[] }>(res);
  return Array.isArray(data) ? data : data.championships ?? [];
}

export async function getChampionship(id: string): Promise<ChampionshipDetail> {
  const res = await fetch(`/api/championships/${id}`, { credentials: 'include' });
  const data = await handleResponse<ChampionshipDetail | { championship: ChampionshipDetail }>(res);
  return 'championship' in data && data.championship ? data.championship : (data as ChampionshipDetail);
}

export async function joinChampionship(id: string): Promise<void> {
  const res = await fetch(`/api/championships/${id}/join`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  await handleResponse(res);
}

export async function leaveChampionship(id: string): Promise<void> {
  const res = await fetch(`/api/championships/${id}/join`, {
    method: 'DELETE',
    credentials: 'include',
  });
  await handleResponse(res);
}

export async function getChampionshipRanking(id: string): Promise<ChampionshipRankingEntry[]> {
  const res = await fetch(`/api/championships/${id}/ranking`, { credentials: 'include' });
  const data = await handleResponse<ChampionshipRankingEntry[] | { ranking: ChampionshipRankingEntry[] }>(res);
  return Array.isArray(data) ? data : data.ranking ?? [];
}

export async function enterMatch(
  championshipId: string,
  matchId: string
): Promise<EnterMatchResponse> {
  const res = await fetch(`/api/championships/${championshipId}/matches/${matchId}/enter`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  return handleResponse<EnterMatchResponse>(res);
}

export async function getLiveMatch(
  championshipId: string,
  matchId: string
): Promise<LiveMatchResponse> {
  const res = await fetch(`/api/championships/${championshipId}/matches/${matchId}/live`, {
    credentials: 'include',
  });
  return handleResponse<LiveMatchResponse>(res);
}
