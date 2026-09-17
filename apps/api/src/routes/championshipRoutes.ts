import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { type ChampionshipSize } from '@paguessr/shared';
import { db } from '../db/index.js';
import {
  championships,
  championshipParticipants,
  championshipMatches,
} from '../db/schema.js';
import { requireAuth } from '../auth/session.js';
import { createInitialBracket } from '../championship/bracket.js';

export const championshipRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

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

      const [champ] = await db
        .select()
        .from(championships)
        .where(eq(championships.id, id));

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
};
