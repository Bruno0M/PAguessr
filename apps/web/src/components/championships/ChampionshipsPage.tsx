import { useCallback, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faRotateRight,
  faTrophy,
  faUsers,
  faClock,
  faTriangleExclamation,
  faCircleCheck,
} from '@fortawesome/free-solid-svg-icons';
import type { PublicUser } from '../../api/auth';
import {
  getChampionships,
  joinChampionship,
  leaveChampionship,
  type ChampionshipListItem,
  type ChampionshipStatus,
} from '../../api/championships';
import { AvatarSvg } from '../auth/avatars';
import defaultBanner from '../../assets/mapa-paulo-afonso.webp';
import '../../styles/tokens.css';
import '../../styles/gameUi.css';
import './ChampionshipsPage.css';

type PageStatus = 'loading' | 'ready' | 'error';

const STATUS_LABELS: Record<ChampionshipStatus, string> = {
  inscricoes: 'Inscrições abertas',
  chaveado: 'Chave definida',
  em_andamento: 'Em andamento',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
};

export function ChampionshipsPage({
  user,
  onBack,
  onSelectChampionship,
}: {
  user: PublicUser;
  onBack: () => void;
  onSelectChampionship?: (id: string) => void;
}) {
  const [items, setItems] = useState<ChampionshipListItem[]>([]);
  const [pageStatus, setPageStatus] = useState<PageStatus>('loading');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  const loadData = useCallback(() => {
    setPageStatus('loading');
    setErrorMessage(null);
    getChampionships()
      .then((data) => {
        setItems(data);
        setPageStatus('ready');
      })
      .catch((err: unknown) => {
        const msg =
          err instanceof Error
            ? err.message
            : 'Não foi possível carregar a lista de campeonatos.';
        setErrorMessage(msg);
        setPageStatus('error');
      });
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleJoin = async (id: string) => {
    setActionLoadingId(id);
    setFeedbackToast(null);
    try {
      await joinChampionship(id);
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          const nextParticipants = item.participants + 1;
          const isFull = nextParticipants >= item.max_participants;
          return {
            ...item,
            joined: true,
            participants: nextParticipants,
            status: isFull ? 'chaveado' : item.status,
          };
        })
      );
      setFeedbackToast('Inscrição confirmada com sucesso!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao se inscrever no campeonato.';
      setFeedbackToast(msg);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleLeave = async (id: string) => {
    setActionLoadingId(id);
    setFeedbackToast(null);
    try {
      await leaveChampionship(id);
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          return {
            ...item,
            joined: false,
            participants: Math.max(0, item.participants - 1),
          };
        })
      );
      setFeedbackToast('Inscrição cancelada.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao sair do campeonato.';
      setFeedbackToast(msg);
    } finally {
      setActionLoadingId(null);
    }
  };

  const renderCardAction = (item: ChampionshipListItem) => {
    const isLoading = actionLoadingId === item.id;

    if (item.status === 'inscricoes') {
      if (item.joined) {
        return (
          <button
            type="button"
            className="championship-btn championship-btn-leave"
            disabled={isLoading}
            onClick={() => handleLeave(item.id)}
          >
            {isLoading ? 'Saindo...' : 'Sair'}
          </button>
        );
      }

      const isFull = item.participants >= item.max_participants;
      if (isFull) {
        return (
          <button type="button" className="championship-btn championship-btn-disabled" disabled>
            Lotado
          </button>
        );
      }

      return (
        <button
          type="button"
          className="championship-btn championship-btn-join"
          disabled={isLoading}
          onClick={() => handleJoin(item.id)}
        >
          {isLoading ? 'Entrando...' : 'Entrar'}
        </button>
      );
    }

    if (item.status === 'chaveado') {
      return (
        <button
          type="button"
          className="championship-btn championship-btn-primary"
          onClick={() => onSelectChampionship?.(item.id)}
        >
          Ver chave
        </button>
      );
    }

    if (item.status === 'em_andamento') {
      return (
        <button
          type="button"
          className="championship-btn championship-btn-primary"
          onClick={() => onSelectChampionship?.(item.id)}
        >
          {item.joined ? 'Jogar' : 'Acompanhar'}
        </button>
      );
    }

    if (item.status === 'finalizado') {
      return (
        <button
          type="button"
          className="championship-btn championship-btn-secondary"
          onClick={() => onSelectChampionship?.(item.id)}
        >
          Ver resultado
        </button>
      );
    }

    return null;
  };

  return (
    <div className="championships-screen">
      <header className="championships-header">
        <button type="button" className="championships-back" onClick={onBack}>
          <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" />
          <span>Voltar</span>
        </button>

        <div className="championships-title-group">
          <p className="championships-mark">PAguessr</p>
          <h1 className="championships-title">Campeonatos</h1>
        </div>

        <p className="championships-player">
          <span className="championships-avatar">
            <AvatarSvg id={user.avatarId} />
          </span>
          {user.nick}
        </p>
      </header>

      <main className="championships-content">
        {feedbackToast && (
          <div className="championships-toast" role="status">
            <span>{feedbackToast}</span>
            <button
              type="button"
              className="championships-toast-close"
              onClick={() => setFeedbackToast(null)}
              aria-label="Fechar mensagem"
            >
              ×
            </button>
          </div>
        )}

        {pageStatus === 'loading' && (
          <div className="status-screen">
            <div className="spinner large" />
            <h2>Carregando campeonatos...</h2>
          </div>
        )}

        {pageStatus === 'error' && (
          <div className="game-card championships-empty-card">
            <FontAwesomeIcon
              icon={faTriangleExclamation}
              className="championships-empty-icon"
              aria-hidden="true"
            />
            <h2>Nenhum campeonato disponível</h2>
            <p className="championships-empty-desc">
              {errorMessage || 'Não foi possível carregar os dados. Verifique a conexão com a API.'}
            </p>
            <div className="championships-empty-actions">
              <button type="button" className="btn-secondary" onClick={onBack}>
                Voltar ao início
              </button>
              <button type="button" className="game-cta" onClick={loadData}>
                <FontAwesomeIcon icon={faRotateRight} aria-hidden="true" style={{ marginRight: 8 }} />
                Tentar novamente
              </button>
            </div>
          </div>
        )}

        {pageStatus === 'ready' && items.length === 0 && (
          <div className="game-card championships-empty-card">
            <FontAwesomeIcon icon={faTrophy} className="championships-empty-icon" aria-hidden="true" />
            <h2>Nenhum campeonato no momento</h2>
            <p className="championships-empty-desc">
              Não há campeonatos abertos agora. Fique de olho para as próximas edições mata-mata em
              Paulo Afonso!
            </p>
            <div className="championships-empty-actions">
              <button type="button" className="game-cta" onClick={onBack}>
                Voltar ao início
              </button>
            </div>
          </div>
        )}

        {pageStatus === 'ready' && items.length > 0 && (
          <div className="championships-grid">
            {items.map((item) => {
              const bannerSrc = item.banner_url || item.banner || defaultBanner;
              const championNick = item.champion?.nick || item.winner_nick;

              return (
                <article key={item.id} className="game-card championship-card">
                  <div
                    className="championship-card-banner"
                    onClick={() => onSelectChampionship?.(item.id)}
                    role={onSelectChampionship ? 'button' : undefined}
                    tabIndex={onSelectChampionship ? 0 : undefined}
                    style={{ cursor: onSelectChampionship ? 'pointer' : undefined }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectChampionship?.(item.id);
                      }
                    }}
                  >
                    <img
                      src={bannerSrc}
                      alt=""
                      className="championship-card-banner-img"
                      loading="lazy"
                    />
                    <div className="championship-card-banner-veil" />
                    <span
                      className={`championship-badge championship-badge-${item.status}`}
                    >
                      {STATUS_LABELS[item.status]}
                    </span>
                    {item.joined && (
                      <span className="championship-joined-badge" title="Você está inscrito">
                        <FontAwesomeIcon icon={faCircleCheck} aria-hidden="true" /> Inscrito
                      </span>
                    )}
                  </div>

                  <div className="championship-card-body">
                    <h2
                      className="championship-card-title"
                      onClick={() => onSelectChampionship?.(item.id)}
                      style={{ cursor: onSelectChampionship ? 'pointer' : undefined }}
                    >
                      {item.title}
                    </h2>
                    {item.description && (
                      <p className="championship-card-desc">{item.description}</p>
                    )}

                    <div className="championship-card-meta">
                      <span className="championship-meta-item">
                        <FontAwesomeIcon icon={faUsers} aria-hidden="true" />
                        <strong>
                          {item.participants}/{item.max_participants}
                        </strong>{' '}
                        vagas
                      </span>

                      {item.rounds_per_match && (
                        <span className="championship-meta-item">
                          <FontAwesomeIcon icon={faClock} aria-hidden="true" />
                          {item.rounds_per_match} rodadas · {item.round_duration_seconds ?? 60}s
                        </span>
                      )}
                    </div>

                    {item.status === 'finalizado' && championNick && (
                      <div className="championship-card-champion">
                        <FontAwesomeIcon
                          icon={faTrophy}
                          className="championship-champion-trophy"
                          aria-hidden="true"
                        />
                        <span>
                          Campeão: <strong>{championNick}</strong>
                        </span>
                      </div>
                    )}

                    <div className="championship-card-footer">{renderCardAction(item)}</div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
