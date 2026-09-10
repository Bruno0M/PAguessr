import { useState, useEffect } from 'react';

interface ImagePanelProps {
  roundId?: string;
  imageUrl?: string;
  placeholderText?: string;
  category?: string;
  isMockFallback?: boolean;
}

export function ImagePanel({
  roundId,
  imageUrl,
  placeholderText,
  category,
  isMockFallback = false,
}: ImagePanelProps) {
  const targetSrc = imageUrl || (roundId ? `/api/rounds/${roundId}/image` : '');
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    setLoadState(targetSrc ? 'loading' : 'error');
  }, [targetSrc, retryCount]);

  if (isMockFallback || !targetSrc) {
    return (
      <section className="image-panel" aria-label="Área de imagem da rodada">
        <div className="image-placeholder">
          <div className="placeholder-badge">
            <span className="camera-icon">📷</span>
            <span>Modo Mock Offline</span>
          </div>

          <div className="placeholder-content">
            <div className="placeholder-icon-wrap">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
              </svg>
            </div>

            {category && <span className="category-chip">{category}</span>}

            <p className="placeholder-desc">
              {placeholderText || 'Local turístico de Paulo Afonso-BA. Tente descobrir a localização no mapa.'}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="image-panel" aria-label="Área de imagem da rodada">
      {loadState === 'loading' && (
        <div className="image-loading-overlay">
          <div className="spinner"></div>
          <span>Carregando imagem do Street View...</span>
        </div>
      )}

      {loadState === 'error' && (
        <div className="image-error-box">
          <span className="error-icon">⚠️</span>
          <h4>Não foi possível carregar a imagem desta rodada</h4>
          <p>
            O serviço de imagem ou Street View não respondeu a tempo. Você ainda pode marcar seu palpite no mapa abaixo.
          </p>
          <button
            type="button"
            className="btn-retry-image"
            onClick={() => setRetryCount((c) => c + 1)}
          >
            Tentar recarregar
          </button>
        </div>
      )}

      <img
        key={`${targetSrc}?retry=${retryCount}`}
        src={`${targetSrc}${targetSrc.includes('?') ? '&' : '?'}r=${retryCount}`}
        alt="Foto do local em Paulo Afonso"
        className={`location-image ${loadState === 'loaded' ? 'visible' : 'hidden'}`}
        onLoad={() => setLoadState('loaded')}
        onError={() => setLoadState('error')}
      />
    </section>
  );
}
