import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { PAULO_AFONSO_CENTER } from '@paguessr/shared';
import { getAdminLocations, type AdminLocation } from '../../api/client';
import './AdminLocationsPage.css';

export interface AdminLocationsPageProps {
  onError?: (err: unknown) => void;
}

export function AdminLocationsPage({ onError }: AdminLocationsPageProps = {}) {
  const [locations, setLocations] = useState<AdminLocation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    getAdminLocations()
      .then((data) => {
        if (active) {
          setLocations(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setLoading(false);
          onError?.(err);
        }
      });

    return () => {
      active = false;
    };
  }, [onError]);

  if (loading) {
    return (
      <div className="admin-status">
        <div className="spinner large"></div>
        <h2 style={{ marginTop: '1rem', fontSize: '1.15rem' }}>Carregando locais mapeados...</h2>
      </div>
    );
  }

  return (
    <div className="admin-locations-page">
      <div className="admin-locations-stat">
        Total: <strong>{locations.length}</strong>
      </div>
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
    </div>
  );
}
