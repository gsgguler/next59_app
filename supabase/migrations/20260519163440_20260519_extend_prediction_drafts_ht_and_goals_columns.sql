/*
  # Extend prematch_prediction_drafts — half-time probabilities + goals model

  ## New Columns
  - p_ht_home / p_ht_draw / p_ht_away: half-time outcome probabilities (0-1)
  - over_2_5: probability match ends with 3+ goals
  - btts: both-teams-to-score probability
  - expected_goals_home / expected_goals_away: simple xG estimate per 90 min
  - predicted_score: most likely scoreline string (e.g. "1-0")
  - predicted_score_ht: most likely half-time scoreline
  - goals_model_version: which goals model was applied
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='model_lab' AND table_name='prematch_prediction_drafts'
    AND column_name='p_ht_home') THEN
    ALTER TABLE model_lab.prematch_prediction_drafts
      ADD COLUMN p_ht_home              numeric(5,4),
      ADD COLUMN p_ht_draw              numeric(5,4),
      ADD COLUMN p_ht_away              numeric(5,4),
      ADD COLUMN over_2_5               numeric(5,4),
      ADD COLUMN btts                   numeric(5,4),
      ADD COLUMN expected_goals_home    numeric(4,2),
      ADD COLUMN expected_goals_away    numeric(4,2),
      ADD COLUMN predicted_score        text,
      ADD COLUMN predicted_score_ht     text,
      ADD COLUMN goals_model_version    text DEFAULT 'poisson_v1';
  END IF;
END $$;

-- Rebuild generate_prematch_prediction with half-time + goals model
CREATE OR REPLACE FUNCTION model_lab.generate_prematch_prediction(
  p_match_id   uuid,
  p_triggered_by uuid DEFAULT NULL
)
RETURNS model_lab.prematch_prediction_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'model_lab', 'public'
AS $$
DECLARE
v_match          public.matches%ROWTYPE;
v_comp_name      text;
v_season_label   text;
v_home_name      text;
v_away_name      text;

v_elo_version    text := 'elo_v2_ha0_k20_global';
v_feat_version   text := 'features_v2_domestic_2026_05';
v_formula        text := 'formula_v2_draw_recalibrated';
v_model_version  text := 'gold_replay_v1';

v_elo_home       numeric;
v_elo_away       numeric;
v_elo_gap        numeric;

v_draw_prior     numeric := 0.26;
v_cal_correction numeric := 0.0;
v_cal_brier      numeric;
v_cal_context    text := 'post_covid';

v_feat_tier      text := 'elo_only';
v_home_l5        smallint := 0;
v_away_l5        smallint := 0;
v_has_form       boolean  := false;
v_has_stats      boolean  := false;

-- Full-time probabilities
v_raw_p_home     numeric;
v_raw_p_away     numeric;
v_p_draw         numeric;
v_p_home         numeric;
v_p_away         numeric;
v_residual       numeric;
v_closeness      numeric;
v_total          numeric;

-- Half-time probabilities (attenuated toward 50/50 vs full time)
v_p_ht_home      numeric;
v_p_ht_draw      numeric;
v_p_ht_away      numeric;

-- Goals model
v_league_avg_goals  numeric := 2.65;  -- Premier League default
v_home_attack       numeric;
v_away_attack       numeric;
v_home_defense      numeric;
v_away_defense      numeric;
v_xg_home           numeric;
v_xg_away           numeric;
v_over_2_5          numeric;
v_btts              numeric;
v_pred_score        text;
v_pred_score_ht     text;

-- Confidence
v_confidence     numeric;
v_conf_tier      text;
v_draw_risk      text;
v_upset_risk     text;
v_fav_fragility  text;

v_warnings       text[] := ARRAY[]::text[];
v_has_cal_warn   boolean := false;
v_has_data_warn  boolean := false;

v_job_id         uuid;
v_draft          model_lab.prematch_prediction_drafts;
BEGIN
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_id % not found', p_match_id; END IF;

  IF v_match.status_short IN ('FT','AET','PEN') THEN
    RAISE EXCEPTION 'match % is already finished (status: %)', p_match_id, v_match.status_short;
  END IF;

  -- Competition + season label
  SELECT c.name,
    COALESCE(cs.football_data_uk_season_label, s.label, cs.id::text)
  INTO v_comp_name, v_season_label
  FROM public.competition_seasons cs
  JOIN public.competitions c ON c.id = cs.competition_id
  LEFT JOIN public.seasons s ON s.id = cs.season_id
  WHERE cs.id = v_match.competition_season_id;
  v_comp_name    := COALESCE(v_comp_name, 'Unknown');
  v_season_label := COALESCE(v_season_label, 'Unknown Season');

  SELECT name INTO v_home_name FROM public.teams WHERE id = v_match.home_team_id;
  SELECT name INTO v_away_name FROM public.teams WHERE id = v_match.away_team_id;

  -- Log job
  INSERT INTO model_lab.admin_generation_jobs (
    id, job_type, match_id, competition, season_label,
    model_version, feature_version, status, triggered_by, started_at, created_at
  ) VALUES (
    gen_random_uuid(), 'prematch_prediction', p_match_id,
    v_comp_name, v_season_label, v_model_version, v_feat_version,
    'queued', p_triggered_by, now(), now()
  ) RETURNING id INTO v_job_id;

  -- ELO: try team_elo_snapshots first
  SELECT pre_match_elo_home INTO v_elo_home
  FROM model_lab.team_elo_snapshots
  WHERE home_team_id = v_match.home_team_id
    AND match_date <= v_match.match_date
  ORDER BY match_date DESC LIMIT 1;

  SELECT pre_match_elo_away INTO v_elo_away
  FROM model_lab.team_elo_snapshots
  WHERE away_team_id = v_match.away_team_id
    AND match_date <= v_match.match_date
  ORDER BY match_date DESC LIMIT 1;

  -- Fallback: team_elo_ratings
  IF v_elo_home IS NULL THEN
    SELECT elo_overall INTO v_elo_home FROM model_lab.team_elo_ratings
    WHERE team_id = v_match.home_team_id ORDER BY last_match_date DESC LIMIT 1;
  END IF;
  IF v_elo_away IS NULL THEN
    SELECT elo_overall INTO v_elo_away FROM model_lab.team_elo_ratings
    WHERE team_id = v_match.away_team_id ORDER BY last_match_date DESC LIMIT 1;
  END IF;

  IF v_elo_home IS NULL THEN
    v_elo_home := 1500;
    v_warnings := array_append(v_warnings, 'home ELO not found; using 1500 default');
    v_has_data_warn := true;
  END IF;
  IF v_elo_away IS NULL THEN
    v_elo_away := 1500;
    v_warnings := array_append(v_warnings, 'away ELO not found; using 1500 default');
    v_has_data_warn := true;
  END IF;

  v_elo_gap := v_elo_home - v_elo_away;

  -- Feature tier: match_feature_matrix_v2 first
  SELECT
    COALESCE(has_form_features, false),
    COALESCE(has_stats_features, false),
    COALESCE(home_l5_matches_available, 0)::smallint,
    COALESCE(away_l5_matches_available, 0)::smallint,
    COALESCE(feature_quality_tier, 'elo_only')
  INTO v_has_form, v_has_stats, v_home_l5, v_away_l5, v_feat_tier
  FROM model_lab.match_feature_matrix_v2
  WHERE match_id = p_match_id
  ORDER BY populated_at DESC LIMIT 1;

  -- Fallback: prematch_upcoming_feature_snapshots
  IF NOT FOUND THEN
    SELECT
      COALESCE(has_form_features, false),
      COALESCE(home_has_stats_features OR away_has_stats_features, false),
      COALESCE(home_matches_l5, 0)::smallint,
      COALESCE(away_matches_l5, 0)::smallint,
      COALESCE(feature_quality_tier, 'elo_only')
    INTO v_has_form, v_has_stats, v_home_l5, v_away_l5, v_feat_tier
    FROM model_lab.prematch_upcoming_feature_snapshots
    WHERE match_id = p_match_id;
  END IF;

  IF NOT FOUND THEN
    v_feat_tier     := 'elo_only';
    v_warnings      := array_append(v_warnings, 'feature matrix row absent; elo_only tier applied');
    v_has_data_warn := true;
  END IF;

  -- Calibration
  SELECT COALESCE(current_home_correction, 0.0), rolling_brier_l50
  INTO v_cal_correction, v_cal_brier
  FROM model_lab.league_calibration_state
  WHERE competition_name = v_comp_name
  ORDER BY updated_at DESC LIMIT 1;

  IF NOT FOUND THEN
    v_cal_correction := 0.0;
    v_warnings := array_append(v_warnings, format('no calibration state for "%s"; correction=0', v_comp_name));
    v_has_cal_warn := true;
  END IF;

  -- Draw prior
  SELECT COALESCE(post_covid_draw_rate, overall_draw_rate, 0.26)
  INTO v_draw_prior
  FROM model_lab.league_draw_priors
  WHERE competition_name = v_comp_name;

  IF NOT FOUND THEN
    v_draw_prior := 0.26;
    v_warnings := array_append(v_warnings, format('no draw prior for "%s"; using 0.26', v_comp_name));
    v_has_cal_warn := true;
  END IF;

  -- ── Full-time probabilities (formula_v2_draw_recalibrated) ──────────────────
  v_raw_p_home := GREATEST(0.05, LEAST(0.90,
    1.0 / (1.0 + power(10.0, -v_elo_gap / 400.0)) + COALESCE(v_cal_correction, 0.0)
  ));
  v_raw_p_away := 1.0 - v_raw_p_home;
  v_closeness  := GREATEST(0.0, 1.0 - abs(v_elo_gap) / 400.0);
  v_p_draw     := GREATEST(0.10, LEAST(0.32, v_draw_prior * v_closeness * 1.5));
  v_residual   := 1.0 - v_p_draw;
  v_p_home     := v_residual * (v_raw_p_home / (v_raw_p_home + v_raw_p_away));
  v_p_away     := v_residual * (v_raw_p_away / (v_raw_p_home + v_raw_p_away));
  v_total      := v_p_home + v_p_draw + v_p_away;
  v_p_home     := ROUND(v_p_home / v_total, 4);
  v_p_draw     := ROUND(v_p_draw / v_total, 4);
  v_p_away     := ROUND(1.0 - v_p_home - v_p_draw, 4);

  -- ── Half-time probabilities ──────────────────────────────────────────────────
  -- Half-time outcomes are more compressed toward 0-0; draws are more common.
  -- Model: attenuate ELO gap by 50% for HT (fewer goals, shorter window),
  --        then apply a higher draw prior of ~0.38 (HT draws historically ~38-42%).
  DECLARE
    v_elo_gap_ht    numeric := v_elo_gap * 0.50;
    v_raw_ht_home   numeric;
    v_raw_ht_away   numeric;
    v_ht_draw_prior numeric := 0.40;
    v_ht_residual   numeric;
    v_ht_total      numeric;
  BEGIN
    v_raw_ht_home := GREATEST(0.05, LEAST(0.80,
      1.0 / (1.0 + power(10.0, -v_elo_gap_ht / 400.0)) + COALESCE(v_cal_correction * 0.5, 0.0)
    ));
    v_raw_ht_away := 1.0 - v_raw_ht_home;
    v_ht_draw_prior := GREATEST(0.32, LEAST(0.48, v_ht_draw_prior * (v_closeness * 0.6 + 0.7)));
    v_p_ht_draw := v_ht_draw_prior;
    v_ht_residual := 1.0 - v_p_ht_draw;
    v_p_ht_home := v_ht_residual * (v_raw_ht_home / (v_raw_ht_home + v_raw_ht_away));
    v_p_ht_away := v_ht_residual * (v_raw_ht_away / (v_raw_ht_home + v_raw_ht_away));
    v_ht_total := v_p_ht_home + v_p_ht_draw + v_p_ht_away;
    v_p_ht_home := ROUND(v_p_ht_home / v_ht_total, 4);
    v_p_ht_draw := ROUND(v_p_ht_draw / v_ht_total, 4);
    v_p_ht_away := ROUND(1.0 - v_p_ht_home - v_p_ht_draw, 4);
  END;

  -- ── Goals model (Poisson-inspired, ELO-based) ───────────────────────────────
  -- xG = league_avg * strength_ratio, capped 0.4–3.5
  -- home attack strength = exp(v_elo_gap / 600), away = inverse
  DECLARE
    v_league_goals_home numeric := v_league_avg_goals * 0.53;  -- ~53% goals are scored by home
    v_league_goals_away numeric := v_league_avg_goals * 0.47;
    v_strength_home     numeric := power(10.0, v_elo_gap / 1200.0);
    v_strength_away     numeric := power(10.0, -v_elo_gap / 1200.0);

    -- Try to pull form-based goals averages from upcoming feature snapshot
    v_snap_goals_for_home  numeric;
    v_snap_goals_for_away  numeric;
    v_snap_goals_ag_home   numeric;
    v_snap_goals_ag_away   numeric;

    -- Poisson P(0 goals) for each team
    v_p_home_0  numeric;
    v_p_away_0  numeric;
    v_poisson_k integer;
    v_p_total_0_0 numeric;
    v_p_total_1_0 numeric;
    v_p_total_0_1 numeric;
    v_p_total_1_1 numeric;
    v_p_total_2_0 numeric;
    v_p_total_0_2 numeric;
    v_p_total_2_1 numeric;
    v_p_total_1_2 numeric;

    v_sum_over_2_5 numeric := 0;
    v_hg integer;
    v_ag integer;
    v_p_hg numeric;
    v_p_ag numeric;
  BEGIN
    -- Try feature snapshot for goal averages
    SELECT home_goals_for_avg_l5, away_goals_for_avg_l5,
           home_goals_against_avg_l5, away_goals_against_avg_l5
    INTO v_snap_goals_for_home, v_snap_goals_for_away,
         v_snap_goals_ag_home, v_snap_goals_ag_away
    FROM model_lab.prematch_upcoming_feature_snapshots
    WHERE match_id = p_match_id;

    -- Also try feature matrix v2
    IF v_snap_goals_for_home IS NULL THEN
      SELECT rolling_goals_for_home_l5, rolling_goals_for_away_l5,
             rolling_goals_against_home_l5, rolling_goals_against_away_l5
      INTO v_snap_goals_for_home, v_snap_goals_for_away,
           v_snap_goals_ag_home, v_snap_goals_ag_away
      FROM model_lab.match_feature_matrix_v2
      WHERE match_id = p_match_id LIMIT 1;
    END IF;

    IF v_snap_goals_for_home IS NOT NULL AND v_snap_goals_ag_away IS NOT NULL THEN
      -- Dixon-Coles inspired: xG = attack * opponent_defense / league_avg
      v_xg_home := GREATEST(0.4, LEAST(3.5,
        (v_snap_goals_for_home * v_snap_goals_ag_away) / NULLIF(v_league_avg_goals * 0.5, 0)
      ));
      v_xg_away := GREATEST(0.4, LEAST(3.5,
        (v_snap_goals_for_away * v_snap_goals_ag_home) / NULLIF(v_league_avg_goals * 0.5, 0)
      ));
    ELSE
      -- Fallback: ELO strength ratio
      v_xg_home := GREATEST(0.4, LEAST(3.5, v_league_goals_home * v_strength_home));
      v_xg_away := GREATEST(0.4, LEAST(3.5, v_league_goals_away * v_strength_away));
    END IF;

    -- Poisson probabilities for scorelines 0-0 through 4-4
    -- P(k goals) = e^(-lambda) * lambda^k / k!
    -- over_2_5 = P(home+away >= 3)
    -- btts = P(home>=1) * P(away>=1) = (1 - P(home=0)) * (1 - P(away=0))
    v_p_home_0 := exp(-v_xg_home);
    v_p_away_0 := exp(-v_xg_away);

    v_btts := (1 - v_p_home_0) * (1 - v_p_away_0);

    -- Sum P(h+a >= 3) over scorelines h=0..4, a=0..4
    FOR v_hg IN 0..4 LOOP
      FOR v_ag IN 0..4 LOOP
        IF v_hg + v_ag > 2 THEN
          -- P(h goals) * P(a goals) using Poisson PMF
          v_p_hg := exp(-v_xg_home) * power(v_xg_home, v_hg) /
            CASE v_hg WHEN 0 THEN 1 WHEN 1 THEN 1 WHEN 2 THEN 2 WHEN 3 THEN 6 ELSE 24 END;
          v_p_ag := exp(-v_xg_away) * power(v_xg_away, v_ag) /
            CASE v_ag WHEN 0 THEN 1 WHEN 1 THEN 1 WHEN 2 THEN 2 WHEN 3 THEN 6 ELSE 24 END;
          v_sum_over_2_5 := v_sum_over_2_5 + v_p_hg * v_p_ag;
        END IF;
      END LOOP;
    END LOOP;
    v_over_2_5 := ROUND(GREATEST(0.05, LEAST(0.95, v_sum_over_2_5)), 4);
    v_btts     := ROUND(GREATEST(0.05, LEAST(0.95, v_btts)), 4);

    -- Predicted full-time score
    v_pred_score := CASE
      WHEN v_p_home > v_p_away + 0.15 THEN
        CASE WHEN v_over_2_5 > 0.60 THEN '2-1' ELSE '1-0' END
      WHEN v_p_away > v_p_home + 0.15 THEN
        CASE WHEN v_over_2_5 > 0.60 THEN '1-2' ELSE '0-1' END
      ELSE
        CASE WHEN v_over_2_5 > 0.60 THEN '1-1' ELSE '1-1' END
    END;

    -- Predicted HT score (roughly half xG)
    v_pred_score_ht := CASE
      WHEN v_p_ht_home > v_p_ht_away + 0.10 THEN '1-0'
      WHEN v_p_ht_away > v_p_ht_home + 0.10 THEN '0-1'
      ELSE '0-0'
    END;
  END;

  -- ── Confidence ───────────────────────────────────────────────────────────────
  v_confidence := 0.40 + LEAST(0.40, abs(v_elo_gap) / 500.0);
  IF v_feat_tier IN ('elo_form', 'elo_form_stats') AND v_home_l5 >= 3 AND v_away_l5 >= 3 THEN
    v_confidence := v_confidence + 0.10;
  END IF;
  IF v_feat_tier = 'elo_form_stats' THEN v_confidence := v_confidence + 0.05; END IF;
  IF v_cal_brier IS NOT NULL AND v_cal_brier > 0.26 THEN
    v_confidence := v_confidence - 0.05;
    v_warnings := array_append(v_warnings, 'brier ' || round(v_cal_brier,3)::text || ' > 0.26; confidence reduced');
  END IF;
  IF v_has_cal_warn THEN v_confidence := v_confidence - 0.10; END IF;
  v_confidence := GREATEST(0.20, LEAST(0.95, ROUND(v_confidence, 3)));

  v_conf_tier := CASE
    WHEN v_confidence >= 0.70 THEN 'high'
    WHEN v_confidence >= 0.50 THEN 'medium'
    ELSE 'low'
  END;
  v_draw_risk     := CASE WHEN v_p_draw >= 0.28 THEN 'high' WHEN v_p_draw >= 0.22 THEN 'medium' ELSE 'low' END;
  v_upset_risk    := CASE WHEN v_p_home > 0.60 AND v_p_away >= 0.20 THEN 'medium' WHEN v_p_home <= 0.40 THEN 'high' ELSE 'low' END;
  v_fav_fragility := CASE WHEN abs(v_elo_gap) < 50 THEN 'high' WHEN abs(v_elo_gap) < 150 THEN 'medium' ELSE 'low' END;

  -- ── Upsert ───────────────────────────────────────────────────────────────────
  INSERT INTO model_lab.prematch_prediction_drafts (
    id, match_id,
    competition_name, season_label, match_date,
    home_team_name, away_team_name,
    model_version, feature_version, elo_version, calibration_version, prediction_formula,
    pre_match_elo_home, pre_match_elo_away,
    raw_p_home_elo, league_cal_correction,
    feature_quality_tier, home_l5_available, away_l5_available,
    calibration_context,
    p_home, p_draw, p_away,
    p_ht_home, p_ht_draw, p_ht_away,
    over_2_5, btts,
    expected_goals_home, expected_goals_away,
    predicted_score, predicted_score_ht,
    goals_model_version,
    confidence_score, confidence_tier,
    has_calibration_warning, has_data_warning, warnings,
    generated_payload,
    status, generated_by, generated_at, version
  )
  VALUES (
    gen_random_uuid(), p_match_id,
    v_comp_name, v_season_label, v_match.match_date,
    COALESCE(v_home_name,'Unknown'), COALESCE(v_away_name,'Unknown'),
    v_model_version, v_feat_version, v_elo_version, 'cal_v1', v_formula,
    v_elo_home, v_elo_away,
    v_raw_p_home, v_cal_correction,
    v_feat_tier, v_home_l5, v_away_l5,
    v_cal_context,
    v_p_home, v_p_draw, v_p_away,
    v_p_ht_home, v_p_ht_draw, v_p_ht_away,
    v_over_2_5, v_btts,
    ROUND(v_xg_home, 2), ROUND(v_xg_away, 2),
    v_pred_score, v_pred_score_ht,
    'poisson_v1',
    v_confidence, v_conf_tier,
    v_has_cal_warn, v_has_data_warn, v_warnings,
    jsonb_build_object(
      'elo_gap',        v_elo_gap,
      'draw_prior',     v_draw_prior,
      'closeness',      v_closeness,
      'cal_correction', v_cal_correction,
      'draw_risk',      v_draw_risk,
      'upset_risk',     v_upset_risk,
      'fav_fragility',  v_fav_fragility,
      'xg_home',        ROUND(v_xg_home, 2),
      'xg_away',        ROUND(v_xg_away, 2),
      'generated_at',   now()::text
    ),
    'pending_review', p_triggered_by, now(), 1
  );

  UPDATE model_lab.admin_generation_jobs
  SET status = 'completed', completed_at = now()
  WHERE id = v_job_id;

  BEGIN
    PERFORM model_lab.assess_upcoming_match_readiness(p_match_id);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  SELECT * INTO v_draft
  FROM model_lab.prematch_prediction_drafts
  WHERE match_id = p_match_id
  ORDER BY generated_at DESC LIMIT 1;

  RETURN v_draft;

EXCEPTION WHEN OTHERS THEN
  IF v_job_id IS NOT NULL THEN
    UPDATE model_lab.admin_generation_jobs
    SET status = 'failed', error_message = SQLERRM, completed_at = now()
    WHERE id = v_job_id;
  END IF;
  RAISE;
END;
$$;

-- Public RPC: get prediction for a match (reads latest approved or pending_review draft)
CREATE OR REPLACE FUNCTION public.get_match_prediction(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'model_lab', 'public', 'pg_temp'
AS $$
DECLARE
  v_row model_lab.prematch_prediction_drafts;
BEGIN
  SELECT * INTO v_row
  FROM model_lab.prematch_prediction_drafts
  WHERE match_id = p_match_id
    AND status NOT IN ('hidden', 'rejected')
  ORDER BY
    CASE status WHEN 'approved' THEN 0 WHEN 'published' THEN 0 ELSE 1 END,
    generated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'match_id',            v_row.match_id,
    'home_team_name',      v_row.home_team_name,
    'away_team_name',      v_row.away_team_name,
    'p_home',              v_row.p_home,
    'p_draw',              v_row.p_draw,
    'p_away',              v_row.p_away,
    'p_ht_home',           v_row.p_ht_home,
    'p_ht_draw',           v_row.p_ht_draw,
    'p_ht_away',           v_row.p_ht_away,
    'over_2_5',            v_row.over_2_5,
    'btts',                v_row.btts,
    'expected_goals_home', v_row.expected_goals_home,
    'expected_goals_away', v_row.expected_goals_away,
    'predicted_score',     v_row.predicted_score,
    'predicted_score_ht',  v_row.predicted_score_ht,
    'confidence_score',    v_row.confidence_score,
    'confidence_tier',     v_row.confidence_tier,
    'feature_quality_tier',v_row.feature_quality_tier,
    'pre_match_elo_home',  v_row.pre_match_elo_home,
    'pre_match_elo_away',  v_row.pre_match_elo_away,
    'warnings',            v_row.warnings,
    'status',              v_row.status,
    'generated_at',        v_row.generated_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_match_prediction(uuid) TO anon, authenticated;
