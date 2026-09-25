export type FlagReason = 'offset_constante' | 'tempo_desumano';

export interface RoundSample {
  guessLat: number | null;
  guessLng: number | null;
  locLat: number;
  locLng: number;
  answerSeconds: number | null;
}

function round6(val: number): string {
  const rounded = Math.round(val * 1e6) / 1e6;
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  return normalized.toFixed(6);
}

export function detectGame(rounds: RoundSample[]): FlagReason | null {
  const offsetCounts = new Map<string, number>();

  for (const round of rounds) {
    if (round.guessLat === null || round.guessLng === null) {
      continue;
    }

    const dLat = round6(round.guessLat - round.locLat);
    const dLng = round6(round.guessLng - round.locLng);
    const key = `${dLat},${dLng}`;

    const count = (offsetCounts.get(key) || 0) + 1;
    if (count >= 3) {
      return 'offset_constante';
    }
    offsetCounts.set(key, count);
  }

  let fastRounds = 0;
  for (const round of rounds) {
    if (round.guessLat === null || round.guessLng === null) {
      continue;
    }

    if (round.answerSeconds !== null && round.answerSeconds < 5) {
      fastRounds++;
      if (fastRounds >= 3) {
        return 'tempo_desumano';
      }
    }
  }

  return null;
}
