/* Relógio do servidor no navegador. O duelo é decidido pelo horário do servidor,
   então o cronômetro não pode confiar no relógio da máquina do jogador: se ele
   estiver adiantado ou atrasado, a rodada "acabaria" na hora errada.

   Cada resposta de campeonato traz `serverTime`. A diferença entre esse instante
   e a metade do caminho de ida e volta é o desvio; ficamos com a amostra de menor
   ida e volta, que é a que menos se engana com a rede. */

const STALE_SAMPLE_MS = 60_000;

let offsetMs = 0;
let bestRoundTripMs = Infinity;
let bestSampleAt = 0;

export function syncServerClock(
  serverTimeIso: string,
  requestStartedAt: number,
  responseAt: number
): void {
  const serverMs = Date.parse(serverTimeIso);
  const roundTripMs = responseAt - requestStartedAt;
  if (Number.isNaN(serverMs) || roundTripMs < 0) return;

  const isStale = responseAt - bestSampleAt > STALE_SAMPLE_MS;
  if (roundTripMs <= bestRoundTripMs || isStale) {
    bestRoundTripMs = roundTripMs;
    bestSampleAt = responseAt;
    offsetMs = serverMs - (requestStartedAt + responseAt) / 2;
  }
}

/** Hora do servidor em milissegundos, no mesmo formato de `Date.now()`. */
export function serverNow(): number {
  return Date.now() + offsetMs;
}
