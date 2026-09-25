import { describe, expect, it } from 'vitest';
import { isRoundClosed } from './timeline.js';

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
});
