const BRT_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC-3, sem horário de verão no Brasil hoje

// Instante UTC correspondente à última segunda-feira 00:00:00 no horário de
// Brasília. Truque de fuso fixo: desloca `now` pelo offset antes de ler os
// campos de calendário em UTC — isso equivale a ler os campos locais em BRT,
// sem precisar de lib de data.
export function getWeekStartBRT(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() - BRT_OFFSET_MS);
  const dayOfWeek = shifted.getUTCDay(); // 0 = domingo .. 6 = sábado, já em "dia BRT"
  const daysSinceMonday = (dayOfWeek + 6) % 7;

  const mondayShifted = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() - daysSinceMonday,
    0,
    0,
    0,
    0
  );

  return new Date(mondayShifted + BRT_OFFSET_MS);
}

// Chave do dia civil em BRT (ex.: "2026-10-02"), pra orçamentos/contadores
// diários. Mesmo truque de fuso fixo acima: desloca antes de ler os campos em
// UTC, o que equivale a ler os campos locais em BRT.
export function getDayKeyBRT(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() - BRT_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
