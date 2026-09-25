import { describe, expect, it } from 'vitest';
import { calculateDebt } from './penalty.js';

describe('calculateDebt', () => {
  it('retorna dívida 0 para jogador sem partidas', () => {
    const result = calculateDebt([]);
    expect(result).toEqual({ debt: 0, lastChangedAt: null });
  });

  it('soma de duas fraudes', () => {
    const t1 = new Date('2026-09-01T10:00:00Z');
    const t2 = new Date('2026-09-01T11:00:00Z');

    const result = calculateDebt([
      { totalScore: 10000, flaggedReason: 'tempo_desumano', finishedAt: t1 },
      { totalScore: 15000, flaggedReason: 'offset_constante', finishedAt: t2 },
    ]);

    expect(result.debt).toBe(25000);
    expect(result.lastChangedAt).toEqual(t2);
  });

  it('abatimento parcial', () => {
    const t1 = new Date('2026-09-01T10:00:00Z');
    const t2 = new Date('2026-09-01T11:00:00Z');

    const result = calculateDebt([
      { totalScore: 25000, flaggedReason: 'offset_constante', finishedAt: t1 },
      { totalScore: 10000, flaggedReason: null, finishedAt: t2 },
    ]);

    expect(result.debt).toBe(15000);
    expect(result.lastChangedAt).toEqual(t2);
  });

  it('quitacao', () => {
    const t1 = new Date('2026-09-01T10:00:00Z');
    const t2 = new Date('2026-09-01T11:00:00Z');
    const t3 = new Date('2026-09-01T12:00:00Z');

    const result = calculateDebt([
      { totalScore: 20000, flaggedReason: 'offset_constante', finishedAt: t1 },
      { totalScore: 15000, flaggedReason: null, finishedAt: t2 },
      { totalScore: 10000, flaggedReason: null, finishedAt: t3 },
    ]);

    expect(result.debt).toBe(0);
    expect(result.lastChangedAt).toEqual(t3);
  });

  it('partidas anteriores a fraude nao abatem', () => {
    const t1 = new Date('2026-09-01T08:00:00Z');
    const t2 = new Date('2026-09-01T09:00:00Z');
    const t3 = new Date('2026-09-01T10:00:00Z');

    const result = calculateDebt([
      { totalScore: 25000, flaggedReason: null, finishedAt: t1 },
      { totalScore: 20000, flaggedReason: null, finishedAt: t2 },
      { totalScore: 24920, flaggedReason: 'offset_constante', finishedAt: t3 },
    ]);

    expect(result.debt).toBe(24920);
    expect(result.lastChangedAt).toEqual(t3);
  });

  it('campeonato normal nao abate', () => {
    const t1 = new Date('2026-09-01T10:00:00Z');
    const t2 = new Date('2026-09-01T11:00:00Z');

    const result = calculateDebt([
      { totalScore: 20000, flaggedReason: 'offset_constante', finishedAt: t1 },
      {
        totalScore: 25000,
        flaggedReason: null,
        championshipMatchId: 'match-123',
        finishedAt: t2,
      },
    ]);

    expect(result.debt).toBe(20000);
    expect(result.lastChangedAt).toEqual(t1);
  });

  it('partida de campeonato marcada soma na divida', () => {
    const t1 = new Date('2026-09-01T10:00:00Z');

    const result = calculateDebt([
      {
        totalScore: 18000,
        flaggedReason: 'tempo_desumano',
        championshipMatchId: 'match-123',
        finishedAt: t1,
      },
    ]);

    expect(result.debt).toBe(18000);
    expect(result.lastChangedAt).toEqual(t1);
  });

  it('ordena partidas por finished_at independente da ordem de entrada', () => {
    const t1 = new Date('2026-09-01T09:00:00Z');
    const t2 = new Date('2026-09-01T10:00:00Z');
    const t3 = new Date('2026-09-01T11:00:00Z');

    const result = calculateDebt([
      { totalScore: 5000, flaggedReason: null, finishedAt: t3 },
      { totalScore: 25000, flaggedReason: null, finishedAt: t1 },
      { totalScore: 20000, flaggedReason: 'offset_constante', finishedAt: t2 },
    ]);

    expect(result.debt).toBe(15000);
    expect(result.lastChangedAt).toEqual(t3);
  });

  it('ignora partidas nao finalizadas', () => {
    const t1 = new Date('2026-09-01T10:00:00Z');

    const result = calculateDebt([
      { totalScore: 15000, flaggedReason: 'tempo_desumano', finishedAt: t1 },
      { totalScore: 25000, flaggedReason: null, finishedAt: null },
    ]);

    expect(result.debt).toBe(15000);
    expect(result.lastChangedAt).toEqual(t1);
  });
});
