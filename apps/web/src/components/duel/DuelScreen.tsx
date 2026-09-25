import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation, faXmark } from '@fortawesome/free-solid-svg-icons';
import { DUEL_REVEAL_SECONDS, PAULO_AFONSO_CENTER, type LatLng } from '@paguessr/shared';
import { submitGuess } from '../../api/client';
import {
  enterMatch,
  getLiveMatch,
  type EnterMatchRound,
  type LiveMatchOpponent,
  type LiveMatchResponse,
  type LiveMatchRound,
} from '../../api/championships';
import type { PublicUser } from '../../api/auth';
import { serverNow } from '../../lib/serverClock';
import { AvatarSvg } from '../auth/avatars';
import { formatCountdown } from '../championships/lobby/lobbyState';
import { ImagePanel } from '../ImagePanel';
import { PanoramaPanel } from '../PanoramaPanel';
import { GuessMap } from '../GuessMap';
import { DuelHeader } from './DuelHeader';
import { DuelResult } from './DuelResult';
import { deriveDuelPhase, mergeRoundTimes, type RoundTime } from './duelPhase';
import './DuelScreen.css';

export interface DuelScreenProps {
  championshipId: string;
  matchId: string;
  user: PublicUser;
  onBackToBracket: () => void;
  /** Depois de vencer um duelo que não era a final, o resultado leva de volta à sala. */
  onBackToLobby?: () => void;
}

/** Quanto antes do fim da rodada o palpite sai sozinho, em ms do relógio do servidor. */
const AUTO_SUBMIT_LEAD_MS = 500;
const TICK_MS = 250;
/** Polling do `live`: rápido quando algo pode mudar a qualquer momento, lento enquanto se palpita. */
const POLL_FAST_MS = 1000;
const POLL_SLOW_MS = 3000;

interface MyAnswer {
  score: number;
  distance: number | null;
  guess: LatLng | null;
  location: LatLng;
}

type LoadState = 'loading' | 'ready' | 'error';

