# Relatório de Integração Real: Campeonatos

Data da verificação: 2026-09-17  
Ambiente: Desenvolvimento (PostgreSQL dev na porta 5434, API dev na porta 3333).  
Metodologia: Exercício do fluxo completo via HTTP com `curl`, confrontando respostas reais com os clientes TypeScript do frontend (`apps/web/src/api/championships.ts`, `apps/web/src/api/adminChampionships.ts`, `apps/web/src/api/auth.ts`) e componentes consumidores.

---

## 1. O que funciona

- Registro e login de usuários via `POST /api/auth/register` e `POST /api/auth/login` gerando cookie de sessão `pag_session`.
- Criação de campeonato via admin em `POST /api/admin/championships` com validação de payload e status inicial `inscricoes`.
- Listagem admin em `GET /api/admin/championships` retornando contadores `participant_count` e `current_phase`.
- Edição de campeonato via admin em `PATCH /api/admin/championships/:id` respeitando a matriz de campos por estado.
- Inscrição de participantes em `POST /api/championships/:id/join` com transição atômica para `chaveado` e geração determinística de todas as fases da chave ao preencher a 4ª vaga.
- Bloqueio com `409 Conflict` ao tentar inscrever participante em campeonato com inscrições encerradas (`chaveado`).
- Largada pelo admin em `POST /api/admin/championships/:id/start` mudando status para `em_andamento`, gravando `started_at` e inicializando `opens_at` da fase 1.
- Consulta detalhada em `GET /api/championships/:id` com chave completa, participantes com seed, `myMatch` e `myStatus` (`ready_to_play`).
- Entrada no duelo em `POST /api/championships/:id/matches/:matchId/enter` estritamente idempotente (chamada repetida devolveu o mesmo `gameId` e mesmas rodadas com `startedAt` derivado idêntico para ambos os competidores).
- Consulta ao vivo do confronto em `GET /api/championships/:id/matches/:matchId/live` informando rodada atual e estado de consolidação.
- Resolução de duelo por W.O. duplo e desempate por menor seed sem travar a chave.
- Avanço forçado pelo admin em `POST /api/admin/championships/:id/advance` finalizando o torneio (`status = 'finalizado'`, `finished_at`).
- Ranking do campeonato em `GET /api/championships/:id/ranking` ordenando corretamente pelos 3 critérios (fase alcançada, pontuação total e menor seed).

---

## 2. Divergências front x API

### Divergência 1: Placar Parcial do Adversário no Polling do Duelo

**Status: resolvido.** O `live` manda `opponentScore` (só rodadas fechadas) e `rounds`.

