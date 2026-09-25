import type { ChampionshipDetail, ChampionshipMatch } from '../../../api/championships';
import { totalPhasesFor } from '../phaseNames';

export interface LobbyPlayer {
  id: string;
  nick: string;
  avatarId: number;
  seed: number | null;
}

export interface LobbyMatch {
  id: string;
  phase: number;
  slot: number;
  a: LobbyPlayer | null;
  b: LobbyPlayer | null;
  opensAtMs: number | null;
  resolved: boolean;
  scoreA: number | null;
  scoreB: number | null;
}

/** O meu confronto atual, com quem eu enfrento e em que ponto do campeonato estamos. */
export interface LobbyMatchup {
  me: LobbyPlayer;
  match: LobbyMatch;
  phase: number;
  totalPhases: number;
}

export type LobbyLeaveReason = 'not_joined' | 'eliminated' | 'finished' | 'cancelled';

export type LobbyState =
  | { kind: 'leave'; reason: LobbyLeaveReason }
  | { kind: 'queue'; players: LobbyPlayer[]; capacity: number }
  | (LobbyMatchup & { kind: 'drawn'; opponent: LobbyPlayer; others: LobbyMatch[] })
  | (LobbyMatchup & {
      kind: 'countdown';
      opponent: LobbyPlayer;
      opensAtMs: number;
      others: LobbyMatch[];
    })
  | (LobbyMatchup & { kind: 'live'; opponent: LobbyPlayer; others: LobbyMatch[] })
  | (LobbyMatchup & { kind: 'waiting_phase'; opponent: LobbyPlayer; running: LobbyMatch[] })
  | (LobbyMatchup & { kind: 'waiting_opponent'; feeder: LobbyMatch | null });

function timeOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function involves(match: LobbyMatch, userId: string): boolean {
  return match.a?.id === userId || match.b?.id === userId;
}

/**
 * Onde a pessoa está na jornada do campeonato, só com o que o `GET
 * /championships/:id` já devolve. `nowMs` vem do relógio do servidor: é ele que
 * separa a contagem ("countdown") do duelo já aberto ("live").
 */
export function deriveLobbyState(
  detail: ChampionshipDetail,
  userId: string,
  nowMs: number
): LobbyState {
  const participants = detail.participants ?? [];
  const players = new Map<string, LobbyPlayer>(
    participants.map((p) => [
      p.userId,
      { id: p.userId, nick: p.nick, avatarId: p.avatarId, seed: p.seed },
    ])
  );

  const meRow = participants.find((p) => p.userId === userId);
  if (!meRow) return { kind: 'leave', reason: 'not_joined' };
  if (detail.status === 'cancelado') return { kind: 'leave', reason: 'cancelled' };
  if (detail.status === 'finalizado') return { kind: 'leave', reason: 'finished' };
  if (meRow.eliminatedInPhase !== null && meRow.eliminatedInPhase !== undefined) {
    return { kind: 'leave', reason: 'eliminated' };
  }

  const me = players.get(userId)!;
  const queue: LobbyState = {
    kind: 'queue',
    capacity: detail.max_participants,
    players: [...participants]
      .sort((x, y) => (timeOf(x.joinedAt) ?? 0) - (timeOf(y.joinedAt) ?? 0))
      .map((p) => players.get(p.userId)!),
  };
  if (detail.status === 'inscricoes') return queue;

  const toLobbyMatch = (m: ChampionshipMatch): LobbyMatch => ({
    id: m.id,
    phase: m.phase,
    slot: m.slot,
    a: m.playerAId ? (players.get(m.playerAId) ?? null) : null,
    b: m.playerBId ? (players.get(m.playerBId) ?? null) : null,
    opensAtMs: timeOf(m.opensAt),
    resolved: Boolean(m.resolvedAt),
    scoreA: m.scoreA ?? null,
    scoreB: m.scoreB ?? null,
  });
  const matches = (detail.matches ?? []).map(toLobbyMatch);
  const mine = matches.filter((m) => involves(m, userId));
  const totalPhases = totalPhasesFor(detail.max_participants);

  if (detail.status === 'chaveado') {
    const match = mine.find((m) => m.phase === 1);
    const opponent = match ? (match.a?.id === userId ? match.b : match.a) : null;
    if (!match || !opponent) return queue;
    return {
      kind: 'drawn',
      me,
      match,
      opponent,
      phase: match.phase,
      totalPhases,
      others: matches.filter((m) => m.phase === match.phase && m.id !== match.id),
    };
  }

  // em_andamento: o meu confronto é o primeiro ainda não resolvido.
  const match = mine.filter((m) => !m.resolved).sort((x, y) => x.phase - y.phase)[0];
  if (!match) return { kind: 'leave', reason: 'finished' };

  const base = { me, match, phase: match.phase, totalPhases };
  const opponent = match.a?.id === userId ? match.b : match.a;

  if (!opponent) {
    // Vaga aberta: quem preenche é o vencedor do outro confronto que alimenta este.
    const feeder =
      matches.find(
        (m) =>
          m.phase === match.phase - 1 &&
          (m.slot === match.slot * 2 || m.slot === match.slot * 2 + 1) &&
          !involves(m, userId)
      ) ?? null;
    return { kind: 'waiting_opponent', ...base, feeder };
  }

  if (match.opensAtMs === null) {
    return {
      kind: 'waiting_phase',
      ...base,
      opponent,
      running: matches.filter((m) => m.phase === match.phase - 1 && !involves(m, userId)),
    };
  }

  const others = matches.filter((m) => m.phase === match.phase && m.id !== match.id);
  if (match.opensAtMs > nowMs) {
    return { kind: 'countdown', ...base, opponent, opensAtMs: match.opensAtMs, others };
  }
  return { kind: 'live', ...base, opponent, others };
}

/** `m:ss` abaixo de 1 h, `h:mm:ss` daí pra cima. */
export function formatCountdown(remainingMs: number): string {
  const total = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = String(seconds).padStart(2, '0');
  if (hours === 0) return `${minutes}:${ss}`;
  return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Contagem legível; a partir de 24 h vira "abre dd/mm às HH:MM". */
export function describeOpening(opensAtMs: number, nowMs: number): string {
  const remaining = opensAtMs - nowMs;
  if (remaining < DAY_MS) return formatCountdown(remaining);
  const date = new Date(opensAtMs);
  const day = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `abre ${day} às ${time}`;
}

/** Só existe contagem regressiva de verdade abaixo de 24 h. */
export function isCountingDown(opensAtMs: number, nowMs: number): boolean {
  return opensAtMs - nowMs < DAY_MS;
}
