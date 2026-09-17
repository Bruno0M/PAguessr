# Relatório de Integração Real: Campeonatos

Data da verificação: 2026-09-17
Ambiente: Desenvolvimento (PostgreSQL dev na porta 5434, API dev na porta 3333 via HTTP/curl).
Clientes auditados:
- `apps/web/src/api/championships.ts` (Mirante)
- `apps/web/src/api/adminChampionships.ts` (Torre)
- Componentes consumidores: `ChampionshipsPage.tsx`, `ChampionshipDetailPage.tsx`, `DuelScreen.tsx`, `AdminChampionshipsPage.tsx`.

---

## 1. Sumário Executivo

O fluxo completo de ponta a ponta foi exercitado por HTTP com dados reais no banco de desenvolvimento:
1. Autenticação de admin e jogadores comuns;
2. Criação de campeonato via admin (`POST /api/admin/championships`);
3. Inscrições sucessivas até lotação (`POST /api/championships/:id/join`), com disparo do sorteio na última vaga e transição imediata para `status = 'chaveado'`;
4. Largada pelo admin (`POST /api/admin/championships/:id/start`), abrindo a fase 1 com `opens_at`;
5. Leitura da chave e estado individual (`GET /api/championships/:id`);
6. Entrada idempotente de ambos os lados no duelo (`POST .../enter`), gerando os mesmos locais, ordens e horários pré-calculados de rodada;
7. Consulta do confronto ao vivo (`GET .../live`) e consolidação por tempo/avanço preguiçoso;
8. Consulta do ranking do campeonato (`GET .../ranking`);
9. Forçamento de avanço pelo admin (`POST .../advance`) até finalização.

A arquitetura geral e a maior parte dos contratos estão alinhados, com suporte a dualidade snake_case/camelCase em identificadores e datas ISO compatíveis. Foram encontradas **2 divergências reais de payload** e **1 restrição de regra de negócio em cadastro de admin** que merecem atenção.

---

## 2. Divergências Encontradas

### Divergência 1: Placar Parcial do Adversário Ausente no Polling de Duelo (`GET .../live`)
- **Endpoint**: `GET /api/championships/:id/matches/:matchId/live`
- **O que o frontend espera**:
  - `DuelScreen.tsx` (linhas 114–123) busca `live.opponent_score` ou `live.opponentScore` para exibir o placar parcial ao vivo do oponente no cabeçalho do duelo (`opponentScore`).
  - A spec (§1.1 e §5.1) define: *"O que sobra para 'ver o adversário ao vivo' (placar parcial, se ele já respondeu)... só o total parcial e o progresso"*.
- **O que a API devolve atualmente**:
  - Devolve apenas:
    ```json
    {
      "currentRound": 2,
      "current_round": 2,
      "myScore": 0,
      "my_score": 0,
      "opponentRoundsAnswered": 0,
      "opponent_rounds_answered": 0,
      "resolvedAt": "2026-09-17T21:48:03.756Z",
      "resolved_at": "2026-09-17T21:48:03.756Z",
      "winnerId": "...",
      "winner_id": "..."
    }
    ```
  - **Não contém** `opponentScore` nem `opponent_score`.
  - Impacto: O placar do adversário fica congelado em 0 durante todo o duelo no frontend.
  - Além disso, a tipagem `LiveMatchResponse` em `apps/web/src/api/championships.ts` não inclui o campo.
- **Arquivos que precisam mudar**:
  1. `apps/api/src/routes/championshipRoutes.ts` (Basalto) — incluir `opponentScore` e `opponent_score` calculando a pontuação acumulada do jogo do oponente (`oppGameId`).
  2. `apps/web/src/api/championships.ts` (Mirante) — adicionar `opponentScore?: number; opponent_score?: number;` na interface `LiveMatchResponse`.

---

### Divergência 2: Campeão Ausente na Lista de Campeonatos (`GET /api/championships`)
- **Endpoint**: `GET /api/championships`
- **O que o frontend espera**:
  - `apps/web/src/api/championships.ts` define `ChampionshipListItem` com os campos opcionais: `winner_id`, `winner_nick`, `winner_avatar_id`, e `champion: { nick: string; avatarId?: number }`.
  - `ChampionshipsPage.tsx` (linhas 352–362) renderiza o selo de campeão no card:
    `item.status === 'finalizado' && (item.champion?.nick || item.winner_nick) -> Campeão: [nick]`.
  - A spec (§7.2) especifica: `finalizado -> Ver resultado, com o campeão no card`.
