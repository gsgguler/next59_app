/*
  # Fix generate_prematch_brain_package — write to correct tables

  ## Problem
  The function attempted to INSERT into model_lab.prematch_brain_packages,
  which does not exist. This caused all daily brain package generation
  calls to fail with "relation does not exist".

  ## Fix
  Replace the phantom-table INSERT with:
  1. UPSERT into model_lab.prematch_brain_runs (status='completed') — this is
     what the daily pipeline skip-detection reads to avoid re-running
  2. UPSERT into model_lab.prematch_brain_outputs with the full brain jsonb

  ## No schema changes — function replacement only
*/

CREATE OR REPLACE FUNCTION model_lab.generate_prematch_brain_package(
  p_match_id     uuid,
  p_triggered_by text DEFAULT 'system'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'model_lab', 'public', 'shared'
AS $$
DECLARE
v_pred       record;
v_readiness  model_lab.upcoming_match_readiness;
v_cal        model_lab.league_calibration_state;
v_feat       record;
v_draw_prior record;
v_snap       record;

v_p_home     numeric;
v_p_draw     numeric;
v_p_away     numeric;
v_confidence numeric;
v_conf_tier  text;

v_elo_gap        numeric;
v_draw_risk      text;
v_upset_risk     text;
v_upset_prob     numeric;
v_fav_fragility  text;
v_tempo          text;
v_late_pressure  text;
v_closeness      numeric;

v_standings_gap  integer;
v_inj_warning    text;
v_goals_for_home numeric;
v_goals_for_away numeric;
v_altitude_warn  text;

v_publish_rec     text;
v_review_required boolean := false;
v_data_warnings   text[] := '{}';

v_result          jsonb;
v_brain_run_id    uuid;
BEGIN
-- Load prediction
SELECT * INTO v_pred
FROM model_lab.prematch_prediction_drafts
WHERE match_id = p_match_id AND status NOT IN ('hidden', 'rejected')
ORDER BY generated_at DESC LIMIT 1;

IF NOT FOUND THEN
  RETURN jsonb_build_object('error', 'no_prediction_draft', 'match_id', p_match_id);
END IF;

-- Load readiness (typed row — avoids record field caching errors)
SELECT * INTO v_readiness
FROM model_lab.upcoming_match_readiness
WHERE match_id = p_match_id;

-- Load calibration (typed row — avoids is_production_candidate ghost field error)
SELECT * INTO v_cal
FROM model_lab.league_calibration_state
WHERE competition_name = v_pred.competition_name
LIMIT 1;

-- Load feature matrix
SELECT * INTO v_feat
FROM model_lab.match_feature_matrix_v2
WHERE match_id = p_match_id
LIMIT 1;

-- Load draw prior
SELECT * INTO v_draw_prior
FROM model_lab.league_draw_priors
WHERE competition_name = v_pred.competition_name
LIMIT 1;

-- Load enrichment snapshot
SELECT * INTO v_snap
FROM model_lab.prematch_upcoming_feature_snapshots
WHERE match_id = p_match_id;

v_p_home     := v_pred.p_home;
v_p_draw     := v_pred.p_draw;
v_p_away     := v_pred.p_away;
v_confidence := v_pred.confidence_score;
v_conf_tier  := v_pred.confidence_tier;
v_elo_gap    := (v_pred.pre_match_elo_home - v_pred.pre_match_elo_away);
v_closeness  := greatest(0, 1 - abs(COALESCE(v_elo_gap, 0)) / 400.0);

-- DRAW RISK BRAIN
v_draw_risk := CASE
  WHEN v_p_draw >= 0.30 THEN 'high'
  WHEN v_p_draw >= 0.22 THEN 'medium'
  ELSE 'low'
END;

-- UPSET RISK BRAIN
v_standings_gap := v_snap.standings_rank_gap;

v_fav_fragility := CASE
  WHEN abs(COALESCE(v_elo_gap, 0)) < 50  THEN 'high'
  WHEN abs(COALESCE(v_elo_gap, 0)) < 150 THEN 'medium'
  ELSE 'low'
END;

IF v_standings_gap IS NOT NULL AND v_standings_gap > 5 AND v_elo_gap > 0 THEN
  v_fav_fragility := 'medium';
END IF;

v_upset_prob := CASE
  WHEN v_p_home >= v_p_away THEN v_p_away
  ELSE v_p_home
END;

v_upset_risk := CASE
  WHEN v_upset_prob >= 0.35 THEN 'high'
  WHEN v_upset_prob >= 0.25 THEN 'medium'
  ELSE 'low'
END;

-- TEMPO BRAIN
v_goals_for_home := COALESCE(v_snap.season_goals_for_avg_home, v_feat.rolling_goals_for_home_l5);
v_goals_for_away := COALESCE(v_snap.season_goals_for_avg_away, v_feat.rolling_goals_for_away_l5);

v_tempo := CASE
  WHEN COALESCE(v_goals_for_home, 0) + COALESCE(v_goals_for_away, 0) > 3.2 THEN 'high'
  WHEN COALESCE(v_goals_for_home, 0) + COALESCE(v_goals_for_away, 0) > 2.0 THEN 'balanced'
  ELSE 'low'
END;

-- LATE PRESSURE BRAIN
v_late_pressure := CASE
  WHEN v_p_draw >= 0.28 AND v_closeness >= 0.6 THEN 'high'
  WHEN v_p_draw >= 0.22 THEN 'medium'
  ELSE 'low'
END;

-- DATA QUALITY BRAIN
IF v_pred.has_data_warning THEN
  v_data_warnings := array_append(v_data_warnings, 'elo_only_prediction');
END IF;
IF NOT COALESCE(v_readiness.standings_readiness, false) THEN
  v_data_warnings := array_append(v_data_warnings, 'missing_standings');
END IF;
IF NOT COALESCE(v_readiness.injuries_readiness, false) THEN
  v_data_warnings := array_append(v_data_warnings, 'missing_injuries');
END IF;
IF NOT COALESCE(v_readiness.team_statistics_readiness, false) THEN
  v_data_warnings := array_append(v_data_warnings, 'missing_team_statistics');
END IF;
IF NOT COALESCE(v_readiness.venue_readiness, false) THEN
  v_data_warnings := array_append(v_data_warnings, 'missing_venue');
END IF;

-- Altitude warning
IF v_snap.venue_altitude_meters IS NOT NULL AND v_snap.venue_altitude_meters > 1000 THEN
  v_altitude_warn := v_snap.venue_context_warning;
  v_data_warnings := array_append(v_data_warnings, 'altitude_context');
END IF;

-- Injury warning
v_inj_warning := COALESCE(v_snap.injury_warning_level, v_readiness.injury_warning_level);
IF v_inj_warning IN ('moderate', 'severe') THEN
  v_review_required := true;
  v_data_warnings := array_append(v_data_warnings, 'injury_warning_' || v_inj_warning);
END IF;

-- MASTER BRAIN
DECLARE
  v_enrichment_score smallint := COALESCE(v_readiness.enrichment_score, 0);
  v_core_ok boolean := COALESCE(v_readiness.elo_readiness, false)
    AND COALESCE(v_readiness.feature_readiness, false)
    AND COALESCE(v_readiness.calibration_readiness, false);
BEGIN
  IF NOT v_core_ok AND v_enrichment_score < 1 THEN
    v_publish_rec := 'do_not_publish';
  ELSIF v_review_required THEN
    v_publish_rec := 'review_required';
  ELSIF v_confidence >= 0.70 AND v_enrichment_score >= 3 THEN
    v_publish_rec := 'publish';
  ELSIF v_confidence >= 0.50 THEN
    v_publish_rec := 'publish_with_caveats';
  ELSE
    v_publish_rec := 'review_required';
  END IF;
END;

-- ASSEMBLE OUTPUT
v_result := jsonb_build_object(
  'match_id',    p_match_id,
  'generated_at', now(),

  'probability', jsonb_build_object(
    'p_home',          round(v_p_home::numeric, 3),
    'p_draw',          round(v_p_draw::numeric, 3),
    'p_away',          round(v_p_away::numeric, 3),
    'confidence',      round(v_confidence::numeric, 3),
    'confidence_tier', v_conf_tier
  ),

  'draw_risk', jsonb_build_object(
    'level',             v_draw_risk,
    'p_draw',            round(v_p_draw::numeric, 3),
    'closeness',         round(v_closeness::numeric, 3),
    'league_draw_prior', COALESCE(v_draw_prior.post_covid_draw_rate, v_draw_prior.overall_draw_rate)
  ),

  'upset_risk', jsonb_build_object(
    'level',              v_upset_risk,
    'upset_probability',  round(v_upset_prob::numeric, 3),
    'favorite_fragility', v_fav_fragility,
    'standings_gap',      v_standings_gap,
    'elo_gap',            round(COALESCE(v_elo_gap, 0)::numeric, 1),
    'standings_context', CASE
      WHEN v_standings_gap IS NOT NULL
      THEN jsonb_build_object(
        'home_rank',   v_snap.standings_rank_home,
        'away_rank',   v_snap.standings_rank_away,
        'home_points', v_snap.standings_points_home,
        'away_points', v_snap.standings_points_away,
        'home_form',   v_snap.standings_form_home,
        'away_form',   v_snap.standings_form_away
      )
      ELSE NULL
    END
  ),

  'tempo', jsonb_build_object(
    'level',                     v_tempo,
    'goals_for_home_season_avg', v_snap.season_goals_for_avg_home,
    'goals_for_away_season_avg', v_snap.season_goals_for_avg_away,
    'clean_sheet_rate_home',     v_snap.season_clean_sheet_rate_home,
    'clean_sheet_rate_away',     v_snap.season_clean_sheet_rate_away,
    'home_attack_baseline',      v_snap.home_attack_baseline,
    'away_attack_baseline',      v_snap.away_attack_baseline
  ),

  'late_pressure', jsonb_build_object(
    'level',     v_late_pressure,
    'draw_risk', v_draw_risk,
    'closeness', round(v_closeness::numeric, 3)
  ),

  'calibration', jsonb_build_object(
    'league',               v_pred.competition_name,
    'home_bias',            v_cal.current_home_correction,
    'brier_l50',            v_cal.rolling_brier_l50,
    'production_candidate', NULL::boolean
  ),

  'injuries', jsonb_build_object(
    'warning_level',      COALESCE(v_inj_warning, 'none'),
    'injury_count_home',  COALESCE(v_snap.injury_count_home, 0),
    'injury_count_away',  COALESCE(v_snap.injury_count_away, 0),
    'injury_count_total', COALESCE(v_snap.injury_count_total, 0),
    'data_available',     COALESCE(v_readiness.injuries_readiness, false)
  ),

  'venue', jsonb_build_object(
    'venue_name',      v_snap.venue_name,
    'city',            v_snap.venue_city,
    'surface',         v_snap.venue_surface,
    'capacity',        v_snap.venue_capacity,
    'altitude_meters', v_snap.venue_altitude_meters,
    'context_warning', v_altitude_warn,
    'is_wc2026_venue', CASE
      WHEN v_snap.venue_id IS NOT NULL THEN (
        SELECT vn.is_wc2026_venue FROM public.af_venues_normalized vn
        WHERE vn.af_venue_id = v_snap.venue_id LIMIT 1
      )
      ELSE false
    END
  ),

  'data_quality', jsonb_build_object(
    'feature_quality_tier',      COALESCE(v_pred.feature_quality_tier, 'elo_only'),
    'elo_readiness',             COALESCE(v_readiness.elo_readiness, false),
    'feature_readiness',         COALESCE(v_readiness.feature_readiness, false),
    'calibration_readiness',     COALESCE(v_readiness.calibration_readiness, false),
    'standings_readiness',       COALESCE(v_readiness.standings_readiness, false),
    'injuries_readiness',        COALESCE(v_readiness.injuries_readiness, false),
    'team_statistics_readiness', COALESCE(v_readiness.team_statistics_readiness, false),
    'venue_readiness',           COALESCE(v_readiness.venue_readiness, false),
    'enrichment_score',          COALESCE(v_readiness.enrichment_score, 0),
    'warnings',                  v_data_warnings,
    'severity', CASE
      WHEN array_length(v_data_warnings, 1) >= 4 THEN 'high'
      WHEN array_length(v_data_warnings, 1) >= 2 THEN 'medium'
      ELSE 'low'
    END
  ),

  'master_summary', jsonb_build_object(
    'publish_recommendation',  v_publish_rec,
    'review_required',         v_review_required,
    'confidence_tier',         v_conf_tier,
    'enrichment_score',        COALESCE(v_readiness.enrichment_score, 0),
    'enrichment_max',          4,
    'enrichment_coverage_pct', round((COALESCE(v_readiness.enrichment_score, 0)::numeric / 4.0) * 100),
    'data_warning_count',      COALESCE(array_length(v_data_warnings, 1), 0),
    'altitude_warning',        v_altitude_warn IS NOT NULL
  )
);

-- Upsert brain run so the daily pipeline skip-detection can find it
INSERT INTO model_lab.prematch_brain_runs (
  match_id, status, generated_at, generated_by
)
VALUES (p_match_id, 'completed', now(), p_triggered_by)
ON CONFLICT (match_id) DO UPDATE SET
  status       = 'completed',
  generated_at = now(),
  generated_by = EXCLUDED.generated_by
RETURNING id INTO v_brain_run_id;

-- Store full brain output attached to the run
INSERT INTO model_lab.prematch_brain_outputs (
  brain_run_id, brain_name, brain_version, output_json,
  confidence_score, warning_level
)
VALUES (
  v_brain_run_id,
  'master_brain',
  '1.0',
  v_result,
  v_confidence,
  CASE
    WHEN array_length(v_data_warnings, 1) >= 4 THEN 'high'
    WHEN array_length(v_data_warnings, 1) >= 2 THEN 'medium'
    ELSE 'low'
  END
)
ON CONFLICT DO NOTHING;

RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION model_lab.generate_prematch_brain_package(uuid, text) TO authenticated;
