import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faLocationDot, faXmark } from '@fortawesome/free-solid-svg-icons';

export interface DuelHeaderProps {
  myNick: string;
  opponentNick: string;
  myScore: number;
  opponentScore: number;
  currentRound: number;
  totalRounds: number;
  secondsLeft: number | null;
  onExit: () => void;
}

export function DuelHeader({
  myNick,
  opponentNick,
  myScore,
  opponentScore,
  currentRound,
  totalRounds,
  secondsLeft,
  onExit,
}: DuelHeaderProps) {
  return (
    <header className="header duel-header">
      <div className="header-brand">
        <span className="duel-brand">
          <span className="logo-pin" aria-hidden="true">
            <FontAwesomeIcon icon={faLocationDot} />
          </span>
          <span className="logo-title">PAguessr</span>
        </span>
        <span className="duel-badge">Duelo 1v1</span>
        <button
          type="button"
          className="game-ghost duel-btn-exit"
          onClick={onExit}
          title="Ver chave do campeonato"
        >
          <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" />
          Chave
        </button>
      </div>

      <div className="duel-scoreboard">
        <div className="duel-player-pill duel-player-me">
          <span className="duel-player-nick">{myNick}</span>
          <span className="duel-player-score">{myScore.toLocaleString('pt-BR')}</span>
        </div>

        <span className="duel-vs">
          <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
        </span>

        <div className="duel-player-pill duel-player-opp">
          <span className="duel-player-score">{opponentScore.toLocaleString('pt-BR')}</span>
          <span className="duel-player-nick">{opponentNick}</span>
        </div>
      </div>

      <div className="header-stats">
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
      </div>
    </header>
  );
}
