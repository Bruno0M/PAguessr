import { useEffect, useState } from 'react';
import type { RoundResult } from '../types';

interface RoundResultModalProps {
  result: RoundResult;
  isLastRound: boolean;
  onNext: () => void;
}

function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} metros`;
  }
  return `${(meters / 1000).toFixed(2).replace('.', ',')} km`;
}

export function RoundResultModal({ result, isLastRound, onNext }: RoundResultModalProps) {
  const timedOut = result.distanceMeters === null;
  const hasHistory = Boolean(result.location.history);
  const [isHistoryOpen, setIsHistoryOpen] = useState(hasHistory);

  useEffect(() => {
    setIsHistoryOpen(hasHistory);
  }, [hasHistory, result.roundNumber]);

  useEffect(() => {
    if (!isHistoryOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setIsHistoryOpen(false);
    };

    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [isHistoryOpen]);

  return (
    <>
      {hasHistory && isHistoryOpen && (
        <>
          <button
            type="button"
            className="location-history-backdrop"
            aria-label="Fechar história do local"
            onClick={() => setIsHistoryOpen(false)}
          />

          <aside
            className="location-history-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="location-history-title"
          >
            <button
              type="button"
              className="history-close-button"
              aria-label="Fechar história do local"
              onClick={() => setIsHistoryOpen(false)}
            >
              ×
            </button>

            <div className="history-card-heading">
              <span className="history-book-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M3.5 5.25A3.25 3.25 0 0 1 6.75 2H11v17H6.75a3.25 3.25 0 0 0-3.25 3.25v-17Z" />
                  <path d="M20.5 5.25A3.25 3.25 0 0 0 17.25 2H13v17h4.25a3.25 3.25 0 0 1 3.25 3.25v-17Z" />
                </svg>
              </span>
              <span>História do local</span>
              <span className="history-heading-line" />
            </div>

            {result.location.category && (
              <span className="history-category">{result.location.category}</span>
            )}

            <h2 id="location-history-title">
              {result.location.name || 'Ponto turístico de Paulo Afonso'}
            </h2>
            <p className="history-description">{result.location.history}</p>

            <div className="history-card-footer">
              <span className="history-place-label">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
                  <circle cx="12" cy="10" r="2.5" />
                </svg>
                Ponto turístico em Paulo Afonso
              </span>
              <button
                type="button"
                className="history-continue-button"
                onClick={() => setIsHistoryOpen(false)}
              >
                Continuar <span aria-hidden="true">›</span>
              </button>
            </div>
          </aside>
        </>
      )}

      {hasHistory && !isHistoryOpen && (
        <button
          type="button"
          className="history-reopen-button"
          onClick={() => setIsHistoryOpen(true)}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3.5 5.25A3.25 3.25 0 0 1 6.75 2H11v17H6.75a3.25 3.25 0 0 0-3.25 3.25v-17Z" />
            <path d="M20.5 5.25A3.25 3.25 0 0 0 17.25 2H13v17h4.25a3.25 3.25 0 0 1 3.25 3.25v-17Z" />
          </svg>
          Ver história
        </button>
      )}

      <div className="result-banner">
        <div className="result-banner-card">
          <div className="result-main-metrics">
            <div className="metric-box">
              <span className="metric-label">Distância do alvo</span>
              <span className="metric-value distance">
                {timedOut ? 'Tempo esgotado' : formatDistance(result.distanceMeters as number)}
              </span>
            </div>

            <div className="metric-box highlight">
              <span className="metric-label">Pontuação</span>
              <span className="metric-value points">+{result.score.toLocaleString('pt-BR')}</span>
            </div>
          </div>

          <div className="result-location-info">
            <h3 className="location-name">{result.location.name || 'Ponto em Paulo Afonso'}</h3>
            {result.location.description && (
              <p className="location-desc">{result.location.description}</p>
            )}
          </div>

          <div className="result-banner-action">
            <button type="button" className="btn-next-round" onClick={onNext}>
              {isLastRound ? 'Ver Resultado Final 🏆' : 'Próxima Rodada →'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
