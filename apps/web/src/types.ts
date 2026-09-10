import type { LatLng } from '@paguessr/shared';

export interface LocationPoint {
  id: string;
  name: string;
  description: string;
  coords: LatLng;
  imageUrl?: string;
  imagePlaceholderText?: string;
  category?: string;
}

export interface RoundResult {
  roundNumber: number;
  location: LocationPoint;
  guess: LatLng;
  distanceMeters: number;
  score: number;
}

export type GameState = 'guessing' | 'round_result' | 'finished';
