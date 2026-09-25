import { useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation, faXmark } from '@fortawesome/free-solid-svg-icons';
import { HomeScreen } from './components/HomeScreen';
import { LoginScreen } from './components/auth/LoginScreen';
import { RegisterScreen } from './components/auth/RegisterScreen';
import { RecoverPasswordScreen } from './components/auth/RecoverPasswordScreen';
import { RecoveryCodeScreen } from './components/auth/RecoveryCodeScreen';
import { TitleScreen } from './components/title/TitleScreen';
import { haversine, score, PAULO_AFONSO_CENTER, ROUND_DURATION_MS } from '@paguessr/shared';
import type { LatLng } from '@paguessr/shared';
import { MOCK_LOCATIONS } from './data/mockLocations';
import type { GameState, RoundResult, RoundData } from './types';
import { createGame, submitGuess, getGameSummary, type ApiRoundInitial } from './api/client';
import { me, logout, type PublicUser } from './api/auth';
import { getRanking } from './api/ranking';
import { getFeatures, type Features } from './api/features';
import { getFraudNotice, type FraudNoticePendingResponse } from './api/fraudNotice';
import { FraudNoticeModal } from './components/fraud/FraudNoticeModal';
import { RoundHeader } from './components/RoundHeader';
import { ImagePanel } from './components/ImagePanel';
import { PanoramaPanel } from './components/PanoramaPanel';
import { GuessMap } from './components/GuessMap';
import { RoundResultModal } from './components/RoundResultModal';
import { GameResult } from './components/GameResult';
import { AdminApp } from './components/admin/AdminApp';
import { ChampionshipsPage } from './components/championships/ChampionshipsPage';
import { ChampionshipDetailPage } from './components/championships/ChampionshipDetailPage';
import { ChampionshipLobby } from './components/championships/lobby/ChampionshipLobby';
import { DuelScreen } from './components/duel';
import { track } from './lib/analytics';

// Carregado sob demanda: three.js/@react-three só entram no bundle de quem
// realmente abre o ranking, não pesam no carregamento inicial do jogo.
const RankingScreen = lazy(() =>
  import('./components/ranking/RankingScreen').then((m) => ({ default: m.RankingScreen }))
);

type AuthView = 'login' | 'register' | 'recover';

