import { useState, useCallback, useRef, useEffect } from 'react';
import './styles/navyTheme.css';
import { HomeScreen } from './components/HomeScreen';
import { LoginScreen } from './components/auth/LoginScreen';
import { RegisterScreen } from './components/auth/RegisterScreen';
import { RecoverPasswordScreen } from './components/auth/RecoverPasswordScreen';
import { RecoveryCodeScreen } from './components/auth/RecoveryCodeScreen';
import { haversine, score, PAULO_AFONSO_CENTER } from '@paguessr/shared';
import type { LatLng } from '@paguessr/shared';
import { MOCK_LOCATIONS } from './data/mockLocations';
import type { GameState, RoundResult, RoundData } from './types';
import { createGame, submitGuess, getGameSummary, type ApiRoundInitial } from './api/client';
import { me, logout, type PublicUser } from './api/auth';
import { RoundHeader } from './components/RoundHeader';
import { ImagePanel } from './components/ImagePanel';
import { GuessMap } from './components/GuessMap';
import { RoundResultModal } from './components/RoundResultModal';
import { GameResult } from './components/GameResult';

type AuthView = 'login' | 'register' | 'recover';

export function App() {
  const [authUser, setAuthUser] = useState<PublicUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authView, setAuthView] = useState<AuthView>('login');
  const [pendingRecoveryCode, setPendingRecoveryCode] = useState<string | null>(null);

  useEffect(() => {
    me()
      .then((res) => setAuthUser(res.user))
      .finally(() => setAuthChecked(true));
  }, []);

  const sessionVersion = useRef(0);
  const pauseRef = useRef<HTMLDialogElement>(null);
  const returnHome = useCallback(() => {
    sessionVersion.current += 1;
    pauseRef.current?.close();
    setGameState('home');
  }, []);

  const handleLogout = useCallback(async () => {
    await logout().catch(() => {});
    setAuthUser(null);
    setAuthView('login');
    returnHome();
  }, [returnHome]);

  const [gameState, setGameState] = useState<GameState>('home');
  const [gameId, setGameId] = useState<string | null>(null);
  const [rounds, setRounds] = useState<RoundData[]>([]);
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [currentGuess, setCurrentGuess] = useState<LatLng | null>(null);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submittingError, setSubmittingError] = useState<string | null>(null);

  useEffect(() => {
    if (gameState === 'home') return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.repeat || pauseRef.current?.open) return;
      event.preventDefault();
      pauseRef.current?.showModal();
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [gameState]);

  const startNewGame = useCallback(async (forceMock = false) => {
    const version = ++sessionVersion.current;
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
      if (version !== sessionVersion.current) return;
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
      if (version !== sessionVersion.current) return;
      const msg = err instanceof Error ? err.message : 'Erro ao conectar com a API.';
      setErrorMessage(msg);
      setGameState('error');
    }
  }, []);

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
    if (!currentGuess || gameState !== 'guessing') return;
    const version = sessionVersion.current;

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
      if (version !== sessionVersion.current) return;
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
      if (version !== sessionVersion.current) return;
      const msg = err instanceof Error ? err.message : 'Erro ao enviar palpite.';
      setSubmittingError(msg);
      setGameState('guessing');
    }
  };

  const handleNextRound = async () => {
    const version = sessionVersion.current;
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
      if (version !== sessionVersion.current) return;
      setGameState('finished');
    }
  };

  const handlePlayAgain = () => {
    startNewGame(isOfflineMode);
  };

  const latestResult = results[results.length - 1];
  const isLastRound = currentRoundIndex === totalRounds - 1;

  if (!authChecked) {
    return (
      <div className="status-screen">
        <div className="spinner large"></div>
      </div>
    );
  }

  if (pendingRecoveryCode) {
    return (
      <RecoveryCodeScreen
        recoveryCode={pendingRecoveryCode}
        onContinue={() => setPendingRecoveryCode(null)}
      />
    );
  }

  if (!authUser) {
    if (authView === 'register') {
      return (
        <RegisterScreen
          onSuccess={(user, recoveryCode) => {
            setAuthUser(user);
            setPendingRecoveryCode(recoveryCode);
          }}
          onGoToLogin={() => setAuthView('login')}
        />
      );
    }
    if (authView === 'recover') {
      return (
        <RecoverPasswordScreen
          onSuccess={(user) => setAuthUser(user)}
          onGoToLogin={() => setAuthView('login')}
        />
      );
    }
    return (
      <LoginScreen
        onSuccess={(user) => setAuthUser(user)}
        onGoToRegister={() => setAuthView('register')}
        onGoToRecover={() => setAuthView('recover')}
      />
    );
  }

  if (gameState === 'home') {
    return (
      <HomeScreen
        user={authUser}
        onLogout={handleLogout}
        onStartTraining={() => startNewGame(true)}
      />
    );
  }

  return (
    <div className="app-shell">
      <RoundHeader
        currentRound={currentRoundIndex + 1}
        totalRounds={totalRounds}
        totalScore={totalScore}
        isOfflineMode={isOfflineMode}
        onHome={returnHome}
        onPause={() => pauseRef.current?.showModal()}
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
              <button type="button" className="btn-secondary" onClick={returnHome}>
                Voltar ao início
              </button>
              <button type="button" className="btn-primary" onClick={() => startNewGame(false)}>
                Tentar Conectar Novamente
              </button>
              <button type="button" className="btn-secondary" onClick={() => startNewGame(true)}>
                Jogar no Modo Offline (Mock)
              </button>
            </div>
          </div>
        )}

        {gameState === 'finished' && <GameResult results={results} onPlayAgain={handlePlayAgain} />}

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
                gameState === 'round_result' && latestResult ? latestResult.location : null
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
      <dialog ref={pauseRef} className="pause-menu" aria-labelledby="pause-title">
        <span className="pause-kicker">PAGUESSR</span>
        <h2 id="pause-title">Pausa</h2>
        <button autoFocus className="pause-continue" onClick={() => pauseRef.current?.close()}>
          Continuar partida <kbd>Esc</kbd>
        </button>
        <button className="pause-home" onClick={returnHome}>
          Voltar ao início
        </button>
        <p>Ao voltar, a próxima partida começa do zero.</p>
      </dialog>
    </div>
  );
}

export default App;
