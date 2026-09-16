import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { PAULO_AFONSO_CENTER } from '@paguessr/shared';
import { getAdminLocations, ApiError, type AdminLocation } from '../api/client';
import type { PublicUser } from '../api/auth';
import './AdminLocationsPage.css';

interface AdminLocationsPageProps {
  user: PublicUser;
  onLogout: () => void;
  onUnauthorized: () => void;
  onGoHome: () => void;
}

export function AdminLocationsPage({
  user,
  onLogout,
  onUnauthorized,
  onGoHome,
}: AdminLocationsPageProps) {
  const [locations, setLocations] = useState<AdminLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isForbidden, setIsForbidden] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadLocations = async () => {
    setLoading(true);
    setErrorMessage(null);
    setIsForbidden(false);

    try {
      const data = await getAdminLocations();
      setLocations(data);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized();
        return;
      }
      if (err instanceof ApiError && err.status === 403) {
        setIsForbidden(true);
        return;
      }
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao carregar locais mapeados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLocations();
  }, []);

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="admin-header-brand">
          <span className="logo-title">PAguessr</span>
          <span className="admin-badge">Admin</span>
        </div>

        {!loading && !isForbidden && !errorMessage && (
          <div className="admin-header-stats">
            <span className="admin-stat-pill">
              Total: <strong>{locations.length}</strong>
            </span>
          </div>
        )}

        <div className="admin-header-actions">
          <span className="admin-user-tag">👤 {user.nick}</span>
          <button type="button" className="admin-btn admin-btn-secondary" onClick={onGoHome}>
            Voltar ao Jogo
          </button>
          <button type="button" className="admin-btn admin-btn-danger" onClick={onLogout}>
            Sair
          </button>
        </div>
      </header>

      {loading && (
        <div className="admin-status">
          <div className="spinner large"></div>
          <h2 style={{ marginTop: '1rem', fontSize: '1.15rem' }}>Carregando locais mapeados...</h2>
        </div>
      )}

      {!loading && isForbidden && (
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
      )}

      {!loading && !isForbidden && errorMessage && (
        <div className="admin-status error">
          <div className="admin-forbidden-card">
            <span className="admin-forbidden-icon">⚠️</span>
            <h2>Erro ao carregar locais</h2>
            <p style={{ color: '#f87171' }}>{errorMessage}</p>
            <div className="admin-forbidden-actions">
              <button type="button" className="admin-btn admin-btn-secondary" onClick={loadLocations}>
                Tentar novamente
              </button>
              <button type="button" className="admin-btn admin-btn-secondary" onClick={onGoHome}>
                Voltar ao Jogo
              </button>
            </div>
          </div>
        </div>
      )}

      {!loading && !isForbidden && !errorMessage && (
        <main className="admin-map-container">
          <MapContainer
            center={[PAULO_AFONSO_CENTER.lat, PAULO_AFONSO_CENTER.lng]}
            zoom={13}
            scrollWheelZoom={true}
            className="admin-map-leaflet"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
            />

            {locations.map((loc) => (
              <CircleMarker
                key={loc.id}
                center={[loc.lat, loc.lng]}
                radius={6}
                pathOptions={{
                  fillColor: '#3b82f6',
                  fillOpacity: 0.85,
                  color: '#ffffff',
                  weight: 1.5,
                }}
              >
                <Popup>
                  <div className="admin-popup">
                    <div className="admin-popup-title">Local #{loc.id}</div>
                    <div className="admin-popup-row">
                      <span>Latitude:</span>
                      <code>{loc.lat}</code>
                    </div>
                    <div className="admin-popup-row">
                      <span>Longitude:</span>
                      <code>{loc.lng}</code>
                    </div>
                    <div className="admin-popup-row">
                      <span>Fonte:</span>
                      <div>{loc.source}</div>
                    </div>
                    <div className="admin-popup-row">
                      <span>Pano ID:</span>
                      <div>{loc.pano_id ? <code>{loc.pano_id}</code> : <em>Nenhum</em>}</div>
                    </div>
                    <div className="admin-popup-row">
                      <span>Data de Captura:</span>
                      <div>
                        {loc.captured_at
                          ? new Date(loc.captured_at).toLocaleDateString('pt-BR')
                          : <em>Não informada</em>}
                      </div>
                    </div>
                    <a
                      className="admin-popup-maps-link"
                      href={`https://www.google.com/maps?q=${loc.lat},${loc.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Abrir no Google Maps
                    </a>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </main>
      )}
    </div>
  );
}
