export interface AvatarDef {
  bg: [string, string];
  fg: string;
}

// 8 avatares abstratos gerados no próprio código (sem upload de foto, sem
// asset externo baixado). Cada forma mantém a família de cor que já tinha,
// agora tirada da arte da capa: caatinga, céu, sol, terracota, entardecer, rio,
// bronze e creme. A cor também pinta o pino do jogador no pódio 3D.
const AVATAR_BG: [string, string] = ['#1f2a36', '#0b1118'];

const AVATAR_DEFS: AvatarDef[] = [
  { bg: AVATAR_BG, fg: '#a9c07e' },
  { bg: AVATAR_BG, fg: '#6fb0e3' },
  { bg: AVATAR_BG, fg: '#eab25a' },
  { bg: AVATAR_BG, fg: '#e0876a' },
  { bg: AVATAR_BG, fg: '#a99bd6' },
  { bg: AVATAR_BG, fg: '#7fc4bd' },
  { bg: AVATAR_BG, fg: '#c49a6c' },
  { bg: AVATAR_BG, fg: '#f6ecd4' },
];

export function getAvatarDef(id: number): AvatarDef {
  return AVATAR_DEFS[(id - 1 + AVATAR_DEFS.length) % AVATAR_DEFS.length];
}

export function getAvatarColor(id: number): string {
  return getAvatarDef(id).fg;
}
