import { phasesFor, shuffle, type ChampionshipSize } from '@paguessr/shared';

export interface ParticipantSeedInput {
  userId: string;
}

export interface ParticipantWithSeed {
  userId: string;
  seed: number;
}

export interface BracketMatch {
  phase: number;
  slot: number;
  playerAId: string | null;
  playerBId: string | null;
}

export interface NextMatchDestination {
  phase: number;
  slot: number;
  side: 'player_a' | 'player_b';
}

export interface DuelPlayerInput {
  userId: string;
  seed: number;
  totalScore: number;
  totalDistanceMeters: number;
  lastGuessAt?: Date | string | number | null;
  guessesCount?: number;
  hasGuessedAtLeastOnce?: boolean;
}

export type DuelResolutionReason =
  'points' | 'distance' | 'time' | 'seed' | 'wo_single' | 'wo_both';

export interface DuelResolutionResult {
  winnerId: string;
  reason: DuelResolutionReason;
}

export function assignSeeds<T extends ParticipantSeedInput>(
  participants: T[]
): Array<T & { seed: number }> {
  const shuffled = shuffle(participants);
  return shuffled.map((p, index) => ({
    ...p,
    seed: index,
  }));
}

export function generateBracket(
  seededParticipants: ParticipantWithSeed[],
  maxParticipants: ChampionshipSize
): BracketMatch[] {
  const totalPhases = phasesFor(maxParticipants);
  const matches: BracketMatch[] = [];

  const participantsBySeed = new Map<number, ParticipantWithSeed>();
  for (const p of seededParticipants) {
    participantsBySeed.set(p.seed, p);
  }

  const phase1MatchesCount = maxParticipants / 2;
  for (let slot = 0; slot < phase1MatchesCount; slot++) {
    const seedA = 2 * slot;
    const seedB = 2 * slot + 1;
    matches.push({
      phase: 1,
      slot,
      playerAId: participantsBySeed.get(seedA)?.userId ?? null,
      playerBId: participantsBySeed.get(seedB)?.userId ?? null,
    });
  }

  let currentMatchesCount = phase1MatchesCount / 2;
  for (let phase = 2; phase <= totalPhases; phase++) {
    for (let slot = 0; slot < currentMatchesCount; slot++) {
      matches.push({
        phase,
        slot,
        playerAId: null,
        playerBId: null,
      });
    }
    currentMatchesCount = currentMatchesCount / 2;
  }

  return matches;
}

export function createInitialBracket(
  participants: ParticipantSeedInput[],
  maxParticipants: ChampionshipSize
): { seededParticipants: ParticipantWithSeed[]; matches: BracketMatch[] } {
  const seeded = assignSeeds(participants);
  const matches = generateBracket(seeded, maxParticipants);
  return { seededParticipants: seeded, matches };
}

export function getNextMatchDestination(phase: number, slot: number): NextMatchDestination {
  return {
    phase: phase + 1,
    slot: Math.floor(slot / 2),
    side: slot % 2 === 0 ? 'player_a' : 'player_b',
  };
}

function isPlayerPresent(player: DuelPlayerInput): boolean {
  if (player.hasGuessedAtLeastOnce !== undefined) {
    return player.hasGuessedAtLeastOnce;
  }
  if (player.guessesCount !== undefined) {
    return player.guessesCount > 0;
  }
  return player.lastGuessAt != null || player.totalScore > 0;
}

export function resolveDuel(
  playerA: DuelPlayerInput,
  playerB: DuelPlayerInput
): DuelResolutionResult {
  const presentA = isPlayerPresent(playerA);
  const presentB = isPlayerPresent(playerB);

  if (!presentA && !presentB) {
    const winnerId = playerA.seed < playerB.seed ? playerA.userId : playerB.userId;
    return { winnerId, reason: 'wo_both' };
  }

  if (presentA && !presentB) {
    return { winnerId: playerA.userId, reason: 'wo_single' };
  }

  if (!presentA && presentB) {
    return { winnerId: playerB.userId, reason: 'wo_single' };
  }

  if (playerA.totalScore > playerB.totalScore) {
    return { winnerId: playerA.userId, reason: 'points' };
  }
  if (playerB.totalScore > playerA.totalScore) {
    return { winnerId: playerB.userId, reason: 'points' };
  }

  if (playerA.totalDistanceMeters < playerB.totalDistanceMeters) {
    return { winnerId: playerA.userId, reason: 'distance' };
  }
  if (playerB.totalDistanceMeters < playerA.totalDistanceMeters) {
    return { winnerId: playerB.userId, reason: 'distance' };
  }

  const timeA = playerA.lastGuessAt ? new Date(playerA.lastGuessAt).getTime() : Infinity;
  const timeB = playerB.lastGuessAt ? new Date(playerB.lastGuessAt).getTime() : Infinity;
  if (timeA < timeB) {
    return { winnerId: playerA.userId, reason: 'time' };
  }
  if (timeB < timeA) {
    return { winnerId: playerB.userId, reason: 'time' };
  }

  const winnerId = playerA.seed < playerB.seed ? playerA.userId : playerB.userId;
  return { winnerId, reason: 'seed' };
}

export function calculateRoundStartedAt(
  opensAt: Date | string | number,
  roundNumber: number,
  roundDurationSeconds: number
): Date {
  const opensAtMs = new Date(opensAt).getTime();
  const offsetSeconds = (roundNumber - 1) * roundDurationSeconds;
  return new Date(opensAtMs + offsetSeconds * 1000);
}
