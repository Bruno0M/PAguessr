import { describe, expect, it } from 'vitest';
import { getDayKeyBRT, getWeekStartBRT } from './period.js';

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

describe('getDayKeyBRT', () => {
  it('meia-noite BRT exata já conta como o novo dia', () => {
    // 00:00:00 BRT = 03:00:00 UTC
    expect(getDayKeyBRT(new Date('2026-10-02T03:00:00.000Z'))).toBe('2026-10-02');
  });

  it('1s antes da meia-noite BRT ainda é o dia anterior', () => {
    expect(getDayKeyBRT(new Date('2026-10-02T02:59:59.000Z'))).toBe('2026-10-01');
  });

  it('horário em que UTC já virou o dia mas BRT ainda não', () => {
    expect(getDayKeyBRT(new Date('2026-10-02T01:00:00.000Z'))).toBe('2026-10-01');
  });
});
