# Spec: Campeonatos

Torneios mata-mata 1v1 dentro do PAguessr. O admin cria o campeonato, jogadores se
inscrevem, o chaveamento é sorteado ao lotar e o admin dá a largada.

Registrado em 2026-09-17. Complementa [DECISIONS.md](DECISIONS.md).

## 1. Decisões que fecham o escopo

| Pergunta                  | Decisão                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| Formato                   | Mata-mata de eliminatória simples, 1v1. Sem repescagem.                                       |
| Vagas                     | Só potências de 2: **4, 8, 16 ou 32**. Chave perfeita, sem bye.                               |
| "Quantidade de rodadas"   | Quantos **locais** cada duelo tem (igual às 5 do Ranqueado).                                  |
| "Tempo entre cada rodada" | Intervalo entre **fases** do chaveamento (ex.: 24 h da fase 1 para a semi).                   |
| Duelo                     | **Ao vivo, simultâneo**: os dois adversários jogam os mesmos locais no mesmo relógio.         |
| Tempo por local           | **Configurável por campeonato**, 10 a 300 s. Padrão 60 s, o `ROUND_DURATION_MS` do Ranqueado. |

### 1.1. Ao vivo sem WebSocket

O projeto não tem WebSocket e esta spec **não introduz um**. O duelo é simultâneo porque
o relógio é do servidor, não porque existe um canal aberto.

Quando uma fase abre, o servidor grava `opens_at` no confronto e deriva o `started_at` de
todas as rodadas dos dois jogadores a partir dele:

```
started_at(rodada N) = opens_at + (N - 1) * round_duration_seconds
```

Como `round_duration_seconds` é do campeonato, os dois lados do duelo usam
obrigatoriamente o mesmo valor — a configuração não abre brecha de justiça.

Os dois jogadores caem exatamente na mesma rodada no mesmo instante, tenham entrado na
tela ou não. Quem chega atrasado perde o tempo que passou — não atrasa o adversário nem
trava a partida esperando alguém ficar online. É o mesmo mecanismo que o Ranqueado já usa
(`activateRound` / `started_at` em `gameRoutes.ts`), só que com o `started_at` pré-calculado
em vez de ativado a cada palpite.

O que sobra para "ver o adversário ao vivo" (placar parcial, se ele já respondeu) é
enfeite, e vem de **polling** de ~3 s num endpoint leve. Se o polling falhar, o duelo
continua correto: o servidor é a fonte da verdade do relógio e da pontuação.

**Trade-off aceito:** não há aviso em tempo real de que a fase abriu. Quem não estiver com
a tela aberta na hora marcada joga com menos tempo ou leva W.O. Notificação fica fora do
escopo (ver §9).

## 2. Modelo de dados

Migration nova: `0005_championships.sql`. Três tabelas novas e uma coluna em `games`.

### 2.1. `championships`

| Coluna                   | Tipo                         | Notas                             |
| ------------------------ | ---------------------------- | --------------------------------- |
| `id`                     | `uuid` PK                    | `defaultRandom()`                 |
| `title`                  | `varchar(80)` not null       |                                   |
| `description`            | `text`                       | opcional                          |
| `banner_url`             | `text`                       | opcional, URL externa (ver §9)    |
| `max_participants`       | `integer` not null           | 4, 8, 16 ou 32                    |
| `rounds_per_match`       | `integer` not null           | 1 a 10                            |
| `round_duration_seconds` | `integer` not null           | 10 a 300, default 60              |
| `phase_interval_seconds` | `integer` not null           | intervalo entre fases             |
| `status`                 | `text` not null              | ver §2.6                          |
| `created_by`             | `uuid` not null → `users.id` |                                   |
| `created_at`             | `timestamptz` not null       | `defaultNow()`                    |
| `seeded_at`              | `timestamptz`                | quando o chaveamento foi sorteado |
| `started_at`             | `timestamptz`                | quando o admin deu a largada      |
| `finished_at`            | `timestamptz`                |                                   |

### 2.2. `championship_participants`

| Coluna                | Tipo                                                     | Notas                                        |
| --------------------- | -------------------------------------------------------- | -------------------------------------------- |
| `championship_id`     | `uuid` not null → `championships.id` `on delete cascade` |                                              |
| `user_id`             | `uuid` not null → `users.id` `on delete cascade`         |                                              |
| `seed`                | `integer`                                                | posição sorteada, 0..N-1. Null até o sorteio |
| `joined_at`           | `timestamptz` not null                                   | `defaultNow()`                               |
| `eliminated_in_phase` | `integer`                                                | null enquanto vivo                           |

