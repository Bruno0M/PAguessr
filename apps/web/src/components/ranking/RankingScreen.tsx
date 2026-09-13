import { useCallback, useEffect, useState } from 'react';
import type { PublicUser } from '../../api/auth';
import { getRanking, type ApiRankingResponse, type RankingPeriod } from '../../api/ranking';
import { AvatarSvg } from '../auth/avatars';
import { Podium3D } from './Podium3D';
import './RankingScreen.css';

type Status = 'loading' | 'ready' | 'error';

function formatScore(score: number): string {
  return score.toLocaleString('pt-BR');
}

export function RankingScreen({ user, onBack }: { user: PublicUser; onBack: () => void }) {
  const [period, setPeriod] = useState<RankingPeriod>('geral');
  const [data, setData] = useState<ApiRankingResponse | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  const load = useCallback((p: RankingPeriod) => {
    setStatus('loading');
    getRanking(p, 15)
      .then((res) => {
        setData(res);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, []);

  useEffect(() => {
    load(period);
  }, [period, load]);

  const entries = data?.entries ?? [];
  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);
  const me = data?.me ?? null;
  const isMeVisible = entries.some((entry) => entry.userId === user.id);

  return (
    <div className="ranking-screen">
      <header className="ranking-header">
        <button type="button" className="ranking-back" onClick={onBack}>
          ← Voltar
        </button>
        <h1 className="ranking-title">Ranking</h1>
        <span className="ranking-header-spacer" aria-hidden="true" />
      </header>

      <div className="ranking-tabs" role="tablist" aria-label="Período do ranking">
        <button
          type="button"
          role="tab"
          aria-selected={period === 'semana'}
          className={`ranking-tab ${period === 'semana' ? 'active' : ''}`}
          onClick={() => setPeriod('semana')}
        >
          Semana
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={period === 'geral'}
          className={`ranking-tab ${period === 'geral' ? 'active' : ''}`}
          onClick={() => setPeriod('geral')}
        >
          Geral
        </button>
      </div>

      {status === 'loading' && (
        <div className="status-screen">
          <div className="spinner large"></div>
        </div>
      )}

      {status === 'error' && (
        <div className="status-screen error">
          <span className="screen-emoji">⚠️</span>
          <p>Não foi possível carregar o ranking.</p>
          <button type="button" className="btn-secondary" onClick={() => load(period)}>
            Tentar de novo
          </button>
        </div>
      )}

      {status === 'ready' && entries.length === 0 && (
        <div className="status-screen">
          <span className="screen-emoji">🏁</span>
          <p>Ninguém pontuou {period === 'semana' ? 'nesta semana' : 'ainda'}. Seja o primeiro!</p>
        </div>
      )}

      {status === 'ready' && entries.length > 0 && (
        <div className="ranking-body">
          <Podium3D entries={top3} currentUserId={user.id} />

          {rest.length > 0 && (
            <ul className="ranking-list">
              {rest.map((entry) => (
                <li
                  key={entry.userId}
                  className={`ranking-row ${entry.userId === user.id ? 'is-me' : ''}`}
                >
                  <span className="ranking-position">{entry.position}</span>
                  <AvatarSvg id={entry.avatarId} className="ranking-avatar" />
                  <span className="ranking-nick">{entry.nick}</span>
                  <span className="ranking-score">{formatScore(entry.score)} pts</span>
                </li>
              ))}
            </ul>
          )}

          {me && !isMeVisible && (
            <div className="ranking-me-pin">
              <span className="ranking-position">{me.position}</span>
              <AvatarSvg id={user.avatarId} className="ranking-avatar" />
              <span className="ranking-nick">Você</span>
              <span className="ranking-score">{formatScore(me.score)} pts</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
