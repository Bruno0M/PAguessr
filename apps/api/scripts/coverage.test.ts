import { describe, expect, it } from 'vitest';
import { generateGrid, isValidMetadata, StreetViewMetadataResponse } from './coverage.js';

describe('Coverage script logic', () => {
  it('gera grade de pontos dentro dos limites de Paulo Afonso', () => {
    const grid = generateGrid();
    expect(grid.length).toBeGreaterThan(0);
    for (const point of grid) {
      expect(point.lat).toBeGreaterThanOrEqual(-9.44);
      expect(point.lat).toBeLessThanOrEqual(-9.37);
      expect(point.lng).toBeGreaterThanOrEqual(-38.25);
      expect(point.lng).toBeLessThanOrEqual(-38.18);
    }
  });

  it('descarta panoramas com status diferente de OK', () => {
    const meta: StreetViewMetadataResponse = {
      status: 'ZERO_RESULTS',
    };
    const seen = new Set<string>();
    expect(isValidMetadata(meta, seen)).toBe(false);
  });

  it('descarta pano_id repetidos', () => {
    const meta: StreetViewMetadataResponse = {
      status: 'OK',
      pano_id: 'pano-123',
      location: { lat: -9.4, lng: -38.2 },
      date: '2023-01',
    };
    const seen = new Set<string>(['pano-123']);
    expect(isValidMetadata(meta, seen)).toBe(false);
  });

  it('descarta panoramas antigos', () => {
    const meta: StreetViewMetadataResponse = {
      status: 'OK',
      pano_id: 'pano-old',
      location: { lat: -9.4, lng: -38.2 },
      date: '2015-05',
    };
    const seen = new Set<string>();
    expect(isValidMetadata(meta, seen, '2018-01')).toBe(false);
  });

  it('aceita metadados válidos e recentes', () => {
    const meta: StreetViewMetadataResponse = {
      status: 'OK',
      pano_id: 'pano-new',
      location: { lat: -9.4064, lng: -38.2147 },
      date: '2023-08',
    };
    const seen = new Set<string>();
    expect(isValidMetadata(meta, seen)).toBe(true);
  });
});
