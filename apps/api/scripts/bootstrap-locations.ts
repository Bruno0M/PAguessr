import '../src/env.js';
import { db, sql } from '../src/db/index.js';
import { locations } from '../src/db/schema.js';
import { evaluateMetadata, fetchStreetViewMetadata, generateGrid } from './coverage.js';

// Small, repeatable initial import; the full coverage scan remains a separate command.
async function bootstrapLocations() {
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_STREET_VIEW_API_KEY;
  if (!key) throw new Error('Configure GOOGLE_STREET_VIEW_API_KEY no .env.');
  const existing = await db.select({ pano_id: locations.pano_id }).from(locations);
  const seen = new Set(existing.map((location) => location.pano_id));
  const target = 10;
  if (seen.size >= target) {
    console.log('O banco já possui locais suficientes.');
    return;
  }
  const grid = generateGrid().sort((a, b) =>
    Math.hypot(a.lat + 9.4064, a.lng + 38.2147) - Math.hypot(b.lat + 9.4064, b.lng + 38.2147)
  );
  for (const point of grid.slice(0, 80)) {
    const meta = await fetchStreetViewMetadata(point.lat, point.lng, key);
    const result = evaluateMetadata(meta, seen);
    if (!result.valid) {
      if (result.reason === 'API_ERROR') {
        throw new Error(`Não foi possível consultar o Street View: ${meta?.status || 'falha de conexão'}. Verifique a chave e a ativação da API no Google Cloud.`);
      }
      continue;
    }
    await db.insert(locations).values({
      pano_id: meta!.pano_id!,
      lat: meta!.location!.lat,
      lng: meta!.location!.lng,
      source: 'streetview',
      captured_at: meta!.date ? new Date(meta!.date) : null,
    }).onConflictDoNothing();
    seen.add(meta!.pano_id!);
    console.log(`Locais disponíveis: ${seen.size}/${target}`);
    if (seen.size >= target) return;
  }
  if (seen.size < 5) throw new Error('Não foram encontrados 5 panoramas válidos. Execute a varredura de cobertura.');
}

bootstrapLocations()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Falha ao cadastrar locais.');
    process.exitCode = 1;
  })
  .finally(() => sql.end({ timeout: 1 }));
