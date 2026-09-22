import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { type ChampionshipSize, shuffle } from '@paguessr/shared';
import { db } from '../db/index.js';
import {
  championships,
  championshipParticipants,
  championshipMatches,
  games,
  rounds,
  locations,
  users,
  type Location,
} from '../db/schema.js';
import { requireAuth, isAdminNick } from '../auth/session.js';
import { isChampionshipsVisible, parseChampionshipsMode } from '../championship/featureFlag.js';
import { calculateRoundStartedAt, createInitialBracket } from '../championship/bracket.js';
import { advanceChampionship } from '../championship/advance.js';
import { resolveStreetviewMode } from '../streetview.js';

async function pickLocationsForMatch(
  tx: any,
  championshipId: string,
  count: number
): Promise<Location[]> {
  const allLocations: Location[] = await tx.select().from(locations);
  if (allLocations.length === 0) {
    throw new Error('Nenhum local cadastrado no sistema');
  }

  const usedRounds = await tx
    .select({ location_id: rounds.location_id })
    .from(rounds)
    .innerJoin(games, eq(rounds.game_id, games.id))
    .innerJoin(championshipMatches, eq(games.championship_match_id, championshipMatches.id))
    .where(eq(championshipMatches.championship_id, championshipId));

  const usedLocationIds = new Set(usedRounds.map((r: any) => r.location_id));
  const available = allLocations.filter((l: any) => !usedLocationIds.has(l.id));

  const pool = available.length >= count ? available : allLocations;
  const shuffled = shuffle(pool);
  const selected = shuffled.slice(0, count);

  while (selected.length < count) {
    selected.push(allLocations[selected.length % allLocations.length]);
  }

  return selected;
}

