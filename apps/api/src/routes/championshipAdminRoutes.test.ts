import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { LOBBY_COUNTDOWN_SECONDS } from '@paguessr/shared';
import { buildApp } from '../app.js';
import { db } from '../db/index.js';
import {
  championships,
  championshipParticipants,
  championshipMatches,
  users,
} from '../db/schema.js';
import { resetTestDatabase } from '../test/fixtures.js';
import { extractSessionCookie, registerUser } from '../test/authHelpers.js';

describe('Championship Admin Routes Integration', () => {
  const app = buildApp();
  const origAdminNicks = process.env.ADMIN_NICKS;
  let adminCookie: string;
  let commonCookie: string;
  let adminUserId: string;

  beforeAll(async () => {
    process.env.LOG_LEVEL = 'silent';
    process.env.ADMIN_NICKS = 'chefe';
    await resetTestDatabase();

    const adminReg = await registerUser(app, { nick: 'chefe' });
    adminCookie = extractSessionCookie(adminReg.headers['set-cookie']);
    const adminBody = JSON.parse(adminReg.body);
    adminUserId = adminBody.user.id;

    const commonReg = await registerUser(app, { nick: 'jogadorcomum' });
    commonCookie = extractSessionCookie(commonReg.headers['set-cookie']);
  });

  afterAll(async () => {
    process.env.ADMIN_NICKS = origAdminNicks;
    await app.close();
  });

  describe('Autenticação e Permissão', () => {
    it('GET /api/admin/championships sem sessão retorna 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/championships',
      });
      expect(res.statusCode).toBe(401);
    });

    it('GET /api/admin/championships com usuário comum retorna 403', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/championships',
        headers: { cookie: commonCookie },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Criação (POST /api/admin/championships)', () => {
    it('cria campeonato válido com campos obrigatórios', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/championships',
        headers: { cookie: adminCookie },
        payload: {
          title: 'Torneio Teste 2026',
          max_participants: 8,
          rounds_per_match: 5,
          phase_interval_seconds: 3600,
        },
      });

      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.body);
      expect(data).toHaveProperty('id');
      expect(data.title).toBe('Torneio Teste 2026');
      expect(data.max_participants).toBe(8);
      expect(data.rounds_per_match).toBe(5);
      expect(data.round_duration_seconds).toBe(60);
      expect(data.phase_interval_seconds).toBe(3600);
      expect(data.status).toBe('inscricoes');
      expect(data.created_by).toBe(adminUserId);
    });

    it('cria campeonato com campos opcionais válidos (banner e descrição)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/championships',
        headers: { cookie: adminCookie },
        payload: {
          title: 'Copa Paulo Afonso',
          description: 'Torneio eliminatório mata-mata',
          banner_url: 'https://exemplo.com/banner.png',
          max_participants: 16,
          rounds_per_match: 3,
          round_duration_seconds: 45,
          phase_interval_seconds: 7200,
        },
      });

      expect(res.statusCode).toBe(201);
      const data = JSON.parse(res.body);
      expect(data.description).toBe('Torneio eliminatório mata-mata');
      expect(data.banner_url).toBe('https://exemplo.com/banner.png');
      expect(data.round_duration_seconds).toBe(45);
    });

    it('recusa título com menos de 3 caracteres', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/championships',
        headers: { cookie: adminCookie },
        payload: {
          title: 'AB',
          max_participants: 8,
          rounds_per_match: 5,
          phase_interval_seconds: 3600,
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('recusa título com mais de 80 caracteres', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/championships',
        headers: { cookie: adminCookie },
        payload: {
          title: 'A'.repeat(81),
          max_participants: 8,
          rounds_per_match: 5,
          phase_interval_seconds: 3600,
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('recusa banner_url que não começa com http:// ou https://', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/championships',
        headers: { cookie: adminCookie },
        payload: {
          title: 'Torneio Sem Banner Valido',
          banner_url: 'ftp://exemplo.com/foto.jpg',
          max_participants: 8,
          rounds_per_match: 5,
          phase_interval_seconds: 3600,
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('recusa max_participants diferente de 4, 8, 16 ou 32', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/championships',
        headers: { cookie: adminCookie },
        payload: {
          title: 'Torneio Tamanho Invalido',
          max_participants: 10,
          rounds_per_match: 5,
          phase_interval_seconds: 3600,
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('recusa rounds_per_match fora do intervalo 1..10', async () => {
      const res1 = await app.inject({
        method: 'POST',
        url: '/api/admin/championships',
        headers: { cookie: adminCookie },
        payload: {
          title: 'Torneio Zero Rodadas',
          max_participants: 8,
          rounds_per_match: 0,
          phase_interval_seconds: 3600,
        },
      });
      expect(res1.statusCode).toBe(400);

      const res2 = await app.inject({
        method: 'POST',
        url: '/api/admin/championships',
        headers: { cookie: adminCookie },
        payload: {
          title: 'Torneio Muitas Rodadas',
          max_participants: 8,
          rounds_per_match: 11,
          phase_interval_seconds: 3600,
        },
      });
      expect(res2.statusCode).toBe(400);
    });

    it('recusa round_duration_seconds fora de 10..300', async () => {
      const res1 = await app.inject({
        method: 'POST',
        url: '/api/admin/championships',
        headers: { cookie: adminCookie },
        payload: {
          title: 'Torneio Muito Rapido',
          max_participants: 8,
          rounds_per_match: 5,
          round_duration_seconds: 9,
          phase_interval_seconds: 3600,
        },
      });
      expect(res1.statusCode).toBe(400);

      const res2 = await app.inject({
        method: 'POST',
        url: '/api/admin/championships',
        headers: { cookie: adminCookie },
        payload: {
          title: 'Torneio Muito Lento',
          max_participants: 8,
          rounds_per_match: 5,
          round_duration_seconds: 301,
          phase_interval_seconds: 3600,
        },
      });
      expect(res2.statusCode).toBe(400);
    });

    it('recusa phase_interval_seconds fora de 60..604800', async () => {
      const res1 = await app.inject({
        method: 'POST',
        url: '/api/admin/championships',
        headers: { cookie: adminCookie },
        payload: {
          title: 'Intervalo Pequeno Demais',
          max_participants: 8,
          rounds_per_match: 5,
          phase_interval_seconds: 59,
        },
      });
      expect(res1.statusCode).toBe(400);

      const res2 = await app.inject({
        method: 'POST',
        url: '/api/admin/championships',
        headers: { cookie: adminCookie },
        payload: {
          title: 'Intervalo Grande Demais',
          max_participants: 8,
          rounds_per_match: 5,
          phase_interval_seconds: 604801,
        },
      });
      expect(res2.statusCode).toBe(400);
    });
  });

  describe('Matriz de Edição (PATCH /api/admin/championships/:id)', () => {
    it('retorna 404 para ID inexistente', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/admin/championships/00000000-0000-0000-0000-000000000000',
        headers: { cookie: adminCookie },
        payload: { title: 'Novo Titulo' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('em "inscricoes": edita campos com sucesso', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/admin/championships',
        headers: { cookie: adminCookie },
        payload: {
          title: 'Original Inscricoes',
          max_participants: 8,
          rounds_per_match: 3,
          phase_interval_seconds: 3600,
        },
      });
      const created = JSON.parse(createRes.body);

      const patchRes = await app.inject({
        method: 'PATCH',
        url: `/api/admin/championships/${created.id}`,
        headers: { cookie: adminCookie },
        payload: {
          title: 'Alterado Inscricoes',
          max_participants: 16,
          rounds_per_match: 5,
        },
      });

      expect(patchRes.statusCode).toBe(200);
      const updated = JSON.parse(patchRes.body);
      expect(updated.title).toBe('Alterado Inscricoes');
      expect(updated.max_participants).toBe(16);
      expect(updated.rounds_per_match).toBe(5);
    });

    it('em "inscricoes": recusa reduzir max_participants para menos que inscritos (409)', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/admin/championships',
        headers: { cookie: adminCookie },
        payload: {
          title: 'Com Participantes',
          max_participants: 16,
          rounds_per_match: 3,
          phase_interval_seconds: 3600,
        },
      });
      const created = JSON.parse(createRes.body);

      for (let i = 0; i < 5; i++) {
        const [u] = await db
          .insert(users)
          .values({
            nick: `userpart_${i}`,
            nick_normalizado: `userpart_${i}`,
            password_hash: 'hash',
            recovery_code_hash: 'rechash',
            avatar_id: 1,
          })
          .returning();
        await db.insert(championshipParticipants).values({
          championship_id: created.id,
          user_id: u.id,
        });
      }

      const patchRes = await app.inject({
        method: 'PATCH',
        url: `/api/admin/championships/${created.id}`,
        headers: { cookie: adminCookie },
        payload: {
          max_participants: 4,
        },
      });

      expect(patchRes.statusCode).toBe(409);
    });

    it('em "chaveado": permite alterar título/descrição/banner mas recusa config de partida (409)', async () => {
      const [champ] = await db
        .insert(championships)
        .values({
          title: 'Chaveado Original',
          max_participants: 8,
          rounds_per_match: 5,
          round_duration_seconds: 60,
          phase_interval_seconds: 3600,
          status: 'chaveado',
          created_by: adminUserId,
        })
        .returning();

      const okRes = await app.inject({
        method: 'PATCH',
        url: `/api/admin/championships/${champ.id}`,
        headers: { cookie: adminCookie },
        payload: {
          title: 'Chaveado Renomeado',
          description: 'Nova descricao',
        },
      });
      expect(okRes.statusCode).toBe(200);
      const updated = JSON.parse(okRes.body);
      expect(updated.title).toBe('Chaveado Renomeado');

      const conflictRes = await app.inject({
        method: 'PATCH',
        url: `/api/admin/championships/${champ.id}`,
        headers: { cookie: adminCookie },
        payload: {
          rounds_per_match: 10,
        },
      });
      expect(conflictRes.statusCode).toBe(409);
    });

    it('em "finalizado": recusa qualquer alteração (409)', async () => {
      const [champ] = await db
        .insert(championships)
        .values({
          title: 'Finalizado Inalteravel',
          max_participants: 4,
          rounds_per_match: 3,
          phase_interval_seconds: 3600,
          status: 'finalizado',
          created_by: adminUserId,
        })
        .returning();

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/admin/championships/${champ.id}`,
        headers: { cookie: adminCookie },
        payload: {
          title: 'Tentativa de Alterar',
        },
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe('Largada e Avanço (POST start & advance)', () => {
    it('start recusa quando status não é "chaveado" (409)', async () => {
      const [champ] = await db
        .insert(championships)
        .values({
          title: 'Ainda em Inscricoes',
          max_participants: 8,
          rounds_per_match: 5,
          phase_interval_seconds: 3600,
          status: 'inscricoes',
          created_by: adminUserId,
        })
        .returning();

      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/championships/${champ.id}/start`,
        headers: { cookie: adminCookie },
      });

      expect(res.statusCode).toBe(409);
    });

    it('start com sucesso quando status é "chaveado"', async () => {
      const [champ] = await db
        .insert(championships)
        .values({
          title: 'Pronto para Largada',
          max_participants: 4,
          rounds_per_match: 3,
          phase_interval_seconds: 3600,
          status: 'chaveado',
          created_by: adminUserId,
        })
        .returning();

      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/championships/${champ.id}/start`,
        headers: { cookie: adminCookie },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.status).toBe('em_andamento');
      expect(data.started_at).not.toBeNull();
    });

    it('start grava started_at na hora do clique e abre a fase 1 depois da contagem da sala', async () => {
      const [champ] = await db
        .insert(championships)
        .values({
          title: 'Com Contagem',
          max_participants: 4,
          rounds_per_match: 3,
          phase_interval_seconds: 3600,
          status: 'chaveado',
          created_by: adminUserId,
        })
        .returning();

      await db.insert(championshipMatches).values([
        { championship_id: champ.id, phase: 1, slot: 0 },
        { championship_id: champ.id, phase: 1, slot: 1 },
        { championship_id: champ.id, phase: 2, slot: 0 },
      ]);

      const before = Date.now();
      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/championships/${champ.id}/start`,
        headers: { cookie: adminCookie },
      });
      const after = Date.now();
      expect(res.statusCode).toBe(200);

      const startedAt = new Date(JSON.parse(res.body).started_at).getTime();
      expect(startedAt).toBeGreaterThanOrEqual(before);
      expect(startedAt).toBeLessThanOrEqual(after);

      const phase1 = await db
        .select()
        .from(championshipMatches)
        .where(
          and(eq(championshipMatches.championship_id, champ.id), eq(championshipMatches.phase, 1))
        );
      expect(phase1).toHaveLength(2);
      for (const match of phase1) {
        expect(match.opens_at!.getTime()).toBe(startedAt + LOBBY_COUNTDOWN_SECONDS * 1000);
      }

      const [finalMatch] = await db
        .select()
        .from(championshipMatches)
        .where(
          and(eq(championshipMatches.championship_id, champ.id), eq(championshipMatches.phase, 2))
        );
      expect(finalMatch.opens_at).toBeNull();
    });

    it('advance recusa quando status não é "em_andamento" (409)', async () => {
      const [champ] = await db
        .insert(championships)
        .values({
          title: 'Nao Iniciado',
          max_participants: 4,
          rounds_per_match: 3,
          phase_interval_seconds: 3600,
          status: 'chaveado',
          created_by: adminUserId,
        })
        .returning();

      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/championships/${champ.id}/advance`,
        headers: { cookie: adminCookie },
      });

      expect(res.statusCode).toBe(409);
    });

    it('advance responde 200 quando "em_andamento"', async () => {
      const [champ] = await db
        .insert(championships)
        .values({
          title: 'Em Duelos',
          max_participants: 4,
          rounds_per_match: 3,
          phase_interval_seconds: 3600,
          status: 'em_andamento',
          created_by: adminUserId,
        })
        .returning();

      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/championships/${champ.id}/advance`,
        headers: { cookie: adminCookie },
      });

      expect(res.statusCode).toBe(200);
    });
  });

  describe('Exclusão e Listagem', () => {
    it('exclui campeonato com sucesso (204)', async () => {
      const [champ] = await db
        .insert(championships)
        .values({
          title: 'Para Excluir',
          max_participants: 4,
          rounds_per_match: 3,
          phase_interval_seconds: 3600,
          status: 'inscricoes',
          created_by: adminUserId,
        })
        .returning();

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/admin/championships/${champ.id}`,
        headers: { cookie: adminCookie },
      });

      expect(res.statusCode).toBe(204);

      const check = await db.select().from(championships).where(eq(championships.id, champ.id));
      expect(check.length).toBe(0);
    });

    it('GET /api/admin/championships retorna lista com participant_count e current_phase', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/championships',
        headers: { cookie: adminCookie },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);

      const first = data[0];
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('title');
      expect(first).toHaveProperty('status');
      expect(first).toHaveProperty('participant_count');
      expect(first).toHaveProperty('current_phase');
    });
  });
});
