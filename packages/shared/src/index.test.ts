import { describe, expect, it } from 'vitest';
import {
  AVATAR_COUNT,
  CHAMPIONSHIP_SIZES,
  LatLng,
  NICK_MAX_LENGTH,
  NICK_MIN_LENGTH,
  PAULO_AFONSO_CENTER,
  ROUND_DURATION_DEFAULT_SECONDS,
  ROUND_DURATION_MAX_SECONDS,
  ROUND_DURATION_MIN_SECONDS,
  haversine,
  isValidNickFormat,
  phasesFor,
  score,
  shuffle,
} from './index.js';

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

  describe('isValidNickFormat', () => {
    it('aceita nicks dentro do formato esperado', () => {
      expect(isValidNickFormat('abc')).toBe(true);
      expect(isValidNickFormat('Tiago_123')).toBe(true);
      expect(isValidNickFormat('a'.repeat(NICK_MAX_LENGTH))).toBe(true);
    });

    it('rejeita nicks fora dos limites de tamanho', () => {
      expect(isValidNickFormat('a'.repeat(NICK_MIN_LENGTH - 1))).toBe(false);
      expect(isValidNickFormat('a'.repeat(NICK_MAX_LENGTH + 1))).toBe(false);
    });

    it('rejeita caracteres fora de letras, números e underscore', () => {
      expect(isValidNickFormat('tia go')).toBe(false);
      expect(isValidNickFormat('tiago!')).toBe(false);
      expect(isValidNickFormat('tiago-santos')).toBe(false);
      expect(isValidNickFormat('tiagoçã')).toBe(false);
    });
  });

  describe('AVATAR_COUNT', () => {
    it('define 8 avatares disponíveis', () => {
      expect(AVATAR_COUNT).toBe(8);
    });
  });

  describe('phasesFor', () => {
    it('calcula o log2 do tamanho para potências de 2', () => {
      expect(phasesFor(4)).toBe(2);
      expect(phasesFor(8)).toBe(3);
      expect(phasesFor(16)).toBe(4);
      expect(phasesFor(32)).toBe(5);
    });
  });

  describe('shuffle', () => {
    it('retorna novo array com os mesmos elementos sem mutar o original', () => {
      const original = [1, 2, 3, 4, 5];
      const copy = [...original];
      const shuffled = shuffle(original);

      expect(original).toEqual(copy);
      expect(shuffled).toHaveLength(original.length);
      expect(shuffled.slice().sort()).toEqual(original.slice().sort());
    });

    it('lida com array vazio ou com um elemento', () => {
      expect(shuffle([])).toEqual([]);
      expect(shuffle([42])).toEqual([42]);
    });
  });

  describe('championship constants', () => {
    it('tamanhos válidos são potências de 2', () => {
      expect(CHAMPIONSHIP_SIZES).toEqual([4, 8, 16, 32]);
    });

    it('duração padrão da rodada é 60 segundos', () => {
      expect(ROUND_DURATION_DEFAULT_SECONDS).toBe(60);
      expect(ROUND_DURATION_MIN_SECONDS).toBe(10);
      expect(ROUND_DURATION_MAX_SECONDS).toBe(300);
    });
  });
});
