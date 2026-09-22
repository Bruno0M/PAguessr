import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { phasesFor, type ChampionshipSize } from '@paguessr/shared';
import { db } from '../db/index.js';
import {
  championships,
  championshipMatches,
  championshipParticipants,
  users,
} from '../db/schema.js';
import { requireAuth, isAdminNick } from '../auth/session.js';
import { isChampionshipsVisible, parseChampionshipsMode } from '../championship/featureFlag.js';
import { advanceChampionship } from '../championship/advance.js';

export interface ChampionshipRankingEntry {
  position: number;
  userId: string;
  user_id: string;
  nick: string;
  avatarId: number;
  avatar_id: number;
  phaseReached: number;
  phase_reached: number;
  totalScore: number;
  total_score: number;
  seed: number | null;
}

export async function getChampionshipRanking(
  championshipId: string
): Promise<ChampionshipRankingEntry[]> {
  const [champ] = await db.select().from(championships).where(eq(championships.id, championshipId));

  if (!champ) {
    throw new Error('Campeonato não encontrado');
  }

  const totalPhases = phasesFor(champ.max_participants as ChampionshipSize);

  const participants = await db
    .select({
      userId: championshipParticipants.user_id,
      seed: championshipParticipants.seed,
      eliminatedInPhase: championshipParticipants.eliminated_in_phase,
      nick: users.nick,
      avatarId: users.avatar_id,
    })
    .from(championshipParticipants)
    .innerJoin(users, eq(championshipParticipants.user_id, users.id))
    .where(eq(championshipParticipants.championship_id, championshipId));

  const matches = await db
    .select()
    .from(championshipMatches)
    .where(eq(championshipMatches.championship_id, championshipId));

  const finalMatch = matches.find((m) => m.phase === totalPhases && m.slot === 0);
  const isFinalResolved = finalMatch?.resolved_at !== null && finalMatch?.winner_id !== null;

  const entries = participants.map((p) => {
    let totalScore = 0;
    let maxPhasePlayed = 1;

    for (const m of matches) {
      if (m.player_a_id === p.userId) {
        totalScore += m.score_a ?? 0;
        if (m.phase > maxPhasePlayed) maxPhasePlayed = m.phase;
      } else if (m.player_b_id === p.userId) {
        totalScore += m.score_b ?? 0;
        if (m.phase > maxPhasePlayed) maxPhasePlayed = m.phase;
      }
    }

    let phaseReached: number;
    if (isFinalResolved && finalMatch?.winner_id === p.userId) {
      phaseReached = totalPhases + 1;
    } else if (p.eliminatedInPhase !== null) {
      phaseReached = p.eliminatedInPhase;
    } else {
      phaseReached = maxPhasePlayed;
    }

    return {
      userId: p.userId,
      nick: p.nick,
      avatarId: p.avatarId,
      seed: p.seed,
      phaseReached,
      totalScore,
    };
  });

  entries.sort((a, b) => {
    if (b.phaseReached !== a.phaseReached) {
      return b.phaseReached - a.phaseReached;
    }
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }
    const seedA = a.seed ?? 999999;
    const seedB = b.seed ?? 999999;
    return seedA - seedB;
  });

  return entries.map((entry, index) => ({
    position: index + 1,
    userId: entry.userId,
    user_id: entry.userId,
    nick: entry.nick,
    avatarId: entry.avatarId,
    avatar_id: entry.avatarId,
    phaseReached: entry.phaseReached,
    phase_reached: entry.phaseReached,
    totalScore: entry.totalScore,
    total_score: entry.totalScore,
    seed: entry.seed,
  }));
}

export const championshipRankingRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', async (request, reply) => {
    const mode = parseChampionshipsMode(process.env.CHAMPIONSHIPS_MODE);
    const isAdmin = request.authUser ? isAdminNick(request.authUser.nick) : false;
    if (!isChampionshipsVisible(mode, isAdmin)) {
      return reply.status(404).send({ error: 'Não encontrado' });
    }
  });

  app.get<{ Params: { id: string } }>(
    '/championships/:id/ranking',
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
      const { id } = request.params;

      const [champ] = await db
        .select({ id: championships.id, status: championships.status })
        .from(championships)
        .where(eq(championships.id, id));

      if (!champ) {
        return reply.status(404).send({ error: 'Campeonato não encontrado' });
      }

      if (champ.status === 'em_andamento') {
        try {
          await advanceChampionship(id);
        } catch {
          // Se falhar o avanço em background da leitura, não bloqueia o ranking
        }
      }

      const ranking = await getChampionshipRanking(id);
      return reply.send(ranking);
    }
  );
};
