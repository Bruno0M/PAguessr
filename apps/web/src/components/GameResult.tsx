import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowRotateRight,
  faCompass,
  faMap,
  faMedal,
  faStar,
  faTrophy,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';
import type { RoundResult } from '../types';

interface GameResultProps {
  results: RoundResult[];
  onPlayAgain: () => void;
  isRanked?: boolean;
  isNewRecord?: boolean;
  onViewRanking?: () => void;
}

function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2).replace('.', ',')} km`;
}

function getPerformanceTitle(
  totalScore: number,
  maxScore: number
): { title: string; subtitle: string; icon: IconDefinition } {
  const percentage = (totalScore / maxScore) * 100;
  if (percentage >= 90) {
    return {
      title: 'Mestre da Ilha!',
      subtitle: 'Você conhece cada palmo e cânion de Paulo Afonso como ninguém.',
      icon: faTrophy,
    };
  }
  if (percentage >= 70) {
    return {
      title: 'Quase um Pauloafonsino!',
      subtitle: 'Excelente navegação! Você acertou com precisão os pontos da cidade.',
      icon: faStar,
    };
  }
  if (percentage >= 45) {
    return {
      title: 'Explorador do Velho Chico',
      subtitle: 'Bom senso de direção! Com mais algumas rodadas você domina o mapa.',
      icon: faCompass,
    };
  }
  return {
    title: 'Turista Aprendiz',
    subtitle: 'Uma ótima oportunidade para desbravar mais a história e os pontos de Paulo Afonso.',
    icon: faMap,
  };
}

export function GameResult({
  results,
  onPlayAgain,
  isRanked = false,
  isNewRecord = false,
  onViewRanking,
}: GameResultProps) {
  const totalScore = results.reduce((acc, curr) => acc + curr.score, 0);
  const maxScore = results.length * 5000;
  const totalDistance = results.reduce((acc, curr) => acc + (curr.distanceMeters ?? 0), 0);
  const performance = getPerformanceTitle(totalScore, maxScore);
  const showCelebration = isRanked && isNewRecord;

  return (
    <div className="game-result-container">
      <div className="game-result-card">
        <div className="result-header">
          {showCelebration && (
            <div className="new-record-banner">
              <FontAwesomeIcon icon={faTrophy} aria-hidden="true" /> Novo recorde!
            </div>
          )}
          <span className="trophy-emoji">
            <FontAwesomeIcon icon={faMedal} aria-hidden="true" />
          </span>
          <h2 className="result-title">
            {performance.title} <FontAwesomeIcon icon={performance.icon} aria-hidden="true" />
          </h2>
          <p className="result-subtitle">{performance.subtitle}</p>

          <div className="final-score-display">
            <span className="final-score-number">{totalScore.toLocaleString('pt-BR')}</span>
            <span className="final-score-max">/ {maxScore.toLocaleString('pt-BR')} pontos</span>
          </div>

          <p className="total-distance-hint">
            Distância total de erro acumulada: <strong>{formatDistance(totalDistance)}</strong>
          </p>
        </div>

        <div className="rounds-summary">
          <h3 className="rounds-summary-title">Resumo das Rodadas</h3>

          <div className="rounds-list">
            {results.map((r) => (
              <div key={r.roundNumber} className="round-item">
                <div className="round-item-left">
                  <span className="round-badge">R{r.roundNumber}</span>
                  <div className="round-loc-text">
                    <span className="round-loc-name">
                      {r.location.name || `Rodada ${r.roundNumber}`}
                    </span>
                    <span className="round-loc-dist">
                      {r.distanceMeters === null
                        ? 'Tempo esgotado'
                        : `Erro: ${formatDistance(r.distanceMeters)}`}
                    </span>
                  </div>
                </div>

                <div className="round-item-right">
                  <span className="round-score-pill">+{r.score.toLocaleString('pt-BR')} pts</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="result-actions">
          <button type="button" className="btn-play-again" onClick={onPlayAgain}>
            <FontAwesomeIcon icon={faArrowRotateRight} aria-hidden="true" /> Jogar Novamente
          </button>
          {showCelebration && onViewRanking && (
            <button type="button" className="btn-secondary" onClick={onViewRanking}>
              <FontAwesomeIcon icon={faTrophy} aria-hidden="true" /> Ver Ranking
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
