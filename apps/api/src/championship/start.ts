import { and, eq } from 'drizzle-orm';
import { LOBBY_COUNTDOWN_SECONDS } from '@paguessr/shared';
import type { Tx } from '../db/index.js';
import { championships, championshipMatches, type Championship } from '../db/schema.js';

/**
 * Largada do campeonato: grava `started_at` e abre a fase 1 depois da contagem
 * da sala de espera.
 *
 * A regra mora aqui e não nos chamadores porque existem dois: a chave é
 * sorteada **e** largada na mesma transação da última inscrição, e o
 * `POST /admin/championships/:id/start` continua existindo para resgatar
 * campeonato antigo que ficou parado em `chaveado`.
 *
 * Roda dentro da transação do chamador — no sorteio, a fase 1 é criada e aberta
 * no mesmo instante, sem ninguém enxergar o campeonato no estado intermediário.
 */
export async function startChampionship(
  tx: Tx,
  championshipId: string,
  now: Date = new Date()
): Promise<Championship | undefined> {
  // `started_at` é o instante da largada; a fase 1 só abre depois da contagem,
  // tempo de todo mundo chegar na sala antes do relógio das rodadas começar.
  const phase1OpensAt = new Date(now.getTime() + LOBBY_COUNTDOWN_SECONDS * 1000);

  const [updated] = await tx
    .update(championships)
    .set({
      status: 'em_andamento',
      started_at: now,
    })
    .where(eq(championships.id, championshipId))
    .returning();

  await tx
    .update(championshipMatches)
    .set({ opens_at: phase1OpensAt })
    .where(
      and(eq(championshipMatches.championship_id, championshipId), eq(championshipMatches.phase, 1))
    );

  return updated;
}
