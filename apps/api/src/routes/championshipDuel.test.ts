import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { DUEL_REVEAL_SECONDS, PAULO_AFONSO_CENTER } from '@paguessr/shared';
import { buildApp } from '../app.js';
import { resetTestDatabase } from '../test/fixtures.js';
import { createDuelHelpers } from '../test/duelHelpers.js';
import { db } from '../db/index.js';
import { closeDuelRoundIfReady } from '../championship/closeRound.js';
import { rounds } from '../db/schema.js';

// Duelo de campeonato: a linha do tempo é do servidor (`rounds.started_at`), as
// rodadas fecham quando os dois respondem ou o tempo acaba, e o que ainda não
// começou não pode ser usado.
describe('Campeonatos: linha do tempo do duelo', () => {
  const app = buildApp();
  const { setupActiveChampionship, enterMatch, guessRound, sidesOf } = createDuelHelpers(app);

  beforeAll(async () => {
    process.env.LOG_LEVEL = 'silent';
    await resetTestDatabase();
  });

  afterAll(async () => {
    await app.close();
  });

  // Com 3 rodadas de 60 s e revelação de 5 s, só a rodada 1 está aberta logo depois
  // do enter: a 2 e a 3 começam mais à frente.
  async function openDuel(prefix: string) {
    const setup = await setupActiveChampionship({ prefix });
    const { match, playerA, playerB } = sidesOf(setup);
    const dataA = await enterMatch(setup.champ.id, match.id, playerA);
    const dataB = await enterMatch(setup.champ.id, match.id, playerB);
    return { ...setup, match, playerA, playerB, dataA, dataB };
  }

  async function startsOf(gameId: string): Promise<number[]> {
    const rows = await db
      .select({ startedAt: rounds.started_at })
      .from(rounds)
      .where(eq(rounds.game_id, gameId))
      .orderBy(asc(rounds.ordem));
    return rows.map((r) => r.startedAt!.getTime());
  }

  const postGuess = (cookie: string, roundId: number) =>
    app.inject({
      method: 'POST',
      url: `/api/rounds/${roundId}/guess`,
      headers: { cookie },
      payload: PAULO_AFONSO_CENTER,
    });

  describe('rodada que ainda não começou', () => {
    it('recusa o palpite (409) e a rodada continua sem resposta', async () => {
      const { playerA, dataA } = await openDuel('f8_guess');
      const futureRound = dataA.rounds[2];

      const res = await app.inject({
        method: 'POST',
        url: `/api/rounds/${futureRound.id}/guess`,
        headers: { cookie: playerA.cookie },
        payload: { lat: -9.4064, lng: -38.2147 },
      });
      expect(res.statusCode).toBe(409);

      const [row] = await db.select().from(rounds).where(eq(rounds.id, futureRound.id));
      expect(row.pontos).toBeNull();
      expect(row.guess_lat).toBeNull();

      // A rodada aberta segue aceitando palpite.
      await guessRound(playerA, dataA.rounds[0].id, { lat: -9.4064, lng: -38.2147 });
    });

    it('recusa o panorama (409) e não entrega o pano_id', async () => {
      const { playerA, dataA } = await openDuel('f8_pano');
      const futureRound = dataA.rounds[1];
      await db
        .update(rounds)
        .set({ streetview_mode: 'panorama' })
        .where(eq(rounds.id, futureRound.id));
      await db
        .update(rounds)
        .set({ streetview_mode: 'panorama' })
        .where(eq(rounds.id, dataA.rounds[0].id));

      const future = await app.inject({
        method: 'GET',
        url: `/api/rounds/${futureRound.id}/panorama`,
        headers: { cookie: playerA.cookie },
      });
      expect(future.statusCode).toBe(409);
      expect(future.body).not.toContain('pano_id');

      const open = await app.inject({
        method: 'GET',
        url: `/api/rounds/${dataA.rounds[0].id}/panorama`,
        headers: { cookie: playerA.cookie },
      });
      expect(open.statusCode).toBe(200);
      expect(JSON.parse(open.body)).toHaveProperty('pano_id');
    });

    describe('imagem com chave do Google configurada', () => {
      let fetchSpy: MockInstance<typeof fetch>;
      const origKey = process.env.GOOGLE_STREET_VIEW_API_KEY;

      beforeEach(() => {
        process.env.GOOGLE_STREET_VIEW_API_KEY = 'chave-falsa-de-teste';
        fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
          async () =>
            new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
              status: 200,
              headers: { 'content-type': 'image/jpeg' },
            })
        );
      });

      afterEach(() => {
        fetchSpy.mockRestore();
        if (origKey === undefined) delete process.env.GOOGLE_STREET_VIEW_API_KEY;
        else process.env.GOOGLE_STREET_VIEW_API_KEY = origKey;
      });

      it('não busca no Google (nem gasta a cota) antes de a rodada começar', async () => {
        const { playerA, dataA } = await openDuel('f8_image');
        const futureRound = dataA.rounds[2];

        const future = await app.inject({
          method: 'GET',
          url: `/api/rounds/${futureRound.id}/image`,
          headers: { cookie: playerA.cookie },
        });
        expect(future.statusCode).toBe(200);
        expect(future.headers['content-type']).toContain('image/svg+xml');
        expect(fetchSpy).not.toHaveBeenCalled();

        const [untouched] = await db.select().from(rounds).where(eq(rounds.id, futureRound.id));
        expect(untouched.image_fetches).toBe(0);

        // A rodada aberta busca normalmente.
        const open = await app.inject({
          method: 'GET',
          url: `/api/rounds/${dataA.rounds[0].id}/image`,
          headers: { cookie: playerA.cookie },
        });
        expect(open.headers['content-type']).toContain('image/jpeg');
        expect(fetchSpy).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('fechamento antecipado da rodada', () => {
    const STEP_MS = (60 + DUEL_REVEAL_SECONDS) * 1000;

    it('com os dois palpites feitos, a próxima rodada dos DOIS jogos começa 5 s depois', async () => {
      const { playerA, playerB, dataA, dataB } = await openDuel('f9_close');
      const planned = await startsOf(dataA.gameId);
      expect(await startsOf(dataB.gameId)).toEqual(planned);

      // Só A respondeu: o relógio cheio segue valendo pra rodada seguinte.
      expect((await postGuess(playerA.cookie, dataA.rounds[0].id)).statusCode).toBe(200);
      expect(await startsOf(dataA.gameId)).toEqual(planned);
      expect(await startsOf(dataB.gameId)).toEqual(planned);

      const before = Date.now();
      const res = await postGuess(playerB.cookie, dataB.rounds[0].id);
      const after = Date.now();
      expect(res.statusCode).toBe(200);

      const startsA = await startsOf(dataA.gameId);
      const startsB = await startsOf(dataB.gameId);
      expect(startsB).toEqual(startsA);

      // Rodada 1 intacta; a 2 vira agora + 5 s (tolerância de 1 s); a 3 segue 65 s depois.
      expect(startsA[0]).toBe(planned[0]);
      expect(startsA[1]).toBeGreaterThanOrEqual(before + DUEL_REVEAL_SECONDS * 1000 - 1000);
      expect(startsA[1]).toBeLessThanOrEqual(after + DUEL_REVEAL_SECONDS * 1000 + 1000);
      expect(startsA[1]).toBeLessThan(planned[1]);
      expect(startsA[2]).toBe(startsA[1] + STEP_MS);

      // A resposta do palpite já traz o horário adiantado.
      const body = JSON.parse(res.body);
      expect(new Date(body.nextRound.startedAt).getTime()).toBe(startsA[1]);
    });

    it('fechar a última rodada antes do tempo não muda nenhum horário', async () => {
      const { playerA, playerB, dataA, dataB } = await openDuel('f9_last');
      const lastStart = new Date(Date.now() - 1000);
      await db
        .update(rounds)
        .set({ started_at: lastStart })
        .where(and(inArray(rounds.game_id, [dataA.gameId, dataB.gameId]), eq(rounds.ordem, 3)));
      const before = await startsOf(dataA.gameId);

      expect((await postGuess(playerA.cookie, dataA.rounds[2].id)).statusCode).toBe(200);
      expect((await postGuess(playerB.cookie, dataB.rounds[2].id)).statusCode).toBe(200);

      expect(await startsOf(dataA.gameId)).toEqual(before);
      expect(await startsOf(dataB.gameId)).toEqual(before);
    });

    it('rodada fechada pelo tempo não puxa nada (a linha planejada já cobre)', async () => {
      const { dataA, dataB } = await openDuel('f9_time');
      const planned = await startsOf(dataA.gameId);
      await db
        .update(rounds)
        .set({ pontos: 100 })
        .where(inArray(rounds.id, [dataA.rounds[0].id, dataB.rounds[0].id]));

      const afterDeadline = new Date(planned[0] + 61 * 1000);
      const result = await closeDuelRoundIfReady(dataA.rounds[0].id, afterDeadline);
      expect(result.closedEarly).toBe(false);
      expect(await startsOf(dataA.gameId)).toEqual(planned);
      expect(await startsOf(dataB.gameId)).toEqual(planned);
    });

    it('só adianta, nunca atrasa: uma segunda chamada com "agora" maior não muda nada', async () => {
      const { dataA, dataB } = await openDuel('f9_never');
      const planned = await startsOf(dataA.gameId);
      await db
        .update(rounds)
        .set({ pontos: 100 })
        .where(inArray(rounds.id, [dataA.rounds[0].id, dataB.rounds[0].id]));

      const first = new Date(planned[0] + 10 * 1000);
      expect((await closeDuelRoundIfReady(dataA.rounds[0].id, first)).closedEarly).toBe(true);
      const shifted = await startsOf(dataA.gameId);
      expect(shifted[1]).toBe(first.getTime() + DUEL_REVEAL_SECONDS * 1000);

      const later = new Date(planned[0] + 20 * 1000);
      await closeDuelRoundIfReady(dataB.rounds[0].id, later);
      expect(await startsOf(dataA.gameId)).toEqual(shifted);
      expect(await startsOf(dataB.gameId)).toEqual(shifted);
    });

    it('dois palpites simultâneos adiantam a rodada seguinte uma vez só, igual nos dois jogos', async () => {
      const { playerA, playerB, dataA, dataB } = await openDuel('f9_race');
      const planned = await startsOf(dataA.gameId);

      const [resA, resB] = await Promise.all([
        postGuess(playerA.cookie, dataA.rounds[0].id),
        postGuess(playerB.cookie, dataB.rounds[0].id),
      ]);
      expect(resA.statusCode).toBe(200);
      expect(resB.statusCode).toBe(200);

      const startsA = await startsOf(dataA.gameId);
      const startsB = await startsOf(dataB.gameId);
      expect(startsB).toEqual(startsA);
      expect(startsA[1]).toBeLessThan(planned[1]);
      expect(startsA[2]).toBe(startsA[1] + STEP_MS);

      // Quem respondeu por último devolve o horário adiantado; quem respondeu
      // primeiro pode ter visto o antigo, mas o banco ficou coerente.
      const finalStart = new Date(startsA[1]).toISOString();
      const nextStarts = [JSON.parse(resA.body), JSON.parse(resB.body)].map((b) =>
        new Date(b.nextRound.startedAt).toISOString()
      );
      expect(nextStarts).toContain(finalStart);
    });
  });
});
