import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { type RankingEntry } from '@paguessr/shared';
import { db } from '../db/index.js';
import { games } from '../db/schema.js';
import { requireAuth } from '../auth/session.js';
import { calculateRanking } from '../ranking/ranking.js';

export const fraudNoticeRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  app.get('/me/fraud-notice', async (request, reply) => {
    const userId = request.authUser!.id;

    const unackGames = await db
      .select({
        id: games.id,
        totalScore: games.total_score,
      })
      .from(games)
      .where(
        and(
          eq(games.user_id, userId),
          isNotNull(games.flagged_reason),
          isNull(games.flag_acknowledged_at)
        )
      );

    if (unackGames.length === 0) {
      return reply.send({ pending: false });
    }

    const penalty = unackGames.reduce((sum, g) => sum + g.totalScore, 0);

    const currentRanked = await calculateRanking('geral');
    const afterRow = currentRanked.find((r) => r.userId === userId);
    const after = afterRow
      ? { position: afterRow.position, score: afterRow.score }
      : { position: currentRanked.length + 1, score: 0 };

    const unflagGameIds = new Set(unackGames.map((g) => g.id));
    const beforeRanked = await calculateRanking('geral', { unflagGameIds });
    const beforeRow = beforeRanked.find((r) => r.userId === userId);
    const before = beforeRow ? { position: beforeRow.position, score: beforeRow.score } : null;

    const total = currentRanked.length;
    const others = currentRanked.filter((r) => r.userId !== userId);

    const startPos = before ? before.position - 2 : 1;
    const endPos = after.position + 2;

    const inRange = others.filter((r) => r.position >= startPos && r.position <= endPos);

    let entries: RankingEntry[];
    let gap: boolean;

    if (inRange.length > 60) {
      entries = [...inRange.slice(0, 30), ...inRange.slice(-30)];
      gap = true;
    } else {
      entries = inRange;
      gap = false;
    }

    return reply.send({
      pending: true,
      penalty,
      before,
      after,
      total,
      entries,
      gap,
    });
  });

  app.post('/me/fraud-notice/ack', async (request, reply) => {
    const userId = request.authUser!.id;

    await db
      .update(games)
      .set({ flag_acknowledged_at: new Date() })
      .where(
        and(
          eq(games.user_id, userId),
          isNotNull(games.flagged_reason),
          isNull(games.flag_acknowledged_at)
        )
      );

    return reply.status(204).send();
  });
};
