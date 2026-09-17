import { describe, expect, it } from 'vitest';
import {
  assignSeeds,
  generateBracket,
  getNextMatchDestination,
  resolveDuel,
  calculateRoundStartedAt,
  type ParticipantWithSeed,
  type DuelPlayerInput,
} from './bracket.js';

describe('Módulo de Chaveamento (bracket.ts)', () => {
  describe('1. Sorteio (generateBracket)', () => {
    it('gera chave completa para 4 participantes (2 fases)', () => {
      const participants: ParticipantWithSeed[] = [
        { userId: 'u0', seed: 0 },
        { userId: 'u1', seed: 1 },
        { userId: 'u2', seed: 2 },
        { userId: 'u3', seed: 3 },
      ];

      const matches = generateBracket(participants, 4);

      expect(matches.length).toBe(3);

      const phase1 = matches.filter((m) => m.phase === 1);
      const phase2 = matches.filter((m) => m.phase === 2);

      expect(phase1.length).toBe(2);
      expect(phase2.length).toBe(1);

      expect(phase1[0]).toEqual({
        phase: 1,
        slot: 0,
        playerAId: 'u0',
        playerBId: 'u1',
      });
      expect(phase1[1]).toEqual({
        phase: 1,
        slot: 1,
        playerAId: 'u2',
        playerBId: 'u3',
      });

      expect(phase2[0]).toEqual({
        phase: 2,
        slot: 0,
        playerAId: null,
        playerBId: null,
      });
    });

    it('gera chave completa para 8 participantes (3 fases)', () => {
      const participants: ParticipantWithSeed[] = Array.from({ length: 8 }, (_, i) => ({
        userId: `u${i}`,
        seed: i,
      }));

      const matches = generateBracket(participants, 8);

      expect(matches.length).toBe(7);

      const p1 = matches.filter((m) => m.phase === 1);
      const p2 = matches.filter((m) => m.phase === 2);
      const p3 = matches.filter((m) => m.phase === 3);

      expect(p1.length).toBe(4);
      expect(p2.length).toBe(2);
      expect(p3.length).toBe(1);

      for (let s = 0; s < 4; s++) {
        expect(p1[s].playerAId).toBe(`u${2 * s}`);
        expect(p1[s].playerBId).toBe(`u${2 * s + 1}`);
      }

      for (const m of [...p2, ...p3]) {
        expect(m.playerAId).toBeNull();
        expect(m.playerBId).toBeNull();
      }
    });

    it('gera chave completa para 16 participantes (4 fases)', () => {
      const participants: ParticipantWithSeed[] = Array.from({ length: 16 }, (_, i) => ({
        userId: `u${i}`,
        seed: i,
      }));

      const matches = generateBracket(participants, 16);

      expect(matches.length).toBe(15);
      expect(matches.filter((m) => m.phase === 1).length).toBe(8);
      expect(matches.filter((m) => m.phase === 2).length).toBe(4);
      expect(matches.filter((m) => m.phase === 3).length).toBe(2);
      expect(matches.filter((m) => m.phase === 4).length).toBe(1);
    });

    it('gera chave completa para 32 participantes (5 fases)', () => {
      const participants: ParticipantWithSeed[] = Array.from({ length: 32 }, (_, i) => ({
        userId: `u${i}`,
        seed: i,
      }));

      const matches = generateBracket(participants, 32);

      expect(matches.length).toBe(31);
      expect(matches.filter((m) => m.phase === 1).length).toBe(16);
      expect(matches.filter((m) => m.phase === 2).length).toBe(8);
      expect(matches.filter((m) => m.phase === 3).length).toBe(4);
      expect(matches.filter((m) => m.phase === 4).length).toBe(2);
      expect(matches.filter((m) => m.phase === 5).length).toBe(1);
    });

    it('assignSeeds embaralha e atribui seeds únicas 0..N-1', () => {
      const users = Array.from({ length: 8 }, (_, i) => ({ userId: `id-${i}` }));
      const seeded = assignSeeds(users);

      expect(seeded.length).toBe(8);
      const seeds = seeded.map((s) => s.seed).sort((a, b) => a - b);
      expect(seeds).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    });
  });

  describe('2. Promoção (getNextMatchDestination)', () => {
    it('promove os 8 slots de uma fase para seus destinos exatos (slot e side)', () => {
      const phase = 1;
      const destinations = Array.from({ length: 8 }, (_, slot) =>
        getNextMatchDestination(phase, slot)
      );

      expect(destinations[0]).toEqual({ phase: 2, slot: 0, side: 'player_a' });
      expect(destinations[1]).toEqual({ phase: 2, slot: 0, side: 'player_b' });

      expect(destinations[2]).toEqual({ phase: 2, slot: 1, side: 'player_a' });
      expect(destinations[3]).toEqual({ phase: 2, slot: 1, side: 'player_b' });

      expect(destinations[4]).toEqual({ phase: 2, slot: 2, side: 'player_a' });
      expect(destinations[5]).toEqual({ phase: 2, slot: 2, side: 'player_b' });

      expect(destinations[6]).toEqual({ phase: 2, slot: 3, side: 'player_a' });
      expect(destinations[7]).toEqual({ phase: 2, slot: 3, side: 'player_b' });
    });

    it('promove da semifinal para a final', () => {
      const semi0 = getNextMatchDestination(2, 0);
      const semi1 = getNextMatchDestination(2, 1);

      expect(semi0).toEqual({ phase: 3, slot: 0, side: 'player_a' });
      expect(semi1).toEqual({ phase: 3, slot: 0, side: 'player_b' });
    });
  });

  describe('3. Resolução do Duelo (resolveDuel) e Critérios de Desempate', () => {
    it('decide pelo maior número de pontos quando não há empate', () => {
      const playerA: DuelPlayerInput = {
        userId: 'user-a',
        seed: 0,
        totalScore: 4500,
        totalDistanceMeters: 500,
        guessesCount: 5,
      };
      const playerB: DuelPlayerInput = {
        userId: 'user-b',
        seed: 1,
        totalScore: 4200,
        totalDistanceMeters: 200,
        guessesCount: 5,
      };

      const result = resolveDuel(playerA, playerB);
      expect(result).toEqual({ winnerId: 'user-a', reason: 'points' });
    });

    it('critério 1: desempata por menor distância acumulada', () => {
      const playerA: DuelPlayerInput = {
        userId: 'user-a',
        seed: 3,
        totalScore: 4000,
        totalDistanceMeters: 800,
        guessesCount: 5,
      };
      const playerB: DuelPlayerInput = {
        userId: 'user-b',
        seed: 0,
        totalScore: 4000,
        totalDistanceMeters: 650,
        guessesCount: 5,
      };

      const result = resolveDuel(playerA, playerB);
      expect(result).toEqual({ winnerId: 'user-b', reason: 'distance' });
    });

    it('critério 2: desempata por quem enviou o último palpite mais cedo', () => {
      const playerA: DuelPlayerInput = {
        userId: 'user-a',
        seed: 5,
        totalScore: 4000,
        totalDistanceMeters: 600,
        lastGuessAt: '2026-09-17T12:01:30.000Z',
        guessesCount: 5,
      };
      const playerB: DuelPlayerInput = {
        userId: 'user-b',
        seed: 1,
        totalScore: 4000,
        totalDistanceMeters: 600,
        lastGuessAt: '2026-09-17T12:01:45.000Z',
        guessesCount: 5,
      };

      const result = resolveDuel(playerA, playerB);
      expect(result).toEqual({ winnerId: 'user-a', reason: 'time' });
    });

    it('critério 3: desempata pelo menor seed', () => {
      const playerA: DuelPlayerInput = {
        userId: 'user-a',
        seed: 2,
        totalScore: 4000,
        totalDistanceMeters: 600,
        lastGuessAt: '2026-09-17T12:01:30.000Z',
        guessesCount: 5,
      };
      const playerB: DuelPlayerInput = {
        userId: 'user-b',
        seed: 6,
        totalScore: 4000,
        totalDistanceMeters: 600,
        lastGuessAt: '2026-09-17T12:01:30.000Z',
        guessesCount: 5,
      };

      const result = resolveDuel(playerA, playerB);
      expect(result).toEqual({ winnerId: 'user-a', reason: 'seed' });
    });

    it('encadeamento dos critérios: testa cada nível sucessivamente', () => {
      const baseA: DuelPlayerInput = {
        userId: 'user-a',
        seed: 4,
        totalScore: 5000,
        totalDistanceMeters: 100,
        lastGuessAt: 1000,
        guessesCount: 5,
      };
      const baseB: DuelPlayerInput = {
        userId: 'user-b',
        seed: 2,
        totalScore: 5000,
        totalDistanceMeters: 100,
        lastGuessAt: 1000,
        guessesCount: 5,
      };

      expect(resolveDuel(baseA, baseB).winnerId).toBe('user-b'); // empate até seed: 2 < 4 -> B

      expect(
        resolveDuel(
          { ...baseA, lastGuessAt: 900 },
          baseB
        )
      ).toEqual({ winnerId: 'user-a', reason: 'time' });

      expect(
        resolveDuel(
          { ...baseA, totalDistanceMeters: 50 },
          baseB
        )
      ).toEqual({ winnerId: 'user-a', reason: 'distance' });

      expect(
        resolveDuel(
          baseA,
          { ...baseB, totalScore: 5001 }
        )
      ).toEqual({ winnerId: 'user-b', reason: 'points' });
    });
  });

  describe('4. Ausência (W.O.)', () => {
    it('W.O. de um lado: o participante presente vence independentemente da pontuação', () => {
      const playerPresent: DuelPlayerInput = {
        userId: 'user-present',
        seed: 7,
        totalScore: 0,
        totalDistanceMeters: 50000,
        guessesCount: 5,
      };
      const playerAbsent: DuelPlayerInput = {
        userId: 'user-absent',
        seed: 0,
        totalScore: 0,
        totalDistanceMeters: 0,
        guessesCount: 0,
      };

      const result1 = resolveDuel(playerPresent, playerAbsent);
      expect(result1).toEqual({ winnerId: 'user-present', reason: 'wo_single' });

      const result2 = resolveDuel(playerAbsent, playerPresent);
      expect(result2).toEqual({ winnerId: 'user-present', reason: 'wo_single' });
    });

    it('W.O. dos dois lados: avança o de menor seed para não travar a chave', () => {
      const playerA: DuelPlayerInput = {
        userId: 'absent-a',
        seed: 5,
        totalScore: 0,
        totalDistanceMeters: 0,
        guessesCount: 0,
      };
      const playerB: DuelPlayerInput = {
        userId: 'absent-b',
        seed: 1,
        totalScore: 0,
        totalDistanceMeters: 0,
        guessesCount: 0,
      };

      const result = resolveDuel(playerA, playerB);
      expect(result).toEqual({ winnerId: 'absent-b', reason: 'wo_both' });
    });
  });

  describe('5. Determinismo', () => {
    it('mesma entrada produz rigorosamente a mesma saída quando chamada repetidas vezes', () => {
      const playerA: DuelPlayerInput = {
        userId: 'det-a',
        seed: 3,
        totalScore: 3000,
        totalDistanceMeters: 400,
        lastGuessAt: '2026-09-17T15:00:00.000Z',
        guessesCount: 3,
      };
      const playerB: DuelPlayerInput = {
        userId: 'det-b',
        seed: 7,
        totalScore: 3000,
        totalDistanceMeters: 400,
        lastGuessAt: '2026-09-17T15:00:00.000Z',
        guessesCount: 3,
      };

      const res1 = resolveDuel(playerA, playerB);
      const res2 = resolveDuel(playerA, playerB);

      expect(res1).toEqual(res2);
      expect(res1.winnerId).toBe('det-a');
    });
  });

  describe('6. Relógio da Rodada (calculateRoundStartedAt)', () => {
    it('calcula started_at rigorosamente com a fórmula opens_at + (N - 1) * round_duration_seconds', () => {
      const opensAt = '2026-09-17T12:00:00.000Z';
      const durationSeconds = 60;

      const r1 = calculateRoundStartedAt(opensAt, 1, durationSeconds);
      expect(r1.toISOString()).toBe('2026-09-17T12:00:00.000Z');

      const r2 = calculateRoundStartedAt(opensAt, 2, durationSeconds);
      expect(r2.toISOString()).toBe('2026-09-17T12:01:00.000Z');

      const r3 = calculateRoundStartedAt(opensAt, 3, durationSeconds);
      expect(r3.toISOString()).toBe('2026-09-17T12:02:00.000Z');

      const r5 = calculateRoundStartedAt(opensAt, 5, durationSeconds);
      expect(r5.toISOString()).toBe('2026-09-17T12:04:00.000Z');
    });

    it('funciona com durações não padrão (ex: 45s e 120s)', () => {
      const opensAt = new Date('2026-09-17T10:00:00.000Z');

      const r3_45s = calculateRoundStartedAt(opensAt, 3, 45);
      expect(r3_45s.getTime()).toBe(opensAt.getTime() + 90 * 1000);

      const r4_120s = calculateRoundStartedAt(opensAt, 4, 120);
      expect(r4_120s.getTime()).toBe(opensAt.getTime() + 360 * 1000);
    });
  });
});
