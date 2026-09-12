import { describe, expect, it } from 'vitest';
import { LatLng, PAULO_AFONSO_CENTER, haversine, score } from './index.js';

describe('@paguessr/shared', () => {
  describe('PAULO_AFONSO_CENTER', () => {
    it('possui as coordenadas esperadas de Paulo Afonso-BA', () => {
      expect(PAULO_AFONSO_CENTER).toEqual({
        lat: -9.4064,
        lng: -38.2147,
      });
    });
  });

  describe('haversine', () => {
    it('retorna 0 para o mesmo ponto', () => {
      const point: LatLng = { lat: -9.4064, lng: -38.2147 };
      expect(haversine(point, point)).toBe(0);
    });

    it('é simétrica', () => {
      const a: LatLng = { lat: -9.4064, lng: -38.2147 };
      const b: LatLng = { lat: -9.4005, lng: -38.2198 };
      expect(haversine(a, b)).toBeCloseTo(haversine(b, a), 4);
    });

    it('calcula a distância corretamente em metros', () => {
      const p1: LatLng = { lat: 0, lng: 0 };
      const p2: LatLng = { lat: 1, lng: 0 };
      const dist = haversine(p1, p2);
      expect(dist).toBeGreaterThan(111000);
      expect(dist).toBeLessThan(112000);
    });
  });

  describe('score', () => {
    it('retorna 5000 para distância 0 ou negativa', () => {
      expect(score(0)).toBe(5000);
      expect(score(-10)).toBe(5000);
    });

    it('retorna aproximadamente 1839 para 1500m na escala padrão de 1500', () => {
      expect(score(1500)).toBe(1839);
    });

    it('retorna 0 para distâncias muito grandes', () => {
      expect(score(100000)).toBe(0);
    });

    it('respeita uma escala personalizada', () => {
      expect(score(3000, 3000)).toBe(1839);
      expect(score(0, 3000)).toBe(5000);
    });
  });
});
