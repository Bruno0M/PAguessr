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
