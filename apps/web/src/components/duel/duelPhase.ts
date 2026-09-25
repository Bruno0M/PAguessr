/*
 * Fase do duelo, derivada só da linha do tempo do servidor e do relógio. Nada aqui
 * é guardado: a cada tique a tela pergunta "em que ponto estamos?" e a resposta
 * sai dos horários das rodadas, de quem já respondeu e de quais rodadas fecharam.
 *
 *   pre_start   antes de a rodada 1 abrir
 *   guessing    rodada aberta, eu ainda não respondi
 *   submitting  enviando o meu palpite
 *   waiting     eu respondi, a rodada segue aberta (o adversário ainda pensa)
 *   reveal      rodada fechada: local certo e os dois palpites, até a próxima abrir
 *   finished    a última rodada fechou e a revelação acabou
 */

export interface RoundTime {
  startedAtMs: number;
  durationMs: number;
}

export type DuelPhase = 'pre_start' | 'guessing' | 'submitting' | 'waiting' | 'reveal' | 'finished';

export interface DuelPhaseInput {
  now: number;
  /** Uma entrada por rodada, na ordem (índice 0 = rodada 1). */
  times: RoundTime[];
  revealMs: number;
  isAnswered: (order: number) => boolean;
  isClosed: (order: number) => boolean;
  isSubmitting: (order: number) => boolean;
  /** Instante (do servidor) em que cada rodada foi vista fechada; usado na última. */
  closedAt: Record<number, number>;
}

export interface DuelPhaseState {
  phase: DuelPhase;
  /** Rodada atual (1 a N): a maior cujo início já passou. */
  order: number;
  /** Fim da revelação, só quando `phase` é `reveal`. */
  revealEndsAt: number | null;
}

export function deriveDuelPhase(input: DuelPhaseInput): DuelPhaseState {
  const { now, times, revealMs } = input;
  const total = times.length;

  if (total === 0 || now < times[0].startedAtMs) {
    return { phase: 'pre_start', order: 1, revealEndsAt: null };
  }

  let order = 1;
  for (let index = 0; index < total; index++) {
    if (times[index].startedAtMs <= now) order = index + 1;
  }

  if (input.isClosed(order)) {
    const time = times[order - 1];
    if (order < total) {
      // A próxima rodada ainda não começou (senão ela seria a atual): revelação
      // até o início dela, que o servidor já puxou pra `fechamento + revelação`.
      return { phase: 'reveal', order, revealEndsAt: times[order].startedAtMs };
    }
    const timeEnd = time.startedAtMs + time.durationMs;
    const closedAt = input.closedAt[order] ?? Math.min(now, timeEnd);
    const revealEndsAt = closedAt + revealMs;
    if (now >= revealEndsAt) return { phase: 'finished', order, revealEndsAt: null };
    return { phase: 'reveal', order, revealEndsAt };
  }

  if (input.isAnswered(order)) return { phase: 'waiting', order, revealEndsAt: null };
  if (input.isSubmitting(order)) return { phase: 'submitting', order, revealEndsAt: null };
  return { phase: 'guessing', order, revealEndsAt: null };
}

/** Une horários novos aos que já temos, ficando sempre com o mais cedo: o servidor só adianta. */
export function mergeRoundTimes(
  current: RoundTime[],
  updates: Array<{ order: number; startedAtMs: number; durationMs: number }>
): RoundTime[] {
  let changed = false;
  const next = current.map((time) => ({ ...time }));
  for (const update of updates) {
    const index = update.order - 1;
    const existing = next[index];
    if (!existing || !Number.isFinite(update.startedAtMs)) continue;
    if (update.startedAtMs < existing.startedAtMs) {
      existing.startedAtMs = update.startedAtMs;
      changed = true;
    }
    if (update.durationMs !== existing.durationMs) {
      existing.durationMs = update.durationMs;
      changed = true;
    }
  }
  return changed ? next : current;
}
