import type { ReactNode } from 'react';
import type { PublicUser } from '../../api/auth';
import './AdminLayout.css';

export interface AdminLayoutProps {
  user: PublicUser;
  currentPath: string;
  onNavigate: (path: string) => void;
  onLogout: () => void;
  onGoHome: () => void;
  isForbidden?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  championships?: boolean;
  children: ReactNode;
}

export function AdminLayout({
  user,
  currentPath,
  onNavigate,
  onLogout,
  onGoHome,
  isForbidden = false,
  errorMessage = null,
  onRetry,
  championships = false,
  children,
}: AdminLayoutProps) {
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-header">
          <div className="admin-brand">
            <span className="logo-title">PAguessr</span>
            <span className="admin-badge">Admin</span>
          </div>
        </div>

        <nav className="admin-sidebar-nav" aria-label="Menu de Administração">
          <button
            type="button"
            className={`admin-nav-item ${currentPath.startsWith('/admin/locais') ? 'active' : ''}`}
            onClick={() => onNavigate('/admin/locais')}
          >
            <span className="admin-nav-bullet">▸</span>
            <span>Locais</span>
          </button>
          {championships && (
            <button
              type="button"
              className={`admin-nav-item ${currentPath.startsWith('/admin/campeonatos') ? 'active' : ''}`}
              onClick={() => onNavigate('/admin/campeonatos')}
            >
              <span className="admin-nav-bullet">▸</span>
              <span>Campeonatos</span>
            </button>
          )}
        </nav>

        <div className="admin-sidebar-footer">
          <div className="admin-sidebar-user">
            <span className="admin-user-tag" title={user.nick}>
              👤 {user.nick}
            </span>
            <button
              type="button"
              className="admin-btn-logout"
              onClick={onLogout}
              title="Sair da conta"
            >
              Sair
            </button>
          </div>
          <button
            type="button"
            className="admin-btn admin-btn-secondary admin-btn-home"
            onClick={onGoHome}
          >
            Voltar ao Jogo
          </button>
        </div>
      </aside>

      <main className="admin-main">
        {isForbidden ? (
          <div className="admin-status forbidden">
            <div className="admin-forbidden-card">
              <span className="admin-forbidden-icon">⛔</span>
              <h2>Acesso Negado</h2>
              <p className="admin-forbidden-message">Sua conta não tem acesso de admin.</p>
              <div className="admin-forbidden-actions">
                <button type="button" className="admin-btn admin-btn-secondary" onClick={onGoHome}>
                  Voltar ao Jogo
                </button>
                <button type="button" className="admin-btn admin-btn-danger" onClick={onLogout}>
                  Sair
                </button>
              </div>
            </div>
          </div>
        ) : errorMessage ? (
          <div className="admin-status error">
            <div className="admin-forbidden-card">
              <span className="admin-forbidden-icon">⚠️</span>
              <h2>Erro no painel de admin</h2>
              <p className="admin-error-text">{errorMessage}</p>
              <div className="admin-forbidden-actions">
                {onRetry && (
                  <button type="button" className="admin-btn admin-btn-secondary" onClick={onRetry}>
                    Tentar novamente
                  </button>
                )}
                <button type="button" className="admin-btn admin-btn-secondary" onClick={onGoHome}>
                  Voltar ao Jogo
                </button>
              </div>
            </div>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
