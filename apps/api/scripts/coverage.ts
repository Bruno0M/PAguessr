import '../src/env.js';
import { eq } from 'drizzle-orm';
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
  error_message?: string;
}

export const PAULO_AFONSO_BOUNDS = {
  minLat: -9.435,
  maxLat: -9.375,
  minLng: -38.245,
  maxLng: -38.185,
};

export const MINIMUM_YEAR_CUTOFF = '2018-01';

export function generateGrid(bounds = PAULO_AFONSO_BOUNDS, stepMeters = 200): GridPoint[] {
  const points: GridPoint[] = [];
  const latStep = stepMeters / 111000;
  const avgLatRad = ((bounds.minLat + bounds.maxLat) / 2) * (Math.PI / 180);
  const lngStep = stepMeters / (111000 * Math.cos(avgLatRad));

  for (let lat = bounds.minLat; lat <= bounds.maxLat; lat += latStep) {
    for (let lng = bounds.minLng; lng <= bounds.maxLng; lng += lngStep) {
      points.push({
        lat: Math.round(lat * 1000000) / 1000000,
        lng: Math.round(lng * 1000000) / 1000000,
      });
    }
  }

  return points;
}

export type DiscardReason = 'NO_PANORAMA' | 'OLD_DATE' | 'DUPLICATE_PANO' | 'API_ERROR';

export function evaluateMetadata(
  meta: StreetViewMetadataResponse | null,
  seenPanoIds: Set<string>,
  minDateCutoff = MINIMUM_YEAR_CUTOFF
): { valid: true } | { valid: false; reason: DiscardReason; message?: string } {
  if (!meta || meta.status !== 'OK') {
    if (meta?.status === 'ZERO_RESULTS' || meta?.status === 'NOT_FOUND') {
      return { valid: false, reason: 'NO_PANORAMA' };
    }
    return {
      valid: false,
      reason: 'API_ERROR',
      message: meta?.error_message || meta?.status || 'Erro desconhecido',
    };
  }

  if (!meta.pano_id || !meta.location) {
    return { valid: false, reason: 'NO_PANORAMA' };
  }

  if (seenPanoIds.has(meta.pano_id)) {
    return { valid: false, reason: 'DUPLICATE_PANO' };
  }

  if (meta.date && meta.date < minDateCutoff) {
    return { valid: false, reason: 'OLD_DATE' };
  }

  return { valid: true };
}

export function isValidMetadata(
  meta: StreetViewMetadataResponse,
  seenPanoIds: Set<string>,
  minDateCutoff = MINIMUM_YEAR_CUTOFF
): boolean {
  return evaluateMetadata(meta, seenPanoIds, minDateCutoff).valid;
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
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_STREET_VIEW_API_KEY;

  if (!apiKey) {
    console.error(
      'Erro: Chave da Google Maps API não configurada em GOOGLE_MAPS_API_KEY ou GOOGLE_STREET_VIEW_API_KEY. Defina a chave no arquivo .env para executar o script de cobertura.'
    );
    process.exit(1);
  }

  const existing = await db.select({ pano_id: locations.pano_id }).from(locations);
  const seenPanoIds = new Set<string>(existing.map((e) => e.pano_id));

  const initialSeedLocations = await db
    .select()
    .from(locations)
    .where(eq(locations.source, 'seed'));

  const grid = generateGrid();
  console.log(`Iniciando varredura de grade com ${grid.length} pontos em Paulo Afonso...`);

  const stats = {
    consultados: 0,
    inseridos: 0,
    semPanorama: 0,
    dataAntiga: 0,
    panoRepetido: 0,
    erroApi: 0,
    ultimoErroApi: '',
  };

  for (const point of grid) {
    stats.consultados++;
    const meta = await fetchStreetViewMetadata(point.lat, point.lng, apiKey);
    const evaluation = evaluateMetadata(meta, seenPanoIds);

    if (!evaluation.valid) {
      if (evaluation.reason === 'NO_PANORAMA') stats.semPanorama++;
      else if (evaluation.reason === 'OLD_DATE') stats.dataAntiga++;
      else if (evaluation.reason === 'DUPLICATE_PANO') stats.panoRepetido++;
      else if (evaluation.reason === 'API_ERROR') {
        stats.erroApi++;
        if (evaluation.message) stats.ultimoErroApi = evaluation.message;
        if (
          meta?.status === 'OVER_QUERY_LIMIT' ||
          evaluation.message?.toLowerCase().includes('quota') ||
          evaluation.message?.toLowerCase().includes('over_query_limit')
        ) {
          console.warn(
            `Interrompido por limite de cota no ponto ${stats.consultados}: ${evaluation.message || meta?.status}`
          );
          break;
        }
      }
      continue;
    }

    seenPanoIds.add(meta!.pano_id!);

    const newLoc: NewLocation = {
      pano_id: meta!.pano_id!,
      lat: meta!.location!.lat,
      lng: meta!.location!.lng,
      source: 'streetview',
      captured_at: meta!.date ? new Date(meta!.date) : null,
    };

    await db.insert(locations).values(newLoc).onConflictDoNothing();
    stats.inseridos++;

    await new Promise((res) => setTimeout(res, 50));
  }

  const finalSeedLocations = await db.select().from(locations).where(eq(locations.source, 'seed'));

  const totalFinalLocations = await db.select().from(locations);

  console.log('\n--- Relatório da Varredura de Cobertura ---');
  console.log(`Pontos da grade consultados: ${stats.consultados}`);
  console.log(`Locais válidos inseridos: ${stats.inseridos}`);
  console.log(`Descartados sem panorama: ${stats.semPanorama}`);
  console.log(`Descartados por data antiga (< ${MINIMUM_YEAR_CUTOFF}): ${stats.dataAntiga}`);
  console.log(`Descartados por pano_id repetido: ${stats.panoRepetido}`);
  console.log(
    `Descartados por erro na API: ${stats.erroApi} ${stats.ultimoErroApi ? `(${stats.ultimoErroApi})` : ''}`
  );
  console.log(
    `Locais de seed preservados na tabela: ${finalSeedLocations.length} de ${initialSeedLocations.length}`
  );
  console.log(`Total geral de locais no banco: ${totalFinalLocations.length}`);

  return stats;
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
