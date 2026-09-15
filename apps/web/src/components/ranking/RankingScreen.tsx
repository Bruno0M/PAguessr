import { useCallback, useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import type { PublicUser } from '../../api/auth';
import { getRanking, type ApiRankingResponse, type RankingPeriod } from '../../api/ranking';
import { AvatarSvg } from '../auth/avatars';
import { Podium3D } from './Podium3D';
import { RankingGeralDialog } from './RankingGeralDialog';
import './RankingScreen.css';

type Status = 'loading' | 'ready' | 'error';

const CAPTIONS: Record<RankingPeriod, string> = {
  semana: 'Melhor partida de cada jogador desde segunda, 00h',
  geral: 'Melhor partida de cada jogador em todos os tempos',
};

function formatScore(score: number): string {
  return score.toLocaleString('pt-BR');
}

export function RankingScreen({
  user,
  onBack,
  onPlayRanked,
}: {
  user: PublicUser;
  onBack: () => void;
  onPlayRanked: () => void;
}) {
  const [period, setPeriod] = useState<RankingPeriod>('geral');
  const [data, setData] = useState<ApiRankingResponse | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [geralOpen, setGeralOpen] = useState(false);
  const requestId = useRef(0);
  const openGeral = useCallback(() => setGeralOpen(true), []);

  const load = useCallback((p: RankingPeriod) => {
    const id = ++requestId.current;
    setStatus('loading');
    getRanking(p, 15)
      .then((res) => {
        if (id !== requestId.current) return;
        setData(res);
        setStatus('ready');
      })
      .catch(() => {
        if (id === requestId.current) setStatus('error');
      });
  }, []);

  useEffect(() => {
    load(period);
  }, [period, load]);

  // No erro não sobra o pódio do período anterior sob a mensagem; no loading sim,
  // pra troca de aba não piscar a cena vazia.
  const entries = status === 'error' ? [] : (data?.entries ?? []);
  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);
  const me = data?.me ?? null;
  const isMeVisible = entries.some((entry) => entry.userId === user.id);
  const isEmpty = status === 'ready' && entries.length === 0;

  return (
    <div className="ranking-screen">
      <section className="ranking-stage" aria-labelledby="ranking-title">
        <Podium3D
          entries={top3}
          currentUserId={user.id}
          periodKey={data?.period ?? period}
          onPlayRanked={onPlayRanked}
          onGoHome={onBack}
          onOpenGeral={openGeral}
        />

        {/* Mesmas ações das placas 3D, alcançáveis por teclado e leitor de tela. */}
        <nav className="ranking-scene-actions" aria-label="Ações do pódio">
          <button type="button" onClick={onBack}>
            Paulo Afonso: voltar ao menu
          </button>
          <button type="button" onClick={openGeral}>
            Ver ranking geral completo
          </button>
          <button type="button" onClick={onPlayRanked}>
            Jogar Ranqueado
          </button>
        </nav>

        <header className="ranking-hud">
          <button type="button" className="ranking-back" onClick={onBack}>
            <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" /> Início
          </button>

          <div className="ranking-heading">
            <h1 id="ranking-title" className="ranking-title">
              Ranking<b>.</b>
            </h1>
            <p className="ranking-caption">{CAPTIONS[period]}</p>
          </div>

          <div className="ranking-tabs" role="tablist" aria-label="Período do ranking">
            {(['semana', 'geral'] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={period === p}
                className={`ranking-tab${period === p ? ' is-active' : ''}`}
                onClick={() => setPeriod(p)}
              >
                {p === 'semana' ? 'Semana' : 'Geral'}
              </button>
            ))}
          </div>
        </header>

        {status === 'loading' && (
          <p className="ranking-stage-status" role="status">
            <span className="ranking-stage-spinner" aria-hidden="true" /> Carregando ranking…
          </p>
        )}

        {status === 'error' && (
          <div className="ranking-stage-message" role="alert">
            <h2>Não deu para carregar o ranking.</h2>
            <p>Verifique sua conexão e tente de novo.</p>
            <button type="button" className="ranking-action" onClick={() => load(period)}>
              Tentar de novo
            </button>
          </div>
        )}

        {isEmpty && (
          <div className="ranking-stage-message">
            <h2>
              {period === 'semana'
                ? 'Ninguém jogou Ranqueado nesta semana ainda.'
                : 'Ninguém jogou Ranqueado ainda.'}
            </h2>
            <p>Termine uma partida Ranqueada para colocar seu pin no pódio.</p>
            <button type="button" className="ranking-action" onClick={onPlayRanked}>
              Jogar Ranqueado
            </button>
          </div>
        )}

        <ol className="ranking-sr-only">
          {top3.map((entry) => (
            <li key={entry.userId}>
              {entry.position}º lugar: {entry.nick}, {formatScore(entry.score)} pontos
            </li>
          ))}
        </ol>
      </section>

      {(rest.length > 0 || (me && !isMeVisible)) && (
        <section className="ranking-board" aria-label="Demais posições">
          {rest.length > 0 && (
            <>
              <h2 className="ranking-board-title">Do 4º lugar em diante</h2>
              <ol className="ranking-list">
                {rest.map((entry) => (
                  <li
                    key={entry.userId}
                    className={`ranking-row${entry.userId === user.id ? ' is-me' : ''}`}
                  >
                    <span className="ranking-position">{entry.position}º</span>
                    <AvatarSvg id={entry.avatarId} className="ranking-avatar" />
                    <span className="ranking-nick">
                      {entry.nick}
                      {entry.userId === user.id && <span className="ranking-you">Você</span>}
                    </span>
                    <span className="ranking-score">
                      {formatScore(entry.score)} <small>pts</small>
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}

          {me && !isMeVisible && (
            <>
              <h2 className="ranking-board-title">Sua posição</h2>
              <div className="ranking-row is-me">
                <span className="ranking-position">{me.position}º</span>
                <AvatarSvg id={user.avatarId} className="ranking-avatar" />
                <span className="ranking-nick">
                  {user.nick}
                  <span className="ranking-you">Você</span>
                </span>
                <span className="ranking-score">
                  {formatScore(me.score)} <small>pts</small>
                </span>
              </div>
            </>
          )}
        </section>
      )}

      <RankingGeralDialog open={geralOpen} user={user} onClose={() => setGeralOpen(false)} />
    </div>
  );
}
