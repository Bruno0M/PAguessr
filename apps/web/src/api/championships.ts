import { syncServerClock } from '../lib/serverClock';

export type ChampionshipStatus =
  'inscricoes' | 'chaveado' | 'em_andamento' | 'finalizado' | 'cancelado';

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
    'not_joined' | 'waiting' | 'ready_to_play' | 'waiting_next_phase' | 'eliminated' | 'spectator';
  serverTime?: string;
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
  serverTime?: string;
}

export interface LiveMatchOpponent {
  id: string;
  nick: string;
  avatarId: number;
}

export interface LiveMatchRound {
  order: number;
  /** Os dois responderam ou o tempo acabou: só então os pontos do adversário aparecem. */
  closed: boolean;
  myPoints: number | null;
  myDistance: number | null;
  opponentPoints: number | null;
  opponentDistance: number | null;
}

export interface LiveMatchResponse {
  currentRound: number;
  current_round?: number;
  myScore: number;
  my_score?: number;
  /** Fase deste confronto e total de fases: o resultado precisa saber se era a final. */
  phase: number;
  totalPhases: number;
  /** Soma dos pontos do adversário só nas rodadas fechadas. */
  opponentScore: number;
  opponent: LiveMatchOpponent | null;
  rounds: LiveMatchRound[];
  /** Placar consolidado pelo servidor, depois que o duelo é resolvido. */
  finalScore: { me: number; opponent: number } | null;
  opponentRoundsAnswered: number;
  opponent_rounds_answered?: number;
  resolvedAt: string | null;
  resolved_at?: string | null;
  winnerId: string | null;
  winner_id?: string | null;
  serverTime?: string;
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

// Igual ao fetch + handleResponse, mas aproveita o `serverTime` da resposta pra
// calibrar o relógio do servidor (lib/serverClock.ts). O instante da resposta é
// medido assim que os cabeçalhos chegam, antes de ler o corpo.
async function fetchWithClock<T>(url: string, init: RequestInit): Promise<T> {
  const requestStartedAt = Date.now();
  const res = await fetch(url, init);
  const responseAt = Date.now();
  const data = await handleResponse<T>(res);
  const serverTime = (data as { serverTime?: unknown }).serverTime;
  if (typeof serverTime === 'string') {
    syncServerClock(serverTime, requestStartedAt, responseAt);
  }
  return data;
}

export async function getChampionships(): Promise<ChampionshipListItem[]> {
  const res = await fetch('/api/championships', { credentials: 'include' });
  const data = await handleResponse<
    ChampionshipListItem[] | { championships: ChampionshipListItem[] }
  >(res);
  return Array.isArray(data) ? data : (data.championships ?? []);
}

export async function getChampionship(id: string): Promise<ChampionshipDetail> {
  const data = await fetchWithClock<ChampionshipDetail | { championship: ChampionshipDetail }>(
    `/api/championships/${id}`,
    { credentials: 'include' }
  );
  return 'championship' in data && data.championship
    ? data.championship
    : (data as ChampionshipDetail);
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
  const data = await handleResponse<
    ChampionshipRankingEntry[] | { ranking: ChampionshipRankingEntry[] }
  >(res);
  return Array.isArray(data) ? data : (data.ranking ?? []);
}

export async function enterMatch(
  championshipId: string,
  matchId: string
): Promise<EnterMatchResponse> {
  return fetchWithClock<EnterMatchResponse>(
    `/api/championships/${championshipId}/matches/${matchId}/enter`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

export async function getLiveMatch(
  championshipId: string,
  matchId: string
): Promise<LiveMatchResponse> {
  return fetchWithClock<LiveMatchResponse>(
    `/api/championships/${championshipId}/matches/${matchId}/live`,
    { credentials: 'include' }
  );
}
