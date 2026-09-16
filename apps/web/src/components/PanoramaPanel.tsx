import { useState, useEffect, useRef } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { getAppConfig, getRoundPanorama } from '../api/client';
import { ImagePanel } from './ImagePanel';

interface PanoramaPanelProps {
  roundId?: string | number;
  placeholderText?: string;
  category?: string;
  isMockFallback?: boolean;
}

export function PanoramaPanel({
  roundId,
  placeholderText,
  category,
  isMockFallback = false,
}: PanoramaPanelProps) {
  const [fallbackToImage, setFallbackToImage] = useState(false);
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [retryCount, setRetryCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFallbackToImage(false);
    setLoadState('loading');

    if (isMockFallback || !roundId) {
      setFallbackToImage(true);
      return;
    }

    let cancelled = false;
    let listener: google.maps.MapsEventListener | null = null;

    async function setupPanorama() {
      try {
        const [panoData, config] = await Promise.all([
          getRoundPanorama(roundId!),
          getAppConfig(),
        ]);

        if (cancelled) return;

        if (!config.googleMapsBrowserKey) {
          setFallbackToImage(true);
          return;
        }

        setOptions({
          key: config.googleMapsBrowserKey,
          v: 'weekly',
        });

        await importLibrary('streetView');

        if (cancelled || !containerRef.current) return;

        const panorama = new google.maps.StreetViewPanorama(containerRef.current, {
          pano: panoData.pano_id,
          addressControl: false,
          showRoadLabels: false,
          motionTracking: false,
        });

        listener = panorama.addListener('status_changed', () => {
          if (cancelled) return;
          const status = panorama.getStatus();
          if (status === google.maps.StreetViewStatus.OK) {
            setLoadState('loaded');
          } else {
            setFallbackToImage(true);
          }
        });

        if (panorama.getStatus() === google.maps.StreetViewStatus.OK) {
          setLoadState('loaded');
        }
      } catch {
        if (!cancelled) {
          setFallbackToImage(true);
        }
      }
    }

    setupPanorama();

    return () => {
      cancelled = true;
      if (listener) {
        google.maps.event.removeListener(listener);
      }
    };
  }, [roundId, isMockFallback, retryCount]);

  if (fallbackToImage) {
    return (
      <ImagePanel
        roundId={roundId}
        placeholderText={placeholderText}
        category={category}
        isMockFallback={isMockFallback}
      />
    );
  }

  return (
    <section className="image-panel" aria-label="Área de imagem da rodada">
      {loadState === 'loading' && (
        <div className="image-loading-overlay">
          <div className="spinner"></div>
          <span>Carregando panorama do Street View...</span>
        </div>
      )}

      {loadState === 'error' && (
        <div className="image-error-box">
          <span className="error-icon">⚠️</span>
          <h4>Não foi possível carregar o panorama desta rodada</h4>
          <p>
            O serviço de Street View não respondeu a tempo. Você ainda pode marcar seu
            palpite no mapa ao lado.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn-retry-image"
              onClick={() => setRetryCount((c) => c + 1)}
            >
              Tentar recarregar
            </button>
            <button
              type="button"
              className="btn-retry-image"
              onClick={() => setFallbackToImage(true)}
            >
              Ver imagem estática
            </button>
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          visibility: loadState === 'loaded' ? 'visible' : 'hidden',
        }}
      />
    </section>
  );
}
