export interface LatLng {
  lat: number;
  lng: number;
}

export type StreetviewMode = 'static' | 'panorama';

export const PAULO_AFONSO_CENTER: LatLng = {
  lat: -9.4064,
  lng: -38.2147,
};

const EARTH_RADIUS_METERS = 6371000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function haversine(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);

  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinHalfLat = Math.sin(dLat / 2);
  const sinHalfLng = Math.sin(dLng / 2);

  const h = sinHalfLat * sinHalfLat + Math.cos(lat1) * Math.cos(lat2) * sinHalfLng * sinHalfLng;

  const clampedH = Math.min(1, Math.max(0, h));
  const c = 2 * Math.atan2(Math.sqrt(clampedH), Math.sqrt(1 - clampedH));

  return EARTH_RADIUS_METERS * c;
}

export function score(distanciaMetros: number, escala = 1500): number {
  if (distanciaMetros <= 0) {
    return 5000;
  }

  return Math.round(5000 * Math.exp(-distanciaMetros / escala));
}

// Regras de nick compartilhadas entre API e web, pra nunca divergir: o front
// valida o formato ao vivo, a API valida de novo (é a fonte da verdade).
export const NICK_MIN_LENGTH = 3;
export const NICK_MAX_LENGTH = 16;
export const NICK_PATTERN_SOURCE = `^[A-Za-z0-9_]{${NICK_MIN_LENGTH},${NICK_MAX_LENGTH}}$`;
export const NICK_PATTERN = new RegExp(NICK_PATTERN_SOURCE);

export function isValidNickFormat(nick: string): boolean {
  return NICK_PATTERN.test(nick);
}

export const AVATAR_COUNT = 8;

// Tempo por rodada no modo Ranqueado, compartilhado entre API (autoridade,
// decide a pontuação) e front (só exibe a contagem regressiva).
export const ROUND_DURATION_MS = 60_000;
