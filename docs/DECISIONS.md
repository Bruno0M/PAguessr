# PAguessr: decisões

Jogo estilo GeoGuessr restrito a Paulo Afonso-BA: o jogador vê uma imagem de um ponto da cidade e marca no mapa onde acha que é.

Registrado em 2026-09-10.

## Escopo da v1

- **Imagem estática, sem panorama.** Validar o jogo primeiro. O 360° vem depois, se der tempo.
- Partida de 5 rodadas: imagem → palpite no mapa → distância e pontos → resultado final.

## Stack

| Camada          | Escolha                                                                         |
| --------------- | ------------------------------------------------------------------------------- |
| Monorepo        | pnpm workspaces: `apps/api`, `apps/web`, `packages/shared`                      |
| Frontend        | React + Vite + TypeScript                                                       |
| Mapa do palpite | Leaflet (react-leaflet) com tiles do OpenStreetMap                              |
| Backend         | Node + TypeScript + Fastify                                                     |
| ORM             | Drizzle                                                                         |
| Banco           | PostgreSQL                                                                      |
| Infra           | Docker Compose (Postgres + API + frontend), igual em dev e em produção numa VPS |

- **Fastify** em vez de Hono: validação por schema nativa e ecossistema maduro para uma API Node tradicional.
- **Drizzle** em vez de Prisma: schema em TypeScript, migrations em SQL legível e sem binário de engine.
- Distância e pontuação ficam em `packages/shared`, usado pela API (fonte da verdade) e pelo frontend.

## Imagens: Google Street View

- **v1: Street View Static API.** SKU Essentials, 10.000 imagens grátis por mês e US$ 7 por 1.000 depois disso.
- **Street View Metadata** (grátis, sem limite): diz se existe panorama num ponto e devolve `pano_id`, a `location` real e a `date`. Uso:
  1. script que percorre uma grade de pontos sobre a cidade (~200 m) para mapear a cobertura;
  2. montar a lista de locais descartando panoramas antigos, `pano_id` repetidos e imagens de interiores (`source=outdoor`);
  3. a `location` devolvida é a resposta certa da rodada, não o ponto da grade.
- **Futuro, 360°:** Dynamic Street View (SKU Pro, 5.000 carregamentos grátis por mês, US$ 14 por 1.000 depois). Andar e girar dentro do panorama não gera cobrança extra.
- Sem panorama no local, usar fotos próprias.

### Anti-cola

- A imagem passa por um **proxy na API** (`GET /api/rounds/:id/image`): a chave do Google fica só no servidor e o navegador nunca vê `location` nem `pano_id`.
- A rodada só revela a localização correta na resposta do palpite; um segundo palpite na mesma rodada é recusado.
- Com o proxy, URL signing deixa de ser necessário para esconder a chave.

### Custos e proteções no Google Cloud

- Faturamento com cartão é **obrigatório** mesmo dentro da cota gratuita.
- O crédito de US$ 200 por mês acabou em 01/03/2025. Agora cada SKU tem a própria cota.
- Proteções:
  - **limite diário de quota** no Cloud Console: é o que de fato bloqueia cobrança;
  - chave restrita por API (e por IP do servidor, já que as chamadas saem do proxy);
  - alerta de orçamento: só avisa, não bloqueia.

Fonte: <https://developers.google.com/maps/billing-and-pricing/pricing>

## Pontuação

- Distância pela fórmula de Haversine.
- `pontos = 5000 * e^(-d / escala)`, com a escala calibrada para o tamanho da cidade (algo entre 1 e 2 km, a testar). Valor inicial: 1500 m.

## Em aberto

- **Termos de uso do Google:** conferir o que pode ser guardado de forma permanente (`pano_id`, coordenadas).
- Provedor da VPS.
- Ranking e login: v1 ou depois.
