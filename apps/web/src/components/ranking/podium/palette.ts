// Cores da arena. O three não lê CSS, então os valores repetem os tokens de
// styles/tokens.css (comentário ao lado) e a arte do mapa da Home: chão azul-noite,
// rio turquesa, rota e luzes em dourado. Mudou a paleta do jogo? Muda aqui também.

// Tokens do jogo.
export const NIGHT = '#060b11'; // --pa-night
export const CREAM = '#f6ecd4'; // --pa-cream
export const CREAM_SOFT = '#c9c1ad'; // --pa-cream-soft
export const INK = '#10161d'; // --pa-ink
export const SUN = '#eab25a'; // --pa-sun
export const SUN_SOFT = '#f1c577'; // --pa-sun-hover
export const SKY = '#6fb0e3'; // --pa-sky
export const DANGER = '#ef8e73'; // --pa-danger

// Só da arena.
export const ARENA = {
  // Luz: preenchimento frio do céu, luz principal quente e uma de contorno em céu.
  fillSky: '#9fbbd6',
  fillGround: '#0a1219',
  key: '#f3ead6',
  bounce: '#8fa3b8',
  shadow: '#02070d',

  // Chão do disco e casco por baixo.
  ground: '#0b1620',
  hull: '#08111a',
  rimMetal: '#cbc5b8',
  ring: CREAM_SOFT,

  // Mapa de Paulo Afonso sobre o disco.
  land: '#15263a',
  landLine: '#2f4a63',
  landGlow: '#2a4d6a',

  // Rio: o turquesa da arte, mais escuro que o ciano de antes.
  river: '#3f9fb0',
  riverDeep: '#0a4f5e',
  riverGlow: '#0d6a7c',

  // Estrada e ponte: a rota dourada da arte.
  asphalt: '#141d28',
  roadBody: '#77746c',
  steel: '#d8d1bf',
  steelLight: '#e6dfcd',

  // Placas: tarja creme, texto em tinta.
  signBoard: '#dcd2b8',
  signPost: '#2a323c',

  // Cenário.
  wall: '#243140',
  wallCap: '#39414d',
  windowOff: '#16212e',
  windowOn: '#ffd58a',
  concrete: '#a09d95',
  concreteDark: '#8b8a84',
  concreteLight: '#aeaa9f',
  roof: '#cdc7b8',
  cable: '#2a323c',
  trunk: '#7a5a3c',
  frond: '#5f8a4e',
  frondGlow: '#16260f',
  bushLight: '#7d9a58',
  bushDark: '#3f5a34',
  cloud: '#1c2b3c',
  cloudGlow: '#0b1520',

  pinHole: NIGHT,
} as const;
