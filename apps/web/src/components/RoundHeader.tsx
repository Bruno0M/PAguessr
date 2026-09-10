interface RoundHeaderProps {
  currentRound: number;
  totalRounds: number;
  totalScore: number;
  isOfflineMode?: boolean;
}

export function RoundHeader({
  currentRound,
  totalRounds,
  totalScore,
  isOfflineMode = false,
}: RoundHeaderProps) {
  return (
    <header className="header">
      <div className="header-brand">
        <span className="logo-pin">📍</span>
        <h1 className="logo-title">PAguessr</h1>
        <span className="city-tag">Paulo Afonso - BA</span>
        {isOfflineMode && <span className="offline-tag">Modo Offline (Mock)</span>}
      </div>

      <div className="header-stats">
        <div className="stat-pill">
          <span className="stat-label">Rodada</span>
          <span className="stat-value">
            {currentRound} / {totalRounds}
          </span>
        </div>

        <div className="stat-pill highlight">
          <span className="stat-label">Pontos</span>
          <span className="stat-value">{totalScore.toLocaleString('pt-BR')}</span>
        </div>
      </div>
    </header>
  );
}
