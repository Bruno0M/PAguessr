import { and, eq, gt, inArray } from 'drizzle-orm';
import { DUEL_REVEAL_SECONDS } from '@paguessr/shared';
import { db } from '../db/index.js';
import { championshipMatches, championships, games, rounds } from '../db/schema.js';
import { shiftedRoundStarts } from './timeline.js';

/**
 * Fecha a rodada do duelo quando o segundo palpite chega e adianta as seguintes.
 *
 * Roda depois de o palpite já estar gravado. Numa transação com trava no
 * confronto (serializa dois palpites simultâneos), confere se os dois lados
 * responderam a rodada e, se ainda havia tempo, puxa o início das próximas
 * rodadas dos DOIS jogos pra `agora + revelação`. Só adianta: um horário que já
 * é mais cedo que o novo fica como está (a segunda chamada de uma corrida, com
 * `agora` um pouco maior, não atrasa o que a primeira adiantou).
 */
export async function closeDuelRoundIfReady(
  roundId: number,
  now = new Date()
): Promise<{ closedEarly: boolean }> {
  const [round] = await db.select().from(rounds).where(eq(rounds.id, roundId));
  if (!round) return { closedEarly: false };

  const [game] = await db.select().from(games).where(eq(games.id, round.game_id));
  if (!game?.championship_match_id) return { closedEarly: false };
  const matchId = game.championship_match_id;

  return db.transaction(async (tx) => {
    const [match] = await tx
      .select()
      .from(championshipMatches)
      .where(eq(championshipMatches.id, matchId))
      .for('update');
    if (!match?.game_a_id || !match.game_b_id) return { closedEarly: false };

    const otherGameId = match.game_a_id === round.game_id ? match.game_b_id : match.game_a_id;
    const [mine] = await tx.select().from(rounds).where(eq(rounds.id, roundId));
    const [other] = await tx
      .select()
      .from(rounds)
      .where(and(eq(rounds.game_id, otherGameId), eq(rounds.ordem, round.ordem)));
    if (!mine || !other || mine.pontos === null || other.pontos === null) {
      return { closedEarly: false };
    }

    // Fechou pelo tempo: a linha do tempo planejada já cobre.
    if (
      mine.started_at === null ||
      now.getTime() >= mine.started_at.getTime() + mine.duration_seconds * 1000
    ) {
      return { closedEarly: false };
    }

    const [championship] = await tx
      .select({ roundsPerMatch: championships.rounds_per_match })
      .from(championships)
      .where(eq(championships.id, match.championship_id));
    if (!championship) return { closedEarly: false };

    const starts = shiftedRoundStarts(
      now,
      mine.ordem,
      championship.roundsPerMatch,
      mine.duration_seconds,
      DUEL_REVEAL_SECONDS
    );
    for (const [ordem, startedAt] of starts) {
      await tx
        .update(rounds)
        .set({ started_at: startedAt })
        .where(
          and(
            inArray(rounds.game_id, [match.game_a_id, match.game_b_id]),
            eq(rounds.ordem, ordem),
            gt(rounds.started_at, startedAt)
          )
        );
    }

    return { closedEarly: true };
  });
}
