import { describe, expect, it } from 'vitest';
import { detectGame, RoundSample } from './detect.js';

describe('detectGame', () => {
  it('retorna offset_constante para offset constante em 3 rodadas', () => {
    const rounds: RoundSample[] = [
      { locLat: -9.4313, locLng: -38.1991, guessLat: -9.43133, guessLng: -38.19913, answerSeconds: 12 },
      { locLat: -9.4100, locLng: -38.2100, guessLat: -9.41003, guessLng: -38.21003, answerSeconds: 15 },
      { locLat: -9.4050, locLng: -38.2050, guessLat: -9.40503, guessLng: -38.20503, answerSeconds: 10 },
      { locLat: -9.3900, locLng: -38.1900, guessLat: -9.39200, guessLng: -38.19300, answerSeconds: 20 },
      { locLat: -9.3800, locLng: -38.1800, guessLat: -9.38100, guessLng: -38.18200, answerSeconds: 18 },
    ];
    expect(detectGame(rounds)).toBe('offset_constante');
  });

  it('retorna offset_constante para offset constante em 5 rodadas', () => {
    const rounds: RoundSample[] = [
      { locLat: -9.431378, locLng: -38.199139, guessLat: -9.431348, guessLng: -38.199109, answerSeconds: 12 },
      { locLat: -9.410000, locLng: -38.210000, guessLat: -9.409970, guessLng: -38.209970, answerSeconds: 15 },
      { locLat: -9.405000, locLng: -38.205000, guessLat: -9.404970, guessLng: -38.204970, answerSeconds: 10 },
      { locLat: -9.390000, locLng: -38.190000, guessLat: -9.389970, guessLng: -38.189970, answerSeconds: 20 },
      { locLat: -9.380000, locLng: -38.180000, guessLat: -9.379970, guessLng: -38.179970, answerSeconds: 18 },
    ];
    expect(detectGame(rounds)).toBe('offset_constante');
  });

  it('retorna null para offset constante em apenas 2 rodadas', () => {
    const rounds: RoundSample[] = [
      { locLat: -9.4313, locLng: -38.1991, guessLat: -9.43133, guessLng: -38.19913, answerSeconds: 12 },
      { locLat: -9.4100, locLng: -38.2100, guessLat: -9.41003, guessLng: -38.21003, answerSeconds: 15 },
      { locLat: -9.4050, locLng: -38.2050, guessLat: -9.40550, guessLng: -38.20560, answerSeconds: 10 },
      { locLat: -9.3900, locLng: -38.1900, guessLat: -9.39200, guessLng: -38.19300, answerSeconds: 20 },
      { locLat: -9.3800, locLng: -38.1800, guessLat: -9.38100, guessLng: -38.18200, answerSeconds: 18 },
    ];
    expect(detectGame(rounds)).toBeNull();
  });

  it('retorna tempo_desumano para 3 rodadas sub-5 s', () => {
    const rounds: RoundSample[] = [
      { locLat: -9.4313, locLng: -38.1991, guessLat: -9.4320, guessLng: -38.2000, answerSeconds: 3.2 },
      { locLat: -9.4100, locLng: -38.2100, guessLat: -9.4110, guessLng: -38.2090, answerSeconds: 4.8 },
      { locLat: -9.4050, locLng: -38.2050, guessLat: -9.4040, guessLng: -38.2060, answerSeconds: 2.1 },
      { locLat: -9.3900, locLng: -38.1900, guessLat: -9.3930, guessLng: -38.1910, answerSeconds: 8.5 },
      { locLat: -9.3800, locLng: -38.1800, guessLat: -9.3820, guessLng: -38.1830, answerSeconds: 9.0 },
    ];
    expect(detectGame(rounds)).toBe('tempo_desumano');
  });

  it('retorna null para apenas 2 rodadas sub-5 s', () => {
    const rounds: RoundSample[] = [
      { locLat: -9.4313, locLng: -38.1991, guessLat: -9.4320, guessLng: -38.2000, answerSeconds: 3.2 },
      { locLat: -9.4100, locLng: -38.2100, guessLat: -9.4110, guessLng: -38.2090, answerSeconds: 4.8 },
      { locLat: -9.4050, locLng: -38.2050, guessLat: -9.4040, guessLng: -38.2060, answerSeconds: 7.5 },
      { locLat: -9.3900, locLng: -38.1900, guessLat: -9.3930, guessLng: -38.1910, answerSeconds: 8.5 },
      { locLat: -9.3800, locLng: -38.1800, guessLat: -9.3820, guessLng: -38.1830, answerSeconds: 9.0 },
    ];
    expect(detectGame(rounds)).toBeNull();
  });

  it('retorna null para partida honesta rápida e precisa', () => {
    // Mediana ~14.9m, tempos >= 10.4s
    const rounds: RoundSample[] = [
      { locLat: -9.400000, locLng: -38.200000, guessLat: -9.400134, guessLng: -38.200000, answerSeconds: 10.4 },
      { locLat: -9.410000, locLng: -38.210000, guessLat: -9.410000, guessLng: -38.210134, answerSeconds: 12.0 },
      { locLat: -9.420000, locLng: -38.220000, guessLat: -9.419866, guessLng: -38.220000, answerSeconds: 15.2 },
      { locLat: -9.430000, locLng: -38.230000, guessLat: -9.430000, guessLng: -38.229866, answerSeconds: 11.1 },
      { locLat: -9.440000, locLng: -38.240000, guessLat: -9.440100, guessLng: -38.240100, answerSeconds: 14.3 },
    ];
    expect(detectGame(rounds)).toBeNull();
  });

  it('não conta rodadas sem palpite como offset igual nem tempo desumano', () => {
    const rounds: RoundSample[] = [
      { locLat: -9.4000, locLng: -38.2000, guessLat: null, guessLng: null, answerSeconds: 1.0 },
      { locLat: -9.4100, locLng: -38.2100, guessLat: null, guessLng: null, answerSeconds: 1.2 },
      { locLat: -9.4200, locLng: -38.2200, guessLat: null, guessLng: null, answerSeconds: 0.5 },
      { locLat: -9.4300, locLng: -38.2300, guessLat: -9.4310, guessLng: -38.2310, answerSeconds: 15.0 },
      { locLat: -9.4400, locLng: -38.2400, guessLat: -9.4420, guessLng: -38.2430, answerSeconds: 20.0 },
    ];
    expect(detectGame(rounds)).toBeNull();
  });

  it('prioriza offset_constante sobre tempo_desumano quando ambos ocorrem', () => {
    const rounds: RoundSample[] = [
      { locLat: -9.4313, locLng: -38.1991, guessLat: -9.43133, guessLng: -38.19913, answerSeconds: 2.0 },
      { locLat: -9.4100, locLng: -38.2100, guessLat: -9.41003, guessLng: -38.21003, answerSeconds: 1.5 },
      { locLat: -9.4050, locLng: -38.2050, guessLat: -9.40503, guessLng: -38.20503, answerSeconds: 2.5 },
      { locLat: -9.3900, locLng: -38.1900, guessLat: -9.39200, guessLng: -38.19300, answerSeconds: 12.0 },
      { locLat: -9.3800, locLng: -38.1800, guessLat: -9.38100, guessLng: -38.18200, answerSeconds: 18.0 },
    ];
    expect(detectGame(rounds)).toBe('offset_constante');
  });
});
