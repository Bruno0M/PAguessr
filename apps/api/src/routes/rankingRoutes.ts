import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { and, asc, desc, eq, gte, isNotNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { games, users } from '../db/schema.js';
import { requireAuth } from '../auth/session.js';
import { getWeekStartBRT } from '../ranking/period.js';

type Period = 'semana' | 'geral';

interface RankingEntry {
  userId: string;
  nick: string;
  avatarId: number;
  score: number;
  achievedAt: string;
  position: number;
}

export const rankingRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  app.get(
    '/ranking',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            period: { type: 'string', enum: ['semana', 'geral'], default: 'geral' },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            offset: { type: 'integer', minimum: 0, default: 0 },
          },
        },
      },
    },
    async (request, reply) => {
      const { period, limit, offset } = request.query as {
        period: Period;
        limit: number;
        offset: number;
      };

      const bestPerUser = await db
        .selectDistinctOn([games.user_id], {
          userId: games.user_id,
          score: games.total_score,
          // Sempre não-nulo aqui: o WHERE abaixo já filtra isNotNull(finished_at).
          achievedAt: games.finished_at,
          nick: users.nick,
          avatarId: users.avatar_id,
        })
        .from(games)
        .innerJoin(users, eq(games.user_id, users.id))
        .where(
          and(
            isNotNull(games.finished_at),
            period === 'semana' ? gte(games.finished_at, getWeekStartBRT()) : undefined
          )
        )
        .orderBy(games.user_id, desc(games.total_score), asc(games.finished_at));

      const ranked: RankingEntry[] = bestPerUser
        .map((r) => ({ ...r, achievedAt: r.achievedAt as Date }))
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          const diff = a.achievedAt.getTime() - b.achievedAt.getTime();
          if (diff !== 0) return diff;
          return a.userId.localeCompare(b.userId);
        })
        .map((r, idx) => ({
          userId: r.userId,
          nick: r.nick,
          avatarId: r.avatarId,
          score: r.score,
          achievedAt: r.achievedAt.toISOString(),
          position: idx + 1,
        }));

      const entries = ranked.slice(offset, offset + limit);
      const meRow = ranked.find((r) => r.userId === request.authUser!.id);

      return reply.send({
        period,
        total: ranked.length,
        entries,
        me: meRow ? { position: meRow.position, score: meRow.score } : null,
      });
    }
  );
};
