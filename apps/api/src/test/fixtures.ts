import { sql, db } from '../db/index.js';
import { locations, NewLocation } from '../db/schema.js';

// Locais falsos usados só pelos testes automatizados. Nunca usar em produção —
// por isso ficam aqui, separados de src/db/seed.ts (que é a fonte de dados reais).
export const TEST_LOCATIONS: NewLocation[] = [
  { pano_id: 'test-loc-1', lat: -9.4064, lng: -38.2147, source: 'test' },
  { pano_id: 'test-loc-2', lat: -9.4045, lng: -38.2195, source: 'test' },
  { pano_id: 'test-loc-3', lat: -9.4038, lng: -38.2162, source: 'test' },
  { pano_id: 'test-loc-4', lat: -9.3985, lng: -38.204, source: 'test' },
  { pano_id: 'test-loc-5', lat: -9.4185, lng: -38.2255, source: 'test' },
  { pano_id: 'test-loc-6', lat: -9.3932, lng: -38.1965, source: 'test' },
];

/**
 * Limpa e repovoa o banco de teste com locais falsos. Recusa rodar se
 * DATABASE_URL não apontar claramente para um banco de teste, para nunca
 * arriscar apagar os locais reais coletados via `pnpm coverage`.
 */
export async function resetTestDatabase() {
  const url = process.env.DATABASE_URL || '';
  if (!/paguessr_test/.test(url)) {
    throw new Error(
      `Recusando rodar os testes: DATABASE_URL ("${url}") não parece apontar para um banco de ` +
        'teste (esperado um nome contendo "paguessr_test"). Configure apps/api/.env.test ou a ' +
        'variável de ambiente da CI antes de rodar `pnpm test` — essa checagem existe para nunca ' +
        'apagar os locais reais coletados em produção.'
    );
  }

  await sql`TRUNCATE TABLE rounds, games, locations RESTART IDENTITY CASCADE`;
  await db.insert(locations).values(TEST_LOCATIONS);
}
