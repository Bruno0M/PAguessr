import { expect } from 'vitest';
import { and, asc, eq } from 'drizzle-orm';
import type { buildApp } from '../app.js';
import { db } from '../db/index.js';
import { championships, championshipMatches, locations, rounds, users } from '../db/schema.js';
import { extractSessionCookie, registerUser } from './authHelpers.js';

// Helpers dos testes de duelo, compartilhados entre os arquivos de campeonato.
// Palpite de verdade pelo endpoint: `games.total_score` só é atualizado por ele,
// então UPDATE direto em `rounds.pontos` não conta pro placar consolidado.

export type TestApp = ReturnType<typeof buildApp>;

export async function loginNewUser(
  app: ReturnType<typeof buildApp>,
  nick: string
): Promise<{ cookie: string; userId: string }> {
  const res = await registerUser(app, { nick });
  if (res.statusCode !== 201) {
    throw new Error(`Failed to register user ${nick}: ${res.statusCode} ${res.body}`);
  }
  const cookie = extractSessionCookie(res.headers['set-cookie']);
  const [user] = await db.select().from(users).where(eq(users.nick, nick));
  return { cookie, userId: user.id };
}

export function createDuelHelpers(app: TestApp) {
  async function setupActiveChampionship(options: {
    maxParticipants?: number;
    roundsPerMatch?: number;
    roundDurationSeconds?: number;
    phaseIntervalSeconds?: number;
    prefix: string;
  }) {
    const count = options.maxParticipants ?? 4;
    const host = await loginNewUser(app, `${options.prefix}_host`);
    const [champ] = await db
      .insert(championships)
      .values({
        title: `Torneio ${options.prefix}`,
        max_participants: count,
        rounds_per_match: options.roundsPerMatch ?? 3,
        round_duration_seconds: options.roundDurationSeconds ?? 60,
        phase_interval_seconds: options.phaseIntervalSeconds ?? 3600,
        status: 'inscricoes',
        created_by: host.userId,
      })
      .returning();

    const players = [];
    for (let i = 0; i < count; i++) {
      const p = await loginNewUser(app, `${options.prefix}_p${i}`);
      players.push(p);
      await app.inject({
        method: 'POST',
        url: `/api/championships/${champ.id}/join`,
        headers: { cookie: p.cookie },
      });
    }

    const now = new Date();
    await db
      .update(championships)
      .set({ status: 'em_andamento', started_at: now })
      .where(eq(championships.id, champ.id));

    await db
      .update(championshipMatches)
      .set({ opens_at: now })
      .where(
        and(eq(championshipMatches.championship_id, champ.id), eq(championshipMatches.phase, 1))
      );

    const matches = await db
      .select()
      .from(championshipMatches)
      .where(eq(championshipMatches.championship_id, champ.id))
      .orderBy(asc(championshipMatches.phase), asc(championshipMatches.slot));

    return { champ, host, players, matches };
  }

  type ActiveSetup = Awaited<ReturnType<typeof setupActiveChampionship>>;

  async function enterMatch(
    champId: string,
    matchId: string,
    player: { cookie: string }
  ): Promise<{ gameId: string; rounds: { id: number }[] }> {
    const res = await app.inject({
      method: 'POST',
      url: `/api/championships/${champId}/matches/${matchId}/enter`,
      headers: { cookie: player.cookie },
    });
    expect(res.statusCode).toBe(200);
    return JSON.parse(res.body);
  }

  async function guessRound(
    player: { cookie: string },
    roundId: number,
    point: { lat: number; lng: number } | null
  ): Promise<{ score: number; distancia: number | null }> {
    const res = await app.inject({
      method: 'POST',
      url: `/api/rounds/${roundId}/guess`,
      headers: { cookie: player.cookie },
      payload: point ?? {},
    });
    expect(res.statusCode).toBe(200);
    return JSON.parse(res.body);
  }

  async function locationOfRound(roundId: number): Promise<{ lat: number; lng: number }> {
    const [row] = await db
      .select({ lat: locations.lat, lng: locations.lng })
      .from(rounds)
      .innerJoin(locations, eq(rounds.location_id, locations.id))
      .where(eq(rounds.id, roundId));
    return row;
  }

  async function getLive(champId: string, matchId: string, player: { cookie: string }) {
    const res = await app.inject({
      method: 'GET',
      url: `/api/championships/${champId}/matches/${matchId}/live`,
      headers: { cookie: player.cookie },
    });
    expect(res.statusCode).toBe(200);
    return JSON.parse(res.body);
  }

  function sidesOf(setup: ActiveSetup) {
    const match = setup.matches[0];
    return {
      match,
      playerA: setup.players.find((p) => p.userId === match.player_a_id)!,
      playerB: setup.players.find((p) => p.userId === match.player_b_id)!,
    };
  }

  return { setupActiveChampionship, enterMatch, guessRound, locationOfRound, getLive, sidesOf };
}
