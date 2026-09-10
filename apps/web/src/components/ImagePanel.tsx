import type { LocationPoint } from '../types';

interface ImagePanelProps {
  location: LocationPoint;
}

export function ImagePanel({ location }: ImagePanelProps) {
  return (
    <section className="image-panel" aria-label="Área de imagem da rodada">
      {location.imageUrl ? (
        <img
          src={location.imageUrl}
          alt={location.name}
          className="location-image"
        />
      ) : (
        <div className="image-placeholder">
          <div className="placeholder-badge">
            <span className="camera-icon">📷</span>
            <span>Street View Static (Placeholder v1)</span>
          </div>

          <div className="placeholder-content">
            <div className="placeholder-icon-wrap">
              <svg
                width="64"
                height="64"
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

            {location.category && (
              <span className="category-chip">{location.category}</span>
            )}

            <p className="placeholder-desc">
              {location.imagePlaceholderText || 'Observe a paisagem ao redor e tente reconhecer este local de Paulo Afonso.'}
            </p>
          </div>

          <div className="placeholder-hint">
            💡 Local real de Paulo Afonso-BA. Na v2, a imagem estática do Google Street View será renderizada aqui.
          </div>
        </div>
      )}
    </section>
  );
}
