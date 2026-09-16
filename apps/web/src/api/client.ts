import type { LatLng } from '@paguessr/shared';

export interface ApiRoundInitial {
  id: string | number;
  order?: number;
  ordem?: number;
  roundNumber?: number;
  startedAt?: string | null;
  started_at?: string | null;
  streetview_mode?: 'static' | 'panorama';
}

export interface ApiGameCreated {
  id: string;
  rounds: ApiRoundInitial[];
}

export interface ApiNextRound {
  id: string | number;
  startedAt?: string | null;
  started_at?: string | null;
  streetview_mode?: 'static' | 'panorama';
}

export interface ApiGuessResponse {
  distance?: number | null;
  distanceMeters?: number | null;
  points?: number;
  score?: number;
  location: {
    lat: number;
    lng: number;
    name?: string;
    description?: string;
  };
  nextRound?: ApiNextRound | null;
}

export interface ApiRoundSummary {
  id: string;
  order?: number;
  roundNumber?: number;
  distance?: number | null;
  distanceMeters?: number | null;
  points?: number;
  score?: number;
  guess?: LatLng | null;
  startedAt?: string | null;
  started_at?: string | null;
  streetview_mode?: 'static' | 'panorama';
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
    const details = await res.json().catch(() => null);
    throw new Error(
      typeof details?.error === 'string' && !details.statusCode
        ? details.error
        : 'Não foi possível conectar ao servidor do jogo. Verifique se a API e o banco de dados estão em execução.'
    );
  }

  return res.json();
}

export async function submitGuess(
  roundId: string | number,
  guess: LatLng | null
): Promise<ApiGuessResponse> {
  const res = await fetch(`/api/rounds/${roundId}/guess`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(guess ?? {}),
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

export interface ApiConfig {
  googleMapsBrowserKey: string;
}

let cachedConfigPromise: Promise<ApiConfig> | null = null;

export function getAppConfig(): Promise<ApiConfig> {
  if (!cachedConfigPromise) {
    cachedConfigPromise = fetch('/api/config')
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Falha ao obter configurações (${res.status} ${res.statusText})`);
        }
        return res.json();
      })
      .catch((err) => {
        cachedConfigPromise = null;
        throw err;
      });
  }
  return cachedConfigPromise;
}

export interface ApiRoundPanorama {
  pano_id: string;
}

export async function getRoundPanorama(roundId: string | number): Promise<ApiRoundPanorama> {
  const res = await fetch(`/api/rounds/${roundId}/panorama`);
  if (!res.ok) {
    throw new Error(`Falha ao obter panorama da rodada (${res.status} ${res.statusText})`);
  }
  return res.json();
}
