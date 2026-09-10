import '../src/env.js';
import { db, sql } from '../src/db/index.js';
import { locations, NewLocation } from '../src/db/schema.js';

export interface GridPoint {
  lat: number;
  lng: number;
}

export interface StreetViewMetadataResponse {
  status: string;
  pano_id?: string;
  location?: {
    lat: number;
    lng: number;
  };
  date?: string;
  copyright?: string;
}

export const PAULO_AFONSO_BOUNDS = {
  minLat: -9.435,
  maxLat: -9.375,
  minLng: -38.245,
  maxLng: -38.185
};

export const MINIMUM_YEAR_CUTOFF = '2018-01';

export function generateGrid(
  bounds = PAULO_AFONSO_BOUNDS,
  stepMeters = 200
): GridPoint[] {
  const points: GridPoint[] = [];
  const latStep = stepMeters / 111000;
  const avgLatRad = ((bounds.minLat + bounds.maxLat) / 2) * (Math.PI / 180);
  const lngStep = stepMeters / (111000 * Math.cos(avgLatRad));

  for (let lat = bounds.minLat; lat <= bounds.maxLat; lat += latStep) {
    for (let lng = bounds.minLng; lng <= bounds.maxLng; lng += lngStep) {
      points.push({
        lat: Math.round(lat * 1000000) / 1000000,
        lng: Math.round(lng * 1000000) / 1000000
      });
    }
  }

  return points;
}

export function isValidMetadata(
  meta: StreetViewMetadataResponse,
  seenPanoIds: Set<string>,
  minDateCutoff = MINIMUM_YEAR_CUTOFF
): boolean {
  if (meta.status !== 'OK' || !meta.pano_id || !meta.location) {
    return false;
  }

  if (seenPanoIds.has(meta.pano_id)) {
    return false;
  }

  if (meta.date && meta.date < minDateCutoff) {
    return false;
  }

  return true;
}

export async function fetchStreetViewMetadata(
  lat: number,
  lng: number,
  apiKey: string,
  fetcher: typeof fetch = fetch
): Promise<StreetViewMetadataResponse | null> {
  const url = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&source=outdoor&key=${apiKey}`;
  try {
    const res = await fetcher(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return (await res.json()) as StreetViewMetadataResponse;
  } catch {
    return null;
  }
}

export async function runCoverage() {
  const apiKey =
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_STREET_VIEW_API_KEY;

  if (!apiKey) {
    console.error(
      'Erro: Chave da Google Maps API não configurada em GOOGLE_MAPS_API_KEY ou GOOGLE_STREET_VIEW_API_KEY. Defina a chave no arquivo .env para executar o script de cobertura.'
    );
    process.exit(1);
  }

  const existing = await db.select({ pano_id: locations.pano_id }).from(locations);
  const seenPanoIds = new Set<string>(existing.map((e) => e.pano_id));

  const grid = generateGrid();
  console.log(`Iniciando varredura de grade com ${grid.length} pontos em Paulo Afonso...`);

  let insertedCount = 0;

  for (const point of grid) {
    const meta = await fetchStreetViewMetadata(point.lat, point.lng, apiKey);
    if (!meta || !isValidMetadata(meta, seenPanoIds)) {
      continue;
    }

    seenPanoIds.add(meta.pano_id!);

    const newLoc: NewLocation = {
      pano_id: meta.pano_id!,
      lat: meta.location!.lat,
      lng: meta.location!.lng,
      source: 'streetview',
      captured_at: meta.date ? new Date(meta.date) : null
    };

    await db.insert(locations).values(newLoc).onConflictDoNothing();
    insertedCount++;

    await new Promise((res) => setTimeout(res, 100));
  }

  console.log(`Varredura concluída. ${insertedCount} novos locais inseridos.`);
}

if (process.argv[1]?.endsWith('coverage.ts')) {
  runCoverage()
    .then(async () => {
      await sql.end({ timeout: 1 });
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Falha na execução do script de cobertura:', err);
      await sql.end({ timeout: 1 }).catch(() => {});
      process.exit(1);
    });
}
