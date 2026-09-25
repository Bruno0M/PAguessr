import { SUN } from './palette';

export const PLATFORM_RADIUS = 5;

// Ouro no dourado do jogo; prata e bronze afastados do azul e do coral (perigo).
// O HUD tem as mesmas cores em RankingScreen.css (--rank-*).
export const MEDAL = {
  1: { metal: '#d9a441', glow: SUN },
  2: { metal: '#a8a59c', glow: '#e4e0d4' },
  3: { metal: '#c27a45', glow: '#e0955a' },
} as const;

export const PODIUM_SLOTS = [
  { place: 2 as const, x: -1.86, height: 1.3 },
  { place: 1 as const, x: 0, height: 1.68 },
  { place: 3 as const, x: 1.86, height: 1.15 },
];
export const PODIUM_Z = -0.95;
export const PEDESTAL_WIDTH = 1.74;
export const PEDESTAL_DEPTH = 1.45;

export const MAP_CENTER: [number, number] = [0, 2.0];
export const MAP_WIDTH = 3.9;

// Estrada em "U" pela frente do disco: entra pelo fundo-esquerdo, passa pela
// Ponte Dom Pedro II, contorna a frente e sai pelo fundo-direito.
export const ROAD_POINTS: [number, number][] = [
  [-4.3, -2.1],
  [-4.2, -0.6],
  [-3.85, 1.0],
  [-3.2, 2.6],
  [-1.95, 3.7],
  [0, 4.15],
  [1.95, 3.7],
  [3.1, 2.7],
  [3.85, 1.2],
  [4.25, -0.4],
  [4.3, -2.0],
];
export const ROAD_WIDTH = 0.66;
export const BRIDGE_CENTER: [number, number] = [-3.85, 1.0];
export const BRIDGE_HALF_SPAN = 0.07;

export const SIGNPOST_POSITION: [number, number] = [3.05, 1.55];
export const USINA_POSITION: [number, number] = [-2.9, -2.75];
