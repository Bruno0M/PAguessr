import type { ChampionshipSize, ChampionshipStatus } from '@paguessr/shared';
import { ApiError } from './client';

export interface AdminChampionship {
  id: string;
  title: string;
  description: string | null;
  banner_url: string | null;
  max_participants: ChampionshipSize;
  rounds_per_match: number;
  round_duration_seconds: number;
  phase_interval_seconds: number;
  status: ChampionshipStatus;
  created_by: string;
  created_at: string;
  seeded_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  participants_count?: number;
  participant_count?: number;
  participants?: number;
  current_phase?: number | null;
  currentPhase?: number | null;
}

export interface CreateChampionshipPayload {
  title: string;
  description?: string | null;
  banner_url?: string | null;
  max_participants: ChampionshipSize;
  rounds_per_match: number;
  round_duration_seconds: number;
  phase_interval_seconds: number;
}

export interface UpdateChampionshipPayload {
  title?: string;
  description?: string | null;
  banner_url?: string | null;
  max_participants?: ChampionshipSize;
  rounds_per_match?: number;
  round_duration_seconds?: number;
  phase_interval_seconds?: number;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    throw new ApiError('Sessão inválida ou expirada', 401);
  }
  if (res.status === 403) {
    throw new ApiError('Sua conta não tem acesso de admin.', 403);
  }
  if (!res.ok) {
    const details = await res.json().catch(() => null);
    const msg =
      typeof details?.error === 'string'
        ? details.error
        : `Falha na requisição (${res.status} ${res.statusText})`;
    throw new ApiError(msg, res.status);
  }
  return res.json();
}

export async function getAdminChampionships(): Promise<AdminChampionship[]> {
  const res = await fetch('/api/admin/championships');
  return handleResponse<AdminChampionship[]>(res);
}

export async function createAdminChampionship(
  payload: CreateChampionshipPayload
): Promise<AdminChampionship> {
  const res = await fetch('/api/admin/championships', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return handleResponse<AdminChampionship>(res);
}

export async function updateAdminChampionship(
  id: string,
  payload: UpdateChampionshipPayload
): Promise<AdminChampionship> {
  const res = await fetch(`/api/admin/championships/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return handleResponse<AdminChampionship>(res);
}

export async function deleteAdminChampionship(id: string): Promise<void> {
  const res = await fetch(`/api/admin/championships/${id}`, {
    method: 'DELETE',
  });
  if (res.status === 401) {
    throw new ApiError('Sessão inválida ou expirada', 401);
  }
  if (res.status === 403) {
    throw new ApiError('Sua conta não tem acesso de admin.', 403);
  }
  if (!res.ok) {
    const details = await res.json().catch(() => null);
    const msg =
      typeof details?.error === 'string'
        ? details.error
        : `Falha ao excluir campeonato (${res.status})`;
    throw new ApiError(msg, res.status);
  }
}

export async function startAdminChampionship(id: string): Promise<AdminChampionship> {
  const res = await fetch(`/api/admin/championships/${id}/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  return handleResponse<AdminChampionship>(res);
}

export async function advanceAdminChampionship(id: string): Promise<AdminChampionship> {
  const res = await fetch(`/api/admin/championships/${id}/advance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  return handleResponse<AdminChampionship>(res);
}
