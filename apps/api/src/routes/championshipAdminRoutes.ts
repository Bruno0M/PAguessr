import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import {
  CHAMPIONSHIP_SIZES,
  ROUND_DURATION_MIN_SECONDS,
  ROUND_DURATION_MAX_SECONDS,
  ROUND_DURATION_DEFAULT_SECONDS,
  CHAMPIONSHIP_TITLE_MIN_LENGTH,
  CHAMPIONSHIP_TITLE_MAX_LENGTH,
  CHAMPIONSHIP_DESCRIPTION_MAX_LENGTH,
  CHAMPIONSHIP_BANNER_URL_MAX_LENGTH,
  CHAMPIONSHIP_ROUNDS_PER_MATCH_MIN,
  CHAMPIONSHIP_ROUNDS_PER_MATCH_MAX,
  CHAMPIONSHIP_PHASE_INTERVAL_MIN_SECONDS,
  CHAMPIONSHIP_PHASE_INTERVAL_MAX_SECONDS,
  type ChampionshipSize,
} from '@paguessr/shared';
import { db } from '../db/index.js';
import {
  championships,
  championshipParticipants,
  championshipMatches,
} from '../db/schema.js';
import { requireAdmin } from '../auth/session.js';

interface CreateChampionshipBody {
  title: string;
  description?: string | null;
  banner_url?: string | null;
  max_participants: ChampionshipSize;
  rounds_per_match: number;
  round_duration_seconds?: number;
  phase_interval_seconds: number;
}

interface UpdateChampionshipBody {
  title?: string;
  description?: string | null;
  banner_url?: string | null;
  max_participants?: ChampionshipSize;
  rounds_per_match?: number;
  round_duration_seconds?: number;
  phase_interval_seconds?: number;
}

const createChampionshipBodySchema = {
  type: 'object',
  required: ['title', 'max_participants', 'rounds_per_match', 'phase_interval_seconds'],
  properties: {
    title: {
      type: 'string',
      minLength: CHAMPIONSHIP_TITLE_MIN_LENGTH,
      maxLength: CHAMPIONSHIP_TITLE_MAX_LENGTH,
    },
    description: {
      type: 'string',
      maxLength: CHAMPIONSHIP_DESCRIPTION_MAX_LENGTH,
      nullable: true,
    },
    banner_url: {
      type: 'string',
      maxLength: CHAMPIONSHIP_BANNER_URL_MAX_LENGTH,
      pattern: '^https?://',
      nullable: true,
    },
    max_participants: {
      type: 'integer',
      enum: [...CHAMPIONSHIP_SIZES],
    },
    rounds_per_match: {
      type: 'integer',
      minimum: CHAMPIONSHIP_ROUNDS_PER_MATCH_MIN,
      maximum: CHAMPIONSHIP_ROUNDS_PER_MATCH_MAX,
    },
    round_duration_seconds: {
      type: 'integer',
      minimum: ROUND_DURATION_MIN_SECONDS,
      maximum: ROUND_DURATION_MAX_SECONDS,
      default: ROUND_DURATION_DEFAULT_SECONDS,
    },
    phase_interval_seconds: {
      type: 'integer',
      minimum: CHAMPIONSHIP_PHASE_INTERVAL_MIN_SECONDS,
      maximum: CHAMPIONSHIP_PHASE_INTERVAL_MAX_SECONDS,
    },
  },
  additionalProperties: false,
} as const;

const updateChampionshipBodySchema = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      minLength: CHAMPIONSHIP_TITLE_MIN_LENGTH,
      maxLength: CHAMPIONSHIP_TITLE_MAX_LENGTH,
    },
    description: {
      type: 'string',
      maxLength: CHAMPIONSHIP_DESCRIPTION_MAX_LENGTH,
      nullable: true,
    },
    banner_url: {
      type: 'string',
      maxLength: CHAMPIONSHIP_BANNER_URL_MAX_LENGTH,
      pattern: '^https?://',
      nullable: true,
    },
    max_participants: {
      type: 'integer',
      enum: [...CHAMPIONSHIP_SIZES],
    },
    rounds_per_match: {
      type: 'integer',
      minimum: CHAMPIONSHIP_ROUNDS_PER_MATCH_MIN,
      maximum: CHAMPIONSHIP_ROUNDS_PER_MATCH_MAX,
    },
    round_duration_seconds: {
      type: 'integer',
      minimum: ROUND_DURATION_MIN_SECONDS,
      maximum: ROUND_DURATION_MAX_SECONDS,
    },
    phase_interval_seconds: {
      type: 'integer',
      minimum: CHAMPIONSHIP_PHASE_INTERVAL_MIN_SECONDS,
      maximum: CHAMPIONSHIP_PHASE_INTERVAL_MAX_SECONDS,
    },
  },
  additionalProperties: false,
} as const;

