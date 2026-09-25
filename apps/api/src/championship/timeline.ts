export interface RoundClosedInput {
  startedAt: Date | null;
  durationSeconds: number;
  /** `rounds.pontos !== null` do meu lado. */
  myAnswered: boolean;
  opponentAnswered: boolean;
  now: Date;
}

/**
 * Uma rodada do duelo está fechada quando os dois responderam ou quando o tempo
 * dela acabou. Só depois de fechada o placar do adversário pode aparecer: antes
 * disso, os pontos dele viram dica pra quem ainda está pensando.
 */
export function isRoundClosed(input: RoundClosedInput): boolean {
  if (input.myAnswered && input.opponentAnswered) return true;
  if (input.startedAt === null) return false;
  return input.now.getTime() >= input.startedAt.getTime() + input.durationSeconds * 1000;
}

/*
 * Linha do tempo do duelo. D = duração da rodada, R = revelação entre rodadas,
 * N = rodadas do confronto, O = `opens_at`.
 *
 *   início planejado da rodada k = O + (k - 1) * (D + R)
 *   fim planejado do duelo       = O + N * D + (N - 1) * R
 *
 * A rodada k fecha quando o segundo palpite chega ou em início(k) + D, o que vier
 * antes. Fechando antes, as rodadas seguintes puxam o início pra T + R (só
 * adiantam, nunca atrasam). Os horários ficam gravados em `rounds.started_at`.
 */

const SECOND_MS = 1000;

export function plannedRoundStart(
  opensAt: Date,
  order: number,
  durationSeconds: number,
  revealSeconds: number
): Date {
  return new Date(opensAt.getTime() + (order - 1) * (durationSeconds + revealSeconds) * SECOND_MS);
}

export function plannedMatchEnd(
  opensAt: Date,
  rounds: number,
  durationSeconds: number,
  revealSeconds: number
): Date {
  const totalSeconds = rounds * durationSeconds + (rounds - 1) * revealSeconds;
  return new Date(opensAt.getTime() + totalSeconds * SECOND_MS);
}

/**
 * Novos inícios das rodadas depois da fechada, quando ela fecha antes do tempo em
 * `closedAt`: a rodada seguinte começa `R` segundos depois e as demais seguem o
 * espaçamento normal. A última rodada fechada não puxa nada.
 */
export function shiftedRoundStarts(
  closedAt: Date,
  closedOrder: number,
  totalRounds: number,
  durationSeconds: number,
  revealSeconds: number
): Map<number, Date> {
  const starts = new Map<number, Date>();
  for (let order = closedOrder + 1; order <= totalRounds; order++) {
    const offsetSeconds =
      revealSeconds + (order - closedOrder - 1) * (durationSeconds + revealSeconds);
    starts.set(order, new Date(closedAt.getTime() + offsetSeconds * SECOND_MS));
  }
  return starts;
}

export interface MatchEndInput {
  /** `started_at` real da última rodada (já com os adiantamentos). */
  lastRoundStart: Date;
  durationSeconds: number;
  finishedA: Date | null;
  finishedB: Date | null;
}

/**
 * Fim real do duelo: se os dois terminaram todas as rodadas, o instante em que o
 * último terminou (um palpite automático que chega depois do prazo não estica o
 * duelo: vale o `min` com o fim do tempo da última rodada). Senão, o fim do tempo
 * da última rodada.
 */
export function matchEndTime(input: MatchEndInput): Date {
  const timeEnd = input.lastRoundStart.getTime() + input.durationSeconds * SECOND_MS;
  if (input.finishedA && input.finishedB) {
    const bothFinished = Math.max(input.finishedA.getTime(), input.finishedB.getTime());
    return new Date(Math.min(bothFinished, timeEnd));
  }
  return new Date(timeEnd);
}

/** Rodada atual: a maior cujo início já passou (a 1 se nenhuma começou). */
export function currentRoundOrder(
  starts: Array<{ order: number; startedAt: Date }>,
  now: Date
): number {
  let current = 1;
  for (const start of starts) {
    if (start.startedAt.getTime() <= now.getTime() && start.order > current) {
      current = start.order;
    }
  }
  return current;
}