PK composta `(championship_id, user_id)`. Índice em `championship_id`.

### 2.3. `championship_matches`

| Coluna                        | Tipo                      | Notas                                           |
| ----------------------------- | ------------------------- | ----------------------------------------------- |
| `id`                          | `uuid` PK                 |                                                 |
| `championship_id`             | `uuid` not null → cascade |                                                 |
| `phase`                       | `integer` not null        | 1 = primeira fase; a final é a última           |
| `slot`                        | `integer` not null        | posição do confronto dentro da fase, 0-indexado |
| `player_a_id` / `player_b_id` | `uuid` → `users.id`       | null nas fases ainda não preenchidas            |
| `game_a_id` / `game_b_id`     | `uuid` → `games.id`       | a partida de cada lado                          |
| `score_a` / `score_b`         | `integer`                 | consolidado ao fim do duelo                     |
| `winner_id`                   | `uuid` → `users.id`       |                                                 |
| `opens_at`                    | `timestamptz`             | âncora do relógio (§1.1)                        |
| `resolved_at`                 | `timestamptz`             |                                                 |

Unique `(championship_id, phase, slot)`.

### 2.4. `games.championship_match_id`

Coluna `uuid` nullable em `games`, referenciando `championship_matches.id`. Reaproveita
toda a máquina de partida existente (rodadas, proxy de imagem, palpite, pontuação) em vez
de duplicá-la.

> **Atenção — regressão silenciosa.** `rankingRoutes.ts` hoje soma _todas_ as partidas
> finalizadas. Sem filtro, partida de campeonato entra no ranking geral e no da semana.
> A query precisa ganhar `isNull(games.championship_match_id)`. Isto é obrigatório, não
> opcional, e merece teste próprio.

### 2.5. `rounds.duration_seconds`

Coluna `integer not null default 60` em `rounds`. **É ela, e não a constante, que manda.**

`ROUND_DURATION_MS` hoje é lido em três lugares, e todos decidem coisas diferentes:

| Onde                | Linha                                    | O que decide                                                |
| ------------------- | ---------------------------------------- | ----------------------------------------------------------- |
| `reserveImageFetch` | `gameRoutes.ts:69`                       | se o proxy ainda pode buscar a imagem no Google (cota paga) |
| handler do palpite  | `gameRoutes.ts:442`                      | `isLate`, que zera a pontuação da rodada                    |
| cronômetro do front | `App.tsx` (`useEffect` de `secondsLeft`) | a contagem regressiva e o envio automático no zero          |

Os três passam a ler `round.duration_seconds`. Guardar a duração **na rodada**, e não só no
campeonato, é o que mantém isso simples: o proxy de imagem e o handler de palpite recebem
um `roundId` e não sabem nada de campeonato — sem a coluna, os dois precisariam de um join
até `championships` a cada request.

Efeito colateral bom: as rodadas passam a registrar com quanto tempo foram jogadas, o que
antes era implícito na constante.

> **Cuidado com o `isLate`.** Rodada curta (10 s) com a imagem demorando a carregar
> significa jogador zerado por latência, não por erro. A folga do proxy
> (`IMAGE_FETCH_GRACE_MS`, 10 s) é medida de cota e **não** entra no `isLate` — não confundir
> as duas. Se 10 s se mostrar cruel na prática, o piso sobe; é só mexer no limite em `shared`.

O Ranqueado continua gravando 60 s e nada muda para ele. A constante segue em `shared` como
**default**, não como regra.

### 2.6. Estados do campeonato

```
inscricoes ──(lotou)──> chaveado ──(admin inicia)──> em_andamento ──> finalizado
     │                      │                             │
     └──────────────────────┴─────────────────────────────┴──> cancelado (admin exclui)
```

- `inscricoes`: aceita entradas. Admin pode editar tudo.
- `chaveado`: lotou, chave sorteada e visível. **Não começou.** Participantes veem a tela de espera.
- `em_andamento`: fase 1 aberta. Duelos rolando.
- `finalizado`: a final foi resolvida. `winner_id` da última fase é o campeão.

## 3. Chaveamento

### 3.1. Sorteio

Disparado **na transação da última inscrição** — quando o contador de participantes
atinge `max_participants`. Fazer isso dentro da transação do `join` evita duas pessoas
entrando ao mesmo tempo na última vaga.

1. Embaralha os participantes (mesmo `shuffle` de `gameRoutes.ts`, vale extrair para `shared`).
2. Grava `seed` = 0..N-1 na ordem embaralhada.
3. Cria **todos** os confrontos de **todas** as fases de uma vez, inclusive os vazios.
4. `status = 'chaveado'`, `seeded_at = now()`.

