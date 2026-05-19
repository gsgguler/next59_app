/*
  # Admin System Health Summary RPC

  ## Summary
  Single-call health snapshot for the main admin dashboard. Returns real DB-backed
  counts and timestamps only — never fabricated values.

  ## New Function
  `public.admin_get_system_health_summary()`

  Returns a single jsonb row with:

  ### User counts
  - total_users: profiles count
  - total_orgs: organizations count

  ### Prediction / publication readiness
  - predictions_total: all non-superseded predictions
  - predictions_published: published predictions
  - stories_pending_review: match_story_drafts in pending_review or draft_generated
  - publications_total: published & visible match_story_publications

  ### Pipeline health (last run)
  - pipeline_last_run_at: prematch_pipeline_runs latest started_at
  - pipeline_last_status: latest status
  - pipeline_predictions_generated: latest run predictions_generated
  - pipeline_error_count: latest run error_count

  ### Sync health (last run)
  - sync_last_run_at: result_sync_runs latest started_at
  - sync_last_status: latest status
  - sync_matches_updated: latest matches_updated

  ### Ingestion health (last 24h)
  - ingestion_runs_24h: ingestion_runs started in last 24h
  - ingestion_failed_24h: failed ingestion runs in last 24h

  ### Failed jobs (last 24h from ingestion_runs)
  - failed_jobs_24h: ingestion_runs with status='failed' in last 24h

  ## Security
  - SECURITY DEFINER, locked search_path
  - Admin role check (admin or super_admin in profiles.role)
  - GRANT to authenticated
*/

CREATE OR REPLACE FUNCTION public.admin_get_system_health_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, model_lab, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','super_admin')
  ) THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  WITH
  users AS (
    SELECT COUNT(*)::int AS total_users FROM public.profiles
  ),
  orgs AS (
    SELECT COUNT(*)::int AS total_orgs FROM public.organizations
  ),
  predictions AS (
    SELECT
      COUNT(*)::int                                         AS predictions_total,
      COUNT(*) FILTER (WHERE status = 'published')::int    AS predictions_published
    FROM model_lab.prematch_prediction_drafts
    WHERE superseded_by IS NULL OR superseded_by IS NOT DISTINCT FROM NULL
  ),
  stories AS (
    SELECT
      COUNT(*) FILTER (
        WHERE status IN ('pending_review','draft_generated')
      )::int AS stories_pending_review
    FROM model_lab.match_story_drafts
  ),
  publications AS (
    SELECT
      COUNT(*) FILTER (WHERE is_visible = true)::int AS publications_total
    FROM model_lab.match_story_publications
  ),
  pipeline AS (
    SELECT
      started_at            AS pipeline_last_run_at,
      status                AS pipeline_last_status,
      predictions_generated AS pipeline_predictions_generated,
      error_count           AS pipeline_error_count
    FROM model_lab.prematch_pipeline_runs
    ORDER BY started_at DESC
    LIMIT 1
  ),
  sync AS (
    SELECT
      started_at       AS sync_last_run_at,
      status           AS sync_last_status,
      matches_updated  AS sync_matches_updated
    FROM public.result_sync_runs
    ORDER BY started_at DESC
    LIMIT 1
  ),
  ingestion AS (
    SELECT
      COUNT(*)::int                                    AS ingestion_runs_24h,
      COUNT(*) FILTER (WHERE status = 'failed')::int  AS ingestion_failed_24h
    FROM public.ingestion_runs
    WHERE started_at >= now() - interval '24 hours'
  )
  SELECT jsonb_build_object(
    'total_users',                    u.total_users,
    'total_orgs',                     o.total_orgs,
    'predictions_total',              p.predictions_total,
    'predictions_published',          p.predictions_published,
    'stories_pending_review',         s.stories_pending_review,
    'publications_total',             pub.publications_total,
    'pipeline_last_run_at',           pipe.pipeline_last_run_at,
    'pipeline_last_status',           pipe.pipeline_last_status,
    'pipeline_predictions_generated', pipe.pipeline_predictions_generated,
    'pipeline_error_count',           pipe.pipeline_error_count,
    'sync_last_run_at',               sync.sync_last_run_at,
    'sync_last_status',               sync.sync_last_status,
    'sync_matches_updated',           sync.sync_matches_updated,
    'ingestion_runs_24h',             i.ingestion_runs_24h,
    'ingestion_failed_24h',           i.ingestion_failed_24h
  )
  INTO v_result
  FROM users u, orgs o, predictions p, stories s, publications pub,
       (SELECT * FROM pipeline LIMIT 1) pipe,
       (SELECT * FROM sync LIMIT 1) sync,
       ingestion i;

  RETURN coalesce(v_result, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_system_health_summary() TO authenticated;