function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2).replace('.', ',')} km`;
}

function formatPoints(points: number): string {
  return `+${points.toLocaleString('pt-BR')}`;
}

export function DuelScreen({
  championshipId,
  matchId,
  user,
  onBackToBracket,
  onBackToLobby,
}: DuelScreenProps) {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rounds, setRounds] = useState<EnterMatchRound[]>([]);
  // Linha do tempo: vem do `enter`, é atualizada pelo `live` a cada polling e pelo
  // `nextRound` da resposta do palpite. Os horários só andam pra frente no
  // servidor, então aqui ficamos sempre com o mais cedo.
  const [times, setTimes] = useState<RoundTime[]>([]);
  const [revealMs, setRevealMs] = useState(DUEL_REVEAL_SECONDS * 1000);
  const [now, setNow] = useState(() => serverNow());

  const [guessState, setGuessState] = useState<{ order: number; guess: LatLng | null }>({
    order: 0,
    guess: null,
  });
  const [answers, setAnswers] = useState<Record<number, MyAnswer>>({});
  const [submittingOrder, setSubmittingOrder] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [closedAt, setClosedAt] = useState<Record<number, number>>({});

  const [opponent, setOpponent] = useState<LiveMatchOpponent | null>(null);
  const [opponentScore, setOpponentScore] = useState(0);
  const [liveMyScore, setLiveMyScore] = useState(0);
  const [liveRounds, setLiveRounds] = useState<LiveMatchRound[]>([]);
  const [finalScore, setFinalScore] = useState<LiveMatchResponse['finalScore']>(null);
  const [phaseInfo, setPhaseInfo] = useState<{ phase: number; totalPhases: number } | null>(null);
  const [winnerId, setWinnerId] = useState<string | null>(null);

  const submittedRef = useRef<Set<number>>(new Set());
  const opponentNick = opponent?.nick ?? 'Adversário';

  const initMatch = useCallback(async () => {
    setLoadState('loading');
    setLoadError(null);
    try {
      const matchData = await enterMatch(championshipId, matchId);
      const matchRounds = matchData.rounds ?? [];

      if (matchRounds.length === 0) {
        setLoadError('Nenhuma rodada encontrada para este duelo.');
        setLoadState('error');
        return;
      }

      setRounds(matchRounds);
      setTimes(
        matchRounds.map((r) => ({
          startedAtMs: new Date(r.started_at ?? r.startedAt ?? serverNow()).getTime(),
          durationMs: (r.duration_seconds ?? r.durationSeconds ?? 60) * 1000,
        }))
      );
      setNow(serverNow());
      setLoadState('ready');
    } catch (err: unknown) {
      setLoadError(
        err instanceof Error ? err.message : 'Falha ao ingressar no confronto do campeonato.'
      );
      setLoadState('error');
    }
  }, [championshipId, matchId]);

  useEffect(() => {
    initMatch();
  }, [initMatch]);

  useEffect(() => {
    if (loadState !== 'ready') return;
    const interval = setInterval(() => setNow(serverNow()), TICK_MS);
    return () => clearInterval(interval);
  }, [loadState]);

  // ---------- Fase do duelo ----------

  const liveByOrder = useMemo(() => new Map(liveRounds.map((r) => [r.order, r])), [liveRounds]);

  const { phase, order, revealEndsAt } = deriveDuelPhase({
    now,
    times,
    revealMs,
    closedAt,
    isAnswered: (n) => answers[n] !== undefined || (liveByOrder.get(n)?.myPoints ?? null) !== null,
    isClosed: (n) => {
      const time = times[n - 1];
      return (
        liveByOrder.get(n)?.closed === true ||
        (time !== undefined && now >= time.startedAtMs + time.durationMs)
      );
    },
    isSubmitting: (n) => submittingOrder === n,
  });

  const currentTime = times[order - 1];
  const currentRound = rounds[order - 1];
  const isLastRound = order === rounds.length;
  const currentGuess = guessState.order === order ? guessState.guess : null;

  // A última rodada não tem "próxima" pra marcar o fim da revelação: guardamos o
  // instante em que a vimos fechada.
  useEffect(() => {
    if (phase !== 'reveal' || order !== times.length || !currentTime) return;
    const timeEnd = currentTime.startedAtMs + currentTime.durationMs;
    setClosedAt((prev) =>
      prev[order] !== undefined ? prev : { ...prev, [order]: Math.min(serverNow(), timeEnd) }
    );
  }, [phase, order, times.length, currentTime]);

  // ---------- Polling do `live` ----------

  const poll = useCallback(async () => {
    try {
      const live = await getLiveMatch(championshipId, matchId);
      if (!live) return;

      setOpponentScore(live.opponentScore);
      setOpponent(live.opponent);
      setLiveRounds(live.rounds);
      setFinalScore(live.finalScore);
      setLiveMyScore(live.myScore ?? live.my_score ?? 0);
      setPhaseInfo({ phase: live.phase, totalPhases: live.totalPhases });
      if (live.revealSeconds > 0) setRevealMs(live.revealSeconds * 1000);
      setTimes((prev) =>
        mergeRoundTimes(
          prev,
          live.rounds.flatMap((r) =>
            r.startedAt
              ? [
                  {
                    order: r.order,
                    startedAtMs: new Date(r.startedAt).getTime(),
                    durationMs: r.durationSeconds * 1000,
                  },
                ]
              : []
          )
        )
      );

      const winner = live.winner_id ?? live.winnerId;
      if (winner) setWinnerId(winner);
    } catch {
      // Degrada em silêncio: o relógio e a pontuação são do servidor, o polling só mostra.
    }
  }, [championshipId, matchId]);

  const pollNowRef = useRef(poll);
  useEffect(() => {
    pollNowRef.current = poll;
  }, [poll]);

  const pollMs = phase === 'guessing' || phase === 'finished' ? POLL_SLOW_MS : POLL_FAST_MS;
  const fullyDecided = phase === 'finished' && winnerId !== null && finalScore !== null;
  useEffect(() => {
    if (loadState !== 'ready' || fullyDecided) return;
    // Ao mudar de fase já busca de novo: a revelação depende dos dados do adversário.
    poll();
    const interval = setInterval(poll, pollMs);
    return () => clearInterval(interval);
  }, [loadState, poll, pollMs, phase, fullyDecided]);

  // ---------- Palpite ----------

  const submit = useCallback(
    async (roundOrder: number, guess: LatLng | null) => {
      const round = rounds[roundOrder - 1];
      if (!round || submittedRef.current.has(roundOrder)) return;
      submittedRef.current.add(roundOrder);

      setSubmittingOrder(roundOrder);
      setSubmitError(null);
      try {
        const res = await submitGuess(round.id, guess);
        setAnswers((prev) => ({
          ...prev,
          [roundOrder]: {
            score: res.score ?? res.points ?? 0,
            distance: res.distanceMeters ?? res.distance ?? null,
            guess,
            location: { lat: res.location.lat, lng: res.location.lng },
          },
        }));

        // Se o meu foi o segundo palpite, a próxima rodada já vem adiantada aqui.
        const nextStart = res.nextRound?.startedAt ?? res.nextRound?.started_at;
        if (nextStart) {
          setTimes((prev) =>
            mergeRoundTimes(prev, [
              {
                order: roundOrder + 1,
                startedAtMs: new Date(nextStart).getTime(),
                durationMs: prev[roundOrder]?.durationMs ?? 0,
              },
            ])
          );
        }
      } catch {
        submittedRef.current.delete(roundOrder);
        setSubmitError('Não foi possível enviar o palpite. Tente de novo.');
      } finally {
        setSubmittingOrder((current) => (current === roundOrder ? null : current));
        pollNowRef.current();
      }
    },
    [rounds]
  );

  // Envio automático quando falta pouco: o palpite leva um tempo pra chegar e o
  // servidor zera o que chega depois do prazo.
  useEffect(() => {
    if (phase !== 'guessing' || !currentTime) return;
    const remainingMs = currentTime.startedAtMs + currentTime.durationMs - now;
    if (remainingMs <= AUTO_SUBMIT_LEAD_MS && !submittedRef.current.has(order)) {
      submit(order, currentGuess);
    }
  }, [now, phase, order, currentTime, currentGuess, submit]);

  // ---------- Tela ----------

  if (loadState === 'loading') {
    return (
      <div className="status-screen">
        <div className="spinner large"></div>
        <h2>Entrando no duelo...</h2>
        <p>Sincronizando relógio e rodadas do servidor.</p>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className="status-screen">
        <FontAwesomeIcon icon={faTriangleExclamation} className="screen-emoji" aria-hidden="true" />
        <h2>Não foi possível iniciar o duelo</h2>
        <p className="error-text">{loadError}</p>
        <div className="status-actions">
          <button type="button" className="game-ghost" onClick={onBackToBracket}>
            Voltar para a chave
          </button>
          <button type="button" className="game-cta" onClick={initMatch}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  // Antes da primeira rodada: o confronto e a contagem, sem montar imagem nem
  // panorama (pedir a imagem antes da hora devolve o placeholder).
  if (phase === 'pre_start') {
    return (
      <div className="status-screen">
        <div className="game-card duel-prestart-card">
          <p className="duel-prestart-eyebrow">Duelo 1v1</p>
          <div className="duel-prestart-versus">
            <span className="duel-prestart-player duel-prestart-me">
              <span className="duel-prestart-avatar">
                <AvatarSvg id={user.avatarId} />
              </span>
              <span className="duel-prestart-nick">Você</span>
            </span>
            <span className="duel-prestart-x" aria-hidden="true">
              <FontAwesomeIcon icon={faXmark} />
            </span>
            <span className="duel-prestart-player">
              <span className="duel-prestart-avatar">
                {opponent && <AvatarSvg id={opponent.avatarId} />}
              </span>
              <span className="duel-prestart-nick">{opponentNick}</span>
            </span>
          </div>
          <p className="duel-prestart-eyebrow">O duelo começa em</p>
          <p className="duel-prestart-digits" role="timer">
            {formatCountdown((times[0]?.startedAtMs ?? now) - now)}
          </p>
        </div>
      </div>
    );
  }

  const localScore = Object.values(answers).reduce((sum, answer) => sum + answer.score, 0);
  const myScore = Math.max(localScore, liveMyScore);

  if (phase === 'finished') {
    return (
      <DuelResult
        myNick={user.nick}
        opponentNick={opponentNick}
        myScore={myScore}
        opponentScore={opponentScore}
        rounds={liveRounds}
        finalScore={finalScore}
        winnerId={winnerId}
        myUserId={user.id}
        phase={phaseInfo?.phase ?? null}
        totalPhases={phaseInfo?.totalPhases ?? null}
        onBackToBracket={onBackToBracket}
        onBackToLobby={onBackToLobby}
      />
    );
  }

  const liveRound = liveByOrder.get(order);
  const myAnswer = answers[order];
  const myPoints = myAnswer?.score ?? liveRound?.myPoints ?? null;
  const myDistance = myAnswer?.distance ?? liveRound?.myDistance ?? null;
  const isPlaying = phase === 'guessing' || phase === 'submitting' || phase === 'waiting';
  const secondsLeft =
    isPlaying && currentTime
      ? Math.max(0, Math.ceil((currentTime.startedAtMs + currentTime.durationMs - now) / 1000))
      : null;
  const revealSecondsLeft =
    phase === 'reveal' && revealEndsAt !== null
      ? Math.max(0, Math.ceil((revealEndsAt - now) / 1000))
      : null;

  // Revelação: os dados vêm do `live`; se ainda não chegaram, o que eu já sei do meu palpite.
  const revealLocation = liveRound?.location ?? myAnswer?.location ?? null;
  const revealMyGuess = liveRound?.myGuess ?? myAnswer?.guess ?? null;
  const revealOpponentGuess = liveRound?.opponentGuess ?? null;

  let mapGuess: LatLng | null = currentGuess;
  if (phase === 'waiting') mapGuess = myAnswer?.guess ?? currentGuess;
  if (phase === 'reveal') mapGuess = revealMyGuess;

  const mapState =
    phase === 'guessing' ? 'guessing' : phase === 'submitting' ? 'submitting' : 'round_result';

  return (
    <div className="app-shell">
      <DuelHeader
        myNick={user.nick}
        opponentNick={opponentNick}
        myScore={myScore}
        opponentScore={opponentScore}
        currentRound={order}
        totalRounds={rounds.length}
        secondsLeft={secondsLeft}
        onExit={onBackToBracket}
      />

      <main className="game-body">
        <div className="game-stage">
          {currentRound?.streetview_mode === 'panorama' ? (
            <PanoramaPanel key={currentRound.id} roundId={currentRound.id} />
          ) : (
            <ImagePanel key={currentRound?.id} roundId={currentRound?.id} />
          )}

          <GuessMap
            center={PAULO_AFONSO_CENTER}
            guess={mapGuess}
            correctCoords={phase === 'reveal' ? revealLocation : null}
            opponentGuess={phase === 'reveal' ? revealOpponentGuess : null}
            opponentLabel={opponentNick}
            gameState={mapState}
            onSelectGuess={(coords) => {
              if (phase === 'guessing') setGuessState({ order, guess: coords });
            }}
            onConfirmGuess={() => {
              if (currentGuess && phase === 'guessing') submit(order, currentGuess);
            }}
          />

          {submitError && (
            <p className="duel-submit-error" role="alert">
              {submitError}
            </p>
          )}

          {phase === 'waiting' && (
            <div className="game-card duel-waiting-card">
              <div className="duel-waiting-spinner-wrap">
                <div className="spinner"></div>
              </div>
              <div className="duel-waiting-text">
                <h3>Palpite enviado</h3>
                <p>
                  {myPoints !== null && <strong>{formatPoints(myPoints)} pts</strong>}
                  {myDistance !== null ? ` (${formatDistance(myDistance)})` : ''}
                </p>
                <p className="duel-waiting-countdown">
                  Fecha em {secondsLeft ?? 0}s ou quando {opponentNick} responder
                </p>
                <div className="duel-opponent-status">
                  <span>{opponentNick}:</span>
                  <span className="duel-opp-status-pill">Ainda está pensando</span>
                  <span>
                    · Placar parcial: <strong>{opponentScore.toLocaleString('pt-BR')} pts</strong>
                  </span>
                </div>
              </div>
            </div>
          )}

          {phase === 'reveal' && (
            <div className="game-card duel-reveal-card" role="status">
              <p className="duel-reveal-eyebrow">Rodada {order} · Local revelado</p>
              <ul className="duel-reveal-rows">
                <li className="duel-reveal-row duel-reveal-me">
                  <span className="duel-reveal-name">Você</span>
                  {myPoints !== null ? (
                    <span className="duel-reveal-points">{formatPoints(myPoints)}</span>
                  ) : (
                    <span className="duel-reveal-none">sem palpite</span>
                  )}
                  <span className="duel-reveal-distance">
                    {myDistance !== null ? formatDistance(myDistance) : ''}
                  </span>
                </li>
                <li className="duel-reveal-row">
                  <span className="duel-reveal-name" title={opponentNick}>
                    {opponentNick}
                  </span>
                  {!liveRound?.closed ? (
                    <span className="duel-reveal-none">...</span>
                  ) : liveRound.opponentPoints !== null ? (
                    <span className="duel-reveal-points">
                      {formatPoints(liveRound.opponentPoints)}
                    </span>
                  ) : (
                    <span className="duel-reveal-none">sem palpite</span>
                  )}
                  <span className="duel-reveal-distance">
                    {liveRound?.opponentDistance != null
                      ? formatDistance(liveRound.opponentDistance)
                      : ''}
                  </span>
                </li>
              </ul>
              <p className="duel-reveal-countdown">
                {isLastRound ? 'Resultado em' : 'Próxima rodada em'} {revealSecondsLeft ?? 0}s
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
