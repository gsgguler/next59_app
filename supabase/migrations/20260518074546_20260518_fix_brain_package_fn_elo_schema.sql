/*
  # Fix generate_prematch_brain_package: ELO tables schema correction

  team_elo_snapshots and team_elo_ratings live in model_lab schema, not public.
  Since the function has search_path = model_lab, public, removing the explicit
  public. prefix resolves them correctly via search_path.
*/

CREATE OR REPLACE FUNCTION model_lab.generate_prematch_brain_package(
  p_match_id    uuid,
  p_triggered_by text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $function$
DECLARE
v_draft         model_lab.prematch_prediction_drafts%ROWTYPE;
v_readiness     model_lab.upcoming_match_readiness%ROWTYPE;
v_cal_state     model_lab.league_calibration_state%ROWTYPE;
v_draw_prior    model_lab.league_draw_priors%ROWTYPE;
v_feat          model_lab.match_feature_matrix_v2%ROWTYPE;

v_elo_home      numeric := 1500;
v_elo_away      numeric := 1500;
v_elo_gap       numeric := 0;

v_run_id        uuid;

v_prob_out      jsonb;
v_draw_out      jsonb;
v_upset_out     jsonb;
v_tempo_out     jsonb;
v_late_out      jsonb;
v_cal_out       jsonb;
v_dq_out        jsonb;

v_prob_conf     numeric := 0.5;
v_draw_conf     numeric := 0.5;
v_upset_conf    numeric := 0.5;
v_tempo_conf    numeric := 0.5;
v_late_conf     numeric := 0.5;
v_cal_conf      numeric := 0.5;
v_dq_conf       numeric := 0.5;

v_prob_warn     text := 'none';
v_draw_warn     text := 'none';
v_upset_warn    text := 'none';
v_tempo_warn    text := 'none';
v_late_warn     text := 'none';
v_cal_warn      text := 'none';
v_dq_warn       text := 'none';

v_final_readiness    text := 'partial';
v_final_confidence   text := 'low';
v_scenario_tone      text := 'balanced_tension';
v_publish_rec        text := 'review_required';
v_master_summary     text := '';
v_warnings           jsonb := '[]'::jsonb;

v_p_home        numeric;
v_p_draw        numeric;
v_p_away        numeric;
v_confidence    numeric;
v_competition   text;
v_home_name     text;
v_away_name     text;
v_home_team_id  uuid;
v_away_team_id  uuid;
v_elo_diff      numeric;
v_home_form_goals   numeric := 1.5;
v_away_form_goals   numeric := 1.2;
v_draw_prior_rate   numeric := 0.25;
v_cal_home_corr     numeric := 0;
v_cal_brier         numeric := 0.25;
v_favorite_side     text;
v_underdog_p        numeric;
v_favorite_p        numeric;
v_upset_prob        numeric;
v_closeness         numeric;

v_draw_risk_level   text;
v_draw_cal_gap      numeric;
v_draw_pressure     text;
v_frag_level        text;
v_overconf          text;
v_tempo_level       text;
v_combined_goals    numeric;
v_tempo_reason      text;
v_has_stats         boolean;
v_late_level        text;
v_late_reason       text;
v_attack_index      numeric;
v_brier_bench       numeric := 0.25;
v_brier_status      text;
v_is_candidate      boolean;
v_cal_summary       text;
v_dq_tier           text;
v_missing           text[] := ARRAY[]::text[];
v_dq_severity       text;
v_elo_ready         boolean;
v_lineup_ready      boolean;
v_feature_ready     boolean;
v_cal_ready         boolean;

BEGIN
-- ─────────────────────────────────────────────────────────
-- 0. Resolve competition + team names
-- ─────────────────────────────────────────────────────────
SELECT c.name, ht.name, at2.name, m.home_team_id, m.away_team_id
INTO v_competition, v_home_name, v_away_name, v_home_team_id, v_away_team_id
FROM public.matches m
JOIN public.competition_seasons cs ON cs.id = m.competition_season_id
JOIN public.competitions c ON c.id = cs.competition_id
JOIN public.teams ht  ON ht.id  = m.home_team_id
JOIN public.teams at2 ON at2.id = m.away_team_id
WHERE m.id = p_match_id;

IF v_competition IS NULL THEN
  RAISE EXCEPTION 'match % not found or has no competition', p_match_id;
END IF;

-- ─────────────────────────────────────────────────────────
-- 1. Ensure prediction draft exists
-- ─────────────────────────────────────────────────────────
SELECT * INTO v_draft
FROM model_lab.prematch_prediction_drafts
WHERE match_id = p_match_id
ORDER BY generated_at DESC
LIMIT 1;

IF NOT FOUND THEN
  BEGIN
    PERFORM model_lab.generate_prematch_prediction(p_match_id, p_triggered_by);
    SELECT * INTO v_draft
    FROM model_lab.prematch_prediction_drafts
    WHERE match_id = p_match_id
    ORDER BY generated_at DESC
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END IF;

-- ─────────────────────────────────────────────────────────
-- 2. Load readiness
-- ─────────────────────────────────────────────────────────
SELECT * INTO v_readiness
FROM model_lab.upcoming_match_readiness
WHERE match_id = p_match_id
ORDER BY assessed_at DESC
LIMIT 1;

-- ─────────────────────────────────────────────────────────
-- 3. Load calibration / draw prior / features
-- ─────────────────────────────────────────────────────────
SELECT * INTO v_cal_state
FROM model_lab.league_calibration_state
WHERE competition_name = v_competition
LIMIT 1;

SELECT * INTO v_draw_prior
FROM model_lab.league_draw_priors
WHERE competition_name = v_competition
LIMIT 1;

SELECT * INTO v_feat
FROM model_lab.match_feature_matrix_v2
WHERE match_id = p_match_id
ORDER BY populated_at DESC
LIMIT 1;

-- ELO snapshot (in model_lab schema)
SELECT tes.pre_match_elo_home, tes.pre_match_elo_away
INTO v_elo_home, v_elo_away
FROM model_lab.team_elo_snapshots tes
WHERE tes.match_id = p_match_id
LIMIT 1;

IF v_elo_home IS NULL THEN
  SELECT ter.elo_overall INTO v_elo_home
  FROM model_lab.team_elo_ratings ter
  WHERE ter.team_id = v_home_team_id
  ORDER BY ter.last_match_date DESC NULLS LAST
  LIMIT 1;
  v_elo_home := COALESCE(v_elo_home, 1500);
END IF;

IF v_elo_away IS NULL THEN
  SELECT ter.elo_overall INTO v_elo_away
  FROM model_lab.team_elo_ratings ter
  WHERE ter.team_id = v_away_team_id
  ORDER BY ter.last_match_date DESC NULLS LAST
  LIMIT 1;
  v_elo_away := COALESCE(v_elo_away, 1500);
END IF;

v_elo_gap := v_elo_home - v_elo_away;

v_draw_prior_rate := COALESCE(
  v_draw_prior.post_covid_draw_rate,
  v_draw_prior.overall_draw_rate,
  0.25
);
v_cal_home_corr := COALESCE(v_cal_state.current_home_correction, 0);
v_cal_brier     := COALESCE(v_cal_state.rolling_brier_l50, 0.25);

v_p_home    := COALESCE(v_draft.p_home, 0.40);
v_p_draw    := COALESCE(v_draft.p_draw, 0.28);
v_p_away    := COALESCE(v_draft.p_away, 0.32);
v_confidence := COALESCE(v_draft.confidence_score, 0.35);

v_home_form_goals := COALESCE((v_feat.features->>'home_l5_goals_scored')::numeric, 1.5);
v_away_form_goals := COALESCE((v_feat.features->>'away_l5_goals_scored')::numeric, 1.2);

-- ─────────────────────────────────────────────────────────
-- Create brain run record
-- ─────────────────────────────────────────────────────────
INSERT INTO model_lab.prematch_brain_runs (
  match_id, prediction_draft_id, status, generated_by
) VALUES (
  p_match_id, v_draft.id, 'running', p_triggered_by
) RETURNING id INTO v_run_id;

-- ══════════════════════════════════════════════════════════
-- BRAIN 1: PROBABILITY
-- ══════════════════════════════════════════════════════════
v_prob_conf := LEAST(GREATEST(v_confidence, 0), 1);
v_prob_warn := CASE
  WHEN v_confidence >= 0.65 THEN 'none'
  WHEN v_confidence >= 0.45 THEN 'low'
  WHEN v_confidence >= 0.30 THEN 'medium'
  ELSE 'high'
END;

v_prob_out := jsonb_build_object(
  'p_home',           round(v_p_home::numeric, 4),
  'p_draw',           round(v_p_draw::numeric, 4),
  'p_away',           round(v_p_away::numeric, 4),
  'confidence_score', round(v_confidence::numeric, 3),
  'elo_gap',          round(v_elo_gap::numeric, 1),
  'elo_home',         round(v_elo_home::numeric, 1),
  'elo_away',         round(v_elo_away::numeric, 1),
  'draft_status',     COALESCE(v_draft.status, 'missing')
);

INSERT INTO model_lab.prematch_brain_outputs
  (brain_run_id, brain_name, output_json, confidence_score, warning_level)
VALUES (v_run_id, 'probability', v_prob_out, v_prob_conf, v_prob_warn);

-- ══════════════════════════════════════════════════════════
-- BRAIN 2: DRAW RISK
-- ══════════════════════════════════════════════════════════
v_closeness := GREATEST(0, 1.0 - abs(v_elo_gap) / 400.0);
v_draw_cal_gap := round((v_p_draw - v_draw_prior_rate)::numeric, 3);

IF v_p_draw >= 0.30 AND v_closeness >= 0.70 THEN
  v_draw_risk_level := 'high';
  v_draw_warn := 'medium';
  v_draw_pressure := 'Closely matched teams with high draw prior — strong draw pressure expected.';
ELSIF v_p_draw >= 0.25 OR v_closeness >= 0.60 THEN
  v_draw_risk_level := 'medium';
  v_draw_warn := 'low';
  v_draw_pressure := 'Moderate draw risk — teams are reasonably evenly matched.';
ELSE
  v_draw_risk_level := 'low';
  v_draw_warn := 'none';
  v_draw_pressure := 'Clear favorite identified; draw risk below league average.';
END IF;

v_draw_conf := CASE v_draw_risk_level
  WHEN 'high'   THEN 0.75
  WHEN 'medium' THEN 0.60
  ELSE 0.45
END;

v_draw_out := jsonb_build_object(
  'draw_risk_level',      v_draw_risk_level,
  'draw_pressure',        v_draw_pressure,
  'league_draw_prior',    round(v_draw_prior_rate::numeric, 4),
  'model_p_draw',         round(v_p_draw::numeric, 4),
  'draw_calibration_gap', v_draw_cal_gap,
  'closeness_index',      round(v_closeness::numeric, 3)
);

INSERT INTO model_lab.prematch_brain_outputs
  (brain_run_id, brain_name, output_json, confidence_score, warning_level)
VALUES (v_run_id, 'draw_risk', v_draw_out, v_draw_conf, v_draw_warn);

-- ══════════════════════════════════════════════════════════
-- BRAIN 3: UPSET RISK
-- ══════════════════════════════════════════════════════════
IF v_p_home >= v_p_away THEN
  v_favorite_side := 'home';
  v_favorite_p    := v_p_home;
  v_underdog_p    := v_p_away;
ELSE
  v_favorite_side := 'away';
  v_favorite_p    := v_p_away;
  v_underdog_p    := v_p_home;
END IF;

v_upset_prob := v_underdog_p;

IF v_favorite_p >= 0.65 AND v_closeness >= 0.50 THEN
  v_frag_level := 'high';
  v_upset_warn := 'medium';
  v_overconf   := 'Favorite appears overconfident given team closeness — upset watch warranted.';
ELSIF v_upset_prob >= 0.30 THEN
  v_frag_level := 'medium';
  v_upset_warn := 'low';
  v_overconf   := 'Underdog has meaningful win probability; result not certain.';
ELSE
  v_frag_level := 'low';
  v_upset_warn := 'none';
  v_overconf   := 'Favorite dominance aligns with ELO gap; upset unlikely.';
END IF;

v_upset_conf := CASE v_frag_level
  WHEN 'high'   THEN 0.70
  WHEN 'medium' THEN 0.55
  ELSE 0.40
END;

v_upset_out := jsonb_build_object(
  'favorite_side',            v_favorite_side,
  'favorite_win_probability', round(v_favorite_p::numeric, 4),
  'upset_probability',        round(v_upset_prob::numeric, 4),
  'favorite_fragility',       v_frag_level,
  'overconfidence_warning',   v_overconf,
  'elo_gap_abs',              round(abs(v_elo_gap)::numeric, 1)
);

INSERT INTO model_lab.prematch_brain_outputs
  (brain_run_id, brain_name, output_json, confidence_score, warning_level)
VALUES (v_run_id, 'upset_risk', v_upset_out, v_upset_conf, v_upset_warn);

-- ══════════════════════════════════════════════════════════
-- BRAIN 4: TEMPO
-- ══════════════════════════════════════════════════════════
v_has_stats     := COALESCE(v_feat.has_stats_features, false);
v_combined_goals := v_home_form_goals + v_away_form_goals;

IF v_has_stats AND v_combined_goals >= 3.5 THEN
  v_tempo_level  := 'high';
  v_tempo_reason := format('Combined L5 goals/game: %.1f. Both sides averaging strong attacking output.', v_combined_goals);
  v_tempo_warn   := 'none';
  v_tempo_conf   := 0.70;
ELSIF v_combined_goals >= 2.5 THEN
  v_tempo_level  := 'balanced';
  v_tempo_reason := format('Combined L5 goals/game: %.1f. Mixed attacking signals.', v_combined_goals);
  v_tempo_warn   := 'none';
  v_tempo_conf   := 0.55;
ELSE
  v_tempo_level  := 'low';
  IF NOT v_has_stats THEN
    v_tempo_reason := 'Stats features unavailable — tempo estimate from ELO only.';
    v_tempo_warn   := 'medium';
    v_tempo_conf   := 0.35;
  ELSE
    v_tempo_reason := format('Combined L5 goals/game: %.1f. Both sides defensively cautious.', v_combined_goals);
    v_tempo_warn   := 'low';
    v_tempo_conf   := 0.55;
  END IF;
END IF;

v_tempo_out := jsonb_build_object(
  'expected_tempo',     v_tempo_level,
  'tempo_reason',       v_tempo_reason,
  'home_l5_goals',      round(v_home_form_goals::numeric, 2),
  'away_l5_goals',      round(v_away_form_goals::numeric, 2),
  'combined_l5_goals',  round(v_combined_goals::numeric, 2),
  'has_stats_features', v_has_stats,
  'note',               'No minute-specific or event-level prediction made.'
);

INSERT INTO model_lab.prematch_brain_outputs
  (brain_run_id, brain_name, output_json, confidence_score, warning_level)
VALUES (v_run_id, 'tempo', v_tempo_out, v_tempo_conf, v_tempo_warn);

-- ══════════════════════════════════════════════════════════
-- BRAIN 5: LATE PRESSURE
-- ══════════════════════════════════════════════════════════
v_attack_index := (v_home_form_goals + v_away_form_goals) / 2.5;

IF v_closeness >= 0.70 AND v_p_draw >= 0.26 THEN
  v_late_level  := 'high';
  v_late_reason := 'Closely matched teams with elevated draw probability — late equalizer or winner pressure likely.';
  v_late_warn   := 'low';
  v_late_conf   := 0.68;
ELSIF v_closeness >= 0.50 OR v_attack_index >= 1.2 THEN
  v_late_level  := 'medium';
  v_late_reason := 'Moderate team closeness and/or above-average attacking output creates meaningful late pressure.';
  v_late_warn   := 'none';
  v_late_conf   := 0.55;
ELSE
  v_late_level  := 'low';
  v_late_reason := 'Clear favorite with below-average attacking index — low late-period volatility expected.';
  v_late_warn   := 'none';
  v_late_conf   := 0.45;
END IF;

v_late_out := jsonb_build_object(
  'late_goal_pressure', v_late_level,
  'late_reason',        v_late_reason,
  'closeness_index',    round(v_closeness::numeric, 3),
  'p_draw',             round(v_p_draw::numeric, 4),
  'attack_index',       round(v_attack_index::numeric, 3),
  'note',               'No minute-specific goal timestamps predicted.'
);

INSERT INTO model_lab.prematch_brain_outputs
  (brain_run_id, brain_name, output_json, confidence_score, warning_level)
VALUES (v_run_id, 'late_pressure', v_late_out, v_late_conf, v_late_warn);

-- ══════════════════════════════════════════════════════════
-- BRAIN 6: CALIBRATION
-- ══════════════════════════════════════════════════════════
v_is_candidate := v_cal_brier < v_brier_bench * 0.95;

IF v_cal_state.competition_name IS NULL THEN
  v_cal_warn     := 'high';
  v_cal_conf     := 0.20;
  v_brier_status := 'no_calibration_data';
  v_is_candidate := false;
ELSIF v_cal_brier <= 0.220 THEN
  v_brier_status := 'excellent';
  v_cal_warn := 'none';
  v_cal_conf := 0.85;
ELSIF v_cal_brier <= 0.240 THEN
  v_brier_status := 'good';
  v_cal_warn := 'none';
  v_cal_conf := 0.70;
ELSIF v_cal_brier <= 0.255 THEN
  v_brier_status := 'acceptable';
  v_cal_warn := 'low';
  v_cal_conf := 0.55;
ELSE
  v_brier_status := 'degraded';
  v_cal_warn := 'high';
  v_cal_conf := 0.30;
END IF;

v_cal_summary := format(
  '%s: Brier=%.3f (%s), home_correction=%.3f, production_candidate=%s',
  v_competition, v_cal_brier, v_brier_status, v_cal_home_corr, v_is_candidate::text
);

v_cal_out := jsonb_build_object(
  'competition',          v_competition,
  'rolling_brier_l50',    round(v_cal_brier::numeric, 4),
  'brier_status',         v_brier_status,
  'home_correction',      round(v_cal_home_corr::numeric, 4),
  'league_draw_prior',    round(v_draw_prior_rate::numeric, 4),
  'production_candidate', v_is_candidate,
  'calibration_summary',  v_cal_summary
);

INSERT INTO model_lab.prematch_brain_outputs
  (brain_run_id, brain_name, output_json, confidence_score, warning_level)
VALUES (v_run_id, 'calibration', v_cal_out, v_cal_conf, v_cal_warn);

-- ══════════════════════════════════════════════════════════
-- BRAIN 7: DATA QUALITY
-- ══════════════════════════════════════════════════════════
v_elo_ready     := COALESCE(v_readiness.elo_ready, false);
v_lineup_ready  := COALESCE(v_readiness.lineup_ready, false);
v_feature_ready := COALESCE(v_readiness.feature_ready, false);
v_cal_ready     := COALESCE(v_readiness.calibration_ready, false);
v_dq_tier       := COALESCE(v_feat.feature_quality_tier, 'unknown');

v_missing := ARRAY[]::text[];
IF NOT v_elo_ready     THEN v_missing := array_append(v_missing, 'elo_not_ready'); END IF;
IF NOT v_feature_ready THEN v_missing := array_append(v_missing, 'feature_matrix_missing'); END IF;
IF NOT v_cal_ready     THEN v_missing := array_append(v_missing, 'calibration_not_ready'); END IF;
IF NOT v_lineup_ready  THEN v_missing := array_append(v_missing, 'lineup_not_available'); END IF;
IF v_draft.id IS NULL  THEN v_missing := array_append(v_missing, 'prediction_draft_missing'); END IF;

IF COALESCE(array_length(v_missing, 1), 0) >= 4 OR NOT v_elo_ready THEN
  v_dq_severity := 'high';  v_dq_warn := 'high';   v_dq_conf := 0.20;
ELSIF COALESCE(array_length(v_missing, 1), 0) >= 2 THEN
  v_dq_severity := 'medium'; v_dq_warn := 'medium'; v_dq_conf := 0.45;
ELSIF COALESCE(array_length(v_missing, 1), 0) = 1 THEN
  v_dq_severity := 'low';   v_dq_warn := 'low';    v_dq_conf := 0.65;
ELSE
  v_dq_severity := 'none';  v_dq_warn := 'none';   v_dq_conf := 0.85;
END IF;

v_dq_out := jsonb_build_object(
  'feature_quality_tier',    v_dq_tier,
  'elo_ready',               v_elo_ready,
  'lineup_ready',            v_lineup_ready,
  'feature_ready',           v_feature_ready,
  'calibration_ready',       v_cal_ready,
  'prediction_draft_exists', v_draft.id IS NOT NULL,
  'missing_items',           to_jsonb(v_missing),
  'warning_severity',        v_dq_severity
);

INSERT INTO model_lab.prematch_brain_outputs
  (brain_run_id, brain_name, output_json, confidence_score, warning_level)
VALUES (v_run_id, 'data_quality', v_dq_out, v_dq_conf, v_dq_warn);

-- ══════════════════════════════════════════════════════════
-- MASTER BRAIN
-- ══════════════════════════════════════════════════════════
v_final_readiness := CASE
  WHEN COALESCE(v_readiness.overall_status, 'blocked') = 'ready'   THEN 'ready'
  WHEN COALESCE(v_readiness.overall_status, 'blocked') = 'partial' THEN 'partial'
  ELSE 'blocked'
END;

v_final_confidence := CASE
  WHEN v_dq_warn = 'high'                                              THEN 'insufficient'
  WHEN v_confidence >= 0.65 AND v_dq_warn IN ('none', 'low')          THEN 'high'
  WHEN v_confidence >= 0.45                                            THEN 'medium'
  ELSE 'low'
END;

v_elo_diff := abs(v_elo_gap);
v_scenario_tone := CASE
  WHEN v_dq_warn = 'high'                          THEN 'low_data_caution'
  WHEN v_frag_level = 'high'                       THEN 'upset_watch'
  WHEN v_draw_risk_level = 'high'                  THEN 'draw_pressure'
  WHEN v_elo_diff >= 150 AND v_favorite_p >= 0.55  THEN 'favorite_control'
  ELSE 'balanced_tension'
END;

v_publish_rec := CASE
  WHEN v_dq_warn = 'high' OR v_final_confidence = 'insufficient'       THEN 'do_not_publish'
  WHEN v_cal_warn = 'high' OR v_final_confidence = 'low'
    OR v_final_readiness = 'blocked'                                    THEN 'review_required'
  WHEN v_final_confidence IN ('medium', 'high')
    AND v_final_readiness IN ('ready', 'partial')                       THEN 'publish_safe'
  ELSE 'review_required'
END;

-- Collect warnings
IF v_prob_warn  <> 'none' THEN
  v_warnings := v_warnings || jsonb_build_object('brain', 'probability',   'level', v_prob_warn,  'msg', 'Low prediction confidence');
END IF;
IF v_draw_warn  <> 'none' THEN
  v_warnings := v_warnings || jsonb_build_object('brain', 'draw_risk',     'level', v_draw_warn,  'msg', v_draw_pressure);
END IF;
IF v_upset_warn <> 'none' THEN
  v_warnings := v_warnings || jsonb_build_object('brain', 'upset_risk',    'level', v_upset_warn, 'msg', v_overconf);
END IF;
IF v_tempo_warn <> 'none' THEN
  v_warnings := v_warnings || jsonb_build_object('brain', 'tempo',         'level', v_tempo_warn, 'msg', 'Tempo estimate uncertain — stats features missing');
END IF;
IF v_late_warn  <> 'none' THEN
  v_warnings := v_warnings || jsonb_build_object('brain', 'late_pressure', 'level', v_late_warn,  'msg', 'Elevated late-period pressure expected');
END IF;
IF v_cal_warn   <> 'none' THEN
  v_warnings := v_warnings || jsonb_build_object('brain', 'calibration',   'level', v_cal_warn,   'msg', 'League calibration quality: ' || v_brier_status);
END IF;
IF v_dq_warn    <> 'none' THEN
  v_warnings := v_warnings || jsonb_build_object('brain', 'data_quality',  'level', v_dq_warn,
    'msg', 'Missing: ' || array_to_string(v_missing, ', '));
END IF;

v_master_summary := format(
  '%s — %s vs %s | Tone: %s | Confidence: %s | Publish: %s | ELO gap: %s | p=%.0f/%.0f/%.0f%% | Draw: %s | Upset: %s | Tempo: %s | Late: %s | Cal: %s | DQ: %s',
  v_competition, v_home_name, v_away_name,
  v_scenario_tone, v_final_confidence, v_publish_rec,
  round(v_elo_gap::numeric, 0)::text,
  v_p_home * 100, v_p_draw * 100, v_p_away * 100,
  v_draw_risk_level, v_frag_level, v_tempo_level, v_late_level,
  v_brier_status, v_dq_severity
);

INSERT INTO model_lab.prematch_master_brain_outputs (
  brain_run_id, final_readiness, final_confidence, scenario_tone,
  publish_recommendation, master_summary, warnings_json
) VALUES (
  v_run_id, v_final_readiness, v_final_confidence, v_scenario_tone,
  v_publish_rec, v_master_summary, v_warnings
);

UPDATE model_lab.prematch_brain_runs SET status = 'completed' WHERE id = v_run_id;

RETURN jsonb_build_object(
  'brain_run_id',  v_run_id,
  'match_id',      p_match_id,
  'competition',   v_competition,
  'generated_at',  now(),
  'master_brain', jsonb_build_object(
    'final_readiness',        v_final_readiness,
    'final_confidence',       v_final_confidence,
    'scenario_tone',          v_scenario_tone,
    'publish_recommendation', v_publish_rec,
    'master_summary',         v_master_summary,
    'warnings',               v_warnings
  ),
  'sub_brains', jsonb_build_object(
    'probability',   v_prob_out,
    'draw_risk',     v_draw_out,
    'upset_risk',    v_upset_out,
    'tempo',         v_tempo_out,
    'late_pressure', v_late_out,
    'calibration',   v_cal_out,
    'data_quality',  v_dq_out
  )
);

EXCEPTION WHEN OTHERS THEN
  IF v_run_id IS NOT NULL THEN
    UPDATE model_lab.prematch_brain_runs SET status = 'failed' WHERE id = v_run_id;
  END IF;
  RAISE;
END;
$function$;
