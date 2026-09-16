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
- **Dynamic Street View (360° interativo):** SKU Pro, 5.000 carregamentos grátis por mês (cota separada da Static), US$ 14 por 1.000 depois. Andar e girar dentro do panorama não gera cobrança extra.
  - Controlado pela feature flag `STREETVIEW_PANORAMA_ENABLED` (`false` por padrão).
  - Controle de orçamento: `STREETVIEW_PANORAMA_MONTHLY_BUDGET` (padrão `4500`, margem de segurança antes do teto de 5.000). A tabela `streetview_panorama_usage` registra atomicamente os carregamentos por mês (`YYYY-MM`). Se o consumo ultrapassar o teto estipulado, a criação da rodada faz fallback transparente para `'static'`.
  - Chave do cliente: `GOOGLE_MAPS_BROWSER_KEY`, pública no frontend (via `GET /api/config`), restrita por HTTP referrer/domínio no GCP Console.
- Sem panorama no local, usar fotos próprias.

### Anti-cola

- No **modo estático**, a imagem passa por um **proxy na API** (`GET /api/rounds/:id/image`): a chave do Google fica só no servidor e o navegador nunca vê `location` nem `pano_id`.
- No **modo panorama (360°)**, o `pano_id` é disponibilizado via `GET /api/rounds/:id/panorama` apenas enquanto a rodada não foi respondida.
  - **Trade-off aceito conscientemente:** para a Maps JavaScript API renderizar a esfera 360° interativa, o navegador obrigatoriamente precisa conhecer o `pano_id` (não é viável fazer proxy de tiles dinâmicos como na imagem estática). Um jogador que abrir as ferramentas de desenvolvedor (DevTools) consegue inspecionar o `pano_id` e consultar o ponto exato no Google Maps antes do palpite. O GeoGuessr original possui esse mesmo trade-off, e assumimos essa limitação em prol da jogabilidade 360°.
- A rodada só revela a localização correta na resposta do palpite; um segundo palpite na mesma rodada é recusado.
- Com o proxy estático e a chave de browser restrita por referrer, URL signing deixa de ser necessário.

### Custos e proteções no Google Cloud

- Faturamento com cartão é **obrigatório** mesmo dentro da cota gratuita.
- O crédito de US$ 200 por mês acabou em 01/03/2025. Agora cada SKU tem a própria cota.
- Proteções:
  - **limite diário de quota** no Cloud Console: é o que de fato bloqueia cobrança;
  - chave restrita por API (e por IP do servidor, já que as chamadas saem do proxy);
  - alerta de orçamento: só avisa, não bloqueia.
- **A imagem não pode ser guardada no servidor.** A política do Street View Static API proíbe pré-carregar, indexar, armazenar ou fazer cache do conteúdo; só o `pano_id` pode ser guardado indefinidamente. Por isso não existe cache de imagem por local.
- No lugar do cache, o proxy limita as buscas (cada uma é cobrada): só busca no Google enquanto a rodada está aberta (iniciada, sem palpite, dentro dos 60 s + 10 s de folga) e no máximo 3 vezes por rodada (`rounds.image_fetches`, incrementado de forma atômica). Fora disso devolve o placeholder com `no-store`.
- A resposta com a foto sai com `Cache-Control: private, max-age=300`: só o navegador do jogador guarda, pelo tempo da rodada.

Fontes: <https://developers.google.com/maps/billing-and-pricing/pricing>, <https://developers.google.com/maps/documentation/streetview/policies>

## Pontuação

- Distância pela fórmula de Haversine.
- `pontos = 5000 * e^(-d / escala)`, com a escala calibrada para o tamanho da cidade (algo entre 1 e 2 km, a testar). Valor inicial: 1500 m.

## Em aberto

- **Termos de uso do Google:** `pano_id` pode ser guardado e imagem não (ver "Custos e proteções"). Falta conferir as coordenadas que a tabela `locations` guarda vindas da Metadata API.
- Provedor da VPS.
- Ranking e login: v1 ou depois.
