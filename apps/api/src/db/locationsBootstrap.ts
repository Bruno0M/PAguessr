import { db } from './index.js';
import { locations } from './schema.js';
import { evaluateMetadata, fetchStreetViewMetadata, generateGrid } from '../streetview.js';

const CITY_CENTER = { lat: -9.4064, lng: -38.2147 };
const DEFAULT_TARGET = 10;
const MINIMUM_VIABLE = 5;
const GRID_SCAN_LIMIT = 80;

export type EnsureLocationsReason =
  'ALREADY_POPULATED' | 'NO_API_KEY' | 'API_ERROR' | 'INSUFFICIENT_PANORAMAS';

export interface EnsureLocationsResult {
  added: number;
  total: number;
  skipped: boolean;
  reason?: EnsureLocationsReason;
  message?: string;
}

// Chamado tanto pelo script manual (scripts/bootstrap-locations.ts) quanto
// automaticamente na subida da API (src/index.ts), para nunca deixar o banco
// de produção sem locais suficientes para iniciar uma partida (mínimo 5, ver
// POST /games em routes/gameRoutes.ts). A Metadata API é gratuita e sem
// limite (docs/DECISIONS.md), então rodar isso a cada boot não gera custo.
export async function ensureLocations(target = DEFAULT_TARGET): Promise<EnsureLocationsResult> {
  const existing = await db.select({ pano_id: locations.pano_id }).from(locations);
  const seen = new Set(existing.map((location) => location.pano_id));

  if (seen.size >= target) {
    return { added: 0, total: seen.size, skipped: true, reason: 'ALREADY_POPULATED' };
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_STREET_VIEW_API_KEY;
  if (!apiKey) {
    return { added: 0, total: seen.size, skipped: true, reason: 'NO_API_KEY' };
  }

  const grid = generateGrid().sort(
    (a, b) =>
      Math.hypot(a.lat - CITY_CENTER.lat, a.lng - CITY_CENTER.lng) -
      Math.hypot(b.lat - CITY_CENTER.lat, b.lng - CITY_CENTER.lng)
  );

  let added = 0;
  for (const point of grid.slice(0, GRID_SCAN_LIMIT)) {
    const meta = await fetchStreetViewMetadata(point.lat, point.lng, apiKey);
    const evaluation = evaluateMetadata(meta, seen);
    if (!evaluation.valid) {
      if (evaluation.reason === 'API_ERROR') {
        return {
          added,
          total: seen.size,
          skipped: false,
          reason: 'API_ERROR',
          message: evaluation.message,
        };
      }
      continue;
    }

    await db
      .insert(locations)
      .values({
        pano_id: meta!.pano_id!,
        lat: meta!.location!.lat,
        lng: meta!.location!.lng,
        source: 'streetview',
        captured_at: meta!.date ? new Date(meta!.date) : null,
      })
      .onConflictDoNothing();
    seen.add(meta!.pano_id!);
    added++;
    if (seen.size >= target) break;
  }

  if (seen.size < MINIMUM_VIABLE) {
    return { added, total: seen.size, skipped: false, reason: 'INSUFFICIENT_PANORAMAS' };
  }

  return { added, total: seen.size, skipped: false };
}
