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

export interface RoundData {
  id: string | number;
  order: number;
}

export interface RoundResult {
  roundNumber: number;
  location: {
    lat: number;
    lng: number;
    name?: string;
    description?: string;
  };
  guess: LatLng;
  distanceMeters: number;
  score: number;
}

export type GameState =
  'home' | 'loading' | 'guessing' | 'submitting' | 'round_result' | 'finished' | 'error';
