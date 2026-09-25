export type ChampionshipsMode = 'off' | 'admin' | 'public';

export function parseChampionshipsMode(raw: string | undefined): ChampionshipsMode {
  if (!raw) return 'off';
  const val = raw.trim().toLowerCase();
  if (val === 'admin') return 'admin';
  if (val === 'public') return 'public';
  return 'off';
}

export function isChampionshipsVisible(mode: ChampionshipsMode, isAdmin: boolean): boolean {
  if (mode === 'public') return true;
  if (mode === 'admin') return isAdmin;
  return false;
}