export const championshipAdminRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAdmin);

  app.get('/admin/championships', async (_request, reply) => {
    const list = await db
      .select({
        id: championships.id,
        title: championships.title,
        description: championships.description,
        banner_url: championships.banner_url,
        max_participants: championships.max_participants,
        rounds_per_match: championships.rounds_per_match,
        round_duration_seconds: championships.round_duration_seconds,
        phase_interval_seconds: championships.phase_interval_seconds,
        status: championships.status,
        created_by: championships.created_by,
        created_at: championships.created_at,
        seeded_at: championships.seeded_at,
        started_at: championships.started_at,
        finished_at: championships.finished_at,
        participant_count: sql<number>`coalesce((
          select count(*)::int
          from ${championshipParticipants}
          where ${championshipParticipants.championship_id} = ${championships.id}
        ), 0)`,
        current_phase: sql<number | null>`(
          select min(phase)::int
          from ${championshipMatches}
          where ${championshipMatches.championship_id} = ${championships.id}
            and ${championshipMatches.resolved_at} is null
        )`,
      })
      .from(championships)
      .orderBy(sql`${championships.created_at} DESC`);

    return reply.send(list);
  });

  app.post<{ Body: CreateChampionshipBody }>(
    '/admin/championships',
    { schema: { body: createChampionshipBodySchema } },
    async (request, reply) => {
      const user = request.authUser!;
      const body = request.body;

      const trimmedTitle = body.title.trim();
      if (
        trimmedTitle.length < CHAMPIONSHIP_TITLE_MIN_LENGTH ||
        trimmedTitle.length > CHAMPIONSHIP_TITLE_MAX_LENGTH
      ) {
        return reply.status(400).send({
          error: `Título deve ter entre ${CHAMPIONSHIP_TITLE_MIN_LENGTH} e ${CHAMPIONSHIP_TITLE_MAX_LENGTH} caracteres.`,
        });
      }

      const [created] = await db
        .insert(championships)
        .values({
          title: trimmedTitle,
          description: body.description?.trim() || null,
          banner_url: body.banner_url?.trim() || null,
          max_participants: body.max_participants,
          rounds_per_match: body.rounds_per_match,
          round_duration_seconds: body.round_duration_seconds ?? ROUND_DURATION_DEFAULT_SECONDS,
          phase_interval_seconds: body.phase_interval_seconds,
          status: 'inscricoes',
          created_by: user.id,
        })
        .returning();

      return reply.status(201).send(created);
    }
  );

  app.patch<{ Params: { id: string }; Body: UpdateChampionshipBody }>(
    '/admin/championships/:id',
    { schema: { body: updateChampionshipBodySchema } },
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body;

      const [champ] = await db.select().from(championships).where(eq(championships.id, id));
      if (!champ) {
        return reply.status(404).send({ error: 'Campeonato não encontrado' });
      }

      if (champ.status === 'finalizado' || champ.status === 'cancelado') {
        return reply.status(409).send({
          error: 'Campeonatos finalizados não podem ser alterados.',
        });
      }

      if (champ.status === 'chaveado' || champ.status === 'em_andamento') {
        if (
          body.rounds_per_match !== undefined ||
          body.round_duration_seconds !== undefined ||
          body.phase_interval_seconds !== undefined ||
          body.max_participants !== undefined
        ) {
          return reply.status(409).send({
            error: 'Configurações de partida não podem ser alteradas após o sorteio das chaves.',
          });
        }
      }

      if (champ.status === 'inscricoes' && body.max_participants !== undefined) {
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(championshipParticipants)
          .where(eq(championshipParticipants.championship_id, id));

        if (body.max_participants < count) {
          return reply.status(409).send({
            error: `O número de vagas (${body.max_participants}) não pode ser menor que o total de inscritos (${count}).`,
          });
        }
      }

      const [updated] = await db
        .update(championships)
        .set({
          ...(body.title !== undefined ? { title: body.title.trim() } : {}),
          ...(body.description !== undefined ? { description: body.description?.trim() || null } : {}),
          ...(body.banner_url !== undefined ? { banner_url: body.banner_url?.trim() || null } : {}),
          ...(body.max_participants !== undefined ? { max_participants: body.max_participants } : {}),
          ...(body.rounds_per_match !== undefined ? { rounds_per_match: body.rounds_per_match } : {}),
          ...(body.round_duration_seconds !== undefined
            ? { round_duration_seconds: body.round_duration_seconds }
            : {}),
          ...(body.phase_interval_seconds !== undefined
            ? { phase_interval_seconds: body.phase_interval_seconds }
            : {}),
        })
        .where(eq(championships.id, id))
        .returning();

      return reply.send(updated);
    }
  );

  app.delete<{ Params: { id: string } }>('/admin/championships/:id', async (request, reply) => {
    const { id } = request.params;

    const [deleted] = await db
      .delete(championships)
      .where(eq(championships.id, id))
      .returning({ id: championships.id });

    if (!deleted) {
      return reply.status(404).send({ error: 'Campeonato não encontrado' });
    }

    return reply.status(204).send();
  });

  app.post<{ Params: { id: string } }>('/admin/championships/:id/start', async (request, reply) => {
    const { id } = request.params;

    const [champ] = await db.select().from(championships).where(eq(championships.id, id));
    if (!champ) {
      return reply.status(404).send({ error: 'Campeonato não encontrado' });
    }

    if (champ.status !== 'chaveado') {
      return reply.status(409).send({
        error: `Campeonato em estado '${champ.status}' não pode ser iniciado (esperado: 'chaveado').`,
      });
    }

    const [updated] = await db
      .update(championships)
      .set({
        status: 'em_andamento',
        started_at: new Date(),
      })
      .where(eq(championships.id, id))
      .returning();

    return reply.send(updated);
  });

  app.post<{ Params: { id: string } }>('/admin/championships/:id/advance', async (request, reply) => {
    const { id } = request.params;

    const [champ] = await db.select().from(championships).where(eq(championships.id, id));
    if (!champ) {
      return reply.status(404).send({ error: 'Campeonato não encontrado' });
    }

    if (champ.status !== 'em_andamento') {
      return reply.status(409).send({
        error: `Campeonato em estado '${champ.status}' não pode ser avançado (esperado: 'em_andamento').`,
      });
    }

    return reply.send(champ);
  });
};
