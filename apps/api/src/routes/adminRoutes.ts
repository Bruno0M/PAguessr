import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { db } from '../db/index.js';
import { locations } from '../db/schema.js';
import { requireAdmin } from '../auth/session.js';

export const adminRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAdmin);

  app.get('/admin/locations', async (_request, reply) => {
    const allLocations = await db
      .select({
        id: locations.id,
        lat: locations.lat,
        lng: locations.lng,
        source: locations.source,
        captured_at: locations.captured_at,
        pano_id: locations.pano_id,
      })
      .from(locations)
      .orderBy(locations.id);

    return reply.send(allLocations);
  });
};
