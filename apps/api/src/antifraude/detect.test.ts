import { describe, expect, it } from 'vitest';
import { detectGame, RoundSample } from './detect.js';

describe('detectGame', () => {
  it('retorna offset_constante para offset constante em 3 rodadas', () => {
    const rounds: RoundSample[] = [
      {
        locLat: -9.4313,
        locLng: -38.1991,
        guessLat: -9.43133,
        guessLng: -38.19913,
        answerSeconds: 12,
      },
      { locLat: -9.41, locLng: -38.21, guessLat: -9.41003, guessLng: -38.21003, answerSeconds: 15 },
      {
        locLat: -9.405,
        locLng: -38.205,
        guessLat: -9.40503,
        guessLng: -38.20503,
        answerSeconds: 10,
      },
      { locLat: -9.39, locLng: -38.19, guessLat: -9.392, guessLng: -38.193, answerSeconds: 20 },
      { locLat: -9.38, locLng: -38.18, guessLat: -9.381, guessLng: -38.182, answerSeconds: 18 },
    ];
    expect(detectGame(rounds)).toBe('offset_constante');
  });

  it('retorna offset_constante para offset constante em 5 rodadas', () => {
    const rounds: RoundSample[] = [
      {
        locLat: -9.431378,
        locLng: -38.199139,
        guessLat: -9.431348,
        guessLng: -38.199109,
        answerSeconds: 12,
      },
      { locLat: -9.41, locLng: -38.21, guessLat: -9.40997, guessLng: -38.20997, answerSeconds: 15 },
      {
        locLat: -9.405,
        locLng: -38.205,
        guessLat: -9.40497,
        guessLng: -38.20497,
        answerSeconds: 10,
      },
      { locLat: -9.39, locLng: -38.19, guessLat: -9.38997, guessLng: -38.18997, answerSeconds: 20 },
      { locLat: -9.38, locLng: -38.18, guessLat: -9.37997, guessLng: -38.17997, answerSeconds: 18 },
    ];
    expect(detectGame(rounds)).toBe('offset_constante');
  });

  it('retorna null para offset constante em apenas 2 rodadas', () => {
    const rounds: RoundSample[] = [
      {
        locLat: -9.4313,
        locLng: -38.1991,
        guessLat: -9.43133,
        guessLng: -38.19913,
        answerSeconds: 12,
      },
      { locLat: -9.41, locLng: -38.21, guessLat: -9.41003, guessLng: -38.21003, answerSeconds: 15 },
      { locLat: -9.405, locLng: -38.205, guessLat: -9.4055, guessLng: -38.2056, answerSeconds: 10 },
      { locLat: -9.39, locLng: -38.19, guessLat: -9.392, guessLng: -38.193, answerSeconds: 20 },
      { locLat: -9.38, locLng: -38.18, guessLat: -9.381, guessLng: -38.182, answerSeconds: 18 },
    ];
    expect(detectGame(rounds)).toBeNull();
  });

  it('retorna tempo_desumano para 3 rodadas sub-5 s', () => {
    const rounds: RoundSample[] = [
      { locLat: -9.4313, locLng: -38.1991, guessLat: -9.432, guessLng: -38.2, answerSeconds: 3.2 },
      { locLat: -9.41, locLng: -38.21, guessLat: -9.411, guessLng: -38.209, answerSeconds: 4.8 },
      { locLat: -9.405, locLng: -38.205, guessLat: -9.404, guessLng: -38.206, answerSeconds: 2.1 },
      { locLat: -9.39, locLng: -38.19, guessLat: -9.393, guessLng: -38.191, answerSeconds: 8.5 },
      { locLat: -9.38, locLng: -38.18, guessLat: -9.382, guessLng: -38.183, answerSeconds: 9.0 },
    ];
    expect(detectGame(rounds)).toBe('tempo_desumano');
  });

  it('retorna null para apenas 2 rodadas sub-5 s', () => {
    const rounds: RoundSample[] = [
      { locLat: -9.4313, locLng: -38.1991, guessLat: -9.432, guessLng: -38.2, answerSeconds: 3.2 },
      { locLat: -9.41, locLng: -38.21, guessLat: -9.411, guessLng: -38.209, answerSeconds: 4.8 },
      { locLat: -9.405, locLng: -38.205, guessLat: -9.404, guessLng: -38.206, answerSeconds: 7.5 },
      { locLat: -9.39, locLng: -38.19, guessLat: -9.393, guessLng: -38.191, answerSeconds: 8.5 },
      { locLat: -9.38, locLng: -38.18, guessLat: -9.382, guessLng: -38.183, answerSeconds: 9.0 },
    ];
    expect(detectGame(rounds)).toBeNull();
  });

  it('retorna null para partida honesta rápida e precisa', () => {
    // Mediana ~14.9m, tempos >= 10.4s
    const rounds: RoundSample[] = [
      { locLat: -9.4, locLng: -38.2, guessLat: -9.400134, guessLng: -38.2, answerSeconds: 10.4 },
      { locLat: -9.41, locLng: -38.21, guessLat: -9.41, guessLng: -38.210134, answerSeconds: 12.0 },
      { locLat: -9.42, locLng: -38.22, guessLat: -9.419866, guessLng: -38.22, answerSeconds: 15.2 },
      { locLat: -9.43, locLng: -38.23, guessLat: -9.43, guessLng: -38.229866, answerSeconds: 11.1 },
      { locLat: -9.44, locLng: -38.24, guessLat: -9.4401, guessLng: -38.2401, answerSeconds: 14.3 },
    ];
    expect(detectGame(rounds)).toBeNull();
  });

  it('não conta rodadas sem palpite como offset igual nem tempo desumano', () => {
    const rounds: RoundSample[] = [
      { locLat: -9.4, locLng: -38.2, guessLat: null, guessLng: null, answerSeconds: 1.0 },
      { locLat: -9.41, locLng: -38.21, guessLat: null, guessLng: null, answerSeconds: 1.2 },
      { locLat: -9.42, locLng: -38.22, guessLat: null, guessLng: null, answerSeconds: 0.5 },
      { locLat: -9.43, locLng: -38.23, guessLat: -9.431, guessLng: -38.231, answerSeconds: 15.0 },
      { locLat: -9.44, locLng: -38.24, guessLat: -9.442, guessLng: -38.243, answerSeconds: 20.0 },
    ];
    expect(detectGame(rounds)).toBeNull();
  });

  it('prioriza offset_constante sobre tempo_desumano quando ambos ocorrem', () => {
    const rounds: RoundSample[] = [
      {
        locLat: -9.4313,
        locLng: -38.1991,
        guessLat: -9.43133,
        guessLng: -38.19913,
        answerSeconds: 2.0,
      },
      {
        locLat: -9.41,
        locLng: -38.21,
        guessLat: -9.41003,
        guessLng: -38.21003,
        answerSeconds: 1.5,
      },
      {
        locLat: -9.405,
        locLng: -38.205,
        guessLat: -9.40503,
        guessLng: -38.20503,
        answerSeconds: 2.5,
      },
      { locLat: -9.39, locLng: -38.19, guessLat: -9.392, guessLng: -38.193, answerSeconds: 12.0 },
      { locLat: -9.38, locLng: -38.18, guessLat: -9.381, guessLng: -38.182, answerSeconds: 18.0 },
    ];
    expect(detectGame(rounds)).toBe('offset_constante');
  });
});