- **O que a API devolve atualmente**:
  - O select do endpoint `GET /championships` devolve: `id, title, description, banner_url, banner, status, max_participants, rounds_per_match, round_duration_seconds, phase_interval_seconds, created_at, seeded_at, started_at, finished_at, participants, joined`.
  - **Não devolve** nenhum campo referente ao vencedor/campeão.
  - Impacto: Campeonatos finalizados nunca exibem o nome do campeão no card da lista principal.
- **Arquivo que precisa mudar**:
  - `apps/api/src/routes/championshipRoutes.ts` (Basalto) — fazer subquery/join para obter o `winner_id` do confronto final (`phase = totalPhases`) e o `nick`/`avatar_id` do usuário correspondente quando `status = 'finalizado'`.

---

### Observação de Validação: Nick contendo substring "admin" é rejeitado no registro
- **Endpoint**: `POST /api/auth/register`
- **Comportamento observado**:
  - Ao tentar cadastrar `adminteste`, a API rejeita com `400 Bad Request` (`{"error":"Esse nick não é permitido"}`).
  - Causa: `containsBlockedWord` em `apps/api/src/auth/nickname.ts` possui `'admin'` na lista `BLOCKED_SUBSTRINGS`.
  - Impacto: Contas de administrador para testes manuais não podem conter a palavra "admin" no nick (ex.: cadastrado `admtorres` com sucesso).
- **Arquivo que precisa mudar (se desejado permitir)**:
  - `apps/api/src/auth/nickname.ts` (Basalto).

---

## 3. Matriz Completa de Endpoints Auditados

| # | Método | Rota | Status HTTP | Resposta API vs. Front | Status |
|---|---|---|---|---|---|
| 1 | `POST` | `/api/admin/championships` | `201 Created` | Devolve `AdminChampionship` com todos os campos de configuração e status `'inscricoes'`. | **OK** |
| 2 | `GET` | `/api/admin/championships` | `200 OK` | Array de `AdminChampionship` contendo `participant_count` e `current_phase`. | **OK** |
| 3 | `PATCH` | `/api/admin/championships/:id` | `200 OK` | Devolve `AdminChampionship` atualizado. Validado de acordo com a matriz de estados. | **OK** |
| 4 | `DELETE` | `/api/admin/championships/:id` | `204 No Content` | Exclui em cascata; cliente trata 204 como sucesso. | **OK** |
| 5 | `POST` | `/api/admin/championships/:id/start` | `200 OK` | Altera status para `'em_andamento'`, grava `started_at` e abre fase 1 com `opens_at`. | **OK** |
| 6 | `POST` | `/api/admin/championships/:id/advance` | `200 OK` | Força avaliação do avanço de fase e encerra campeonato na final. | **OK** |
| 7 | `POST` | `/api/championships/:id/join` | `200 OK` / `409` | Devolve `{success, seeded, status}`. Dispara sorteio ao lotar. Rejeita 409 quando lotado. | **OK** |
| 8 | `DELETE` | `/api/championships/:id/join` | `204 No Content` | Remove inscrição em `inscricoes`; cliente trata 204 como sucesso. | **OK** |
| 9 | `GET` | `/api/championships` | `200 OK` | Lista de campeonatos com contadores e flag `joined`. Falta info de campeão em finalizados. | **DIVERGÊNCIA** (Falta `champion`/`winner_nick`) |
| 10 | `GET` | `/api/championships/:id` | `200 OK` | Devolve `ChampionshipDetail` completo: `participants`, `matches` (com `playerA`/`playerB`), `myMatch` e `myStatus`. | **OK** |
| 11 | `POST` | `/api/championships/:id/matches/:matchId/enter` | `200 OK` | Idempotente: duas chamadas consecutivas devolveram o mesmo `gameId` e rodadas com locais idênticos e `startedAt` derivado. | **OK** |
| 12 | `GET` | `/api/championships/:id/matches/:matchId/live` | `200 OK` | Devolve rodada atual, placar próprio, rodadas respondidas pelo oponente e `winnerId`. | **DIVERGÊNCIA** (Falta `opponentScore`) |
| 13 | `GET` | `/api/championships/:id/ranking` | `200 OK` | Array de `ChampionshipRankingEntry` ordenado pelos 3 critérios da spec (fase, pontos, menor seed). | **OK** |

---

## 4. Endpoints Pendentes

Nenhum. Todos os 13 endpoints de jogadores e de administração de campeonatos especificados na seção 5 da spec já estão implementados, roteados e respondendo no ambiente de desenvolvimento.
