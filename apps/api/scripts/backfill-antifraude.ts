import '../src/env.js';
import { eq } from 'drizzle-orm';
import { db, sql } from '../src/db/index.js';
import { games, locations, rounds, users } from '../src/db/schema.js';
import { detectGame, RoundSample } from '../src/antifraude/detect.js';

async function main() {
  const allGames = await db
    .select({
      id: games.id,
      user_id: games.user_id,
      finished_at: games.finished_at,
      flagged_reason: games.flagged_reason,
      nick: users.nick,
    })
    .from(games)
    .innerJoin(users, eq(games.user_id, users.id));

  const allRounds = await db
    .select({
      game_id: rounds.game_id,
      ordem: rounds.ordem,
      guess_lat: rounds.guess_lat,
      guess_lng: rounds.guess_lng,
      started_at: rounds.started_at,
      loc_lat: locations.lat,
      loc_lng: locations.lng,
    })
    .from(rounds)
    .innerJoin(locations, eq(rounds.location_id, locations.id))
    .orderBy(rounds.game_id, rounds.ordem);

  const roundsByGame = new Map<string, typeof allRounds>();
  for (const r of allRounds) {
    let list = roundsByGame.get(r.game_id);
    if (!list) {
      list = [];
      roundsByGame.set(r.game_id, list);
    }
    list.push(r);
  }

  let flaggedCount = 0;
  let updatedCount = 0;

  for (const game of allGames) {
    const gameRounds = roundsByGame.get(game.id) || [];
    const samples: RoundSample[] = gameRounds.map((r, idx) => {
      let answerSeconds: number | null = null;
      if (r.started_at) {
        const nextTime =
          idx < gameRounds.length - 1
            ? gameRounds[idx + 1].started_at?.getTime()
            : game.finished_at?.getTime();
        if (nextTime !== undefined) {
          answerSeconds = (nextTime - r.started_at.getTime()) / 1000;
        }
      }
      return {
        guessLat: r.guess_lat,
        guessLng: r.guess_lng,
        locLat: r.loc_lat,
        locLng: r.loc_lng,
        answerSeconds,
      };
    });

    const reason = detectGame(samples);

    if (reason !== null) {
      flaggedCount++;
      console.log(`Partida marcada: game_id=${game.id}, nick=${game.nick}, motivo=${reason}`);
    }

    if (game.flagged_reason !== reason) {
      await db.update(games).set({ flagged_reason: reason }).where(eq(games.id, game.id));
      updatedCount++;
    }
  }

  console.log(`Backfill concluído:`);
  console.log(`- Partidas analisadas: ${allGames.length}`);
  console.log(`- Partidas marcadas: ${flaggedCount}`);
  console.log(`- Partidas atualizadas: ${updatedCount}`);
}

main()
  .catch((error: unknown) => {
    console.error('Falha no backfill antifraude:', error);
    process.exitCode = 1;
  })
  .finally(() => sql.end({ timeout: 1 }));