Criar as fases futuras vazias desde já deixa a tela de chave trivial de renderizar (a
estrutura é fixa) e dá um destino determinístico para o vencedor.

Total de fases = `log2(max_participants)`: 4 → 2 fases, 8 → 3, 16 → 4, 32 → 5.

Fase 1, confronto `slot = i`: `player_a` = seed `2i`, `player_b` = seed `2i + 1`.

### 3.2. Avanço

O vencedor do confronto `(fase p, slot s)` vai para `(fase p+1, slot ⌊s/2⌋)`:

- como `player_a` se `s` for par;
- como `player_b` se `s` for ímpar.

### 3.3. Quem ganha o duelo

Maior soma de pontos das `rounds_per_match` rodadas. Empate resolve nesta ordem:

1. menor distância acumulada;
2. quem enviou o último palpite mais cedo;
3. menor `seed` (determinístico, nunca sorteia de novo).

**Ausência (W.O.):** quem não palpitar em nenhuma rodada fica com 0 e perde. Se os **dois**
faltarem, avança o de menor `seed` — a chave nunca trava por ausência.

## 4. Progressão das fases sem agendador

O projeto não tem cron nem fila, e esta spec não adiciona um. O avanço é **preguiçoso**,
avaliado quando alguém lê o campeonato (`GET /api/championships/:id` e o endpoint de
polling), dentro de uma transação idempotente:

1. Todo confronto da fase atual com o tempo esgotado e sem `resolved_at` é consolidado
   (§3.3) e o vencedor é promovido (§3.2).
2. Se **toda** a fase está resolvida e ainda há fase seguinte, ela recebe
   `opens_at = max(resolved_at da fase) + phase_interval_seconds`.
3. Se a fase resolvida era a final, `status = 'finalizado'`.

Consequência aceita: um campeonato sem ninguém olhando não avança sozinho — ele avança no
primeiro acesso, com os horários calculados corretamente para trás. Nenhum jogador perde
tempo de jogo por causa disso, porque o relógio do duelo vem de `opens_at`, não do
instante da consolidação.

Escape hatch: `POST /api/admin/championships/:id/advance` força a avaliação. Útil para
destravar na mão e para testar.

## 5. API

Tudo sob sessão (`requireAuth`); a seção de admin usa `requireAdmin` (`ADMIN_NICKS`).

### 5.1. Jogador

| Método   | Rota                                            | Descrição                                                                                                                      |
| -------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `GET`    | `/api/championships`                            | Lista. Campos: id, título, banner, status, `participants`/`max_participants`, `joined` (se eu estou dentro).                   |
| `GET`    | `/api/championships/:id`                        | Detalhe: dados, chave completa, meu confronto atual, meu estado. Dispara o avanço preguiçoso (§4).                             |
| `POST`   | `/api/championships/:id/join`                   | Entra. 409 se lotado, já inscrito ou fora de `inscricoes`. Dispara o sorteio ao lotar.                                         |
| `DELETE` | `/api/championships/:id/join`                   | Sai. Só em `inscricoes`.                                                                                                       |
| `GET`    | `/api/championships/:id/ranking`                | Ranking do campeonato (§6).                                                                                                    |
| `POST`   | `/api/championships/:id/matches/:matchId/enter` | Entra no duelo. Devolve `gameId` + rodadas com `started_at` já calculado. Idempotente: chamar de novo devolve a mesma partida. |
| `GET`    | `/api/championships/:id/matches/:matchId/live`  | Alvo do polling: rodada atual, meu placar parcial, quantas rodadas o adversário já respondeu, `resolved_at`.                   |

Palpite continua em `POST /api/rounds/:id/guess`. Nada muda ali.

`enter` cria as duas partidas na primeira chamada, **com os mesmos locais na mesma ordem**
para os dois lados (justiça do duelo). Não usa `pickLocationsForUser`: a seleção é por
confronto, não por jogador. Mantém a regra de não repetir local dentro do mesmo campeonato
enquanto o pool permitir.

O endpoint `live` **não** revela o palpite nem os pontos por rodada do adversário antes da
rodada fechar — só o total parcial e o progresso. Sem isso o adversário vira dica.

### 5.2. Admin

