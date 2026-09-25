import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowRight,
  faFlagCheckered,
  faHourglassHalf,
  faTrophy,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import type { LiveMatchRound } from '../../api/championships';

export interface DuelResultProps {
  myNick: string;
  opponentNick: string;
  myScore: number;
  opponentScore: number;
  /** As rodadas do `live`, com os pontos dos dois lados. */
  rounds: LiveMatchRound[];
  /** Placar consolidado pelo servidor; nulo até o duelo ser resolvido. */
  finalScore: { me: number; opponent: number } | null;
  winnerId?: string | null;
  myUserId: string;
  onBackToBracket: () => void;
}

function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2).replace('.', ',')} km`;
}

function PointsCell({ points, opponent = false }: { points: number | null; opponent?: boolean }) {
  return (
    <span className="duel-round-cell">
      {points === null ? (
        <span className="duel-round-none">–</span>
      ) : (
        <span className={`round-score-pill${opponent ? ' is-opponent' : ''}`}>
          +{points.toLocaleString('pt-BR')}
        </span>
      )}
    </span>
  );
}

function describeMyRound(round: LiveMatchRound): string {
  if (round.myDistance !== null) return `Erro: ${formatDistance(round.myDistance)}`;
  return round.myPoints === null ? 'Sem palpite' : 'Tempo esgotado';
}

export function DuelResult({
  myNick,
  opponentNick,
  myScore,
  opponentScore,
  rounds,
  finalScore,
  winnerId,
  myUserId,
  onBackToBracket,
}: DuelResultProps) {
  // Quem vence é sempre o servidor que decide (pontos, depois desempate por
  // distância, horário e seed). Enquanto o vencedor não chega, ninguém é destacado.
  const isDecided = Boolean(winnerId);
  const isWinner = isDecided && winnerId === myUserId;
  const isLoser = isDecided && !isWinner;

  const totalMe = finalScore?.me ?? myScore;
  const totalOpponent = finalScore?.opponent ?? opponentScore;
  const tiedOnPoints = finalScore !== null && finalScore.me === finalScore.opponent;
  const totalDistance = rounds.reduce((acc, r) => acc + (r.myDistance ?? 0), 0);

  const title = !isDecided ? 'Duelo encerrado' : isWinner ? 'Vitória!' : 'Derrota';
  const subtitle = !isDecided
    ? 'Apurando o resultado...'
    : tiedOnPoints
      ? 'Empate nos pontos, decidido no desempate.'
      : isWinner
        ? `Você superou ${opponentNick} e avançou no chaveamento.`
        : `${opponentNick} somou mais pontos neste duelo.`;

  return (
    <div className="game-result-container duel-result-screen">
      <div className="game-card game-result-card duel-result-card">
        <div className="result-header">
          <span className="trophy-emoji">
            <FontAwesomeIcon
              icon={!isDecided ? faHourglassHalf : isWinner ? faTrophy : faFlagCheckered}
              aria-hidden="true"
            />
          </span>
          <h2 className="result-title">{title}</h2>
          <p className="result-subtitle">{subtitle}</p>

          <div className="duel-result-matchup">
            <div className={`duel-result-box duel-result-me ${isWinner ? 'winner' : ''}`}>
              <span className="duel-result-box-label">Você</span>
              <span className="duel-result-box-nick">{myNick}</span>
              <span className="duel-result-box-score">{totalMe.toLocaleString('pt-BR')}</span>
              <span className="duel-result-box-unit">pontos</span>
            </div>

            <span className="duel-result-vs">
              <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
            </span>

            <div className={`duel-result-box duel-result-opp ${isLoser ? 'winner' : ''}`}>
              <span className="duel-result-box-label">Adversário</span>
              <span className="duel-result-box-nick">{opponentNick}</span>
              <span className="duel-result-box-score">{totalOpponent.toLocaleString('pt-BR')}</span>
              <span className="duel-result-box-unit">pontos</span>
            </div>
          </div>

          <p className="total-distance-hint">
            Seu erro acumulado: <strong>{formatDistance(totalDistance)}</strong>
          </p>
        </div>

        <div className="rounds-summary">
          <h3 className="rounds-summary-title">Rodadas</h3>
          <div className="duel-rounds-head">
            <span className="duel-rounds-col">Você</span>
            <span className="duel-rounds-col" title={opponentNick}>
              {opponentNick}
            </span>
          </div>
          <div className="rounds-list">
            {rounds.map((r) => (
              <div key={r.order} className="round-item">
                <div className="round-item-left">
                  <span className="round-badge">R{r.order}</span>
                  <div className="round-loc-text">
                    <span className="round-loc-name">Rodada {r.order}</span>
                    <span className="round-loc-dist">{describeMyRound(r)}</span>
                  </div>
                </div>
                <div className="duel-round-scores">
                  <PointsCell points={r.myPoints} />
                  <PointsCell points={r.opponentPoints} opponent />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="result-actions">
          <button type="button" className="game-cta" onClick={onBackToBracket}>
            Ver chave do campeonato <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
