import type { LatLng } from '@paguessr/shared';

export interface ApiRoundInitial {
  id: string | number;
  order?: number;
  ordem?: number;
  roundNumber?: number;
}

export interface ApiGameCreated {
  id: string;
  rounds: ApiRoundInitial[];
}

export interface ApiGuessResponse {
  distance?: number;
  distanceMeters?: number;
  points?: number;
  score?: number;
  location: {
    lat: number;
    lng: number;
    name?: string;
    description?: string;
  };
}

export interface ApiRoundSummary {
  id: string;
  order?: number;
  roundNumber?: number;
  distance?: number;
  distanceMeters?: number;
  points?: number;
  score?: number;
  guess?: LatLng;
  location?: {
    lat: number;
    lng: number;
    name?: string;
    description?: string;
  };
}

export interface ApiGameSummary {
  id: string;
  totalScore?: number;
  score?: number;
  rounds: ApiRoundSummary[];
}

export async function createGame(): Promise<ApiGameCreated> {
  const res = await fetch('/api/games', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    throw new Error(`Falha ao iniciar partida na API (${res.status} ${res.statusText})`);
  }

  return res.json();
}

export async function submitGuess(
  roundId: string | number,
  guess: LatLng
): Promise<ApiGuessResponse> {
  const res = await fetch(`/api/rounds/${roundId}/guess`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(guess),
  });

  if (!res.ok) {
    throw new Error(`Falha ao registrar palpite (${res.status} ${res.statusText})`);
  }

  return res.json();
}

export async function getGameSummary(gameId: string): Promise<ApiGameSummary> {
  const res = await fetch(`/api/games/${gameId}`);

  if (!res.ok) {
    throw new Error(`Falha ao obter resultado da partida (${res.status} ${res.statusText})`);
  }

  return res.json();
}

export function getRoundImageUrl(roundId: string | number): string {
  return `/api/rounds/${roundId}/image`;
}