| Método   | Rota                                   | Descrição                                                        |
| -------- | -------------------------------------- | ---------------------------------------------------------------- |
| `GET`    | `/api/admin/championships`             | Lista com contadores.                                            |
| `POST`   | `/api/admin/championships`             | Cria.                                                            |
| `PATCH`  | `/api/admin/championships/:id`         | Edita (§5.3).                                                    |
| `DELETE` | `/api/admin/championships/:id`         | Exclui (cascade).                                                |
| `POST`   | `/api/admin/championships/:id/start`   | Largada. Só de `chaveado`. Abre a fase 1 com `opens_at = now()`. |
| `POST`   | `/api/admin/championships/:id/advance` | Força a avaliação de avanço.                                     |

### 5.3. O que dá para editar, e quando

| Campo                                                                  | `inscricoes`              | `chaveado` / `em_andamento` | `finalizado` |
| ---------------------------------------------------------------------- | ------------------------- | --------------------------- | ------------ |
| Título, descrição, banner                                              | ✅                        | ✅                          | ❌           |
| `rounds_per_match`, `phase_interval_seconds`, `round_duration_seconds` | ✅                        | ❌                          | ❌           |
| `max_participants`                                                     | ✅, desde que ≥ inscritos | ❌                          | ❌           |

Mudar `max_participants` depois do sorteio significaria refazer a chave com gente já
eliminada — a API recusa com 409.

`DELETE` funciona em qualquer estado (cascade em participantes, confrontos e partidas),
mas a UI exige confirmação digitando o título quando o campeonato não está em `inscricoes`.

### 5.4. Validação na criação

```
title                   3..80 caracteres
description             até 500, opcional
banner_url              http(s), até 500, opcional
max_participants        ∈ {4, 8, 16, 32}
rounds_per_match        1..10
round_duration_seconds  10..300     (default 60)
phase_interval_seconds  60..604800  (1 min a 7 dias)
```

Constantes em `packages/shared` (`CHAMPIONSHIP_SIZES`, `ROUND_DURATION_MIN_SECONDS`,
`ROUND_DURATION_MAX_SECONDS`, `phasesFor(size)`), para
front e API validarem com a mesma régua — mesmo padrão já usado no nick.

## 6. Ranking do campeonato

Aba dentro da tela do campeonato. Ordena por:

1. fase alcançada (campeão primeiro, depois eliminados na final, e assim por diante);
2. pontos totais somados em todos os duelos disputados;
3. menor `seed`.

Mostra todos os participantes, inclusive eliminados. É independente do ranking geral, que
por sua vez **ignora** partidas de campeonato (§2.4).

## 7. Telas

### 7.1. Menu principal

`MENU_ITEMS` em `HomeScreen.tsx` ganha `campeonatos` **logo abaixo de `ranqueado`**:

```
Ranqueado
Campeonatos   ← novo
Ranking
Como jogar
Sair
```

Mesmo padrão dos outros: `eyebrow: 'Modo'`, descrição e `facts`. O painel de prévia pode
mostrar "N campeonatos abertos", no mesmo espírito do "Seu recorde" do Ranqueado —
enfeite, some em silêncio se a chamada falhar.

### 7.2. Lista de campeonatos

Cards com banner (ou fundo padrão quando não houver), título, selo de status e as vagas
(`5/8`). Ação por estado:

- `inscricoes` → **Entrar** (ou **Sair**, se já inscrito);
- `chaveado` → **Ver chave**;
- `em_andamento` → **Acompanhar** / **Jogar**, se for a minha vez;
- `finalizado` → **Ver resultado**, com o campeão no card.

### 7.3. Tela do campeonato

Três abas: **Chave**, **Ranking**, **Participantes**.

A chave é visível para qualquer pessoa logada, inscrita ou não — era o pedido explícito de
quem clica depois de lotar. Colunas por fase, confrontos com avatar, nick e placar; o meu
confronto fica destacado.

Estados do meu ponto de vista:

- não inscrito, tem vaga → botão Entrar;
- inscrito, `chaveado` → **tela de espera**: meu adversário, e "aguardando o admin iniciar";
- `em_andamento`, minha fase aberta → contagem para a rodada e botão Jogar;
- `em_andamento`, fase futura → "próxima fase abre em HH:MM";
- eliminado → "eliminado na fase X", chave continua acessível.

### 7.4. Duelo

Reaproveita o `game-stage` inteiro (`ImagePanel`/`PanoramaPanel` + `GuessMap` +
`RoundResultModal`). Muda o cabeçalho, que passa a ser de duelo: meu placar × placar do
adversário, rodada `N/total`, cronômetro.

Quem responde antes do tempo cai num estado **"aguardando a próxima rodada"** com o
relógio correndo — consequência direta do jogo simultâneo (§1.1), e é onde o polling de
3 s alimenta o placar do adversário.

