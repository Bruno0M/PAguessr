import { useCallback, useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faTrophy,
  faUsers,
  faClock,
  faTriangleExclamation,
  faRotateRight,
  faCheck,
  faHourglassHalf,
  faCrown,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import type { PublicUser } from '../../api/auth';
import {
  getChampionship,
  getChampionshipRanking,
  joinChampionship,
  leaveChampionship,
  type ChampionshipDetail,
  type ChampionshipMatch,
  type ChampionshipParticipant,
  type ChampionshipRankingEntry,
  type ChampionshipStatus,
} from '../../api/championships';
import { AvatarSvg } from '../auth/avatars';
import defaultBanner from '../../assets/mapa-paulo-afonso.webp';
import '../../styles/tokens.css';
import '../../styles/gameUi.css';
import './ChampionshipDetailPage.css';

type Tab = 'chave' | 'ranking' | 'participantes';

const STATUS_LABELS: Record<ChampionshipStatus, string> = {
  inscricoes: 'Inscrições abertas',
  chaveado: 'Chave definida',
  em_andamento: 'Em andamento',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
};

function getPhaseName(phase: number, totalPhases: number): string {
  if (phase > totalPhases) return 'Campeão';
  if (phase === totalPhases) return 'Final';
  if (phase === totalPhases - 1) return 'Semifinal';
  if (phase === totalPhases - 2) return 'Quartas de final';
  if (phase === totalPhases - 3) return 'Oitavas de final';
  return `Fase ${phase}`;
}

function formatDateTime(isoString?: string | null): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ChampionshipDetailPage({
  championshipId,
  user,
  onBack,
  onEnterMatch,
}: {
  championshipId: string;
  user: PublicUser;
  onBack: () => void;
  onEnterMatch?: (matchId: string, opponentNick?: string) => void;
}) {
  const [detail, setDetail] = useState<ChampionshipDetail | null>(null);
  const [ranking, setRanking] = useState<ChampionshipRankingEntry[] | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('chave');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadData = useCallback(() => {
    setLoading(true);
    setErrorMessage(null);
    getChampionship(championshipId)
      .then((data) => {
        setDetail(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        const msg =
          err instanceof Error ? err.message : 'Não foi possível carregar os dados do campeonato.';
        setErrorMessage(msg);
        setLoading(false);
      });
  }, [championshipId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (activeTab === 'ranking' && !ranking) {
      getChampionshipRanking(championshipId)
        .then((data) => setRanking(data))
        .catch(() => {});
    }
  }, [activeTab, championshipId, ranking]);

  const participantsMap = useMemo(() => {
    const map = new Map<string, ChampionshipParticipant>();
    if (detail?.participants) {
      for (const p of detail.participants) {
        const id = p.userId || p.user_id;
        if (id) map.set(id, p);
      }
    }
    return map;
  }, [detail?.participants]);

  const totalPhases = useMemo(() => {
    if (!detail?.max_participants) return 1;
    return Math.max(1, Math.round(Math.log2(detail.max_participants)));
  }, [detail?.max_participants]);

  const isJoined = useMemo(() => {
    if (!detail) return false;
    if (typeof detail.joined === 'boolean') return detail.joined;
    return detail.participants?.some((p) => (p.userId || p.user_id) === user.id);
  }, [detail, user.id]);

  const myParticipant = useMemo(() => {
    return detail?.participants?.find((p) => (p.userId || p.user_id) === user.id) || null;
  }, [detail?.participants, user.id]);

  const myMatches = useMemo(() => {
    if (!detail?.matches) return [];
    return detail.matches.filter((m) => {
      const a = m.playerAId || m.player_a_id;
      const b = m.playerBId || m.player_b_id;
      return a === user.id || b === user.id;
    });
  }, [detail?.matches, user.id]);

  const currentMatch = useMemo(() => {
    if (!myMatches.length) return null;
    const unresolved = myMatches.find((m) => !(m.resolvedAt || m.resolved_at));
    if (unresolved) return unresolved;
    return myMatches[myMatches.length - 1];
  }, [myMatches]);

  const handleJoin = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      await joinChampionship(championshipId);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao se inscrever.';
      setActionError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleLeave = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      await leaveChampionship(championshipId);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao cancelar inscrição.';
      setActionError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const renderPlayerRow = (match: ChampionshipMatch | undefined, playerKey: 'a' | 'b') => {
    const isPlayerA = playerKey === 'a';
    const playerId = isPlayerA
      ? match?.playerAId || match?.player_a_id
      : match?.playerBId || match?.player_b_id;
    const playerObj = isPlayerA ? match?.playerA : match?.playerB;
    const pData = playerId ? participantsMap.get(playerId) : null;
    const nick = playerObj?.nick || pData?.nick || (playerId ? 'Jogador' : 'A definir');
    const avatarId = playerObj?.avatarId ?? pData?.avatarId ?? pData?.avatar_id ?? 0;
    const scoreVal = isPlayerA
      ? (match?.scoreA ?? match?.score_a)
      : (match?.scoreB ?? match?.score_b);
    const winnerId = match?.winnerId || match?.winner_id;
    const isWinner = Boolean(playerId && winnerId && winnerId === playerId);
    const isMe = Boolean(playerId && playerId === user.id);

    return (
      <div
        className={`bracket-player${isWinner ? ' is-winner' : ''}${isMe ? ' is-me' : ''}${
          !playerId ? ' is-empty' : ''
        }`}
      >
        <span className="bracket-player-avatar">
          {playerId ? <AvatarSvg id={avatarId} /> : <span className="bracket-player-dash">—</span>}
        </span>
        <span className="bracket-player-nick" title={nick}>
          {nick}
          {isWinner && (
            <FontAwesomeIcon icon={faCrown} className="bracket-crown-icon" aria-label="Vencedor" />
          )}
        </span>
        <span className="bracket-player-score">
          {typeof scoreVal === 'number' ? scoreVal.toLocaleString('pt-BR') : '—'}
        </span>
      </div>
    );
  };

  const renderMyStatusCard = () => {
    if (!detail) return null;

    if (!isJoined) {
      const isFull = (detail.participants?.length ?? 0) >= detail.max_participants;
      if (detail.status === 'inscricoes') {
        return (
          <div className="game-card championship-status-card">
            <div className="status-card-content">
              <h3>Inscrições Abertas</h3>
              <p>
                {isFull
                  ? 'Todas as vagas foram preenchidas. O chaveamento será sorteado em breve.'
                  : 'Garanta sua vaga neste torneio mata-mata de eliminatória simples!'}
              </p>
            </div>
            {!isFull && (
              <button
                type="button"
                className="game-cta status-card-cta"
                disabled={actionLoading}
                onClick={handleJoin}
              >
                {actionLoading ? 'Entrando...' : 'Entrar no Campeonato'}
              </button>
            )}
          </div>
        );
      }
      return null;
    }

    if (detail.status === 'inscricoes') {
      return (
        <div className="game-card championship-status-card is-joined">
          <div className="status-card-content">
            <span className="status-badge-inline">
              <FontAwesomeIcon icon={faCheck} aria-hidden="true" /> Inscrito
            </span>
            <h3>Você está na disputa!</h3>
            <p>
              Aguardando os outros jogadores preencherem as vagas para o sorteio automático da
              chave.
            </p>
          </div>
          <button
            type="button"
            className="championship-btn championship-btn-leave status-card-leave"
            disabled={actionLoading}
            onClick={handleLeave}
          >
            {actionLoading ? 'Saindo...' : 'Sair do Campeonato'}
          </button>
        </div>
      );
    }

    if (detail.status === 'chaveado') {
      const match = currentMatch;
      const opponentId =
        (match?.playerAId || match?.player_a_id) === user.id
          ? match?.playerBId || match?.player_b_id
          : match?.playerAId || match?.player_a_id;
      const opponentData = opponentId ? participantsMap.get(opponentId) : null;
      const opponentNick = opponentData?.nick || 'Adversário a definir';

      return (
        <div className="game-card championship-status-card is-waiting">
          <div className="status-card-content">
            <span className="status-badge-inline">
              <FontAwesomeIcon icon={faHourglassHalf} aria-hidden="true" /> Chave Montada
            </span>
            <h3>Aguardando o admin iniciar</h3>
            <p>
              Seu duelo na 1ª fase será contra <strong>{opponentNick}</strong>. Fique atento à tela
              para o início da partida.
            </p>
          </div>
        </div>
      );
    }

    if (detail.status === 'em_andamento') {
      const match = currentMatch;
      const isEliminated = Boolean(
        myParticipant?.eliminatedInPhase ||
        (match &&
          (match.resolvedAt || match.resolved_at) &&
          (match.winnerId || match.winner_id) &&
          (match.winnerId || match.winner_id) !== user.id)
      );

      if (isEliminated) {
        const phaseNum = myParticipant?.eliminatedInPhase || match?.phase || 1;
        return (
          <div className="game-card championship-status-card is-eliminated">
            <div className="status-card-content">
              <h3>Eliminado na {getPhaseName(phaseNum, totalPhases)}</h3>
              <p>Você não segue na chave, mas pode acompanhar os confrontos restantes ao vivo.</p>
            </div>
          </div>
        );
      }

      if (match && !(match.resolvedAt || match.resolved_at)) {
        const opensAt = match.opensAt || match.opens_at;
        const opensAtTime = opensAt ? new Date(opensAt).getTime() : 0;
        const isOpen = !opensAt || opensAtTime <= Date.now();

        if (isOpen) {
          const opponentId =
            (match.playerAId || match.player_a_id) === user.id
              ? match.playerBId || match.player_b_id
              : match.playerAId || match.player_a_id;
          const opponentData = opponentId ? participantsMap.get(opponentId) : null;
          const oppNick =
            opponentData?.nick ||
            ((match.playerAId || match.player_a_id) === user.id
              ? match.playerB?.nick
              : match.playerA?.nick) ||
            'Adversário';

          return (
            <div className="game-card championship-status-card is-active">
              <div className="status-card-content">
                <span className="status-badge-inline live-pulse">Sua vez de jogar</span>
                <h3>Duelo da {getPhaseName(match.phase, totalPhases)} aberto</h3>
                <p>
                  O relógio está correndo no servidor! Entre na partida para enviar seus palpites.
                </p>
              </div>
              <button
                type="button"
                className="game-cta status-card-cta"
                onClick={() => onEnterMatch?.(match.id, oppNick)}
              >
                Jogar Duelo
              </button>
            </div>
          );
        }

        return (
          <div className="game-card championship-status-card is-waiting">
            <div className="status-card-content">
              <span className="status-badge-inline">
                <FontAwesomeIcon icon={faClock} aria-hidden="true" /> Aguardando fase
              </span>
              <h3>Próxima fase abre às {formatDateTime(opensAt)}</h3>
              <p>Prepare-se para o seu confronto na {getPhaseName(match.phase, totalPhases)}.</p>
            </div>
          </div>
        );
      }
    }

    if (detail.status === 'finalizado') {
      const lastMatch = myMatches[myMatches.length - 1];
      const isWinner =
        lastMatch &&
        lastMatch.phase === totalPhases &&
        (lastMatch.winnerId || lastMatch.winner_id) === user.id;

      if (isWinner) {
        return (
          <div className="game-card championship-status-card is-champion">
            <div className="status-card-content">
              <FontAwesomeIcon icon={faTrophy} className="status-trophy-large" aria-hidden="true" />
              <h3>Parabéns, você é o Campeão!</h3>
              <p>Você venceu todos os confrontos e conquistou o título deste torneio!</p>
            </div>
          </div>
        );
      }
    }

    return null;
  };

  const renderBracket = () => {
    if (!detail) return null;

    const phasesArray = Array.from({ length: totalPhases }, (_, i) => i + 1);

    return (
      <div className="bracket-container" role="region" aria-label="Chave de confrontos">
        <div className="bracket-columns">
          {phasesArray.map((phase) => {
            const slotsCount = Math.pow(2, totalPhases - phase);
            const slotsArray = Array.from({ length: slotsCount }, (_, s) => s);
            const phaseName = getPhaseName(phase, totalPhases);

            return (
              <div key={phase} className="bracket-column">
                <h3 className="bracket-column-title">{phaseName}</h3>
                <div className="bracket-matches">
                  {slotsArray.map((slot) => {
                    const match = detail.matches?.find((m) => m.phase === phase && m.slot === slot);
                    const isMyMatch = Boolean(
                      match &&
                      ((match.playerAId || match.player_a_id) === user.id ||
                        (match.playerBId || match.player_b_id) === user.id)
                    );

                    return (
                      <div
                        key={slot}
                        className={`bracket-match-card${isMyMatch ? ' is-my-match' : ''}`}
                      >
                        {isMyMatch && <span className="bracket-match-badge">Seu Duelo</span>}
                        <div className="bracket-match-body">
                          {renderPlayerRow(match, 'a')}
                          <div className="bracket-divider" />
                          {renderPlayerRow(match, 'b')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderRankingTab = () => {
    const list =
      ranking ||
      (detail?.participants || [])
        .map((p, idx) => ({
          userId: p.userId || p.user_id || '',
          nick: p.nick,
          avatarId: p.avatarId ?? p.avatar_id ?? 0,
          phaseReached: p.eliminatedInPhase ? p.eliminatedInPhase : totalPhases,
          totalScore: 0,
          seed: p.seed,
          position: idx + 1,
        }))
        .sort((a, b) => {
          if (b.phaseReached !== a.phaseReached) return b.phaseReached - a.phaseReached;
          if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
          return (a.seed ?? 999) - (b.seed ?? 999);
        });

    return (
      <div className="game-card championship-tab-card">
        <h3 className="championship-tab-title">Classificação do Campeonato</h3>
        <p className="championship-tab-desc">
          Ordenado por fase alcançada, pontuação acumulada nos duelos e seed de sorteio.
        </p>

        {list.length === 0 ? (
          <p className="championship-empty-inline">Nenhum dado de ranking registrado ainda.</p>
        ) : (
          <div className="championship-table-wrapper">
            <table className="championship-table">
              <thead>
                <tr>
                  <th>Pos</th>
                  <th>Jogador</th>
                  <th>Fase</th>
                  <th>Pontos</th>
                  <th>Seed</th>
                </tr>
              </thead>
              <tbody>
                {list.map((entry, index) => {
                  const isMe = entry.userId === user.id;
                  const pos = entry.position || index + 1;
                  return (
                    <tr key={entry.userId || index} className={isMe ? 'is-me-row' : ''}>
                      <td className="table-pos">
                        {pos === 1 ? (
                          <FontAwesomeIcon icon={faTrophy} className="table-trophy" />
                        ) : (
                          `${pos}º`
                        )}
                      </td>
                      <td className="table-user">
                        <span className="table-avatar">
                          <AvatarSvg id={entry.avatarId} />
                        </span>
                        <span className="table-nick">{entry.nick}</span>
                      </td>
                      <td>{getPhaseName(entry.phaseReached, totalPhases)}</td>
                      <td>
                        <strong>{entry.totalScore.toLocaleString('pt-BR')}</strong>
                      </td>
                      <td>{entry.seed !== null ? `#${entry.seed + 1}` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const renderParticipantsTab = () => {
    const list = detail?.participants || [];

    return (
      <div className="game-card championship-tab-card">
        <h3 className="championship-tab-title">
          Participantes ({list.length}/{detail?.max_participants})
        </h3>
        <p className="championship-tab-desc">Lista completa dos jogadores inscritos na disputa.</p>

        {list.length === 0 ? (
          <p className="championship-empty-inline">Ainda não há participantes inscritos.</p>
        ) : (
          <div className="participants-grid">
            {list.map((p) => {
              const pid = p.userId || p.user_id;
              const isMe = pid === user.id;
              const avatarId = p.avatarId ?? p.avatar_id ?? 0;

              return (
                <div key={pid || p.nick} className={`participant-card${isMe ? ' is-me' : ''}`}>
                  <span className="participant-avatar">
                    <AvatarSvg id={avatarId} />
                  </span>
                  <div className="participant-info">
                    <span className="participant-nick">{p.nick}</span>
                    <span className="participant-seed">
                      {p.seed !== null ? `Seed #${p.seed + 1}` : 'Aguardando sorteio'}
                    </span>
                  </div>
                  {p.eliminatedInPhase && (
                    <span className="participant-status-tag">
                      Eliminado na {getPhaseName(p.eliminatedInPhase, totalPhases)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="championship-detail-screen">
      <header className="championship-detail-header">
        <button type="button" className="championships-back" onClick={onBack}>
          <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" />
          <span>Campeonatos</span>
        </button>

        <p className="championships-player">
          <span className="championships-avatar">
            <AvatarSvg id={user.avatarId} />
          </span>
          {user.nick}
        </p>
      </header>

      <main className="championship-detail-content">
        {actionError && (
          <div className="championships-toast error">
            <span>{actionError}</span>
            <button
              type="button"
              className="championships-toast-close"
              onClick={() => setActionError(null)}
              aria-label="Fechar mensagem"
            >
              <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
            </button>
          </div>
        )}

        {loading && (
          <div className="status-screen">
            <div className="spinner large" />
            <h2>Carregando campeonato...</h2>
          </div>
        )}

        {errorMessage && (
          <div className="game-card championships-empty-card">
            <FontAwesomeIcon
              icon={faTriangleExclamation}
              className="championships-empty-icon"
              aria-hidden="true"
            />
            <h2>Campeonato não encontrado</h2>
            <p className="championships-empty-desc">{errorMessage}</p>
            <div className="championships-empty-actions">
              <button type="button" className="game-ghost" onClick={onBack}>
                Voltar à lista
              </button>
              <button type="button" className="game-cta" onClick={loadData}>
                <FontAwesomeIcon
                  icon={faRotateRight}
                  aria-hidden="true"
                  style={{ marginRight: 8 }}
                />
                Tentar novamente
              </button>
            </div>
          </div>
        )}

        {!loading && !errorMessage && detail && (
          <>
            <section className="game-card championship-hero-card">
              <div className="hero-banner">
                <img
                  src={detail.banner_url || detail.banner || defaultBanner}
                  alt=""
                  className="hero-banner-img"
                />
                <div className="hero-banner-veil" />
                <span className={`championship-badge championship-badge-${detail.status}`}>
                  {STATUS_LABELS[detail.status]}
                </span>
              </div>

              <div className="hero-body">
                <h1 className="hero-title">{detail.title}</h1>
                {detail.description && <p className="hero-desc">{detail.description}</p>}

                <div className="hero-meta">
                  <span>
                    <FontAwesomeIcon icon={faUsers} aria-hidden="true" />
                    <strong>
                      {detail.participants?.length ?? 0}/{detail.max_participants}
                    </strong>{' '}
                    vagas
                  </span>
                  <span>
                    <FontAwesomeIcon icon={faClock} aria-hidden="true" />
                    {detail.rounds_per_match} rodadas de {detail.round_duration_seconds}s
                  </span>
                  <span>
                    <FontAwesomeIcon icon={faTrophy} aria-hidden="true" />
                    Mata-mata 1v1 ({totalPhases} fases)
                  </span>
                </div>
              </div>
            </section>

            {renderMyStatusCard()}

            <nav className="championship-tabs" aria-label="Abas do campeonato">
              <button
                type="button"
                className={`championship-tab-btn${activeTab === 'chave' ? ' is-active' : ''}`}
                onClick={() => setActiveTab('chave')}
              >
                Chave
              </button>
              <button
                type="button"
                className={`championship-tab-btn${activeTab === 'ranking' ? ' is-active' : ''}`}
                onClick={() => setActiveTab('ranking')}
              >
                Ranking
              </button>
              <button
                type="button"
                className={`championship-tab-btn${activeTab === 'participantes' ? ' is-active' : ''}`}
                onClick={() => setActiveTab('participantes')}
              >
                Participantes
              </button>
            </nav>

            <section className="championship-tab-pane">
              {activeTab === 'chave' && renderBracket()}
              {activeTab === 'ranking' && renderRankingTab()}
              {activeTab === 'participantes' && renderParticipantsTab()}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
