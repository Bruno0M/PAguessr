/** Nome da fase pelo número dela. Acima do total é o campeão (a API manda `fases + 1`). */
export function getPhaseName(phase: number, totalPhases: number): string {
  if (phase > totalPhases) return 'Campeão';
  if (phase === totalPhases) return 'Final';
  if (phase === totalPhases - 1) return 'Semifinal';
  if (phase === totalPhases - 2) return 'Quartas de final';
  if (phase === totalPhases - 3) return 'Oitavas de final';
  return `Fase ${phase}`;
}

export function totalPhasesFor(maxParticipants: number): number {
  return Math.max(1, Math.round(Math.log2(maxParticipants)));
}