export const championshipRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', async (request, reply) => {
    const mode = parseChampionshipsMode(process.env.CHAMPIONSHIPS_MODE);
    const isAdmin = request.authUser ? isAdminNick(request.authUser.nick) : false;
    if (!isChampionshipsVisible(mode, isAdmin)) {
      return reply.status(404).send({ error: 'Não encontrado' });
    }
  });

  app.get('/championships', async (request, reply) => {
    const user = request.authUser!;

    const list = await db
      .select({
        id: championships.id,
        title: championships.title,
        description: championships.description,
        banner_url: championships.banner_url,
        banner: championships.banner_url,
        status: championships.status,
        max_participants: championships.max_participants,
        rounds_per_match: championships.rounds_per_match,
        round_duration_seconds: championships.round_duration_seconds,
        phase_interval_seconds: championships.phase_interval_seconds,
        created_at: championships.created_at,
        seeded_at: championships.seeded_at,
        started_at: championships.started_at,
        finished_at: championships.finished_at,
        participants: sql<number>`coalesce((
          select count(*)::int
          from ${championshipParticipants}
          where ${championshipParticipants.championship_id} = ${championships.id}
        ), 0)`,
        joined: sql<boolean>`exists(
          select 1
          from ${championshipParticipants}
          where ${championshipParticipants.championship_id} = ${championships.id}
            and ${championshipParticipants.user_id} = ${user.id}
        )`,
      })
      .from(championships)
      .orderBy(desc(championships.created_at));

    return reply.send(list);
  });

  app.get<{ Params: { id: string } }>(
    '/championships/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.authUser!;
      const { id } = request.params;

      const [champ] = await db.select().from(championships).where(eq(championships.id, id));

      if (!champ) {
        return reply.status(404).send({ error: 'Campeonato não encontrado' });
      }

      if (champ.status === 'em_andamento') {
        try {
          await advanceChampionship(id);
        } catch {
          // Ignora erro transitório para não quebrar a visualização
        }
      }

      const [latestChamp] = await db.select().from(championships).where(eq(championships.id, id));

      const participants = await db
        .select({
          userId: championshipParticipants.user_id,
          user_id: championshipParticipants.user_id,
          nick: users.nick,
          avatarId: users.avatar_id,
          avatar_id: users.avatar_id,
          seed: championshipParticipants.seed,
          joinedAt: championshipParticipants.joined_at,
          joined_at: championshipParticipants.joined_at,
          eliminatedInPhase: championshipParticipants.eliminated_in_phase,
          eliminated_in_phase: championshipParticipants.eliminated_in_phase,
        })
        .from(championshipParticipants)
        .innerJoin(users, eq(championshipParticipants.user_id, users.id))
        .where(eq(championshipParticipants.championship_id, id));

      const rawMatches = await db
        .select()
        .from(championshipMatches)
        .where(eq(championshipMatches.championship_id, id))
        .orderBy(asc(championshipMatches.phase), asc(championshipMatches.slot));

      const userMap = new Map(participants.map((p) => [p.userId, p]));

      const matches = rawMatches.map((m) => {
        const playerA = m.player_a_id ? userMap.get(m.player_a_id) : null;
        const playerB = m.player_b_id ? userMap.get(m.player_b_id) : null;

        return {
          id: m.id,
          championshipId: m.championship_id,
          championship_id: m.championship_id,
          phase: m.phase,
          slot: m.slot,
          playerAId: m.player_a_id,
          player_a_id: m.player_a_id,
          playerBId: m.player_b_id,
          player_b_id: m.player_b_id,
          playerA: playerA
            ? { id: playerA.userId, nick: playerA.nick, avatarId: playerA.avatarId }
            : null,
          playerB: playerB
            ? { id: playerB.userId, nick: playerB.nick, avatarId: playerB.avatarId }
            : null,
          gameAId: m.game_a_id,
          game_a_id: m.game_a_id,
          gameBId: m.game_b_id,
          game_b_id: m.game_b_id,
          scoreA: m.score_a,
          score_a: m.score_a,
          scoreB: m.score_b,
          score_b: m.score_b,
          winnerId: m.winner_id,
          winner_id: m.winner_id,
          opensAt: m.opens_at?.toISOString() ?? null,
          opens_at: m.opens_at?.toISOString() ?? null,
          resolvedAt: m.resolved_at?.toISOString() ?? null,
          resolved_at: m.resolved_at?.toISOString() ?? null,
        };
      });

      const joined = participants.some((p) => p.userId === user.id);
      const participantRecord = participants.find((p) => p.userId === user.id);

      let myMatch = null;
      let myStatus:
        | 'not_joined'
        | 'waiting'
        | 'ready_to_play'
        | 'waiting_next_phase'
        | 'eliminated'
        | 'spectator' = 'not_joined';

      if (!joined) {
        myStatus = 'not_joined';
      } else if (
        participantRecord?.eliminatedInPhase !== null &&
        participantRecord?.eliminatedInPhase !== undefined
      ) {
        myStatus = 'eliminated';
      } else if (latestChamp.status === 'chaveado') {
        myStatus = 'waiting';
        myMatch =
          matches.find(
            (m) => m.phase === 1 && (m.playerAId === user.id || m.playerBId === user.id)
          ) ?? null;
      } else if (latestChamp.status === 'em_andamento') {
        const userMatches = matches.filter(
          (m) => m.playerAId === user.id || m.playerBId === user.id
        );
        const currentMatch =
          userMatches.find((m) => m.resolvedAt === null) ?? userMatches[userMatches.length - 1];
        myMatch = currentMatch ?? null;

        if (currentMatch && currentMatch.opensAt) {
          myStatus = 'ready_to_play';
        } else {
          myStatus = 'waiting_next_phase';
        }
      } else if (latestChamp.status === 'finalizado') {
        myStatus = 'spectator';
      }

      return reply.send({
        id: latestChamp.id,
        title: latestChamp.title,
        description: latestChamp.description,
        banner_url: latestChamp.banner_url,
        banner: latestChamp.banner_url,
        status: latestChamp.status,
        max_participants: latestChamp.max_participants,
        rounds_per_match: latestChamp.rounds_per_match,
        round_duration_seconds: latestChamp.round_duration_seconds,
        phase_interval_seconds: latestChamp.phase_interval_seconds,
        created_by: latestChamp.created_by,
        created_at: latestChamp.created_at.toISOString(),
        seeded_at: latestChamp.seeded_at?.toISOString() ?? null,
        started_at: latestChamp.started_at?.toISOString() ?? null,
        finished_at: latestChamp.finished_at?.toISOString() ?? null,
        participants,
        matches,
        joined,
        myMatch,
        myStatus,
      });
    }
  );

  app.post<{ Params: { id: string } }>(
    '/championships/:id/join',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.authUser!;
      const { id } = request.params;

      const result = await db.transaction(async (tx) => {
        const [champ] = await tx
          .select()
          .from(championships)
          .where(eq(championships.id, id))
          .for('update');

        if (!champ) {
          return { status: 404, error: 'Campeonato não encontrado' };
        }

        if (champ.status !== 'inscricoes') {
          return {
            status: 409,
            error: `Inscrições não estão abertas para este campeonato (status: ${champ.status}).`,
          };
        }

        const [alreadyJoined] = await tx
          .select()
          .from(championshipParticipants)
          .where(
            and(
              eq(championshipParticipants.championship_id, id),
              eq(championshipParticipants.user_id, user.id)
            )
          );

        if (alreadyJoined) {
          return { status: 409, error: 'Jogador já inscrito neste campeonato.' };
        }

        const participants = await tx
          .select({ userId: championshipParticipants.user_id })
          .from(championshipParticipants)
          .where(eq(championshipParticipants.championship_id, id));

        if (participants.length >= champ.max_participants) {
          return { status: 409, error: 'Campeonato lotado.' };
        }

        await tx.insert(championshipParticipants).values({
          championship_id: id,
          user_id: user.id,
        });

        const newCount = participants.length + 1;
        let seeded = false;

        if (newCount === champ.max_participants) {
          const allParticipants = [...participants, { userId: user.id }];
          const { seededParticipants, matches } = createInitialBracket(
            allParticipants,
            champ.max_participants as ChampionshipSize
          );

          for (const p of seededParticipants) {
            await tx
              .update(championshipParticipants)
              .set({ seed: p.seed })
              .where(
                and(
                  eq(championshipParticipants.championship_id, id),
                  eq(championshipParticipants.user_id, p.userId)
                )
              );
          }

          await tx.insert(championshipMatches).values(
            matches.map((m) => ({
              championship_id: id,
              phase: m.phase,
              slot: m.slot,
              player_a_id: m.playerAId,
              player_b_id: m.playerBId,
            }))
          );

          await tx
            .update(championships)
            .set({
              status: 'chaveado',
              seeded_at: new Date(),
            })
            .where(eq(championships.id, id));

          seeded = true;
        }

        return { status: 200, joined: true, seeded };
      });

      if (result.status !== 200) {
        return reply.status(result.status).send({ error: result.error });
      }

      return reply.send({
        success: true,
        seeded: result.seeded,
        status: result.seeded ? 'chaveado' : 'inscricoes',
      });
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/championships/:id/join',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.authUser!;
      const { id } = request.params;

      const [champ] = await db.select().from(championships).where(eq(championships.id, id));

      if (!champ) {
        return reply.status(404).send({ error: 'Campeonato não encontrado' });
      }

      if (champ.status !== 'inscricoes') {
        return reply.status(409).send({
          error: 'Não é possível cancelar inscrição após o encerramento das inscrições.',
        });
      }

      const [deleted] = await db
        .delete(championshipParticipants)
        .where(
          and(
            eq(championshipParticipants.championship_id, id),
            eq(championshipParticipants.user_id, user.id)
          )
        )
        .returning();

      if (!deleted) {
        return reply.status(404).send({ error: 'Jogador não está inscrito neste campeonato.' });
      }

      return reply.status(204).send();
    }
  );

  app.post<{ Params: { id: string; matchId: string } }>(
    '/championships/:id/matches/:matchId/enter',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id', 'matchId'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            matchId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.authUser!;
      const { id, matchId } = request.params;

      const result = await db.transaction(async (tx) => {
        const [champ] = await tx
          .select()
          .from(championships)
          .where(eq(championships.id, id))
          .for('update');

        if (!champ) {
          return { status: 404, error: 'Campeonato não encontrado' };
        }

        if (champ.status !== 'em_andamento') {
          return {
            status: 409,
            error: `Campeonato não está em andamento (status: ${champ.status}).`,
          };
        }

        const [match] = await tx
          .select()
          .from(championshipMatches)
          .where(
            and(eq(championshipMatches.id, matchId), eq(championshipMatches.championship_id, id))
          )
          .for('update');

        if (!match) {
          return { status: 404, error: 'Confronto não encontrado' };
        }

        const isPlayerA = match.player_a_id === user.id;
        const isPlayerB = match.player_b_id === user.id;
        if (!isPlayerA && !isPlayerB) {
          return { status: 403, error: 'Jogador não faz parte deste confronto.' };
        }

        if (!match.opens_at) {
          return { status: 409, error: 'Fase do confronto ainda não foi aberta.' };
        }

        let gameAId = match.game_a_id;
        let gameBId = match.game_b_id;

        if (!gameAId && !gameBId) {
          const selectedLocations = await pickLocationsForMatch(tx, id, champ.rounds_per_match);

          const modes = await Promise.all(selectedLocations.map(() => resolveStreetviewMode()));

          if (match.player_a_id) {
            const [gameA] = await tx
              .insert(games)
              .values({
                user_id: match.player_a_id,
                championship_match_id: match.id,
              })
              .returning();
            gameAId = gameA.id;

            const roundsA = selectedLocations.map((loc, idx) => ({
              game_id: gameA.id,
              location_id: loc.id,
              ordem: idx + 1,
              streetview_mode: modes[idx],
              duration_seconds: champ.round_duration_seconds,
              started_at: calculateRoundStartedAt(
                match.opens_at!,
                idx + 1,
                champ.round_duration_seconds
              ),
            }));
            await tx.insert(rounds).values(roundsA);
          }

          if (match.player_b_id) {
            const [gameB] = await tx
              .insert(games)
              .values({
                user_id: match.player_b_id,
                championship_match_id: match.id,
              })
              .returning();
            gameBId = gameB.id;

            const roundsB = selectedLocations.map((loc, idx) => ({
              game_id: gameB.id,
              location_id: loc.id,
              ordem: idx + 1,
              streetview_mode: modes[idx],
              duration_seconds: champ.round_duration_seconds,
              started_at: calculateRoundStartedAt(
                match.opens_at!,
                idx + 1,
                champ.round_duration_seconds
              ),
            }));
            await tx.insert(rounds).values(roundsB);
          }

          await tx
            .update(championshipMatches)
            .set({
              game_a_id: gameAId,
              game_b_id: gameBId,
            })
            .where(eq(championshipMatches.id, match.id));
        }

        const myGameId = isPlayerA ? gameAId : gameBId;
        if (!myGameId) {
          return { status: 500, error: 'Falha ao recuperar partida do jogador.' };
        }

        const myRounds = await tx
          .select()
          .from(rounds)
          .where(eq(rounds.game_id, myGameId))
          .orderBy(asc(rounds.ordem));

        return {
          status: 200,
          data: {
            gameId: myGameId,
            game_id: myGameId,
            rounds: myRounds.map((r) => ({
              id: r.id,
              order: r.ordem,
              ordem: r.ordem,
              startedAt: r.started_at?.toISOString() ?? null,
              started_at: r.started_at?.toISOString() ?? null,
              durationSeconds: r.duration_seconds,
              duration_seconds: r.duration_seconds,
              streetview_mode: r.streetview_mode,
            })),
          },
        };
      });

      if (result.status !== 200) {
        return reply.status(result.status).send({ error: result.error });
      }

      return reply.send(result.data);
    }
  );

  app.get<{ Params: { id: string; matchId: string } }>(
    '/championships/:id/matches/:matchId/live',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id', 'matchId'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            matchId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.authUser!;
      const { id, matchId } = request.params;

      const [champ] = await db.select().from(championships).where(eq(championships.id, id));

      if (!champ) {
        return reply.status(404).send({ error: 'Campeonato não encontrado' });
      }

      if (champ.status === 'em_andamento') {
        try {
          await advanceChampionship(id);
        } catch {
          // Não bloqueia a leitura
        }
      }

      const [match] = await db
        .select()
        .from(championshipMatches)
        .where(
          and(eq(championshipMatches.id, matchId), eq(championshipMatches.championship_id, id))
        );

      if (!match) {
        return reply.status(404).send({ error: 'Confronto não encontrado' });
      }

      const isPlayerA = match.player_a_id === user.id;
      const isPlayerB = match.player_b_id === user.id;
      if (!isPlayerA && !isPlayerB) {
        return reply.status(403).send({ error: 'Jogador não faz parte deste confronto.' });
      }

      const myGameId = isPlayerA ? match.game_a_id : match.game_b_id;
      const oppGameId = isPlayerA ? match.game_b_id : match.game_a_id;

      let currentRound = 1;
      if (match.opens_at) {
        const elapsedMs = Math.max(0, Date.now() - match.opens_at.getTime());
        const roundDurationMs = champ.round_duration_seconds * 1000;
        const calculated = Math.floor(elapsedMs / roundDurationMs) + 1;
        currentRound = Math.min(champ.rounds_per_match, Math.max(1, calculated));
      }

      let myScore = 0;
      if (myGameId) {
        const myRounds = await db
          .select({ pontos: rounds.pontos })
          .from(rounds)
          .where(eq(rounds.game_id, myGameId));
        myScore = myRounds.reduce((acc, r) => acc + (r.pontos ?? 0), 0);
      }

      let opponentRoundsAnswered = 0;
      if (oppGameId) {
        const oppRounds = await db
          .select({
            pontos: rounds.pontos,
            guess_lat: rounds.guess_lat,
          })
          .from(rounds)
          .where(eq(rounds.game_id, oppGameId));
        opponentRoundsAnswered = oppRounds.filter(
          (r) => r.pontos !== null || r.guess_lat !== null
        ).length;
      }

      return reply.send({
        currentRound,
        current_round: currentRound,
        myScore,
        my_score: myScore,
        opponentRoundsAnswered,
        opponent_rounds_answered: opponentRoundsAnswered,
        resolvedAt: match.resolved_at?.toISOString() ?? null,
        resolved_at: match.resolved_at?.toISOString() ?? null,
        winnerId: match.winner_id,
        winner_id: match.winner_id,
      });
    }
  );
};
