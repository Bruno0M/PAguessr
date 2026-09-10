import '../env.js';
import { db, sql } from './index.js';
import { locations, NewLocation } from './schema.js';

export const SEED_LOCATIONS: Array<{
  pano_id: string;
  lat: number;
  lng: number;
  source: string;
  captured_at?: Date;
}> = [];

export async function runSeed() {
  for (const loc of SEED_LOCATIONS) {
    await db
      .insert(locations)
      .values(loc as NewLocation)
      .onConflictDoNothing({ target: locations.pano_id });
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
