# PAguessr

Jogo de adivinhação geográfica (estilo GeoGuessr) focado exclusivamente na cidade de Paulo Afonso-BA.

## Pré-requisitos

- Node.js >= 22
- pnpm >= 11
- Docker e Docker Compose

## Estrutura do Projeto

- `apps/api`: Backend Fastify + TypeScript + Drizzle ORM + PostgreSQL
- `apps/web`: Frontend React + Vite + TypeScript + Leaflet
- `packages/shared`: Tipos comuns, cálculo de distância Haversine e pontuação

## Configuração

Copie o arquivo de variáveis de ambiente:

```bash
cp .env.example .env
```

Instale as dependências:

```bash
pnpm install
```

## Executando com Docker Compose

Para subir todos os serviços (PostgreSQL, API e Web):

```bash
docker compose up --build
```

- Web: [http://localhost:3000](http://localhost:3000)
- API: [http://localhost:3333](http://localhost:3333)
- Health check API: [http://localhost:3333/health](http://localhost:3333/health)

## Desenvolvimento Local

1. Suba apenas o banco de dados:

```bash
docker compose up -d postgres
```

2. Execute as migrações do banco:

```bash
pnpm db:migrate
```

3. Inicie os serviços em modo de desenvolvimento:

```bash
pnpm dev
```

## Testes

Para rodar os testes automatizados do monorepo:

```bash
pnpm test
```
