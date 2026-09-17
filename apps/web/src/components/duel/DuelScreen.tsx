import { useState, useEffect, useRef, useCallback } from 'react';
import { PAULO_AFONSO_CENTER, type LatLng } from '@paguessr/shared';
import { submitGuess } from '../../api/client';
import {
  enterMatch,
  getLiveMatch,
  type EnterMatchRound,
  type LiveMatchResponse,
} from '../../api/championships';
import type { PublicUser } from '../../api/auth';
import type { RoundResult, GameState } from '../../types';
import { ImagePanel } from '../ImagePanel';
import { PanoramaPanel } from '../PanoramaPanel';
import { GuessMap } from '../GuessMap';
import { RoundResultModal } from '../RoundResultModal';
import { DuelHeader } from './DuelHeader';
import { DuelResult } from './DuelResult';
import './DuelScreen.css';

export interface DuelScreenProps {
  championshipId: string;
  matchId: string;
  user: PublicUser;
  opponentNick?: string;
  onBackToBracket: () => void;
}

function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2).replace('.', ',')} km`;
}

export function DuelScreen({
  championshipId,
  matchId,
  user,
  opponentNick = 'Adversário',
  onBackToBracket,
}: DuelScreenProps) {
  const [rounds, setRounds] = useState<EnterMatchRound[]>([]);
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [gameState, setGameState] = useState<GameState>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [currentGuess, setCurrentGuess] = useState<LatLng | null>(null);
  const [myScore, setMyScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [opponentRoundsAnswered, setOpponentRoundsAnswered] = useState(0);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const [results, setResults] = useState<RoundResult[]>([]);
  const [latestResult, setLatestResult] = useState<RoundResult | null>(null);
  const [isWaitingNextRound, setIsWaitingNextRound] = useState(false);

  const hasSubmittedRef = useRef(false);

  const initMatch = useCallback(async () => {
    setGameState('loading');
    setLoadError(null);
    try {
      const matchData = await enterMatch(championshipId, matchId);
      const matchRounds = matchData.rounds ?? [];

      if (matchRounds.length === 0) {
        setLoadError('Nenhuma rodada encontrada para este duelo.');
        setGameState('error');
        return;
      }

      setRounds(matchRounds);

      const now = Date.now();
      let activeIndex = matchRounds.length;
      for (let i = 0; i < matchRounds.length; i++) {
        const r = matchRounds[i];
        const start = new Date(r.started_at ?? r.startedAt ?? now).getTime();
        const duration = (r.duration_seconds ?? r.durationSeconds ?? 60) * 1000;
        if (now < start + duration) {
          activeIndex = i;
          break;
        }
      }

      if (activeIndex >= matchRounds.length) {
        setGameState('finished');
      } else {
        setCurrentRoundIndex(activeIndex);
        setGameState('guessing');
      }
    } catch (err: unknown) {
      setLoadError(
        err instanceof Error ? err.message : 'Falha ao ingressar no confronto do campeonato.'
      );
      setGameState('error');
    }
  }, [championshipId, matchId]);

  useEffect(() => {
    initMatch();
  }, [initMatch]);

  useEffect(() => {
    if (gameState === 'loading' || gameState === 'error' || gameState === 'home') return;

    const poll = async () => {
      try {
        const live: LiveMatchResponse = await getLiveMatch(championshipId, matchId);
        if (!live) return;

        const liveAny = live as unknown as Record<string, unknown>;
        const oppScore =
          typeof liveAny.opponent_score === 'number'
            ? liveAny.opponent_score
            : typeof liveAny.opponentScore === 'number'
              ? liveAny.opponentScore
              : undefined;

        if (oppScore !== undefined) {
          setOpponentScore(oppScore);
        }

        const oppRounds = live.opponent_rounds_answered ?? live.opponentRoundsAnswered;
        if (oppRounds !== undefined) {
          setOpponentRoundsAnswered(oppRounds);
        }

        const winner = live.winner_id ?? live.winnerId;
        if (winner) {
          setWinnerId(winner);
        }
      } catch {
        // Degrada em silêncio: polling é apenas indicativo
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [championshipId, matchId, gameState]);

  const advanceRound = useCallback(() => {
    if (currentRoundIndex + 1 < rounds.length) {
      hasSubmittedRef.current = false;
      setCurrentRoundIndex((prev) => prev + 1);
      setCurrentGuess(null);
      setLatestResult(null);
      setIsWaitingNextRound(false);
      setGameState('guessing');
    } else {
      setGameState('finished');
    }
  }, [currentRoundIndex, rounds.length]);

  const submitOnlineGuess = useCallback(
    async (guess: LatLng | null) => {
      if (hasSubmittedRef.current) return;
      hasSubmittedRef.current = true;

      const currentRound = rounds[currentRoundIndex];
      if (!currentRound) return;

      setGameState('submitting');
      try {
        const res = await submitGuess(currentRound.id, guess);
        const roundScore = res.score ?? res.points ?? 0;
        const distance = res.distanceMeters ?? res.distance ?? null;

        const newResult: RoundResult = {
          roundNumber: currentRoundIndex + 1,
          location: res.location,
          guess,
          distanceMeters: distance,
          score: roundScore,
        };

        setResults((prev) => [...prev, newResult]);
        setLatestResult(newResult);
        setMyScore((prev) => prev + roundScore);
        setGameState('round_result');
        setIsWaitingNextRound(true);
      } catch {
        const fallbackResult: RoundResult = {
          roundNumber: currentRoundIndex + 1,
          location: {
            lat: PAULO_AFONSO_CENTER.lat,
            lng: PAULO_AFONSO_CENTER.lng,
            name: 'Local da Rodada',
          },
          guess,
          distanceMeters: null,
          score: 0,
        };

        setResults((prev) => [...prev, fallbackResult]);
        setLatestResult(fallbackResult);
        setGameState('round_result');
        setIsWaitingNextRound(true);
      }
    },
    [currentRoundIndex, rounds]
  );

  useEffect(() => {
    if (gameState !== 'guessing' && gameState !== 'submitting' && gameState !== 'round_result') {
      setSecondsLeft(null);
      return;
    }

    const currentRound = rounds[currentRoundIndex];
    if (!currentRound) return;

    const startMs = new Date(
      currentRound.started_at ?? currentRound.startedAt ?? Date.now()
    ).getTime();
    const durationSeconds = currentRound.duration_seconds ?? currentRound.durationSeconds ?? 60;
    const endMs = startMs + durationSeconds * 1000;

    let timeoutDispatched = false;

    const tick = () => {
      const remainingMs = endMs - Date.now();
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
      setSecondsLeft(remainingSec);

      if (remainingMs <= 0) {
        if (!hasSubmittedRef.current && !timeoutDispatched) {
          timeoutDispatched = true;
          submitOnlineGuess(currentGuess);
        } else if (hasSubmittedRef.current) {
          advanceRound();
        }
      }
    };

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [currentRoundIndex, gameState, rounds, currentGuess, submitOnlineGuess, advanceRound]);

  if (gameState === 'loading') {
    return (
      <div className="status-screen">
        <div className="spinner large"></div>
        <h2>Entrando no duelo...</h2>
        <p>Sincronizando relógio e rodadas do servidor.</p>
      </div>
    );
  }

  if (gameState === 'error') {
    return (
      <div className="status-screen">
        <span className="screen-emoji">⚠️</span>
        <h2>Não foi possível iniciar o duelo</h2>
        <p className="error-text">{loadError}</p>
        <div className="status-actions" style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={onBackToBracket}
          >
            Voltar para a Chave
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={initMatch}
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  if (gameState === 'finished') {
    return (
      <DuelResult
        myNick={user.nick}
        opponentNick={opponentNick}
        myScore={myScore}
        opponentScore={opponentScore}
        myResults={results}
        winnerId={winnerId}
        myUserId={user.id}
        onBackToBracket={onBackToBracket}
      />
    );
  }

  const currentRound = rounds[currentRoundIndex];
  const isLastRound = currentRoundIndex === rounds.length - 1;

  return (
    <div className="app-shell">
      <DuelHeader
        myNick={user.nick}
        opponentNick={opponentNick}
        myScore={myScore}
        opponentScore={opponentScore}
        currentRound={currentRoundIndex + 1}
        totalRounds={rounds.length}
        secondsLeft={secondsLeft}
        onExit={onBackToBracket}
      />

      <main className="game-body">
        <div className="game-stage">
          {currentRound?.streetview_mode === 'panorama' ? (
            <PanoramaPanel roundId={currentRound.id} />
          ) : (
            <ImagePanel roundId={currentRound?.id} />
          )}

          <GuessMap
            center={PAULO_AFONSO_CENTER}
            guess={currentGuess}
            correctCoords={
              gameState === 'round_result' && latestResult ? latestResult.location : null
            }
            locationName={latestResult?.location.name}
            gameState={gameState}
            onSelectGuess={(coords) => {
              if (gameState === 'guessing') setCurrentGuess(coords);
            }}
            onConfirmGuess={() => {
              if (currentGuess && gameState === 'guessing') {
                submitOnlineGuess(currentGuess);
              }
            }}
          />

          {gameState === 'round_result' && latestResult && !isWaitingNextRound && (
            <RoundResultModal
              result={latestResult}
              isLastRound={isLastRound}
              onNext={() => {
                if (secondsLeft !== null && secondsLeft > 0) {
                  setIsWaitingNextRound(true);
                } else {
                  advanceRound();
                }
              }}
            />
          )}

          {isWaitingNextRound && latestResult && (
            <div className="duel-waiting-card">
              <div className="duel-waiting-spinner-wrap">
                <div className="spinner"></div>
              </div>
              <div className="duel-waiting-text">
                <h3>Aguardando a próxima rodada</h3>
                <p>
                  Palpite enviado:{' '}
                  <strong>+{latestResult.score.toLocaleString('pt-BR')} pts</strong> (
                  {latestResult.distanceMeters !== null
                    ? formatDistance(latestResult.distanceMeters)
                    : 'Tempo esgotado'}
                  ).
                </p>
                <p className="duel-waiting-countdown">
                  {isLastRound
                    ? `Duelo encerra em ${secondsLeft ?? 0}s`
                    : `Próxima rodada em ${secondsLeft ?? 0}s`}
                </p>
                <div className="duel-opponent-status">
                  <span>{opponentNick}:</span>
                  <span className="duel-opp-status-pill">
                    {opponentRoundsAnswered > currentRoundIndex
                      ? '✓ Já respondeu'
                      : 'Pensando no palpite...'}
                  </span>
                  <span>
                    · Placar parcial: <strong>{opponentScore.toLocaleString('pt-BR')} pts</strong>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
