/*
  # Fix ml_insert_prediction and ml_insert_evaluation: add UUID casts

  The match_model_predictions table stores match_id, competition_id, season_id,
  home_team_id, away_team_id as uuid. The previous bridge function was missing
  ::uuid casts for these columns. Also fix ml_insert_evaluation's match_id cast.
*/

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
    (p_payload->>'match_id')::uuid,
    (p_payload->>'match_date')::date,
    (p_payload->>'feature_cutoff_date')::date,
    (p_payload->>'trained_until_date')::date,
    p_payload->>'era_bucket',
    (p_payload->>'competition_id')::uuid,
    p_payload->>'competition_name',
    (p_payload->>'season_id')::uuid,
    p_payload->>'season_label',
    (p_payload->>'home_team_id')::uuid,
    p_payload->>'home_team_name',
    (p_payload->>'away_team_id')::uuid,
    p_payload->>'away_team_name',
    (p_payload->>'p_home')::numeric,
    (p_payload->>'p_draw')::numeric,
    (p_payload->>'p_away')::numeric,
    (p_payload->>'expected_home_goals')::numeric,
    (p_payload->>'expected_away_goals')::numeric,
    (p_payload->>'p_over_1_5')::numeric,
    (p_payload->>'p_over_2_5')::numeric,
    (p_payload->>'p_over_3_5')::numeric,
    (p_payload->>'p_btts')::numeric,
    (p_payload->>'attack_index_home')::numeric,
    (p_payload->>'attack_index_away')::numeric,
    (p_payload->>'xg_lite_internal_home')::numeric,
    (p_payload->>'xg_lite_internal_away')::numeric,
    p_payload->>'predicted_result',
    (p_payload->>'confidence_score')::numeric,
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
    (p_payload->>'match_id')::uuid,
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
    (p_payload->>'brier_1x2')::numeric,
    (p_payload->>'log_loss_1x2')::numeric,
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

-- Also fix ml_upsert_feature_snapshot for match_id, competition_id, season_id, home/away_team_id uuid casts
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
    p_match_id::uuid, p_model_version_id, p_feature_cutoff_date, p_era_bucket,
    p_competition_id::uuid, p_season_id::uuid, p_home_team_id::uuid, p_away_team_id::uuid,
    p_feature_json, p_data_availability_json
  )
  ON CONFLICT (model_version_id, match_id) DO UPDATE SET
    feature_json = EXCLUDED.feature_json,
    data_availability_json = EXCLUDED.data_availability_json,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_insert_prediction(jsonb) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.ml_insert_evaluation(jsonb) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.ml_upsert_feature_snapshot(text, uuid, date, text, text, text, text, text, jsonb, jsonb) TO service_role, authenticated;
