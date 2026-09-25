import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { type RankingPeriod } from '@paguessr/shared';
import { requireAuth } from '../auth/session.js';
import { calculateRanking } from '../ranking/ranking.js';

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
        period: RankingPeriod;
        limit: number;
        offset: number;
      };

      const ranked = await calculateRanking(period);

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
