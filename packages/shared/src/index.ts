export interface LatLng {
  lat: number;
  lng: number;
}

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
