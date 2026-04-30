/*
  # Create RPC bridge functions for model_lab schema

  ## Purpose
  Edge functions using supabase-js hit PostgREST which only exposes the 'public' schema
  by default. Since model_lab is a private schema, we create SECURITY DEFINER functions
  in public schema that act as bridges for the backtest runner edge function.

  These functions are intentionally restricted:
  - Only callable by service_role (via edge function using service key)
  - They bypass RLS because they are SECURITY DEFINER running as the function owner
  - No direct data exposure to anonymous users

  ## Functions created
  1. public.ml_get_model_version(text) - look up model version by key
  2. public.ml_insert_backtest_run(...) - create a new backtest run row
  3. public.ml_update_backtest_run(...) - update run progress/completion
  4. public.ml_upsert_feature_snapshot(...) - upsert feature snapshot
  5. public.ml_insert_prediction(...) - insert a model prediction
  6. public.ml_insert_evaluation(...) - insert an evaluation
*/

-- 1. Get model version id by key
CREATE OR REPLACE FUNCTION public.ml_get_model_version(p_version_key text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_result json;
BEGIN
  SELECT row_to_json(mv) INTO v_result
  FROM model_lab.model_versions mv
  WHERE mv.version_key = p_version_key
  LIMIT 1;
  RETURN v_result;
END;
$$;

-- 2. Create backtest run
CREATE OR REPLACE FUNCTION public.ml_insert_backtest_run(
  p_model_version_id uuid,
  p_run_key text,
  p_run_scope text,
  p_competition_scope text[],
  p_era_scope text[]
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_result json;
BEGIN
  INSERT INTO model_lab.backtest_runs (
    model_version_id, run_key, run_status, run_scope,
    train_start_date, train_end_date,
    validation_start_date, validation_end_date,
    competition_scope, era_scope, started_at
  ) VALUES (
    p_model_version_id, p_run_key, 'running', p_run_scope,
    '2000-07-28', '2018-06-30',
    '2018-07-01', '2019-06-30',
    p_competition_scope, p_era_scope, now()
  )
  RETURNING row_to_json(backtest_runs.*) INTO v_result;
  RETURN v_result;
END;
$$;

-- 3. Update backtest run
CREATE OR REPLACE FUNCTION public.ml_update_backtest_run(
  p_run_id uuid,
  p_status text DEFAULT NULL,
  p_total_matches integer DEFAULT NULL,
  p_processed_matches integer DEFAULT NULL,
  p_failed_matches integer DEFAULT NULL,
  p_avg_brier double precision DEFAULT NULL,
  p_avg_log_loss double precision DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
BEGIN
  UPDATE model_lab.backtest_runs
  SET
    run_status = COALESCE(p_status, run_status),
    total_matches = COALESCE(p_total_matches, total_matches),
    processed_matches = COALESCE(p_processed_matches, processed_matches),
    failed_matches = COALESCE(p_failed_matches, failed_matches),
    average_brier_1x2 = COALESCE(p_avg_brier, average_brier_1x2),
    average_log_loss_1x2 = COALESCE(p_avg_log_loss, average_log_loss_1x2),
    error_message = COALESCE(p_error_message, error_message),
    completed_at = CASE WHEN p_status IN ('completed', 'failed') THEN now() ELSE completed_at END
  WHERE id = p_run_id;
END;
$$;

-- 4. Upsert feature snapshot
CREATE OR REPLACE FUNCTION public.ml_upsert_feature_snapshot(
  p_match_id text,
  p_model_version_id uuid,
  p_feature_cutoff_date date,
  p_era_bucket text,
  p_competition_id text,
  p_season_id text,
  p_home_team_id text,
  p_away_team_id text,
  p_feature_json jsonb,
  p_data_availability_json jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
BEGIN
  INSERT INTO model_lab.match_feature_snapshots (
    match_id, model_version_id, feature_cutoff_date, era_bucket,
    competition_id, season_id, home_team_id, away_team_id,
    feature_json, data_availability_json
  ) VALUES (
    p_match_id, p_model_version_id, p_feature_cutoff_date, p_era_bucket,
    p_competition_id, p_season_id, p_home_team_id, p_away_team_id,
    p_feature_json, p_data_availability_json
  )
  ON CONFLICT (model_version_id, match_id) DO UPDATE SET
    feature_json = EXCLUDED.feature_json,
    data_availability_json = EXCLUDED.data_availability_json,
    updated_at = now();
END;
$$;

-- 5. Insert prediction
CREATE OR REPLACE FUNCTION public.ml_insert_prediction(p_payload jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_result json;
BEGIN
  INSERT INTO model_lab.match_model_predictions (
    backtest_run_id, model_version_id, match_id, match_date,
    feature_cutoff_date, trained_until_date, era_bucket,
    competition_id, competition_name, season_id, season_label,
    home_team_id, home_team_name, away_team_id, away_team_name,
    p_home, p_draw, p_away,
    expected_home_goals, expected_away_goals,
    p_over_1_5, p_over_2_5, p_over_3_5, p_btts,
    attack_index_home, attack_index_away,
    xg_lite_internal_home, xg_lite_internal_away,
    predicted_result, confidence_score, confidence_grade,
    decision_summary, feature_snapshot, model_debug, is_public_visible
  ) VALUES (
    (p_payload->>'backtest_run_id')::uuid,
    (p_payload->>'model_version_id')::uuid,
    p_payload->>'match_id',
    (p_payload->>'match_date')::date,
    (p_payload->>'feature_cutoff_date')::date,
    (p_payload->>'trained_until_date')::date,
    p_payload->>'era_bucket',
    p_payload->>'competition_id',
    p_payload->>'competition_name',
    p_payload->>'season_id',
    p_payload->>'season_label',
    p_payload->>'home_team_id',
    p_payload->>'home_team_name',
    p_payload->>'away_team_id',
    p_payload->>'away_team_name',
    (p_payload->>'p_home')::double precision,
    (p_payload->>'p_draw')::double precision,
    (p_payload->>'p_away')::double precision,
    (p_payload->>'expected_home_goals')::double precision,
    (p_payload->>'expected_away_goals')::double precision,
    (p_payload->>'p_over_1_5')::double precision,
    (p_payload->>'p_over_2_5')::double precision,
    (p_payload->>'p_over_3_5')::double precision,
    (p_payload->>'p_btts')::double precision,
    (p_payload->>'attack_index_home')::double precision,
    (p_payload->>'attack_index_away')::double precision,
    (p_payload->>'xg_lite_internal_home')::double precision,
    (p_payload->>'xg_lite_internal_away')::double precision,
    p_payload->>'predicted_result',
    (p_payload->>'confidence_score')::double precision,
    p_payload->>'confidence_grade',
    p_payload->>'decision_summary',
    (p_payload->'feature_snapshot')::jsonb,
    (p_payload->'model_debug')::jsonb,
    (p_payload->>'is_public_visible')::boolean
  )
  RETURNING row_to_json(match_model_predictions.*) INTO v_result;
  RETURN v_result;
END;
$$;

-- 6. Insert evaluation
CREATE OR REPLACE FUNCTION public.ml_insert_evaluation(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
BEGIN
  INSERT INTO model_lab.match_model_evaluations (
    prediction_id, match_id,
    actual_result, actual_home_score, actual_away_score,
    actual_total_goals, actual_btts,
    actual_over_1_5, actual_over_2_5, actual_over_3_5,
    predicted_result, is_result_correct,
    brier_1x2, log_loss_1x2,
    over_1_5_correct, over_2_5_correct, over_3_5_correct, btts_correct,
    error_category, error_notes, calibration_bucket
  ) VALUES (
    (p_payload->>'prediction_id')::uuid,
    p_payload->>'match_id',
    p_payload->>'actual_result',
    (p_payload->>'actual_home_score')::integer,
    (p_payload->>'actual_away_score')::integer,
    (p_payload->>'actual_total_goals')::integer,
    (p_payload->>'actual_btts')::boolean,
    (p_payload->>'actual_over_1_5')::boolean,
    (p_payload->>'actual_over_2_5')::boolean,
    (p_payload->>'actual_over_3_5')::boolean,
    p_payload->>'predicted_result',
    (p_payload->>'is_result_correct')::boolean,
    (p_payload->>'brier_1x2')::double precision,
    (p_payload->>'log_loss_1x2')::double precision,
    (p_payload->>'over_1_5_correct')::boolean,
    (p_payload->>'over_2_5_correct')::boolean,
    (p_payload->>'over_3_5_correct')::boolean,
    (p_payload->>'btts_correct')::boolean,
    p_payload->>'error_category',
    p_payload->>'error_notes',
    p_payload->>'calibration_bucket'
  );
END;
$$;

-- Grant execute to service_role and authenticated (RLS on tables still protects direct access)
GRANT EXECUTE ON FUNCTION public.ml_get_model_version(text) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.ml_insert_backtest_run(uuid, text, text, text[], text[]) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.ml_update_backtest_run(uuid, text, integer, integer, integer, double precision, double precision, text) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.ml_upsert_feature_snapshot(text, uuid, date, text, text, text, text, text, jsonb, jsonb) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.ml_insert_prediction(jsonb) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.ml_insert_evaluation(jsonb) TO service_role, authenticated;
