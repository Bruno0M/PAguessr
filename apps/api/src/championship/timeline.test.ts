import { describe, expect, it } from 'vitest';
import {
  currentRoundOrder,
  isRoundClosed,
  matchEndTime,
  plannedMatchEnd,
  plannedRoundStart,
  shiftedRoundStarts,
} from './timeline.js';

describe('Linha do tempo do duelo (timeline.ts)', () => {
  describe('isRoundClosed', () => {
    const startedAt = new Date('2026-09-24T12:00:00.000Z');
    const during = new Date('2026-09-24T12:00:30.000Z');

    it('rodada aberta e ninguém respondeu: não fecha', () => {
      expect(
        isRoundClosed({
          startedAt,
          durationSeconds: 60,
          myAnswered: false,
          opponentAnswered: false,
          now: during,
        })
      ).toBe(false);
    });

    it('só eu respondi, dentro do tempo: não fecha', () => {
      expect(
        isRoundClosed({
          startedAt,
          durationSeconds: 60,
          myAnswered: true,
          opponentAnswered: false,
          now: during,
        })
      ).toBe(false);
    });

    it('só o adversário respondeu, dentro do tempo: não fecha', () => {
      expect(
        isRoundClosed({
          startedAt,
          durationSeconds: 60,
          myAnswered: false,
          opponentAnswered: true,
          now: during,
        })
      ).toBe(false);
    });

    it('os dois responderam, mesmo com tempo sobrando: fecha', () => {
      expect(
        isRoundClosed({
          startedAt,
          durationSeconds: 60,
          myAnswered: true,
          opponentAnswered: true,
          now: during,
        })
      ).toBe(true);
    });

    it('tempo esgotado sem ninguém responder: fecha', () => {
      expect(
        isRoundClosed({
          startedAt,
          durationSeconds: 60,
          myAnswered: false,
          opponentAnswered: false,
          now: new Date('2026-09-24T12:01:30.000Z'),
        })
      ).toBe(true);
    });

    it('no instante exato do fim fecha; um milissegundo antes ainda não', () => {
      const base = {
        startedAt,
        durationSeconds: 60,
        myAnswered: false,
        opponentAnswered: false,
      };
      expect(isRoundClosed({ ...base, now: new Date('2026-09-24T12:01:00.000Z') })).toBe(true);
      expect(isRoundClosed({ ...base, now: new Date('2026-09-24T12:00:59.999Z') })).toBe(false);
    });

    it('sem started_at: só fecha se os dois responderam', () => {
      const base = { startedAt: null, durationSeconds: 60, now: during };
      expect(isRoundClosed({ ...base, myAnswered: false, opponentAnswered: false })).toBe(false);
      expect(isRoundClosed({ ...base, myAnswered: true, opponentAnswered: false })).toBe(false);
      expect(isRoundClosed({ ...base, myAnswered: true, opponentAnswered: true })).toBe(true);
    });
  });

  describe('linha do tempo planejada', () => {
    const opensAt = new Date('2026-09-24T12:00:00.000Z');

    it('início da rodada k = opens_at + (k - 1) * (duração + revelação)', () => {
      expect(plannedRoundStart(opensAt, 1, 60, 5).toISOString()).toBe('2026-09-24T12:00:00.000Z');
      expect(plannedRoundStart(opensAt, 2, 60, 5).toISOString()).toBe('2026-09-24T12:01:05.000Z');
      expect(plannedRoundStart(opensAt, 3, 60, 5).toISOString()).toBe('2026-09-24T12:02:10.000Z');
      expect(plannedRoundStart(opensAt, 4, 45, 5).getTime()).toBe(opensAt.getTime() + 150 * 1000);
    });

    it('fim do duelo = opens_at + N * duração + (N - 1) * revelação', () => {
      expect(plannedMatchEnd(opensAt, 5, 60, 5).getTime()).toBe(opensAt.getTime() + 320 * 1000);
      expect(plannedMatchEnd(opensAt, 1, 60, 5).getTime()).toBe(opensAt.getTime() + 60 * 1000);
    });

    it('a última rodada termina no fim planejado do duelo', () => {
      const lastStart = plannedRoundStart(opensAt, 5, 60, 5);
      expect(lastStart.getTime() + 60 * 1000).toBe(plannedMatchEnd(opensAt, 5, 60, 5).getTime());
    });
  });

  describe('shiftedRoundStarts (fechamento antecipado)', () => {
    const closedAt = new Date('2026-09-24T12:00:20.000Z');

    it('a rodada seguinte começa R depois e as outras seguem o espaçamento normal', () => {
      const starts = shiftedRoundStarts(closedAt, 2, 5, 60, 5);
      expect([...starts.keys()]).toEqual([3, 4, 5]);
      expect(starts.get(3)!.getTime()).toBe(closedAt.getTime() + 5 * 1000);
      expect(starts.get(4)!.getTime()).toBe(closedAt.getTime() + 70 * 1000);
      expect(starts.get(5)!.getTime()).toBe(closedAt.getTime() + 135 * 1000);
    });

    it('fechar a última rodada não puxa nada', () => {
      expect(shiftedRoundStarts(closedAt, 5, 5, 60, 5).size).toBe(0);
    });

    it('fechar a penúltima puxa só a última', () => {
      const starts = shiftedRoundStarts(closedAt, 4, 5, 60, 5);
      expect([...starts.keys()]).toEqual([5]);
      expect(starts.get(5)!.getTime()).toBe(closedAt.getTime() + 5 * 1000);
    });
  });

  describe('matchEndTime', () => {
    const lastRoundStart = new Date('2026-09-24T12:04:00.000Z');
    const timeEnd = new Date('2026-09-24T12:05:00.000Z');

    it('os dois terminaram antes do tempo: vale o instante do último a terminar', () => {
      const finishedA = new Date('2026-09-24T12:02:10.000Z');
      const finishedB = new Date('2026-09-24T12:02:40.000Z');
      expect(matchEndTime({ lastRoundStart, durationSeconds: 60, finishedA, finishedB })).toEqual(
        finishedB
      );
    });

    it('só um terminou: vale o fim do tempo da última rodada', () => {
      const finishedA = new Date('2026-09-24T12:02:10.000Z');
      expect(
        matchEndTime({ lastRoundStart, durationSeconds: 60, finishedA, finishedB: null })
      ).toEqual(timeEnd);
    });

    it('palpite automático depois do prazo não estica o duelo (vale o min)', () => {
      const finishedA = new Date('2026-09-24T12:04:20.000Z');
      const finishedB = new Date('2026-09-24T12:05:00.400Z');
      expect(matchEndTime({ lastRoundStart, durationSeconds: 60, finishedA, finishedB })).toEqual(
        timeEnd
      );
    });

    it('ninguém terminou: fim do tempo da última rodada', () => {
      expect(
        matchEndTime({ lastRoundStart, durationSeconds: 60, finishedA: null, finishedB: null })
      ).toEqual(timeEnd);
    });
  });

  describe('currentRoundOrder', () => {
    const starts = [
      { order: 1, startedAt: new Date('2026-09-24T12:00:00.000Z') },
      { order: 2, startedAt: new Date('2026-09-24T12:01:05.000Z') },
      { order: 3, startedAt: new Date('2026-09-24T12:02:10.000Z') },
    ];

    it('antes de qualquer rodada começar, é a 1', () => {
      expect(currentRoundOrder(starts, new Date('2026-09-24T11:59:00.000Z'))).toBe(1);
    });

    it('durante o duelo, é a maior cujo início já passou', () => {
      expect(currentRoundOrder(starts, new Date('2026-09-24T12:00:30.000Z'))).toBe(1);
      expect(currentRoundOrder(starts, new Date('2026-09-24T12:01:05.000Z'))).toBe(2);
      expect(currentRoundOrder(starts, new Date('2026-09-24T12:02:00.000Z'))).toBe(2);
    });

    it('depois de todas começarem, é a última', () => {
      expect(currentRoundOrder(starts, new Date('2026-09-24T13:00:00.000Z'))).toBe(3);
    });

    it('não depende da ordem em que os inícios chegam', () => {
      expect(currentRoundOrder([...starts].reverse(), new Date('2026-09-24T12:01:30.000Z'))).toBe(
        2
      );
    });
  });
});
