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

export function RoundResultModal({
  result,
  isLastRound,
  onNext,
}: RoundResultModalProps) {
  return (
    <div className="result-banner">
      <div className="result-banner-card">
        <div className="result-main-metrics">
          <div className="metric-box">
            <span className="metric-label">Distância do alvo</span>
            <span className="metric-value distance">
              {formatDistance(result.distanceMeters)}
            </span>
          </div>

          <div className="metric-box highlight">
            <span className="metric-label">Pontuação</span>
            <span className="metric-value points">
              +{result.score.toLocaleString('pt-BR')}
            </span>
          </div>
        </div>

        <div className="result-location-info">
          <h3 className="location-name">{result.location.name}</h3>
          <p className="location-desc">{result.location.description}</p>
        </div>

        <div className="result-banner-action">
          <button type="button" className="btn-next-round" onClick={onNext}>
            {isLastRound ? 'Ver Resultado Final 🏆' : 'Próxima Rodada →'}
          </button>
        </div>
      </div>
    </div>
  );
}