Ao fim: tela de resultado do duelo (venci / perdi, placar, link para a chave).

### 7.5. Admin

O `/admin` de hoje é uma página única, **sem sidebar**. Esta spec cria a sidebar pedida:

```
┌────────────────┬─────────────────────────┐
│ PAguessr Admin │                         │
│                │                         │
│ ▸ Locais       │   conteúdo da seção     │
│ ▸ Campeonatos  │                         │
│                │                         │
│ 👤 nick · Sair │                         │
└────────────────┴─────────────────────────┘
```

Extrair `AdminLayout` (sidebar + cabeçalho + estados de 401/403/erro, que hoje vivem
dentro de `AdminLocationsPage`) e deixar as páginas só com o conteúdo. A navegação continua
no esquema manual de `pushState` do `App.tsx` — sem adicionar router:

- `/admin` → redireciona para `/admin/locais`
- `/admin/locais` → página atual
- `/admin/campeonatos` → lista + criar/editar/excluir/iniciar

`App.tsx` hoje compara `currentPath === '/admin'`; passa a casar por prefixo.

A tela de campeonatos do admin é uma tabela (título, status, vagas, fase atual) com as
ações por linha e um formulário de criação/edição em `<dialog>`, no mesmo padrão dos
diálogos já existentes. O botão **Iniciar** só habilita em `chaveado`.

## 8. Plano de implementação

Sete fatias, cada uma fechada e testável:

1. **Schema + migration 0005** — tabelas, `games.championship_match_id`,
   `rounds.duration_seconds`, tipos em `shared`, e o filtro `isNull(championship_match_id)`
   no ranking geral **com teste de regressão**.
2. **Duração por rodada** — trocar `ROUND_DURATION_MS` por `round.duration_seconds` nos
   três consumidores da §2.5. Fatia independente: entrega sem campeonato nenhum, o
   Ranqueado grava 60 s e o comportamento tem de ficar idêntico ao de hoje. Fazer antes do
   duelo evita descobrir o `isLate` errado com chave montada em cima.
3. **CRUD admin** — rotas admin + validação; sem chave, sem jogo.
4. **Inscrição e sorteio** — `join`/`leave`, sorteio transacional ao lotar, criação da chave completa.
5. **Largada e duelo** — `start`, `enter`, geração das duas partidas com locais idênticos,
   `started_at` derivado de `opens_at` e de `round_duration_seconds`, consolidação e
   promoção do vencedor.
6. **Avanço preguiçoso + ranking** — §4 e §6.
7. **Front** — item no menu, lista, tela do campeonato com as três abas, tela de duelo,
   `AdminLayout` com sidebar e a página de campeonatos do admin.

Testes de API no padrão do repo (Vitest contra `paguessr_test`). Os que mais importam:
sorteio com 4/8/16/32, promoção pela regra `⌊s/2⌋`, desempate nos três critérios, W.O. dos
dois lados, `enter` idempotente, avanço preguiçoso rodando duas vezes sem duplicar, o
ranking geral ignorando partida de campeonato, e `isLate`/janela do proxy respeitando uma
duração diferente de 60 s (nos dois extremos, 10 s e 300 s).

## 9. Fora do escopo

- **Upload de banner.** Não existe storage no projeto; `banner_url` é uma URL externa.
  Upload puxaria S3/volume + validação de arquivo, e isso é uma spec própria.
- **Notificação de abertura de fase** (push, e-mail, in-app). Sem isso, ver o trade-off em §1.1.
- **WebSocket.** O duelo simultâneo funciona com relógio do servidor + polling (§1.1).
- Repescagem / eliminatória dupla, bye para número não-potência-de-2, campeonato por
  equipes, prêmios, chat, convite privado ou senha.
- **Tempo por rodada no Ranqueado.** A duração passa a ser dado da rodada (§2.5), mas o
  Ranqueado segue fixo em 60 s. Expor isso lá é outra decisão de produto.

## 10. Em aberto

- **Sair depois do sorteio.** Hoje: não dá, vira W.O. Se virar problema real, a alternativa
  é uma lista de espera que substitui o desistente antes da largada.
- **Um jogador em vários campeonatos ao mesmo tempo.** A spec permite. Se duas fases
  abrirem no mesmo minuto, ele escolhe uma e leva W.O. na outra. Limitar a inscrição a um
  campeonato ativo é a saída, se incomodar.
- **Pool de locais pequeno.** Um campeonato de 32 com 5 rodadas consome muitos locais
  distintos. Vale a API recusar a criação quando `locations` não comporta, no mesmo espírito
  do `MIN_LOCATIONS_PER_GAME`.
