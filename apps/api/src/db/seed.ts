import '../env.js';
import { db, sql } from './index.js';
import { locations, NewLocation } from './schema.js';

export const SEED_LOCATIONS: Array<{
  pano_id: string;
  lat: number;
  lng: number;
  source: string;
  captured_at?: Date;
}> = [
  {
    pano_id: 'mock-cachoeira-pa',
    lat: -9.3985,
    lng: -38.204,
    source: 'seed',
    captured_at: new Date('2023-08-01')
  },
  {
    pano_id: 'mock-touro-sucuri',
    lat: -9.4045,
    lng: -38.2195,
    source: 'seed',
    captured_at: new Date('2023-08-01')
  },
  {
    pano_id: 'mock-igreja-sao-francisco',
    lat: -9.4038,
    lng: -38.2162,
    source: 'seed',
    captured_at: new Date('2023-08-01')
  },
  {
    pano_id: 'mock-ponte-metalica',
    lat: -9.3932,
    lng: -38.1965,
    source: 'seed',
    captured_at: new Date('2023-08-01')
  },
  {
    pano_id: 'mock-balneario-prainha',
    lat: -9.4185,
    lng: -38.2255,
    source: 'seed',
    captured_at: new Date('2023-08-01')
  },
  {
    pano_id: 'seed-parque-belvedere',
    lat: -9.4039,
    lng: -38.2205,
    source: 'seed',
    captured_at: new Date('2023-08-01')
  },
  {
    pano_id: 'seed-praca-mangueiras',
    lat: -9.4082,
    lng: -38.2166,
    source: 'seed',
    captured_at: new Date('2023-08-01')
  },
  {
    pano_id: 'seed-catedral-fatima',
    lat: -9.4076,
    lng: -38.2144,
    source: 'seed',
    captured_at: new Date('2023-08-01')
  },
  {
    pano_id: 'seed-hidreletrica-pa4',
    lat: -9.4215,
    lng: -38.188,
    source: 'seed',
    captured_at: new Date('2023-08-01')
  },
  {
    pano_id: 'seed-memorial-chesf',
    lat: -9.401,
    lng: -38.211,
    source: 'seed',
    captured_at: new Date('2023-08-01')
  },
  {
    pano_id: 'seed-canion-sao-francisco',
    lat: -9.387,
    lng: -38.192,
    source: 'seed',
    captured_at: new Date('2023-08-01')
  },
  {
    pano_id: 'seed-univasf-pa',
    lat: -9.412,
    lng: -38.221,
    source: 'seed',
    captured_at: new Date('2023-08-01')
  }
];

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
