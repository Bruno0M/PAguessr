import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faTriangleExclamation, faXmark } from '@fortawesome/free-solid-svg-icons';
import { shuffle } from '@paguessr/shared';
import type { PublicUser } from '../../../api/auth';
import {
  getChampionship,
  leaveChampionship,
  type ChampionshipDetail,
} from '../../../api/championships';
import { serverNow } from '../../../lib/serverClock';
import { AvatarSvg } from '../../auth/avatars';
import { useReducedMotion } from '../../title/useReducedMotion';
import { getPhaseName } from '../phaseNames';
import {
  deriveLobbyState,
  describeOpening,
  formatCountdown,
  isCountingDown,
  type LobbyMatch,
  type LobbyPlayer,
  type LobbyState,
} from './lobbyState';
import '../../../styles/tokens.css';
import '../../../styles/gameUi.css';
import './ChampionshipLobby.css';

const POLL_MS = 3000;
const FAST_POLL_MS = 1000;
/** Nos últimos segundos antes da largada o polling acelera. */
const FAST_POLL_WINDOW_MS = 15_000;
const FINAL_SECONDS = 10;
const DRAW_MS = 1200;
const SHUFFLE_STEP_MS = 80;

export interface ChampionshipLobbyProps {
  championshipId: string;
  user: PublicUser;
  onBackToList: () => void;
  onViewBracket: () => void;
  onEnterDuel: (matchId: string) => void;
  /**
   * Sem lugar na sala (não inscrito, eliminado, campeonato encerrado): vai pra
   * página do campeonato, sem empilhar a sala no histórico do navegador.
   */
  onLeave: () => void;
}

interface QueueSnapshot {
  key: string;
  players: LobbyPlayer[];
  capacity: number;
}

function nickOf(player: LobbyPlayer | null): string {
  return player?.nick ?? 'A definir';
}

function Slot({ player, isMe }: { player: LobbyPlayer | null; isMe: boolean }) {
  if (!player) {
    return (
      <li className="game-card lobby-slot is-empty">
        <span className="lobby-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="lobby-slot-nick">Aguardando</span>
      </li>
    );
  }
  return (
    <li className={`game-card lobby-slot${isMe ? ' is-me' : ''}`}>
      <span className="lobby-slot-avatar">
        <AvatarSvg id={player.avatarId} />
      </span>
      <span className="lobby-slot-nick" title={player.nick}>
        {isMe ? 'Você' : player.nick}
      </span>
    </li>
  );
}

