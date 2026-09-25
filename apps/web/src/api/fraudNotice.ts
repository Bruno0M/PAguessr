import type { ApiRankingEntry } from './ranking';

export interface FraudNoticePosition {
  position: number;
  score: number;
}

export interface FraudNoticePendingResponse {
  pending: true;
  penalty: number;
  before: FraudNoticePosition | null;
  after: FraudNoticePosition;
  total: number;
  entries: ApiRankingEntry[];
  gap: boolean;
}

export interface FraudNoticeNotPendingResponse {
  pending: false;
}

export type FraudNoticeResponse = FraudNoticePendingResponse | FraudNoticeNotPendingResponse;

export async function getFraudNotice(): Promise<FraudNoticeResponse> {
  const res = await fetch('/api/me/fraud-notice', { credentials: 'include' });

  if (!res.ok) {
    throw new Error(`Falha ao carregar o aviso de penalidade (${res.status} ${res.statusText})`);
  }

  return res.json();
}

export async function acknowledgeFraudNotice(): Promise<void> {
  const res = await fetch('/api/me/fraud-notice/ack', {
    method: 'POST',
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error(`Falha ao confirmar o aviso de penalidade (${res.status} ${res.statusText})`);
  }
}
