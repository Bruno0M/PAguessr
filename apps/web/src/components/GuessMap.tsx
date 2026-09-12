import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LatLng } from '@paguessr/shared';
import type { GameState } from '../types';

interface GuessMapProps {
  center: LatLng;
  guess: LatLng | null;
  correctCoords?: LatLng | null;
  locationName?: string;
  gameState: GameState;
  onSelectGuess: (coords: LatLng) => void;
  onConfirmGuess: () => void;
}

const guessIcon = L.divIcon({
  className: 'custom-pin-wrap',
  html: `
    <div class="pin-marker guess-pin">
      <div class="pin-bubble">
        <svg width="28" height="38" viewBox="0 0 32 42" fill="none">
          <path d="M16 0C7.163 0 0 7.163 0 16c0 12 16 26 16 26s16-14 16-26c0-8.837-7.163-16-16-16z" fill="#ef4444" stroke="#ffffff" stroke-width="2"/>
          <circle cx="16" cy="16" r="6" fill="#ffffff"/>
        </svg>
      </div>
      <span class="pin-tag">Seu Palpite</span>
    </div>
  `,
  iconSize: [32, 42],
  iconAnchor: [16, 42],
});

const correctIcon = L.divIcon({
  className: 'custom-pin-wrap',
  html: `
    <div class="pin-marker correct-pin">
      <div class="pin-bubble">
        <svg width="28" height="38" viewBox="0 0 32 42" fill="none">
          <path d="M16 0C7.163 0 0 7.163 0 16c0 12 16 26 16 26s16-14 16-26c0-8.837-7.163-16-16-16z" fill="#10b981" stroke="#ffffff" stroke-width="2"/>
          <circle cx="16" cy="16" r="6" fill="#ffffff"/>
        </svg>
      </div>
      <span class="pin-tag">Local Correto</span>
    </div>
  `,
  iconSize: [32, 42],
  iconAnchor: [16, 42],
});

function MapInteractionHandler({
  enabled,
  onMapClick,
}: {
  enabled: boolean;
  onMapClick: (coords: LatLng) => void;
}) {
  useMapEvents({
    click(e) {
      if (enabled) {
        onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    },
  });
  return null;
}

function MapViewManager({
  gameState,
  guess,
  correct,
  center,
}: {
  gameState: GameState;
  guess: LatLng | null;
  correct?: LatLng | null;
  center: LatLng;
}) {
  const map = useMap();

  useEffect(() => {
    if (gameState === 'round_result' && guess && correct) {
      const bounds = L.latLngBounds([
        [guess.lat, guess.lng],
        [correct.lat, correct.lng],
      ]);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    } else if (gameState === 'guessing' && !guess) {
      map.setView([center.lat, center.lng], 14);
    }
  }, [gameState, guess, correct, center, map]);

  return null;
}

export function GuessMap({
  center,
  guess,
  correctCoords,
  gameState,
  onSelectGuess,
  onConfirmGuess,
}: GuessMapProps) {
  const isGuessing = gameState === 'guessing';
  const isSubmitting = gameState === 'submitting';
  const showResult = gameState === 'round_result' && !!correctCoords && !!guess;

  const linePositions = useMemo(() => {
    if (!showResult || !guess || !correctCoords) return [];
    return [
      [guess.lat, guess.lng] as [number, number],
      [correctCoords.lat, correctCoords.lng] as [number, number],
    ];
  }, [showResult, guess, correctCoords]);

  return (
    <div className="map-wrapper">
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={14}
        scrollWheelZoom={true}
        className="leaflet-container-custom"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        <MapInteractionHandler enabled={isGuessing} onMapClick={onSelectGuess} />

        <MapViewManager
          gameState={gameState}
          guess={guess}
          correct={correctCoords}
          center={center}
        />

        {guess && (
          <Marker
            position={[guess.lat, guess.lng]}
            icon={guessIcon}
            draggable={isGuessing}
            eventHandlers={{
              dragend: (e) => {
                const marker = e.target;
                const pos = marker.getLatLng();
                onSelectGuess({ lat: pos.lat, lng: pos.lng });
              },
            }}
          />
        )}

        {showResult && correctCoords && (
          <>
            <Marker position={[correctCoords.lat, correctCoords.lng]} icon={correctIcon} />
            <Polyline
              positions={linePositions}
              pathOptions={{
                color: '#ef4444',
                weight: 3,
                dashArray: '8, 8',
                opacity: 0.9,
              }}
            />
          </>
        )}
      </MapContainer>

      {(isGuessing || isSubmitting) && (
        <div className="map-action-bar">
          <button
            type="button"
            className={`btn-confirm ${guess && !isSubmitting ? 'active' : 'disabled'}`}
            disabled={!guess || isSubmitting}
            onClick={onConfirmGuess}
          >
            {isSubmitting
              ? 'Enviando palpite...'
              : guess
                ? 'Confirmar Palpite'
                : 'Clique no mapa para marcar'}
          </button>
        </div>
      )}
    </div>
  );
}
