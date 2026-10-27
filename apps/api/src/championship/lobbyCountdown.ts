export function parseLobbyCountdownSeconds(raw: string | undefined): number {
  const val = Number(raw);
  if (!raw || !Number.isFinite(val) || val < 0) return 0;
  return Math.floor(val);
}