- **Endpoint**: `GET /api/championships/:id/matches/:matchId/live`
- **O que a API devolve**:
  Campos devolvidos:
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
    "winnerId": "ad724c29-d146-4fe3-8d27-b88dd2417bae",
    "winner_id": "ad724c29-d146-4fe3-8d27-b88dd2417bae"
  }
  ```
  A API **não envia** `opponentScore` nem `opponent_score`.
- **O que o front espera**:
  - `apps/web/src/components/duel/DuelScreen.tsx`, linhas 114–122: o componente consome `live.opponent_score` ou `live.opponentScore` (`number`) para atualizar `opponentScore` no cabeçalho do duelo ao vivo. Sem esse campo, o placar do oponente permanece sempre em 0 durante a partida.
  - `apps/web/src/api/championships.ts`, linhas 130–141: a interface `LiveMatchResponse` não possui `opponentScore` nem `opponent_score` declarados em TypeScript.
- **De quem é o arquivo que precisa mudar**:
  - **Basalto** (`apps/api/src/routes/championshipRoutes.ts`): calcular e retornar `opponentScore` / `opponent_score` a partir dos pontos acumulados do oponente (`oppGameId`).
  - **Mirante** (`apps/web/src/api/championships.ts`): adicionar `opponentScore?: number; opponent_score?: number;` na interface `LiveMatchResponse`.

---

### Divergência 2: Informações do Campeão na Lista de Campeonatos

- **Endpoint**: `GET /api/championships`
- **O que a API devolve**:
  Array de objetos contendo apenas:
  ```json
  {
    "id": "f7a279ab-5979-4347-a37f-0896cd8171c2",
    "title": "Copa Paulo Afonso Atualizada",
    "description": "Primeira copa teste de integracao",
    "banner_url": "https://example.com/banner.jpg",
    "banner": "https://example.com/banner.jpg",
    "status": "finalizado",
    "max_participants": 4,
    "rounds_per_match": 2,
    "round_duration_seconds": 30,
    "phase_interval_seconds": 60,
    "created_at": "2026-09-17T20:19:57.082Z",
    "seeded_at": "2026-09-17T21:45:34.575Z",
    "started_at": "2026-09-17T21:47:03.756Z",
    "finished_at": "2026-09-17T21:49:19.383Z",
    "participants": 4,
    "joined": true
  }
  ```
  A API **não envia** nenhum campo identificando o vencedor da final (`winner_id`, `winner_nick`, `winner_avatar_id` ou `champion`).
- **O que o front espera**:
  - `apps/web/src/api/championships.ts`, linhas 21–27: `ChampionshipListItem` define `winner_id?: string | null; winner_nick?: string | null; winner_avatar_id?: number | null; champion?: { nick: string; avatarId?: number } | null;`.
  - `apps/web/src/components/championships/ChampionshipsPage.tsx`, linhas 352–362: exibe o badge `"Campeão: {championNick}"` quando `item.status === 'finalizado'`, lendo `item.champion?.nick ?? item.winner_nick`. Como a API não envia o campo, o badge de campeão nunca é renderizado no card.
- **De quem é o arquivo que precisa mudar**:
  - **Basalto** (`apps/api/src/routes/championshipRoutes.ts`): na query de `GET /championships`, incluir subquery/join para preencher `winner_id`, `winner_nick` e `winner_avatar_id` (ou objeto `champion`) do vencedor da fase final quando o status for `'finalizado'`.

---

### Divergência 3: Duplicação de Chaves camelCase e snake_case nos Payloads da API

- **Endpoints**:
  - `GET /api/championships/:id`
  - `POST /api/championships/:id/matches/:matchId/enter`
  - `GET /api/championships/:id/matches/:matchId/live`
  - `GET /api/championships/:id/ranking`
- **O que a API devolve**:
  A API envia pares duplicados para quase todas as propriedades nos payloads JSON:
  - `userId` (`string`) E `user_id` (`string`)
  - `avatarId` (`number`) E `avatar_id` (`number`)
  - `joinedAt` (`string`) E `joined_at` (`string`)
  - `eliminatedInPhase` (`number | null`) E `eliminated_in_phase` (`number | null`)
  - `championshipId` (`string`) E `championship_id` (`string`)
  - `playerAId` (`string | null`) E `player_a_id` (`string | null`)
  - `playerBId` (`string | null`) E `player_b_id` (`string | null`)
  - `gameAId` (`string | null`) E `game_a_id` (`string | null`)
  - `gameBId` (`string | null`) E `game_b_id` (`string | null`)
  - `scoreA` (`number | null`) E `score_a` (`number | null`)
  - `scoreB` (`number | null`) E `score_b` (`number | null`)
  - `winnerId` (`string | null`) E `winner_id` (`string | null`)
  - `opensAt` (`string | null`) E `opens_at` (`string | null`)
  - `resolvedAt` (`string | null`) E `resolved_at` (`string | null`)
  - `gameId` (`string`) E `game_id` (`string`)
  - `order` (`number`) E `ordem` (`number`)
  - `startedAt` (`string | null`) E `started_at` (`string | null`)
  - `durationSeconds` (`number`) E `duration_seconds` (`number`)
  - `currentRound` (`number`) E `current_round` (`number`)
  - `myScore` (`number`) E `my_score` (`number`)
  - `opponentRoundsAnswered` (`number`) E `opponent_rounds_answered` (`number`)
  - `phaseReached` (`number`) E `phase_reached` (`number`)
  - `totalScore` (`number`) E `total_score` (`number`)
- **O que o front espera**:
  - `apps/web/src/api/championships.ts` (linhas 30–142): as interfaces declaram campos camelCase como primários e snake_case como opcionais de fallback (ex.: `userId: string; user_id?: string;`).
  - O frontend funciona com a duplicação, mas o payload trafega com ~30% de overhead redundante por duplicar todas as chaves.
- **De quem é o arquivo que precisa mudar**:
  - **Basalto** (`apps/api/src/routes/championshipRoutes.ts`) e **Torre** (`apps/api/src/routes/championshipRankingRoutes.ts`): padronizar a resposta da API preferencialmente em camelCase (ou snake_case canônico), e alinhar as interfaces do front em `apps/web/src/api/championships.ts` (Mirante).

---

### Divergência 4: Nomenclatura do Campo de Senha no Registro e Login

- **Endpoints**: `POST /api/auth/register` e `POST /api/auth/login`
- **O que a API devolve / espera**:
  - A API espera `password` (`string`).
- **O que o front envia**:
  - `apps/web/src/api/auth.ts`, linha 27 e 30: `register(nick, password, avatarId)` envia `{ nick, password, avatarId }`.
  - `apps/web/src/api/auth.ts`, linha 33 e 34: `login(nick, password)` envia `{ nick, password }`.
  - Ambos usam o nome `password` (`string`).
- **Status**: Alinhado (sem divergência de contrato entre front e API).

---

### Divergência 5: Bloqueio de Substring "admin" no Nickname Durante Registro

- **Endpoint**: `POST /api/auth/register`
- **O que a API devolve**:
  `400 Bad Request` com `{"error":"Esse nick não é permitido"}` ao tentar cadastrar nicks como `adminteste`.
- **O que a spec / ambiente espera**:
  - No arquivo `.env`, `ADMIN_NICKS` aceita lista de nicks como `eubruno,adminteste`.
  - `apps/api/src/auth/nickname.ts` (linha 9) possui `'admin'` no array `BLOCKED_SUBSTRINGS`, impedindo qualquer registro de nick que contenha a palavra "admin" via API pública.
- **De quem é o arquivo que precisa mudar**:
  - **Basalto** (`apps/api/src/auth/nickname.ts`): se for desejado permitir nicks de administradores com o prefixo/termo "admin", o filtro precisa ignorar nicks presentes em `ADMIN_NICKS`.

---

## 3. Pendências

1. **Submissão de Palpites em Partidas de Campeonato**:
   - `POST /api/rounds/:id/guess`: não foi exercitado com envio de palpites intermediários de coordenadas durante o duelo. As partidas foram resolvidas via encerramento da janela de tempo e resolução de W.O. por seed.
   - Motivo: foco estrito no fluxo de ciclo de vida de campeonatos sem rodar gameplay interativo de geolocalização.

2. **Cancelamento de Inscrição em Status `inscricoes`**:
   - `DELETE /api/championships/:id/join`: foi validado apenas o retorno `409 Conflict` quando o campeonato já estava lotado/chaveado. Não foi exercitada a remoção bem-sucedida (204) enquanto o status ainda era `inscricoes`.
   - Motivo: as 4 inscrições foram realizadas sequencialmente para atingir a lotação e disparar o chaveamento.

3. **Exclusão Administrativa de Campeonato Finalizado**:
   - `DELETE /api/admin/championships/:id`: não foi disparada contra o campeonato criado no banco de desenvolvimento.
   - Motivo: preservação do registro completo (`f7a279ab-5979-4347-a37f-0896cd8171c2`) com histórico de partidas, rodadas e ranking para conferência dos demais desenvolvedores no banco de dev.
