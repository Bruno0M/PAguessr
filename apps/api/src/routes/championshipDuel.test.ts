import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildApp } from '../app.js';
import { resetTestDatabase } from '../test/fixtures.js';
import { createDuelHelpers } from '../test/duelHelpers.js';
import { db } from '../db/index.js';
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

  describe('rodada que ainda não começou', () => {
    // Com 3 rodadas de 60 s e revelação de 5 s, só a rodada 1 está aberta logo
    // depois do enter: a 2 e a 3 começam mais à frente.
    async function openDuel(prefix: string) {
      const setup = await setupActiveChampionship({ prefix });
      const { match, playerA, playerB } = sidesOf(setup);
      const dataA = await enterMatch(setup.champ.id, match.id, playerA);
      const dataB = await enterMatch(setup.champ.id, match.id, playerB);
      return { ...setup, match, playerA, playerB, dataA, dataB };
    }

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
});
