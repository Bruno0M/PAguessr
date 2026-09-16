import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveStreetviewMode } from './streetview.js';
import { resetTestDatabase } from './test/fixtures.js';
import { sql } from './db/index.js';

describe('resolveStreetviewMode', () => {
  const origEnabled = process.env.STREETVIEW_PANORAMA_ENABLED;
  const origBudget = process.env.STREETVIEW_PANORAMA_MONTHLY_BUDGET;

  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterEach(() => {
    process.env.STREETVIEW_PANORAMA_ENABLED = origEnabled;
    process.env.STREETVIEW_PANORAMA_MONTHLY_BUDGET = origBudget;
  });

  it('retorna static sem tocar no banco quando flag desativada', async () => {
    delete process.env.STREETVIEW_PANORAMA_ENABLED;
    const mode = await resolveStreetviewMode();
    expect(mode).toBe('static');

    const rows = await sql`SELECT * FROM streetview_panorama_usage`;
    expect(rows).toHaveLength(0);
  });

  it('retorna panorama até atingir o budget e faz fallback para static', async () => {
    process.env.STREETVIEW_PANORAMA_ENABLED = 'true';
    process.env.STREETVIEW_PANORAMA_MONTHLY_BUDGET = '2';

    const mode1 = await resolveStreetviewMode();
    const mode2 = await resolveStreetviewMode();
    const mode3 = await resolveStreetviewMode();

    expect(mode1).toBe('panorama');
    expect(mode2).toBe('panorama');
    expect(mode3).toBe('static');

    const rows = await sql<{ count: number }[]>`SELECT count FROM streetview_panorama_usage`;
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(3);
  });
});
