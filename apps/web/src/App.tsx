import { useState, useEffect, useCallback } from 'react';
import { haversine, score, PAULO_AFONSO_CENTER } from '@paguessr/shared';
import type { LatLng } from '@paguessr/shared';
import { MOCK_LOCATIONS } from './data/mockLocations';
import type { GameState, RoundResult, RoundData } from './types';
import {
  createGame,
  submitGuess,
  getGameSummary,
  type ApiRoundInitial,
} from './api/client';
import { RoundHeader } from './components/RoundHeader';
import { ImagePanel } from './components/ImagePanel';
import { GuessMap } from './components/GuessMap';
import { RoundResultModal } from './components/RoundResultModal';
import { GameResult } from './components/GameResult';

export function App() {
  const [gameState, setGameState] = useState<GameState>('loading');
  const [gameId, setGameId] = useState<string | null>(null);
  const [rounds, setRounds] = useState<RoundData[]>([]);
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [currentGuess, setCurrentGuess] = useState<LatLng | null>(null);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submittingError, setSubmittingError] = useState<string | null>(null);

  const startNewGame = useCallback(async (forceMock = false) => {
    setGameState('loading');
    setErrorMessage(null);
    setSubmittingError(null);
    setCurrentGuess(null);
    setResults([]);
    setCurrentRoundIndex(0);

    if (forceMock) {
      setIsOfflineMode(true);
      const mockRounds: RoundData[] = MOCK_LOCATIONS.map((loc, idx) => ({
        id: loc.id,
        order: idx + 1,
      }));
      setRounds(mockRounds);
      setGameId('mock-game');
      setGameState('guessing');
      return;
    }

    try {
      const data = await createGame();
      const mappedRounds: RoundData[] = (data.rounds || []).map(
        (r: ApiRoundInitial, idx: number) => ({
          id: r.id,
          order: r.order ?? r.roundNumber ?? idx + 1,
        })
      );

      if (mappedRounds.length === 0) {
        throw new Error('API não retornou rodadas para a partida.');
      }

      setGameId(data.id);
      setRounds(mappedRounds);
      setIsOfflineMode(false);
      setGameState('guessing');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao conectar com a API.';
      setErrorMessage(msg);
      setGameState('error');
    }
  }, []);

  useEffect(() => {
    startNewGame();
  }, [startNewGame]);

  const totalRounds = rounds.length || 5;
  const currentRound = rounds[currentRoundIndex];
  const currentMockLoc = MOCK_LOCATIONS[currentRoundIndex % MOCK_LOCATIONS.length];
  const totalScore = results.reduce((acc, curr) => acc + curr.score, 0);

  const handleSelectGuess = (coords: LatLng) => {
    if (gameState !== 'guessing') return;
    setSubmittingError(null);
    setCurrentGuess(coords);
  };

  const handleConfirmGuess = async () => {
    if (!currentGuess || (gameState !== 'guessing' && gameState !== 'submitting')) return;

    if (isOfflineMode) {
      const distanceMeters = haversine(currentGuess, currentMockLoc.coords);
      const roundScore = score(distanceMeters);

      const newResult: RoundResult = {
        roundNumber: currentRoundIndex + 1,
        location: {
          lat: currentMockLoc.coords.lat,
          lng: currentMockLoc.coords.lng,
          name: currentMockLoc.name,
          description: currentMockLoc.description,
        },
        guess: currentGuess,
        distanceMeters,
        score: roundScore,
      };

      setResults((prev) => [...prev, newResult]);
      setGameState('round_result');
      return;
    }

    if (!currentRound) return;

    setGameState('submitting');
    setSubmittingError(null);

    try {
      const res = await submitGuess(currentRound.id, currentGuess);
      const distanceMeters = res.distance ?? res.distanceMeters ?? 0;
      const roundScore = res.points ?? res.score ?? 0;

      const newResult: RoundResult = {
        roundNumber: currentRoundIndex + 1,
        location: {
          lat: res.location.lat,
          lng: res.location.lng,
          name: res.location.name,
          description: res.location.description,
        },
        guess: currentGuess,
        distanceMeters,
        score: roundScore,
      };

      setResults((prev) => [...prev, newResult]);
      setGameState('round_result');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar palpite.';
      setSubmittingError(msg);
      setGameState('guessing');
    }
  };

  const handleNextRound = async () => {
    if (currentRoundIndex + 1 < totalRounds) {
      setCurrentRoundIndex((prev) => prev + 1);
      setCurrentGuess(null);
      setSubmittingError(null);
      setGameState('guessing');
    } else {
      if (!isOfflineMode && gameId) {
        try {
          await getGameSummary(gameId);
        } catch {
          // Ignora falha de resumo se já possuímos os resultados locais acumulados
        }
      }
      setGameState('finished');
    }
  };

  const handlePlayAgain = () => {
    startNewGame(isOfflineMode);
  };

  const latestResult = results[results.length - 1];
  const isLastRound = currentRoundIndex === totalRounds - 1;

  return (
    <div className="app-shell">
      <RoundHeader
        currentRound={currentRoundIndex + 1}
        totalRounds={totalRounds}
        totalScore={totalScore}
        isOfflineMode={isOfflineMode}
      />

      <main className="game-body">
        {gameState === 'loading' && (
          <div className="status-screen">
            <div className="spinner large"></div>
            <h2>Iniciando partida...</h2>
            <p>Conectando à API e preparando os pontos de Paulo Afonso</p>
          </div>
        )}

        {gameState === 'error' && (
          <div className="status-screen error">
            <span className="screen-emoji">⚠️</span>
            <h2>Não foi possível iniciar a partida</h2>
            <p className="error-text">{errorMessage}</p>
            <div className="status-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => startNewGame(false)}
              >
                Tentar Conectar Novamente
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => startNewGame(true)}
              >
                Jogar no Modo Offline (Mock)
              </button>
            </div>
          </div>
        )}

        {gameState === 'finished' && (
          <GameResult results={results} onPlayAgain={handlePlayAgain} />
        )}

        {(gameState === 'guessing' ||
          gameState === 'submitting' ||
          gameState === 'round_result') && (
          <div className="game-stage">
            {submittingError && (
              <div className="submission-error-toast">
                <span>⚠️ {submittingError}</span>
                <button
                  type="button"
                  className="btn-toast-close"
                  onClick={() => setSubmittingError(null)}
                >
                  ✕
                </button>
              </div>
            )}

            <ImagePanel
              roundId={isOfflineMode ? undefined : currentRound?.id}
              placeholderText={currentMockLoc?.imagePlaceholderText}
              category={currentMockLoc?.category}
              isMockFallback={isOfflineMode}
            />

            <GuessMap
              center={PAULO_AFONSO_CENTER}
              guess={currentGuess}
              correctCoords={
                gameState === 'round_result' && latestResult
                  ? latestResult.location
                  : null
              }
              locationName={latestResult?.location.name}
              gameState={gameState}
              onSelectGuess={handleSelectGuess}
              onConfirmGuess={handleConfirmGuess}
            />

            {gameState === 'round_result' && latestResult && (
              <RoundResultModal
                result={latestResult}
                isLastRound={isLastRound}
                onNext={handleNextRound}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
