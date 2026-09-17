import type { LatLng, StreetviewMode } from '@paguessr/shared';

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
  startedAt?: string | null;
  streetview_mode?: StreetviewMode;
  duration_seconds?: number;
  durationSeconds?: number;
}

export interface RoundResult {
  roundNumber: number;
  location: {
    lat: number;
    lng: number;
    name?: string;
    description?: string;
  };
  guess: LatLng | null;
  distanceMeters: number | null;
  score: number;
}

export type GameState =
  'home' | 'loading' | 'guessing' | 'submitting' | 'round_result' | 'finished' | 'error';
