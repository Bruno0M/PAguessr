import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { sql } from './db/index.js';
import { gameRoutes } from './routes/gameRoutes.js';

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info'
    }
  });

  app.register(cors, {
    origin: true
  });

  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (req, body, done) => {
      const text = typeof body === 'string' ? body.trim() : '';
      if (!text) {
        return done(null, {});
      }
      try {
        done(null, JSON.parse(text));
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  const healthHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await sql`SELECT 1`;
      return {
        status: 'ok',
        database: 'connected'
      };
    } catch (error) {
      request.log.error({ err: error }, 'Falha na verificação do banco de dados');
      return reply.status(503).send({
        status: 'error',
        database: 'disconnected'
      });
    }
  };

  app.get('/health', healthHandler);
  app.get('/api/health', healthHandler);

  app.register(gameRoutes, { prefix: '/api' });
  app.register(gameRoutes);

  return app;
}
