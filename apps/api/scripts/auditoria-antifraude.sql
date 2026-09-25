-- Auditoria antifraude do PAguessr.
-- Uso: psql "$DATABASE_URL" -f apps/api/scripts/auditoria-antifraude.sql
--
-- O banco não guarda IP nem user-agent, então a evidência aqui é toda
-- comportamental: tempo de resposta, distância do palpite e se a imagem da
-- rodada chegou a ser buscada no Google.

\pset pager off
\timing off

-- Tempo de resposta por rodada: `started_at` da rodada n+1 é gravado no
-- instante em que a rodada n é respondida; na última rodada, o carimbo é o
-- `finished_at` da partida.
-- O schema de produção pode estar numa migração anterior à dos campeonatos,
-- então a coluna championship_match_id entra só se existir.
DROP VIEW IF EXISTS audit_rounds CASCADE;
DO $$
DECLARE
  camp_col text := 'NULL::uuid';
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'games' AND column_name = 'championship_match_id'
  ) THEN
    camp_col := 'g.championship_match_id';
  END IF;

  EXECUTE format($f$
    CREATE TEMP VIEW audit_rounds AS
    SELECT
      u.nick,
      g.user_id,
      g.id           AS game_id,
      g.total_score,
      g.created_at   AS game_started,
      g.finished_at,
      %s             AS championship_match_id,
      ro.ordem,
      ro.pontos,
      ro.distancia,
      ro.image_fetches,
      ro.streetview_mode,
      ro.guess_lat,
      ro.guess_lng,
      EXTRACT(EPOCH FROM (
        COALESCE(
          LEAD(ro.started_at) OVER (PARTITION BY ro.game_id ORDER BY ro.ordem),
          g.finished_at
        ) - ro.started_at
      )) AS answer_seconds
    FROM rounds ro
    JOIN games g ON g.id = ro.game_id
    JOIN users u ON u.id = g.user_id
    WHERE ro.started_at IS NOT NULL
  $f$, camp_col);
END $$;

\echo
\echo '=== 1. RANKING OFICIAL (melhor partida por jogador) ==================='
SELECT DISTINCT ON (user_id)
  nick, total_score, finished_at, game_id
FROM audit_rounds
WHERE finished_at IS NOT NULL AND championship_match_id IS NULL
ORDER BY user_id, total_score DESC, finished_at ASC;

\echo
\echo '=== 2a. SANIDADE: image_fetches está sendo contado? =================='
\echo 'O contador só sobe quando a API tem GOOGLE_MAPS_API_KEY configurada.'
\echo 'Se a coluna "com_imagem" for 0 no período todo, o sinal da seção 2b'
\echo 'não vale nada — todo mundo aparece como se nunca tivesse visto a foto.'
SELECT date_trunc('day', created_at)::date AS dia,
       count(*) FILTER (WHERE streetview_mode = 'static') AS rodadas_static,
       count(*) FILTER (WHERE streetview_mode = 'static' AND image_fetches > 0) AS com_imagem
FROM rounds
GROUP BY 1 ORDER BY 1 DESC LIMIT 30;

\echo
\echo '=== 2b. RED FLAG: pontuou sem nunca carregar a imagem ================'
\echo '(só interpretar se a seção 2a mostrar com_imagem > 0 no mesmo dia)'
SELECT ar.nick, ar.game_id, ar.ordem, ar.pontos,
       round(ar.distancia::numeric, 1) AS dist_m,
       round(ar.answer_seconds::numeric, 1) AS seg
FROM audit_rounds ar
WHERE ar.pontos > 0
  AND ar.image_fetches = 0
  AND ar.streetview_mode = 'static'
  AND EXISTS (
    SELECT 1 FROM rounds r2
    WHERE r2.streetview_mode = 'static'
      AND r2.image_fetches > 0
      AND date_trunc('day', r2.created_at) = date_trunc('day', ar.game_started)
  )
ORDER BY ar.pontos DESC
LIMIT 50;

\echo
\echo '=== 3. RED FLAG: precisão impossível (< 50 m) ========================='
\echo '(clicar a menos de 50 m num mapa só acontece com a coordenada em mãos)'
SELECT nick, game_id, ordem, streetview_mode, pontos,
       round(distancia::numeric, 2) AS dist_m,
       round(answer_seconds::numeric, 1) AS seg,
       image_fetches
