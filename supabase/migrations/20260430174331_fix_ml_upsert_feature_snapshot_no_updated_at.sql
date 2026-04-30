/*
  # Fix ml_upsert_feature_snapshot: remove updated_at reference

  match_feature_snapshots has no updated_at column. The previous version of this
  function silently failed on every call due to the invalid column reference.
*/

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
    data_availability_json = EXCLUDED.data_availability_json;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_upsert_feature_snapshot(text, uuid, date, text, text, text, text, text, jsonb, jsonb) TO service_role, authenticated;
