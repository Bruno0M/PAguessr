import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRight, faTrophy } from '@fortawesome/free-solid-svg-icons';
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

  return (
    <div className="result-banner">
      <div className="game-card result-banner-card">
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
          <button type="button" className="game-cta" onClick={onNext}>
            {isLastRound ? (
              <>
                Ver Resultado Final <FontAwesomeIcon icon={faTrophy} aria-hidden="true" />
              </>
            ) : (
              <>
                Próxima Rodada <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
