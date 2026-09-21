import { useEffect, useState, useCallback } from 'react';
import type { PublicUser } from '../../api/auth';
import { ApiError } from '../../api/client';
import { AdminLayout } from './AdminLayout';
import { AdminLocationsPage } from './AdminLocationsPage';
import { AdminChampionshipsPage } from './AdminChampionshipsPage';

export function AdminApp(props: {
  user: PublicUser;
  path: string;
  onNavigate: (path: string) => void;
  onLogout: () => void;
  onUnauthorized: () => void;
  onGoHome: () => void;
  championships?: boolean;
}) {
  const { user, path, onNavigate, onLogout, onUnauthorized, onGoHome, championships } = props;
  const [isForbidden, setIsForbidden] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (path === '/admin' || path === '/admin/') {
      onNavigate('/admin/locais');
    }
  }, [path, onNavigate]);

  useEffect(() => {
    setErrorMessage(null);
  }, [path]);

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized();
        return;
      }
      if (err instanceof ApiError && err.status === 403) {
        setIsForbidden(true);
        return;
      }
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao carregar dados do admin.');
    },
    [onUnauthorized]
  );

  const handleRetry = useCallback(() => {
    setIsForbidden(false);
    setErrorMessage(null);
    setRetryKey((k) => k + 1);
  }, []);

  let content: React.ReactNode = null;

  if (path === '/admin' || path === '/admin/') {
    content = (
      <div className="admin-status">
        <div className="spinner large"></div>
      </div>
    );
  } else if (path === '/admin/campeonatos' || path.startsWith('/admin/campeonatos')) {
    content = <AdminChampionshipsPage key={retryKey} onError={handleError} />;
  } else {
    content = <AdminLocationsPage key={retryKey} onError={handleError} />;
  }

  return (
    <AdminLayout
      user={user}
      currentPath={path}
      onNavigate={onNavigate}
      onLogout={onLogout}
      onGoHome={onGoHome}
      isForbidden={isForbidden}
      errorMessage={errorMessage}
      onRetry={handleRetry}
      championships={championships}
    >
      {content}
    </AdminLayout>
  );
}
