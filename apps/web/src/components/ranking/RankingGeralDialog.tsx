import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicUser } from '../../api/auth';
import { getRanking, type ApiRankingEntry } from '../../api/ranking';
import { AvatarSvg } from '../auth/avatars';
import './RankingGeralDialog.css';

const PAGE_SIZE = 50;

function formatScore(score: number): string {
  return score.toLocaleString('pt-BR');
}

export function RankingGeralDialog({
  open,
  user,
  onClose,
}: {
  open: boolean;
  user: PublicUser;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sentinelRef = useRef<HTMLLIElement>(null);
  const [entries, setEntries] = useState<ApiRankingEntry[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [me, setMe] = useState<{ position: number; score: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const loadingRef = useRef(false);
  const sessionRef = useRef(0);

  const loadPage = useCallback(async (offset: number) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const session = sessionRef.current;
    setLoading(true);
    setError(false);
    try {
      const page = await getRanking('geral', PAGE_SIZE, offset);
      if (session !== sessionRef.current) return;
      setEntries((prev) => (offset === 0 ? page.entries : [...prev, ...page.entries]));
      setTotal(page.total);
      setMe(page.me);
    } catch {
      if (session === sessionRef.current) setError(true);
    } finally {
      if (session === sessionRef.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      sessionRef.current += 1;
      loadingRef.current = false;
      setEntries([]);
      setTotal(null);
      loadPage(0);
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, loadPage]);

  const hasMore = total !== null && entries.length < total;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!open || !sentinel || !hasMore || error) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadPage(entries.length);
      },
      { root: dialogRef.current?.querySelector('.geral-list') ?? null, rootMargin: '200px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [open, hasMore, error, entries.length, loadPage]);

  return (
    <dialog
      ref={dialogRef}
      className="geral-dialog"
      aria-labelledby="geral-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="geral-panel">
        <header className="geral-header">
          <div>
            <h2 id="geral-title">Ranking geral</h2>
            <p>
              {total === null
                ? 'Melhor partida de cada jogador'
                : `${total.toLocaleString('pt-BR')} ${total === 1 ? 'jogador' : 'jogadores'} · melhor partida de cada um`}
            </p>
          </div>
          <button
            type="button"
            className="geral-close"
            aria-label="Fechar ranking geral"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <ol className="geral-list">
          {entries.map((entry) => {
            const isMe = entry.userId === user.id;
            return (
              <li key={entry.userId} className={`geral-row${isMe ? ' is-me' : ''}`}>
                <span className={`geral-position geral-position-${Math.min(entry.position, 4)}`}>
                  {entry.position}º
                </span>
                <AvatarSvg id={entry.avatarId} className="geral-avatar" />
                <span className="geral-nick">
                  {entry.nick}
                  {isMe && <span className="geral-you">Você</span>}
                </span>
                <span className="geral-score">
                  {formatScore(entry.score)} <small>pts</small>
                </span>
              </li>
            );
          })}

          {total === 0 && (
            <li className="geral-empty">
              Ninguém terminou uma partida Ranqueada ainda. A primeira coloca você no topo.
            </li>
          )}
          {error && (
            <li className="geral-empty">
              Não deu para carregar o ranking.{' '}
              <button
                type="button"
                className="geral-retry"
                onClick={() => loadPage(entries.length)}
              >
                Tentar de novo
              </button>
            </li>
          )}
          {loading && (
            <li className="geral-loading" role="status">
              Carregando jogadores…
            </li>
          )}
          {hasMore && !error && (
            <li ref={sentinelRef} className="geral-sentinel" aria-hidden="true" />
          )}
        </ol>

        <footer className="geral-footer">
          {me ? (
            <>
              <span>Sua posição</span>
              <strong>{me.position}º</strong>
              <span className="geral-footer-score">{formatScore(me.score)} pts</span>
            </>
          ) : (
            <span>Termine uma partida Ranqueada para entrar no ranking.</span>
          )}
        </footer>
      </div>
    </dialog>
  );
}
