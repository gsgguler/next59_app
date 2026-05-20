/*
  # Create admin_get_provider_health RPC

  ## Purpose
  Single query that returns health status for all live API/sync feeds,
  surfacing last successful call, error counts, stale state, and last error message.

  ## Data sources joined
  - public.af_standings_raw           (standings sync)
  - public.af_injuries_raw            (injuries sync)
  - public.af_team_statistics_raw     (team stats sync)
  - public.af_venues_raw              (venues sync)
  - shared.af_fixtures_raw            (upcoming fixtures ingest)
  - public.af_uefa_ingestion_runs     (UEFA fixtures ingest)
  - model_lab.prematch_pipeline_runs  (daily prematch pipeline)
  - model_lab.enrichment_sync_log     (enrichment sync)
  - model_lab.result_sync_runs        (live result sync)

  ## Returns
  One row per feed with: last_success_at, last_attempt_at, rows_today,
  http_errors_today, transform_errors_today, last_error_msg, stale_hours_threshold
*/

CREATE OR REPLACE FUNCTION public.admin_get_provider_health()
RETURNS TABLE (
  feed_key              text,
  feed_label            text,
  last_success_at       timestamptz,
  last_attempt_at       timestamptz,
  rows_total            bigint,
  rows_today            bigint,
  http_errors_today     bigint,
  transform_errors_today bigint,
  last_error_msg        text,
  stale_hours_threshold integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'model_lab', 'shared'
AS $$

-- af_standings_raw
SELECT
  'af_standings'::text,
  'AF Puan Durumu'::text,
  max(fetched_at) FILTER (WHERE http_status = 200 AND transform_status <> 'failed'),
  max(fetched_at),
  count(*),
  count(*) FILTER (WHERE fetched_at >= current_date),
  count(*) FILTER (WHERE http_status >= 400 AND fetched_at >= current_date),
  count(*) FILTER (WHERE transform_status = 'failed' AND fetched_at >= current_date),
  max(CASE WHEN http_status >= 400 THEN 'HTTP ' || http_status::text ELSE NULL END),
  6
FROM public.af_standings_raw

UNION ALL

-- af_injuries_raw
SELECT
  'af_injuries',
  'AF Sakatlık',
  max(fetched_at) FILTER (WHERE http_status = 200 AND transform_status <> 'failed'),
  max(fetched_at),
  count(*),
  count(*) FILTER (WHERE fetched_at >= current_date),
  count(*) FILTER (WHERE http_status >= 400 AND fetched_at >= current_date),
  count(*) FILTER (WHERE transform_status = 'failed' AND fetched_at >= current_date),
  max(CASE WHEN http_status >= 400 THEN 'HTTP ' || http_status::text ELSE NULL END),
  24
FROM public.af_injuries_raw

UNION ALL

-- af_team_statistics_raw
SELECT
  'af_team_stats',
  'AF Takım İstatistikleri',
  max(fetched_at) FILTER (WHERE http_status = 200 AND transform_status <> 'failed'),
  max(fetched_at),
  count(*),
  count(*) FILTER (WHERE fetched_at >= current_date),
  count(*) FILTER (WHERE http_status >= 400 AND fetched_at >= current_date),
  count(*) FILTER (WHERE transform_status = 'failed' AND fetched_at >= current_date),
  max(CASE WHEN http_status >= 400 THEN 'HTTP ' || http_status::text ELSE NULL END),
  12
FROM public.af_team_statistics_raw

UNION ALL

-- af_venues_raw
SELECT
  'af_venues',
  'AF Stadyumlar',
  max(fetched_at) FILTER (WHERE http_status = 200 AND transform_status <> 'failed'),
  max(fetched_at),
  count(*),
  count(*) FILTER (WHERE fetched_at >= current_date),
  count(*) FILTER (WHERE http_status >= 400 AND fetched_at >= current_date),
  count(*) FILTER (WHERE transform_status = 'failed' AND fetched_at >= current_date),
  max(CASE WHEN http_status >= 400 THEN 'HTTP ' || http_status::text ELSE NULL END),
  168
FROM public.af_venues_raw

UNION ALL

-- shared.af_fixtures_raw (upcoming fixtures ingest)
SELECT
  'af_fixtures_upcoming',
  'AF Yaklaşan Maçlar',
  max(ingested_at),
  max(ingested_at),
  count(*),
  count(*) FILTER (WHERE ingested_at >= current_date),
  0::bigint,
  count(*) FILTER (WHERE is_processed = false AND ingested_at < now() - interval '1 hour'),
  NULL::text,
  6
FROM shared.af_fixtures_raw

UNION ALL

-- af_uefa_ingestion_runs (UEFA fixtures)
SELECT
  'af_uefa',
  'AF UEFA Fikstür',
  max(completed_at) FILTER (WHERE status = 'completed'),
  max(COALESCE(completed_at, started_at)),
  count(*),
  count(*) FILTER (WHERE started_at >= current_date),
  0::bigint,
  count(*) FILTER (WHERE status = 'failed' AND started_at >= current_date),
  max(CASE WHEN error_summary IS NOT NULL THEN error_summary::text ELSE NULL END),
  24
FROM public.af_uefa_ingestion_runs

UNION ALL

-- model_lab.prematch_pipeline_runs (daily prediction pipeline)
SELECT
  'prematch_pipeline',
  'Prematch Pipeline',
  max(completed_at) FILTER (WHERE status = 'completed' AND error_count = 0),
  max(COALESCE(completed_at, started_at)),
  count(*),
  count(*) FILTER (WHERE started_at >= current_date),
  0::bigint,
  COALESCE(
    (SELECT error_count FROM model_lab.prematch_pipeline_runs ORDER BY started_at DESC LIMIT 1),
    0
  )::bigint,
  (SELECT errors_json->0->>'error' FROM model_lab.prematch_pipeline_runs ORDER BY started_at DESC LIMIT 1),
  24
FROM model_lab.prematch_pipeline_runs

UNION ALL

-- model_lab.enrichment_sync_log
SELECT
  'enrichment_sync',
  'Zenginleştirme Sync',
  max(completed_at) FILTER (WHERE status = 'ok' OR status = 'success' OR status = 'completed'),
  max(COALESCE(completed_at, started_at)),
  count(*),
  count(*) FILTER (WHERE started_at >= current_date),
  0::bigint,
  count(*) FILTER (WHERE errors_json IS NOT NULL AND started_at >= current_date),
  max(CASE WHEN errors_json IS NOT NULL THEN (errors_json->0)::text ELSE NULL END),
  6
FROM model_lab.enrichment_sync_log

UNION ALL

-- model_lab.result_sync_runs (live result sync)
SELECT
  'result_sync',
  'Canlı Sonuç Sync',
  max(completed_at) FILTER (WHERE status = 'ok' OR status = 'success' OR status = 'completed'),
  max(COALESCE(completed_at, started_at)),
  count(*),
  count(*) FILTER (WHERE started_at >= current_date),
  count(*) FILTER (WHERE http_status >= 400 AND started_at >= current_date),
  count(*) FILTER (WHERE errors_json IS NOT NULL AND started_at >= current_date),
  max(CASE WHEN errors_json IS NOT NULL THEN (errors_json->0)::text ELSE NULL END),
  2
FROM model_lab.result_sync_runs;

$$;
