import { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { haversine, score, ROUND_DURATION_MS, LatLng } from '@paguessr/shared';
import { db } from '../db/index.js';
import { games, locations, rounds, Location, Round } from '../db/schema.js';
import { requireAuth } from '../auth/session.js';

const MIN_LOCATIONS_PER_GAME = 5;
const RECENT_GAMES_TO_AVOID = 2;
// Cada busca no Street View Static API é cobrada. A imagem não pode ser guardada
// no servidor (política do Google: só o pano_id pode), então o que protege a cota
// é limitar quando e quantas vezes o proxy busca por rodada.
export const MAX_IMAGE_FETCHES_PER_ROUND = 3;
const IMAGE_FETCH_GRACE_MS = 10_000;

function currentUserId(request: FastifyRequest): string {
  return request.authUser!.id;
}

function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Evita repetir, na medida do possível, locais já vistos pelo jogador nas
// últimas partidas dele. Se excluir esses locais deixasse o pool pequeno
// demais para montar uma partida (banco com poucos locais, ex.: testes),
// cai de volta no conjunto completo.
async function pickLocationsForUser(userId: string, count: number): Promise<Location[]> {
  const allLocations = await db.select().from(locations);

  const recentGames = await db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.user_id, userId))
    .orderBy(desc(games.created_at))
    .limit(RECENT_GAMES_TO_AVOID);

  let pool = allLocations;
  if (recentGames.length > 0) {
    const recentRounds = await db
      .select({ location_id: rounds.location_id })
      .from(rounds)
      .where(
        inArray(
          rounds.game_id,
          recentGames.map((g) => g.id)
        )
      );
    const recentLocationIds = new Set(recentRounds.map((r) => r.location_id));
    const filtered = allLocations.filter((loc) => !recentLocationIds.has(loc.id));
    if (filtered.length >= count) {
      pool = filtered;
    }
  }

  return shuffle(pool).slice(0, count);
}

// Reserva uma busca no Google pra rodada, de forma atômica: só conta se a rodada
// já começou, ainda não tem palpite, não passou do tempo e não esgotou o limite.
async function reserveImageFetch(round: Round): Promise<boolean> {
  if (round.pontos !== null || round.started_at === null) return false;
  if (Date.now() - round.started_at.getTime() > ROUND_DURATION_MS + IMAGE_FETCH_GRACE_MS) {
    return false;
  }
  const [reserved] = await db
    .update(rounds)
    .set({ image_fetches: sql`${rounds.image_fetches} + 1` })
    .where(
      and(
        eq(rounds.id, round.id),
        isNull(rounds.pontos),
        lt(rounds.image_fetches, MAX_IMAGE_FETCHES_PER_ROUND)
      )
    )
    .returning({ id: rounds.id });
  return Boolean(reserved);
}

// Ativa o cronômetro de uma rodada (define started_at = agora) na primeira vez
// que ela é alcançada — na criação da partida (ordem 1) ou logo após o
// palpite da rodada anterior ser resolvido. Idempotente: se a rodada já
// estava ativada, devolve ela sem mexer no started_at original.
async function activateRound(gameId: string, ordem: number): Promise<Round | null> {
  const [activated] = await db
    .update(rounds)
    .set({ started_at: new Date() })
    .where(and(eq(rounds.game_id, gameId), eq(rounds.ordem, ordem), isNull(rounds.started_at)))
    .returning();

  if (activated) return activated;

  const [existing] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.game_id, gameId), eq(rounds.ordem, ordem)));
  return existing ?? null;
}

