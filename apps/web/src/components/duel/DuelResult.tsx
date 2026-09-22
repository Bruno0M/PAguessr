import type { RoundResult } from '../../types';

export interface DuelResultProps {
  myNick: string;
  opponentNick: string;
  myScore: number;
  opponentScore: number;
  myResults: RoundResult[];
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

export function DuelResult({
  myNick,
  opponentNick,
  myScore,
  opponentScore,
  myResults,
  winnerId,
  myUserId,
  onBackToBracket,
}: DuelResultProps) {
  const isWinner = winnerId ? winnerId === myUserId : myScore > opponentScore;
  const isDraw = !winnerId && myScore === opponentScore;
  const totalDistance = myResults.reduce((acc, curr) => acc + (curr.distanceMeters ?? 0), 0);

  return (
    <div className="game-result-container duel-result-screen">
      <div className="game-result-card duel-result-card">
        <div className="result-header">
          <span className="trophy-emoji">{isWinner ? '🏆' : isDraw ? '🤝' : '⚔️'}</span>
          <h2 className="result-title">{isWinner ? 'Vitória!' : isDraw ? 'Empate!' : 'Derrota'}</h2>
          <p className="result-subtitle">
            {isWinner
              ? `Você superou ${opponentNick} e avançou no chaveamento.`
              : isDraw
                ? 'Duelo empatado em pontuação.'
                : `${opponentNick} somou mais pontos neste duelo.`}
          </p>

          <div className="duel-result-matchup">
            <div className={`duel-result-box ${isWinner ? 'winner' : ''}`}>
              <span className="duel-result-box-label">Você</span>
              <span className="duel-result-box-nick">{myNick}</span>
              <span className="duel-result-box-score">{myScore.toLocaleString('pt-BR')}</span>
              <span className="duel-result-box-unit">pontos</span>
            </div>

            <span className="duel-result-vs">✕</span>

            <div className={`duel-result-box ${!isWinner && !isDraw ? 'winner' : ''}`}>
              <span className="duel-result-box-label">Adversário</span>
              <span className="duel-result-box-nick">{opponentNick}</span>
              <span className="duel-result-box-score">{opponentScore.toLocaleString('pt-BR')}</span>
              <span className="duel-result-box-unit">pontos</span>
            </div>
          </div>

          <p className="total-distance-hint">
            Seu erro acumulado: <strong>{formatDistance(totalDistance)}</strong>
          </p>
        </div>

        <div className="rounds-summary">
          <h3 className="rounds-summary-title">Suas Rodadas</h3>
          <div className="rounds-list">
            {myResults.map((r) => (
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
          <button type="button" className="btn-play-again" onClick={onBackToBracket}>
            Ver Chave do Campeonato →
          </button>
        </div>
      </div>
    </div>
  );
}
