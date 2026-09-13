import { describe, expect, it } from 'vitest';
import { getWeekStartBRT } from './period.js';

describe('getWeekStartBRT', () => {
  it('segunda-feira 00:00:00 BRT exata mapeia pra si mesma', () => {
    const mondayMidnightBRT = new Date('2026-09-14T03:00:00.000Z');
    expect(getWeekStartBRT(mondayMidnightBRT)).toEqual(mondayMidnightBRT);
  });

  it('domingo 23:59:59 BRT (1s antes da virada) volta pra segunda anterior', () => {
    const sundayLastSecondBRT = new Date('2026-09-14T02:59:59.000Z');
    expect(getWeekStartBRT(sundayLastSecondBRT)).toEqual(new Date('2026-09-07T03:00:00.000Z'));
  });

  it('é idempotente: alimentar o resultado de volta devolve o mesmo instante', () => {
    const now = new Date('2026-09-16T18:30:00.000Z');
    const weekStart = getWeekStartBRT(now);
    expect(getWeekStartBRT(weekStart)).toEqual(weekStart);
  });

  it('meio da semana (quarta-feira) volta pra segunda daquela mesma semana', () => {
    const wednesdayBRT = new Date('2026-09-16T18:30:00.000Z');
    expect(getWeekStartBRT(wednesdayBRT)).toEqual(new Date('2026-09-14T03:00:00.000Z'));
  });
});
