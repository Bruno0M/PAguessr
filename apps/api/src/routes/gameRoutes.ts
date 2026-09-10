import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { haversine, score, LatLng } from '@paguessr/shared';
import { db } from '../db/index.js';
import { games, locations, rounds } from '../db/schema.js';

export const gameRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post('/games', async (request, reply) => {
    const allLocations = await db.select().from(locations);

    if (allLocations.length < 5) {
      return reply.status(500).send({
        error: 'Não há locais cadastrados suficientes para iniciar uma partida (mínimo 5)'
      });
    }

    const shuffled = [...allLocations].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 5);

    const [newGame] = await db.insert(games).values({}).returning();

    const createdRounds = await db
      .insert(rounds)
      .values(
        selected.map((loc, idx) => ({
          game_id: newGame.id,
          location_id: loc.id,
          ordem: idx + 1
        }))
      )
      .returning();

    createdRounds.sort((a, b) => a.ordem - b.ordem);

    return reply.status(201).send({
      id: newGame.id,
      rounds: createdRounds.map((r) => ({
        id: r.id,
        ordem: r.ordem,
        order: r.ordem
      }))
    });
  });

  app.get(
    '/games/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' }
          }
        }
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const [game] = await db.select().from(games).where(eq(games.id, id));
      if (!game) {
        return reply.status(404).send({ error: 'Partida não encontrada' });
      }

      const gameRounds = await db
        .select({
          id: rounds.id,
          ordem: rounds.ordem,
          guess_lat: rounds.guess_lat,
          guess_lng: rounds.guess_lng,
          distancia: rounds.distancia,
          pontos: rounds.pontos,
          created_at: rounds.created_at,
          location_lat: locations.lat,
          location_lng: locations.lng
        })
        .from(rounds)
        .innerJoin(locations, eq(rounds.location_id, locations.id))
        .where(eq(rounds.game_id, id))
        .orderBy(rounds.ordem);

      const mappedRounds = gameRounds.map((r) => {
        const isAnswered = r.distancia !== null;
        return {
          id: r.id,
          ordem: r.ordem,
          order: r.ordem,
          guess_lat: r.guess_lat,
          guess_lng: r.guess_lng,
          guess:
            isAnswered && r.guess_lat !== null && r.guess_lng !== null
              ? { lat: r.guess_lat, lng: r.guess_lng }
              : null,
          distancia: r.distancia,
          distance: r.distancia,
          pontos: r.pontos,
          score: r.pontos,
          ...(isAnswered
            ? { location: { lat: r.location_lat, lng: r.location_lng } }
            : {})
        };
      });

      return reply.send({
        id: game.id,
        total_score: game.total_score,
        totalScore: game.total_score,
        score: game.total_score,
        created_at: game.created_at.toISOString(),
        finished_at: game.finished_at ? game.finished_at.toISOString() : null,
        rounds: mappedRounds
      });
    }
  );

  app.get(
    '/rounds/:id/image',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'integer', minimum: 1 }
          }
        }
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: number };

      const [round] = await db.select().from(rounds).where(eq(rounds.id, id));
      if (!round) {
        return reply.status(404).send({ error: 'Rodada não encontrada' });
      }

      const [loc] = await db
        .select()
        .from(locations)
        .where(eq(locations.id, round.location_id));
      if (!loc) {
        return reply.status(404).send({ error: 'Local não encontrado' });
      }

      const apiKey =
        process.env.GOOGLE_MAPS_API_KEY ||
        process.env.GOOGLE_STREET_VIEW_API_KEY;

      if (apiKey) {
        try {
          const usePano =
            loc.pano_id &&
            !loc.pano_id.startsWith('mock-') &&
            !loc.pano_id.startsWith('seed-');

          const params = new URLSearchParams({
            size: '800x600',
            fov: '90',
            heading: '0',
            pitch: '0',
            return_error_code: 'true',
            key: apiKey
          });

          if (usePano) {
            params.set('pano', loc.pano_id);
          } else {
            params.set('location', `${loc.lat},${loc.lng}`);
            params.set('source', 'outdoor');
          }

          const googleUrl = `https://maps.googleapis.com/maps/api/streetview?${params.toString()}`;
          const res = await fetch(googleUrl, { signal: AbortSignal.timeout(6000) });
          if (res.ok) {
            const contentType = res.headers.get('content-type') || 'image/jpeg';
            const buffer = Buffer.from(await res.arrayBuffer());
            return reply
              .type(contentType)
              .header('Cache-Control', 'public, max-age=86400')
              .send(buffer);
          }
        } catch {
          // prossegue para o fallback se a API do Google falhar
        }
      }

      const svgPlaceholder = `
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#090d16" />
      <stop offset="100%" stop-color="#1e293b" />
    </linearGradient>
    <linearGradient id="glow" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0284c7" />
      <stop offset="100%" stop-color="#38bdf8" />
    </linearGradient>
  </defs>
  <rect width="800" height="600" fill="url(#sky)" />
  <circle cx="400" cy="220" r="80" fill="#0284c7" opacity="0.15" />
  <circle cx="400" cy="220" r="55" fill="#38bdf8" opacity="0.25" />
  <path d="M400 170 C378 170 360 188 360 210 C360 240 400 280 400 280 C400 280 440 240 440 210 C440 188 422 170 400 170 Z" fill="url(#glow)" />
  <circle cx="400" cy="205" r="12" fill="#090d16" />
  <text x="400" y="340" fill="#f8fafc" font-family="system-ui, -apple-system, sans-serif" font-size="32" font-weight="800" text-anchor="middle" letter-spacing="1">PAguessr</text>
  <text x="400" y="380" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="18" text-anchor="middle">Paulo Afonso - Bahia</text>
  <rect x="230" y="420" width="340" height="46" rx="10" fill="#1e293b" stroke="#334155" stroke-width="1" />
  <text x="400" y="449" fill="#38bdf8" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="600" text-anchor="middle">Street View Placeholder • Rodada #${round.ordem}</text>
</svg>`.trim();

      return reply
        .type('image/svg+xml')
        .header('Cache-Control', 'public, max-age=3600')
        .send(svgPlaceholder);
    }
  );

  app.post(
    '/rounds/:id/guess',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'integer', minimum: 1 }
          }
        },
        body: {
          type: 'object',
          required: ['lat', 'lng'],
          properties: {
            lat: { type: 'number', minimum: -90, maximum: 90 },
            lng: { type: 'number', minimum: -180, maximum: 180 }
          }
        }
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: number };
      const body = request.body as { lat: number; lng: number };

      const [round] = await db.select().from(rounds).where(eq(rounds.id, id));
      if (!round) {
        return reply.status(404).send({ error: 'Rodada não encontrada' });
      }

      if (round.distancia !== null || round.guess_lat !== null) {
        return reply
          .status(409)
          .send({ error: 'Palpite já registrado para esta rodada' });
      }

      const [loc] = await db
        .select()
        .from(locations)
        .where(eq(locations.id, round.location_id));
      if (!loc) {
        return reply.status(404).send({ error: 'Local não encontrado' });
      }

      const guessPoint: LatLng = { lat: body.lat, lng: body.lng };
      const actualPoint: LatLng = { lat: loc.lat, lng: loc.lng };

      const rawDist = haversine(guessPoint, actualPoint);
      const roundedDist = Math.round(rawDist * 10) / 10;
      const roundScore = score(roundedDist);

      await db
        .update(rounds)
        .set({
          guess_lat: body.lat,
          guess_lng: body.lng,
          distancia: roundedDist,
          pontos: roundScore
        })
        .where(eq(rounds.id, id));

      const allGameRounds = await db
        .select()
        .from(rounds)
        .where(eq(rounds.game_id, round.game_id));

      const totalScore = allGameRounds.reduce((acc, r) => {
        if (r.id === id) return acc + roundScore;
        return acc + (r.pontos || 0);
      }, 0);

      const allFinished = allGameRounds.every((r) =>
        r.id === id ? true : r.distancia !== null
      );

      await db
        .update(games)
        .set({
          total_score: totalScore,
          ...(allFinished ? { finished_at: new Date() } : {})
        })
        .where(eq(games.id, round.game_id));

      return reply.send({
        roundId: round.id,
        distancia: roundedDist,
        distance: roundedDist,
        pontos: roundScore,
        score: roundScore,
        location: {
          lat: loc.lat,
          lng: loc.lng
        }
      });
    }
  );
};
