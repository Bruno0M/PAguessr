import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLocationDot } from '@fortawesome/free-solid-svg-icons';

interface RoundHeaderProps {
  currentRound: number;
  totalRounds: number;
  totalScore: number;
  isOfflineMode?: boolean;
  secondsLeft?: number | null;
  onHome: () => void;
  onPause: () => void;
}

export function RoundHeader({
  currentRound,
  totalRounds,
  totalScore,
  isOfflineMode = false,
  secondsLeft = null,
  onHome,
  onPause,
}: RoundHeaderProps) {
  return (
    <header className="header">
      <div className="header-brand">
        <button
          type="button"
          className="header-home"
          onClick={onHome}
          aria-label="PAguessr — voltar ao início"
          title="Voltar ao início"
        >
          <span className="logo-pin" aria-hidden="true">
            <FontAwesomeIcon icon={faLocationDot} />
          </span>
          <span className="logo-title">PAguessr</span>
        </button>
        <span className="city-tag">Paulo Afonso - BA</span>
        {isOfflineMode && <span className="offline-tag">Modo Offline (Mock)</span>}
      </div>

      <div className="header-stats">
        <button
          type="button"
          className="header-pause"
          onClick={onPause}
          aria-label="Pausar partida"
          title="Pausar (Esc)"
        >
          Ⅱ <kbd>Esc</kbd>
        </button>
        <div className="stat-pill">
          <span className="stat-label">Rodada</span>
          <span className="stat-value">
            {currentRound} / {totalRounds}
          </span>
        </div>

        {secondsLeft !== null && (
          <div className={`stat-pill ${secondsLeft <= 10 ? 'timer-warning' : ''}`}>
            <span className="stat-label">Tempo</span>
            <span className="stat-value">{secondsLeft}s</span>
          </div>
        )}

        <div className="stat-pill highlight">
          <span className="stat-label">Pontos</span>
          <span className="stat-value">{totalScore.toLocaleString('pt-BR')}</span>
        </div>
      </div>
    </header>
  );
}
