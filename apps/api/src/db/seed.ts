import '../env.js';
import { db, sql } from './index.js';
import { locations, NewLocation } from './schema.js';

export const SEED_LOCATIONS: NewLocation[] = [
  {
    pano_id: 'VLpFtPYruAFuwaabCcgOsg',
    lat: -9.3962685,
    lng: -38.2124327,
    name: 'O Touro e a Sucuri',
    history:
      'O "Boi e a Cobra", cujo nome oficial é O Touro e a Sucuri, é um famoso monumento em bronze localizado no Parque Belvedere em Paulo Afonso, na Bahia, que simboliza a luta entre a força indomável da natureza e a coragem do ser humano.',
    category: 'Monumento histórico',
    view_heading: 295.3836845294749,
    view_pitch: 3.73579630970994,
    view_fov: 75,
    source: 'seed',
  },
  {
    pano_id: 'NHLx6hBqfOEVnm5jjZ1YwQ',
    lat: -9.4016007,
    lng: -38.2171835,
    name: 'Monumento ao Trabalhador',
    history:
      'O Monumento ao Trabalhador é uma homenagem dedicada aos pioneiros e operários nordestinos que perfuraram rochas e trabalharam bravamente na construção das usinas hidrelétricas da Chesf.',
    category: 'Monumento histórico',
    view_heading: 71.2051717091878,
    view_pitch: -12.786580061724635,
    view_fov: 75,
    source: 'seed',
  },
];

export async function runSeed() {
  for (const loc of SEED_LOCATIONS) {
    await db
      .insert(locations)
      .values(loc)
      .onConflictDoUpdate({
        target: locations.pano_id,
        set: {
          lat: loc.lat,
          lng: loc.lng,
          name: loc.name,
          history: loc.history,
          category: loc.category,
          view_heading: loc.view_heading,
          view_pitch: loc.view_pitch,
          view_fov: loc.view_fov,
          source: loc.source,
        },
      });
  }
}

if (process.argv[1]?.endsWith('seed.ts')) {
  runSeed()
    .then(async () => {
      await sql.end({ timeout: 1 });
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Falha no seed:', err);
      await sql.end({ timeout: 1 }).catch(() => {});
      process.exit(1);
    });
}