FROM audit_rounds
WHERE distancia IS NOT NULL AND distancia < 50
ORDER BY distancia ASC
LIMIT 50;

\echo
\echo '=== 4. RED FLAG: respondeu rápido demais (< 4 s) e acertou ============'
SELECT nick, game_id, ordem, pontos,
       round(distancia::numeric, 1) AS dist_m,
       round(answer_seconds::numeric, 2) AS seg,
       image_fetches
FROM audit_rounds
WHERE answer_seconds IS NOT NULL AND answer_seconds < 4 AND pontos > 1000
ORDER BY answer_seconds ASC
LIMIT 50;

\echo
\echo '=== 5. PERFIL POR JOGADOR ============================================='
SELECT
  nick,
  count(*)                                         AS rodadas,
  count(DISTINCT game_id)                          AS partidas,
  round(avg(pontos)::numeric, 0)                   AS pts_medio,
  round(avg(distancia)::numeric, 1)                AS dist_media_m,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY distancia)::numeric, 1) AS dist_mediana_m,
  round(avg(answer_seconds)::numeric, 1)           AS seg_medio,
  round(min(answer_seconds)::numeric, 1)           AS seg_min,
  sum((image_fetches = 0)::int)                    AS rodadas_sem_imagem,
  sum((distancia < 50)::int)                       AS rodadas_sub50m
FROM audit_rounds
WHERE pontos IS NOT NULL
GROUP BY nick
ORDER BY dist_media_m NULLS LAST;

\echo
\echo '=== 6. RED FLAG: volume/automação (partidas por jogador por hora) ====='
SELECT u.nick, date_trunc('hour', g.created_at) AS hora, count(*) AS partidas_criadas,
       count(*) FILTER (WHERE g.finished_at IS NULL) AS abandonadas
FROM games g JOIN users u ON u.id = g.user_id
GROUP BY 1, 2
HAVING count(*) > 10
ORDER BY partidas_criadas DESC
LIMIT 30;

\echo
\echo '=== 7. INTEGRIDADE: total_score bate com a soma das rodadas? ========='
\echo '(divergência = alteração direta no banco ou bug de cálculo)'
SELECT u.nick, g.id AS game_id, g.total_score AS gravado,
       COALESCE(sum(ro.pontos), 0) AS soma_rodadas,
       g.total_score - COALESCE(sum(ro.pontos), 0) AS diferenca
FROM games g
JOIN users u ON u.id = g.user_id
LEFT JOIN rounds ro ON ro.game_id = g.id
GROUP BY g.id, u.nick
HAVING g.total_score <> COALESCE(sum(ro.pontos), 0)
ORDER BY abs(g.total_score - COALESCE(sum(ro.pontos), 0)) DESC
LIMIT 30;

\echo
\echo '=== 8. INTEGRIDADE: pontos batem com a fórmula 5000*exp(-d/1500)? ===='
SELECT nick, game_id, ordem, pontos AS gravado,
       round(5000 * exp(-distancia / 1500.0)) AS esperado,
       round(distancia::numeric, 1) AS dist_m
FROM audit_rounds
WHERE distancia IS NOT NULL
  AND pontos <> 0
  AND pontos <> round(5000 * exp(-distancia / 1500.0))
LIMIT 30;

\echo
\echo '=== 9. COLETA DE GABARITO: locais já revelados por jogador ==========='
\echo '(cada rodada respondida devolve a coordenada real; muitos locais'
\echo ' distintos vistos = gabarito completo montado)'
SELECT u.nick,
       count(DISTINCT ro.location_id) AS locais_revelados,
       (SELECT count(*) FROM locations) AS total_locais,
       round(100.0 * count(DISTINCT ro.location_id) / NULLIF((SELECT count(*) FROM locations), 0), 1) AS pct
FROM rounds ro
JOIN games g ON g.id = ro.game_id
JOIN users u ON u.id = g.user_id
WHERE ro.pontos IS NOT NULL
GROUP BY u.nick
ORDER BY locais_revelados DESC
LIMIT 20;