function PlayerCard({
  player,
  isMe = false,
  side,
}: {
  player: LobbyPlayer | null;
  isMe?: boolean;
  side: 'left' | 'right';
}) {
  return (
    <div
      className={`game-card lobby-player-card is-${side}${isMe ? ' is-me' : ''}${
        player ? '' : ' is-ghost'
      }`}
    >
      <span className="lobby-player-avatar">
        {player ? (
          <AvatarSvg id={player.avatarId} />
        ) : (
          <span className="lobby-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        )}
      </span>
      <span className="lobby-player-name" title={player?.nick}>
        {!player ? 'A definir' : isMe ? 'Você' : player.nick}
      </span>
      <span className="lobby-player-seed">
        {player && player.seed !== null ? `Seed #${player.seed + 1}` : ''}
      </span>
    </div>
  );
}

function MatchLine({ match }: { match: LobbyMatch }) {
  return (
    <>
      {nickOf(match.a)}{' '}
      <FontAwesomeIcon icon={faXmark} className="lobby-line-x" aria-hidden="true" />{' '}
      {nickOf(match.b)}
    </>
  );
}

export function ChampionshipLobby({
  championshipId,
  user,
  onBackToList,
  onViewBracket,
  onEnterDuel,
  onLeave,
}: ChampionshipLobbyProps) {
  const reducedMotion = useReducedMotion();
  const [detail, setDetail] = useState<ChampionshipDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [, setTick] = useState(0);
  const [announcement, setAnnouncement] = useState('');

  const [lastQueue, setLastQueue] = useState<QueueSnapshot | null>(null);
  const [previousKind, setPreviousKind] = useState<LobbyState['kind'] | null>(null);
  const [drawSource, setDrawSource] = useState<QueueSnapshot | null>(null);
  const [drawnOrder, setDrawnOrder] = useState<LobbyPlayer[]>([]);

  const nowMs = serverNow();
  const state = detail ? deriveLobbyState(detail, user.id, nowMs) : null;
  const kind = state?.kind ?? null;
  const remainingMs = state?.kind === 'countdown' ? state.opensAtMs - nowMs : null;
  const remainingSec = remainingMs === null ? null : Math.ceil(remainingMs / 1000);
  const isDrawing = drawSource !== null;

  // Guarda a última fila vista e, na virada da fila pro sorteio, dispara a
  // animação. Feito durante a renderização (padrão do React pra derivar estado
  // de mudança de estado) pra não empilhar renders dentro de efeitos.
  if (state?.kind === 'queue') {
    const key = state.players.map((p) => p.id).join(',');
    if (lastQueue?.key !== key) {
      setLastQueue({ key, players: state.players, capacity: state.capacity });
    }
  }
  if (kind !== previousKind) {
    setPreviousKind(kind);
    const drawn = kind === 'drawn' || kind === 'countdown' || kind === 'live';
    if (previousKind === 'queue' && drawn && !reducedMotion && lastQueue) {
      setDrawSource(lastQueue);
      setDrawnOrder(lastQueue.players);
    }
  }

  const pollFast = useRef(false);
  useEffect(() => {
    pollFast.current = remainingMs !== null && remainingMs <= FAST_POLL_WINDOW_MS;
  });

  // Polling do detalhe: 3 s, e 1 s quando falta pouco pra largada.
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const load = async () => {
      try {
        const data = await getChampionship(championshipId);
        if (cancelled) return;
        setDetail(data);
        setLoadError(null);
      } catch (err: unknown) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Não foi possível carregar a sala.');
      }
      if (!cancelled) {
        timer = window.setTimeout(load, pollFast.current ? FAST_POLL_MS : POLL_MS);
      }
    };

    load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [championshipId, reloadKey]);

  // Relógio da contagem: só corre enquanto existe uma contagem na tela.
  useEffect(() => {
    if (kind !== 'countdown') return;
    const bump = () => setTick((t) => t + 1);
    const interval = window.setInterval(bump, 250);
    const onVisible = () => {
      if (!document.hidden) bump();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [kind]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.repeat) return;
      event.preventDefault();
      onBackToList();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onBackToList]);

  const leftRef = useRef(false);
  useEffect(() => {
    if (kind === 'leave' && !leftRef.current) {
      leftRef.current = true;
      onLeave();
    }
  }, [kind, onLeave]);

  // Entra sozinho no duelo só na virada da contagem (a sala estava mostrando a
  // contagem e ela zerou). Abrir a sala com o duelo já aberto mostra o botão.
  const lastSeen = useRef<{ kind: LobbyState['kind'] | null; matchId: string | null }>({
    kind: null,
    matchId: null,
  });
  const enteredMatch = useRef<string | null>(null);
  const matchId = state && 'match' in state ? state.match.id : null;
  useEffect(() => {
    const previous = lastSeen.current;
    lastSeen.current = { kind, matchId };
    if (
      kind === 'live' &&
      previous.kind === 'countdown' &&
      previous.matchId === matchId &&
      matchId !== null &&
      enteredMatch.current !== matchId
    ) {
      enteredMatch.current = matchId;
      setAnnouncement('Valendo!');
      onEnterDuel(matchId);
    }
  }, [kind, matchId, onEnterDuel]);

  useEffect(() => {
    if (remainingSec === FINAL_SECONDS) {
      setAnnouncement(`A partida começa em ${FINAL_SECONDS} segundos`);
    }
  }, [remainingSec]);

  // Quem está em outra aba vê a contagem no título.
  const titleText =
    state?.kind === 'countdown' && isCountingDown(state.opensAtMs, nowMs)
      ? formatCountdown(state.opensAtMs - nowMs)
      : null;
  const originalTitle = useRef(document.title);
  useEffect(() => {
    document.title = titleText ? `${titleText} · PAguessr` : originalTitle.current;
  }, [titleText]);
  useEffect(() => {
    const original = originalTitle.current;
    return () => {
      document.title = original;
    };
  }, []);

  // Sorteio: os avatares trocam de lugar rápido e depois os cartões entram.
  useEffect(() => {
    if (!drawSource) return;
    const shuffleTimer = window.setInterval(
      () => setDrawnOrder(shuffle(drawSource.players)),
      SHUFFLE_STEP_MS
    );
    const doneTimer = window.setTimeout(() => setDrawSource(null), DRAW_MS);
    return () => {
      window.clearInterval(shuffleTimer);
      window.clearTimeout(doneTimer);
    };
  }, [drawSource]);

  const handleLeaveChampionship = async () => {
    setLeaving(true);
    setActionError(null);
    try {
      await leaveChampionship(championshipId);
      onLeave();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Falha ao cancelar a inscrição.');
      setLeaving(false);
    }
  };

  const renderGrid = (players: LobbyPlayer[], capacity: number, drawing: boolean) => {
    const slots = Array.from({ length: capacity }, (_, index) => players[index] ?? null);
    return (
      <ul className={`lobby-grid${drawing ? ' is-drawing' : ''}`} data-size={capacity}>
        {slots.map((player, index) => (
          <Slot
            key={player?.id ?? `empty-${index}`}
            player={player}
            isMe={player?.id === user.id}
          />
        ))}
      </ul>
    );
  };

  const renderVersus = (me: LobbyPlayer, opponent: LobbyPlayer | null, label: string) => (
    <>
      <p className="lobby-eyebrow">{label}</p>
      <div className="lobby-versus">
        <PlayerCard player={me} isMe side="left" />
        <span className="lobby-x" aria-hidden="true">
          <FontAwesomeIcon icon={faXmark} />
        </span>
        <PlayerCard player={opponent} side="right" />
      </div>
    </>
  );

  const renderOthers = (others: LobbyMatch[]) =>
    others.length > 0 && (
      <div className="lobby-others">
        <p className="lobby-eyebrow">Outros confrontos</p>
        <ul>
          {others.map((m) => (
            <li key={m.id}>
              <MatchLine match={m} />
            </li>
          ))}
        </ul>
      </div>
    );

  const renderStage = () => {
    if (!state) return null;

    if (isDrawing && drawSource) {
      return (
        <>
          <p className="lobby-eyebrow">Sorteando a chave</p>
          {renderGrid(drawnOrder, drawSource.capacity, true)}
        </>
      );
    }

    switch (state.kind) {
      case 'leave':
        return null;

      case 'queue':
        return (
          <>
            <p className="lobby-eyebrow">Sala de espera</p>
            <p className="lobby-count">
              {state.players.length} / {state.capacity} jogadores
            </p>
            <p className="lobby-note">A chave é sorteada quando a sala lotar.</p>
            {renderGrid(state.players, state.capacity, false)}
            <div className="lobby-actions">
              <button type="button" className="game-ghost" onClick={onViewBracket}>
                Ver chave
              </button>
              <button
                type="button"
                className="game-ghost"
                disabled={leaving}
                onClick={handleLeaveChampionship}
              >
                {leaving ? 'Saindo...' : 'Sair do campeonato'}
              </button>
            </div>
          </>
        );

      case 'drawn':
        return (
          <>
            {renderVersus(state.me, state.opponent, getPhaseName(state.phase, state.totalPhases))}
            <div className="lobby-clock">
              <p className="lobby-eyebrow">Aguardando a largada</p>
              <p className="lobby-note">Quando o admin iniciar, a contagem de 60 s começa aqui.</p>
            </div>
            {renderOthers(state.others)}
          </>
        );

      case 'countdown': {
        const counting = isCountingDown(state.opensAtMs, nowMs);
        const isFinal = remainingSec !== null && remainingSec <= FINAL_SECONDS;
        return (
          <>
            {renderVersus(state.me, state.opponent, getPhaseName(state.phase, state.totalPhases))}
            <div className="lobby-clock">
              <p className="lobby-eyebrow">{counting ? 'A partida começa em' : 'Próximo duelo'}</p>
              <p
                className={`lobby-digits${isFinal ? ' is-final' : ''}${counting ? '' : ' is-date'}`}
              >
                {describeOpening(state.opensAtMs, nowMs)}
              </p>
              <p className="lobby-note">Deixe esta tela aberta: o duelo abre sozinho.</p>
            </div>
            {renderOthers(state.others)}
          </>
        );
      }

      case 'live':
        return (
          <>
            {renderVersus(state.me, state.opponent, getPhaseName(state.phase, state.totalPhases))}
            <div className="lobby-clock">
              <p className="lobby-eyebrow">Duelo em andamento</p>
              <button
                type="button"
                className="game-cta lobby-enter"
                onClick={() => onEnterDuel(state.match.id)}
              >
                Entrar no duelo
              </button>
            </div>
            {renderOthers(state.others)}
          </>
        );

      case 'waiting_phase':
        return (
          <>
            {renderVersus(state.me, state.opponent, 'Próxima fase')}
            <div className="lobby-clock">
              <p className="lobby-note">Aguardando os outros duelos da fase terminarem.</p>
            </div>
            {state.running.length > 0 && (
              <div className="lobby-others">
                <p className="lobby-eyebrow">Confrontos da fase</p>
                <ul>
                  {state.running.map((m) => (
                    <li key={m.id}>
                      <MatchLine match={m} />
                      <span className="lobby-line-status">
                        {m.resolved ? `${m.scoreA ?? 0} × ${m.scoreB ?? 0}` : 'em andamento'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        );

      case 'waiting_opponent':
        return (
          <>
            {renderVersus(state.me, null, getPhaseName(state.phase, state.totalPhases))}
            <div className="lobby-clock">
              <p className="lobby-note">Aguardando o adversário sair do outro confronto.</p>
              {state.feeder && (
                <p className="lobby-feeder">
                  Vencedor de <MatchLine match={state.feeder} />
                  <span className="lobby-line-status">
                    {state.feeder.resolved ? 'já terminou' : 'em andamento'}
                  </span>
                </p>
              )}
            </div>
          </>
        );
    }
  };

  return (
    <div className="lobby-screen">
      <div className="lobby-map" aria-hidden="true" />
      <div className="lobby-veil" aria-hidden="true" />

      <header className="lobby-top">
        <button type="button" className="game-ghost lobby-back" onClick={onBackToList}>
          <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" />
          Campeonatos
        </button>
        <h1 className="lobby-title">{detail?.title ?? 'Campeonato'}</h1>
        <p className="lobby-player">
          <span className="lobby-avatar">
            <AvatarSvg id={user.avatarId} />
          </span>
          {user.nick}
        </p>
      </header>

      <main className="lobby-stage">
        {!detail && !loadError && (
          <div className="lobby-status" role="status">
            <div className="spinner large" />
            <p className="lobby-eyebrow">Entrando na sala</p>
          </div>
        )}

        {!detail && loadError && (
          <div className="lobby-status" role="alert">
            <FontAwesomeIcon icon={faTriangleExclamation} className="lobby-error-icon" />
            <p className="lobby-note">{loadError}</p>
            <div className="lobby-actions">
              <button type="button" className="game-ghost" onClick={onBackToList}>
                Voltar
              </button>
              <button
                type="button"
                className="game-cta lobby-retry"
                onClick={() => setReloadKey((key) => key + 1)}
              >
                Tentar novamente
              </button>
            </div>
          </div>
        )}

        {renderStage()}

        {actionError && (
          <p className="lobby-action-error" role="alert">
            {actionError}
          </p>
        )}
      </main>

      <p className="lobby-sr-only" aria-live="polite">
        {announcement}
      </p>

      <p className="game-hint" aria-hidden="true">
        <span>
          <kbd>Esc</kbd>
          Voltar
        </span>
      </p>
    </div>
  );
}
