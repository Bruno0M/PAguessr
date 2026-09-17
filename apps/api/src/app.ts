import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { sql } from './db/index.js';
import { gameRoutes } from './routes/gameRoutes.js';
import { authRoutes } from './routes/authRoutes.js';
import { rankingRoutes } from './routes/rankingRoutes.js';
import { adminRoutes } from './routes/adminRoutes.js';
import { championshipAdminRoutes } from './routes/championshipAdminRoutes.js';

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
  // global: false — só as rotas que passam `config.rateLimit` (login e
  // recuperação de senha, ver authRoutes.ts) ficam limitadas; o resto do
  // jogo continua sem limite.
  app.register(rateLimit, { global: false });

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

  const configHandler = async () => {
    return {
      googleMapsBrowserKey: process.env.GOOGLE_MAPS_BROWSER_KEY || '',
    };
  };

  app.get('/config', configHandler);
  app.get('/api/config', configHandler);

  app.register(gameRoutes, { prefix: '/api' });
  app.register(gameRoutes);
  app.register(authRoutes, { prefix: '/api' });
  app.register(authRoutes);
  app.register(rankingRoutes, { prefix: '/api' });
  app.register(rankingRoutes);
  app.register(adminRoutes, { prefix: '/api' });
  app.register(adminRoutes);
  app.register(championshipAdminRoutes, { prefix: '/api' });
  app.register(championshipAdminRoutes);

  return app;
}
