export interface AvatarDef {
  bg: [string, string];
  fg: string;
}

// 8 avatares abstratos gerados no próprio código (sem upload de foto, sem
// asset externo baixado), na paleta navy + verde-neon do jogo.
const AVATAR_DEFS: AvatarDef[] = [
  { bg: ['#1c4560', '#0c1c2e'], fg: '#3ee3ad' },
  { bg: ['#1c4560', '#0c1c2e'], fg: '#40cddd' },
  { bg: ['#1c4560', '#0c1c2e'], fg: '#ffd166' },
  { bg: ['#1c4560', '#0c1c2e'], fg: '#ff8fa3' },
  { bg: ['#1c4560', '#0c1c2e'], fg: '#9d8cff' },
  { bg: ['#1c4560', '#0c1c2e'], fg: '#4fd1c5' },
  { bg: ['#1c4560', '#0c1c2e'], fg: '#f0a860' },
  { bg: ['#1c4560', '#0c1c2e'], fg: '#9df57a' },
];

export function getAvatarDef(id: number): AvatarDef {
  return AVATAR_DEFS[(id - 1 + AVATAR_DEFS.length) % AVATAR_DEFS.length];
}

export function getAvatarColor(id: number): string {
  return getAvatarDef(id).fg;
}
