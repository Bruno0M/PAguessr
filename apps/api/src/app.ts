import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { sql } from './db/index.js';
import { gameRoutes } from './routes/gameRoutes.js';
import { authRoutes } from './routes/authRoutes.js';

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
    // A produção fala com a API atrás do nginx (ver apps/web/nginx.conf), que
    // repassa X-Forwarded-Proto. Precisamos disso pra decidir corretamente o
    // atributo `secure` do cookie de sessão por request (ver auth/session.ts).
    trustProxy: true,
  });

  app.register(cors, {
    origin: true,
    credentials: true,
  });
  app.register(cookie);

  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    const text = typeof body === 'string' ? body.trim() : '';
    if (!text) {
      return done(null, {});
    }
    try {
      done(null, JSON.parse(text));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  const healthHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await sql`SELECT 1`;
      return {
        status: 'ok',
        database: 'connected',
      };
    } catch (error) {
      request.log.error({ err: error }, 'Falha na verificação do banco de dados');
      return reply.status(503).send({
        status: 'error',
        database: 'disconnected',
      });
    }
  };

  app.get('/health', healthHandler);
  app.get('/api/health', healthHandler);

  app.register(gameRoutes, { prefix: '/api' });
  app.register(gameRoutes);
  app.register(authRoutes, { prefix: '/api' });
  app.register(authRoutes);

  return app;
}