export function App() {
  const [showTitle, setShowTitle] = useState(
    () =>
      !window.location.pathname.startsWith('/admin') &&
      !window.location.pathname.startsWith('/campeonatos')
  );
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);
  const [authUser, setAuthUser] = useState<PublicUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [features, setFeatures] = useState<Features>({ championships: false });
  const [authView, setAuthView] = useState<AuthView>('login');
  const [pendingRecoveryCode, setPendingRecoveryCode] = useState<string | null>(null);

  useEffect(() => {
    const onPopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  }, []);

  // Troca a página atual sem empilhar no histórico: o "voltar" não cai de novo
  // numa tela que já mandou a pessoa embora (a sala, por exemplo).
  const replacePath = useCallback((path: string) => {
    window.history.replaceState({}, '', path);
    setCurrentPath(path);
  }, []);

  useEffect(() => {
    me()
      .then((res) => setAuthUser(res.user))
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    let active = true;
    setFeatures({ championships: false });
    getFeatures().then((data) => {
      if (active) setFeatures(data);
    });
    return () => {
      active = false;
    };
  }, [authUser]);

  useEffect(() => {
    if (!features.championships) {
      if (currentPath === '/campeonatos' || currentPath.startsWith('/campeonatos/')) {
        navigate('/');
      }
    }
  }, [features.championships, currentPath, navigate]);

  const [fraudNotice, setFraudNotice] = useState<FraudNoticePendingResponse | null>(null);
  const wasInGameRef = useRef(false);

  const checkFraudNotice = useCallback(async () => {
    if (!authUser) return;
    try {
      const notice = await getFraudNotice();
      if (notice.pending) {
        setShowTitle(false);
        setShowRanking(false);
        setFraudNotice(notice);
      }
    } catch {
      // Ignora erro para não quebrar o fluxo da partida
    }
  }, [authUser]);

  useEffect(() => {
    if (authUser) {
      checkFraudNotice();
    }
  }, [authUser, checkFraudNotice]);

  const sessionVersion = useRef(0);
  const pauseRef = useRef<HTMLDialogElement>(null);
  const returnHome = useCallback(() => {
    sessionVersion.current += 1;
    pauseRef.current?.close();
    setGameState('home');
    if (wasInGameRef.current) {
      wasInGameRef.current = false;
      checkFraudNotice();
    }
  }, [checkFraudNotice]);

  const handleLogout = useCallback(async () => {
    await logout().catch(() => {});
    setAuthUser(null);
    setAuthView('login');
    setShowRanking(false);
    setShowTitle(true);
    setFraudNotice(null);
    returnHome();
  }, [returnHome]);

  const [showRanking, setShowRanking] = useState(false);
  const previousBestRef = useRef<number | undefined>(undefined);

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
    if (gameState !== 'home' && gameState !== 'loading' && gameState !== 'error') {
      wasInGameRef.current = true;
    } else if (gameState === 'home' && wasInGameRef.current) {
      wasInGameRef.current = false;
      checkFraudNotice();
    }
  }, [gameState, checkFraudNotice]);

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

  const startNewGame = useCallback(async (forceMock = false, source = 'unknown') => {
    const version = ++sessionVersion.current;
    setGameState('loading');
    setErrorMessage(null);
    setSubmittingError(null);
    setCurrentGuess(null);
    setResults([]);
    setCurrentRoundIndex(0);
    track('game_start', { mode: forceMock ? 'offline' : 'ranked', source });

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

    previousBestRef.current = undefined;
    getRanking('geral', 1)
      .then((res) => {
        previousBestRef.current = res.me?.score ?? 0;
      })
      .catch(() => {
        // Ranking é só decoração da tela final; falha aqui não deve travar a partida.
      });

    try {
      const data = await createGame();
      if (version !== sessionVersion.current) return;
      const mappedRounds: RoundData[] = (data.rounds || []).map(
        (r: ApiRoundInitial, idx: number) => ({
          id: r.id,
          order: r.order ?? r.roundNumber ?? idx + 1,
          startedAt: r.startedAt ?? r.started_at ?? null,
          streetview_mode: r.streetview_mode ?? 'static',
          durationSeconds: r.duration_seconds ?? r.durationSeconds,
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
      track('game_start_error', { source });
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

  const submitOnlineGuess = useCallback(
    async (guess: LatLng | null) => {
      if (!currentRound) return;
      const version = sessionVersion.current;

      setGameState('submitting');
      setSubmittingError(null);

      try {
        const res = await submitGuess(currentRound.id, guess);
        if (version !== sessionVersion.current) return;
        const distanceMeters = res.distance ?? res.distanceMeters ?? null;
        const roundScore = res.points ?? res.score ?? 0;

        const newResult: RoundResult = {
          roundNumber: currentRoundIndex + 1,
          location: {
            lat: res.location.lat,
            lng: res.location.lng,
            name: res.location.name,
            description: res.location.description,
          },
          guess,
          distanceMeters,
          score: roundScore,
        };

        setResults((prev) => [...prev, newResult]);

        const nextRound = res.nextRound;
        if (nextRound) {
          const nextStartedAt = nextRound.startedAt ?? nextRound.started_at ?? null;
          const nextDuration = nextRound.duration_seconds ?? nextRound.durationSeconds;
          setRounds((prev) =>
            prev.map((r) =>
              r.id === nextRound.id
                ? {
                    ...r,
                    startedAt: nextStartedAt,
                    ...(nextRound.streetview_mode
                      ? { streetview_mode: nextRound.streetview_mode }
                      : {}),
                    ...(nextDuration !== undefined ? { durationSeconds: nextDuration } : {}),
                  }
                : r
            )
          );
        }

        setGameState('round_result');
      } catch (err: unknown) {
        if (version !== sessionVersion.current) return;
        const msg = err instanceof Error ? err.message : 'Erro ao enviar palpite.';
        setSubmittingError(msg);
        setGameState('guessing');
      }
    },
    [currentRound, currentRoundIndex]
  );

  const handleConfirmGuess = async () => {
    if (gameState !== 'guessing' || !currentGuess) return;
    track('guess_confirm', {
      roundIndex: currentRoundIndex,
      mode: isOfflineMode ? 'offline' : 'ranked',
    });

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

    await submitOnlineGuess(currentGuess);
  };

  // Cronômetro do modo Ranqueado: só exibição, o servidor é quem decide a
  // pontuação (ver started_at/ROUND_DURATION_MS em gameRoutes.ts). Ao zerar,
  // envia o palpite atual (se houver) ou um timeout explícito (sem coords).
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (isOfflineMode || gameState !== 'guessing' || !currentRound?.startedAt) {
      setSecondsLeft(null);
      return;
    }

    const durationSeconds = currentRound.durationSeconds ?? currentRound.duration_seconds;
    const durationMs =
      typeof durationSeconds === 'number' ? durationSeconds * 1000 : ROUND_DURATION_MS;

    const deadline = new Date(currentRound.startedAt).getTime() + durationMs;
    let timeoutFired = false;

    const tick = () => {
      const remainingMs = deadline - Date.now();
      setSecondsLeft(Math.max(0, Math.ceil(remainingMs / 1000)));
      if (remainingMs <= 0 && !timeoutFired) {
        timeoutFired = true;
        track('guess_timeout', { roundIndex: currentRoundIndex, hadGuess: !!currentGuess });
        submitOnlineGuess(currentGuess);
      }
    };

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [
    isOfflineMode,
    gameState,
    currentRound?.startedAt,
    currentRound?.durationSeconds,
    currentRound?.duration_seconds,
    submitOnlineGuess,
    currentGuess,
    currentRoundIndex,
  ]);

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
      track('game_finished', { totalScore, mode: isOfflineMode ? 'offline' : 'ranked' });
    }
  };

  const handlePlayAgain = () => {
    startNewGame(isOfflineMode, 'play_again');
  };

  const latestResult = results[results.length - 1];
  const isLastRound = currentRoundIndex === totalRounds - 1;

  const fraudModal =
    fraudNotice && authUser ? (
      <FraudNoticeModal notice={fraudNotice} user={authUser} onClose={() => setFraudNotice(null)} />
    ) : null;

  // Tela de título: abre o jogo pra todo mundo (com ou sem sessão) e é o destino
  // do "Sair". O me() lá em cima confere a sessão enquanto ela está na tela.
  if (showTitle) {
    return (
      <>
        <TitleScreen
          ready={authChecked}
          goesToAuth={!authUser}
          onStart={() => setShowTitle(false)}
        />
        {fraudModal}
      </>
    );
  }

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
        onGoToTitle={() => setShowTitle(true)}
      />
    );
  }

  if (currentPath.startsWith('/admin')) {
    return (
      <>
        <AdminApp
          user={authUser}
          path={currentPath}
          onNavigate={navigate}
          onLogout={handleLogout}
          onUnauthorized={() => setAuthUser(null)}
          onGoHome={() => navigate('/')}
          championships={features.championships}
        />
        {fraudModal}
      </>
    );
  }

  if (gameState === 'home') {
    let homeContent: React.ReactNode = null;
    if (showRanking) {
      homeContent = (
        <Suspense
          fallback={
            <div className="status-screen">
              <div className="spinner large"></div>
            </div>
          }
        >
          <RankingScreen
            user={authUser}
            onBack={() => setShowRanking(false)}
            onPlayRanked={() => {
              setShowRanking(false);
              startNewGame(false, 'ranking');
            }}
          />
        </Suspense>
      );
    } else if (features.championships) {
      const duelMatch = currentPath.match(/^\/campeonatos\/([^/]+)\/(?:duelo|matches)\/([^/]+)$/);
      if (duelMatch) {
        const [, champId, matchId] = duelMatch;
        homeContent = (
          <DuelScreen
            championshipId={champId}
            matchId={matchId}
            user={authUser}
            onBackToBracket={() => navigate(`/campeonatos/${champId}`)}
            onBackToLobby={() => navigate(`/campeonatos/${champId}/sala`)}
          />
        );
      } else {
        const lobbyMatch = currentPath.match(/^\/campeonatos\/([^/]+)\/sala$/);
        if (lobbyMatch) {
          const [, championshipId] = lobbyMatch;
          homeContent = (
            <ChampionshipLobby
              championshipId={championshipId}
              user={authUser}
              onBackToList={() => navigate('/campeonatos')}
              onViewBracket={() => navigate(`/campeonatos/${championshipId}`)}
              onEnterDuel={(matchId) => navigate(`/campeonatos/${championshipId}/duelo/${matchId}`)}
              onLeave={() => replacePath(`/campeonatos/${championshipId}`)}
            />
          );
        } else {
          const detailMatch = currentPath.match(/^\/campeonatos\/([^/]+)$/);
          if (detailMatch) {
            const [, championshipId] = detailMatch;
            homeContent = (
              <ChampionshipDetailPage
                championshipId={championshipId}
                user={authUser}
                onBack={() => navigate('/campeonatos')}
                onOpenLobby={() => navigate(`/campeonatos/${championshipId}/sala`)}
                onEnterMatch={(matchId) =>
                  navigate(`/campeonatos/${championshipId}/duelo/${matchId}`)
                }
              />
            );
          } else if (currentPath === '/campeonatos') {
            homeContent = (
              <ChampionshipsPage
                user={authUser}
                onBack={() => navigate('/')}
                onSelectChampionship={(id) => navigate(`/campeonatos/${id}`)}
                onOpenLobby={(id) => navigate(`/campeonatos/${id}/sala`)}
              />
            );
          }
        }
      }
    }

    if (!homeContent) {
      homeContent = (
        <HomeScreen
          user={authUser}
          championships={features.championships}
          onLogout={handleLogout}
          onStartRanked={() => startNewGame(false, 'home')}
          onOpenRanking={() => setShowRanking(true)}
          onOpenChampionships={() => navigate('/campeonatos')}
        />
      );
    }

    return (
      <>
        {homeContent}
        {fraudModal}
      </>
    );
  }

  return (
    <div className="app-shell">
      <RoundHeader
        currentRound={currentRoundIndex + 1}
        totalRounds={totalRounds}
        totalScore={totalScore}
        isOfflineMode={isOfflineMode}
        secondsLeft={secondsLeft}
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
            <FontAwesomeIcon
              icon={faTriangleExclamation}
              className="screen-emoji"
              aria-hidden="true"
            />
            <h2>Não foi possível iniciar a partida</h2>
            <p className="error-text">{errorMessage}</p>
            <div className="status-actions">
              <button type="button" className="game-ghost" onClick={returnHome}>
                Voltar ao início
              </button>
              <button
                type="button"
                className="game-cta"
                onClick={() => startNewGame(false, 'error_retry')}
              >
                Tentar Conectar Novamente
              </button>
              <button
                type="button"
                className="game-ghost"
                onClick={() => startNewGame(true, 'error_offline')}
              >
                Jogar no Modo Offline (Mock)
              </button>
            </div>
          </div>
        )}

        {gameState === 'finished' && (
          <GameResult
            results={results}
            onPlayAgain={handlePlayAgain}
            isRanked={!isOfflineMode}
            isNewRecord={
              previousBestRef.current !== undefined && totalScore > previousBestRef.current
            }
            onViewRanking={() => {
              track('view_ranking_from_result');
              returnHome();
              setShowRanking(true);
            }}
          />
        )}

        {(gameState === 'guessing' ||
          gameState === 'submitting' ||
          gameState === 'round_result') && (
          <div className="game-stage">
            {submittingError && (
              <div className="submission-error-toast">
                <span>
                  <FontAwesomeIcon icon={faTriangleExclamation} aria-hidden="true" />{' '}
                  {submittingError}
                </span>
                <button
                  type="button"
                  className="btn-toast-close"
                  onClick={() => setSubmittingError(null)}
                  aria-label="Fechar aviso"
                >
                  <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
                </button>
              </div>
            )}

            {currentRound?.streetview_mode === 'panorama' ? (
              <PanoramaPanel
                roundId={isOfflineMode ? undefined : currentRound?.id}
                placeholderText={currentMockLoc?.imagePlaceholderText}
                category={currentMockLoc?.category}
                isMockFallback={isOfflineMode}
              />
            ) : (
              <ImagePanel
                roundId={isOfflineMode ? undefined : currentRound?.id}
                placeholderText={currentMockLoc?.imagePlaceholderText}
                category={currentMockLoc?.category}
                isMockFallback={isOfflineMode}
              />
            )}

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
      <dialog ref={pauseRef} className="game-card pause-menu" aria-labelledby="pause-title">
        <span className="pause-kicker">PAGUESSR</span>
        <h2 id="pause-title">Pausa</h2>
        <button
          autoFocus
          type="button"
          className="game-cta pause-continue"
          onClick={() => pauseRef.current?.close()}
        >
          Continuar partida <span className="game-kbd">Esc</span>
        </button>
        <button type="button" className="game-ghost pause-home" onClick={returnHome}>
          Voltar ao início
        </button>
        <p>Ao voltar, a próxima partida começa do zero.</p>
      </dialog>
      {fraudModal}
    </div>
  );
}

export default App;