export const gameRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  app.post('/games', async (request, reply) => {
    const totalLocations = await db.$count(locations);

    if (totalLocations < MIN_LOCATIONS_PER_GAME) {
      return reply.status(503).send({
        error: 'Não há locais cadastrados suficientes para iniciar uma partida (mínimo 5)',
      });
    }

    const selected = await pickLocationsForUser(currentUserId(request), MIN_LOCATIONS_PER_GAME);

    const [newGame] = await db
      .insert(games)
      .values({ user_id: currentUserId(request) })
      .returning();

    const createdRounds = await db
      .insert(rounds)
      .values(
        selected.map((loc, idx) => ({
          game_id: newGame.id,
          location_id: loc.id,
          ordem: idx + 1,
        }))
      )
      .returning();

    createdRounds.sort((a, b) => a.ordem - b.ordem);

    const firstRound = await activateRound(newGame.id, 1);
    const firstRoundStartedAt = firstRound?.started_at ? firstRound.started_at.toISOString() : null;

    return reply.status(201).send({
      id: newGame.id,
      rounds: createdRounds.map((r) => ({
        id: r.id,
        ordem: r.ordem,
        order: r.ordem,
        started_at: r.ordem === 1 ? firstRoundStartedAt : null,
        startedAt: r.ordem === 1 ? firstRoundStartedAt : null,
      })),
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
            id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const [game] = await db.select().from(games).where(eq(games.id, id));
      if (!game || game.user_id !== currentUserId(request)) {
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
          started_at: rounds.started_at,
          created_at: rounds.created_at,
          location_lat: locations.lat,
          location_lng: locations.lng,
        })
        .from(rounds)
        .innerJoin(locations, eq(rounds.location_id, locations.id))
        .where(eq(rounds.game_id, id))
        .orderBy(rounds.ordem);

      const mappedRounds = gameRounds.map((r) => {
        const isAnswered = r.pontos !== null;
        const startedAt = r.started_at ? r.started_at.toISOString() : null;
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
          started_at: startedAt,
          startedAt,
          ...(isAnswered ? { location: { lat: r.location_lat, lng: r.location_lng } } : {}),
        };
      });

      return reply.send({
        id: game.id,
        total_score: game.total_score,
        totalScore: game.total_score,
        score: game.total_score,
        created_at: game.created_at.toISOString(),
        finished_at: game.finished_at ? game.finished_at.toISOString() : null,
        rounds: mappedRounds,
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
            id: { type: 'integer', minimum: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: number };

      const [round] = await db.select().from(rounds).where(eq(rounds.id, id));
      if (!round) {
        return reply.status(404).send({ error: 'Rodada não encontrada' });
      }

      const [game] = await db.select().from(games).where(eq(games.id, round.game_id));
      if (!game || game.user_id !== currentUserId(request)) {
        return reply.status(404).send({ error: 'Rodada não encontrada' });
      }

      const [loc] = await db.select().from(locations).where(eq(locations.id, round.location_id));
      if (!loc) {
        return reply.status(404).send({ error: 'Local não encontrado' });
      }

      const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_STREET_VIEW_API_KEY;

      if (apiKey && (await reserveImageFetch(round))) {
        try {
          const usePano =
            loc.pano_id && !loc.pano_id.startsWith('mock-') && !loc.pano_id.startsWith('seed-');

          const params = new URLSearchParams({
            size: '800x600',
            fov: '90',
            heading: '0',
            pitch: '0',
            return_error_code: 'true',
            key: apiKey,
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
            // `private` e curto: só o navegador do próprio jogador guarda, pelo
            // tempo da rodada — nada de cache compartilhado com conteúdo do Google.
            return reply
              .type(contentType)
              .header('Cache-Control', 'private, max-age=300')
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

      // Com chave configurada, o placeholder significa limite, rodada fechada ou
      // falha do Google: não pode ficar grudado no cache no lugar da foto.
      return reply
        .type('image/svg+xml')
        .header('Cache-Control', apiKey ? 'no-store' : 'public, max-age=3600')
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
            id: { type: 'integer', minimum: 1 },
          },
        },
        body: {
          type: 'object',
          properties: {
            lat: { type: 'number', minimum: -90, maximum: 90 },
            lng: { type: 'number', minimum: -180, maximum: 180 },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: number };
      const body = request.body as { lat?: number; lng?: number };

      // Corpo vazio = timeout explícito (o front chama assim quando o
      // cronômetro local zera sem palpite selecionado). lat/lng têm que vir
      // juntos ou não vir nenhum dos dois — o schema JSON sozinho não pega
      // "só um dos dois" quando os campos são opcionais.
      if ((body.lat === undefined) !== (body.lng === undefined)) {
        return reply
          .status(400)
          .send({ error: 'Envie lat e lng juntos, ou nenhum dos dois (timeout)' });
      }
      const hasGuess = body.lat !== undefined && body.lng !== undefined;

      const [round] = await db.select().from(rounds).where(eq(rounds.id, id));
      if (!round) {
        return reply.status(404).send({ error: 'Rodada não encontrada' });
      }

      const [game] = await db.select().from(games).where(eq(games.id, round.game_id));
      if (!game || game.user_id !== currentUserId(request)) {
        return reply.status(404).send({ error: 'Rodada não encontrada' });
      }

      if (round.pontos !== null) {
        return reply.status(409).send({ error: 'Palpite já registrado para esta rodada' });
      }

      if (round.started_at === null) {
        return reply.status(409).send({ error: 'Rodada ainda não iniciada' });
      }

      const [loc] = await db.select().from(locations).where(eq(locations.id, round.location_id));
      if (!loc) {
        return reply.status(404).send({ error: 'Local não encontrado' });
      }

      const elapsedMs = Date.now() - round.started_at.getTime();
      const isLate = elapsedMs > ROUND_DURATION_MS;

      let roundedDist: number | null = null;
      let roundScore = 0;

      if (hasGuess) {
        const guessPoint: LatLng = { lat: body.lat as number, lng: body.lng as number };
        const actualPoint: LatLng = { lat: loc.lat, lng: loc.lng };

        const rawDist = haversine(guessPoint, actualPoint);
        roundedDist = Math.round(rawDist * 10) / 10;
        roundScore = isLate ? 0 : score(roundedDist);
      }

      // Update atômico: só grava se ninguém venceu a corrida antes (evita
      // que dois palpites simultâneos pra mesma rodada os dois "ganhem").
      const [updated] = await db
        .update(rounds)
        .set({
          guess_lat: hasGuess ? (body.lat as number) : null,
          guess_lng: hasGuess ? (body.lng as number) : null,
          distancia: roundedDist,
          pontos: roundScore,
        })
        .where(and(eq(rounds.id, id), isNull(rounds.pontos)))
        .returning();

      if (!updated) {
        return reply.status(409).send({ error: 'Palpite já registrado para esta rodada' });
      }

      const allGameRounds = await db.select().from(rounds).where(eq(rounds.game_id, round.game_id));

      const totalScore = allGameRounds.reduce((acc, r) => {
        if (r.id === id) return acc + roundScore;
        return acc + (r.pontos || 0);
      }, 0);

      const allFinished = allGameRounds.every((r) => (r.id === id ? true : r.pontos !== null));

      await db
        .update(games)
        .set({
          total_score: totalScore,
          ...(allFinished ? { finished_at: new Date() } : {}),
        })
        .where(eq(games.id, round.game_id));

      const nextRound = await activateRound(round.game_id, round.ordem + 1);
      const nextRoundStartedAt = nextRound?.started_at ? nextRound.started_at.toISOString() : null;

      return reply.send({
        roundId: round.id,
        distancia: roundedDist,
        distance: roundedDist,
        pontos: roundScore,
        score: roundScore,
        location: {
          lat: loc.lat,
          lng: loc.lng,
        },
        nextRound: nextRound
          ? { id: nextRound.id, started_at: nextRoundStartedAt, startedAt: nextRoundStartedAt }
          : null,
      });
    }
  );
};
