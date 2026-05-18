/*
  # Intelligence Foundation — Phase 3: Readiness + Brain Integration

  ## Readiness Updates
  Adds 4 enrichment readiness dimensions to upcoming_match_readiness:
  - standings_readiness
  - injuries_readiness
  - team_statistics_readiness
  - venue_readiness
  Plus new warning codes for missing enrichment.

  Rebuilds assess_upcoming_match_readiness() to populate these.

  ## Brain Package Updates
  Rebuilds generate_prematch_brain_package() with:
  - Data Quality Brain: shows enrichment layer availability
  - Upset Risk Brain: uses standings gap when available
  - Tempo Brain: uses team statistics context when available
  - Master Brain: enrichment warnings in publish recommendation

  ## Notes
  - Missing enrichment lowers confidence but never blocks predictions alone
  - Injuries can set review_required if count >= 3 on either side
  - Severe missing data + weak core = do_not_publish only
*/

-- ============================================================
-- READINESS TABLE: add enrichment columns
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'model_lab' AND table_name = 'upcoming_match_readiness'
    AND column_name = 'standings_readiness') THEN
    ALTER TABLE model_lab.upcoming_match_readiness
      ADD COLUMN standings_readiness          boolean NOT NULL DEFAULT false,
      ADD COLUMN injuries_readiness           boolean NOT NULL DEFAULT false,
      ADD COLUMN team_statistics_readiness    boolean NOT NULL DEFAULT false,
      ADD COLUMN venue_readiness              boolean NOT NULL DEFAULT false,
      ADD COLUMN enrichment_score             smallint NOT NULL DEFAULT 0,  -- 0-4 count of enrichment layers present
      ADD COLUMN injury_warning_level         text;
  END IF;
END $$;

-- ============================================================
-- REBUILD assess_upcoming_match_readiness
-- ============================================================

CREATE OR REPLACE FUNCTION model_lab.assess_upcoming_match_readiness(
  p_match_id uuid
)
RETURNS model_lab.upcoming_match_readiness
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_match              record;
  v_elo_home           record;
  v_elo_away           record;
  v_feature            record;
  v_cal                record;
  v_prediction         record;
  v_scenario           record;
  v_snapshot           record;
  v_af_fixture_id      integer;
  v_af_league_id       integer;
  v_af_season          integer;
  v_af_home_team_id    integer;
  v_af_away_team_id    integer;

  -- Readiness booleans
  v_elo_ready          boolean := false;
  v_feature_ready      boolean := false;
  v_cal_ready          boolean := false;
  v_lineup_ready       boolean := false;
  v_stats_ready        boolean := false;
  v_pred_ready         boolean := false;
  v_scenario_ready     boolean := false;
  v_standings_ready    boolean := false;
  v_injuries_ready     boolean := false;
  v_team_stats_ready   boolean := false;
  v_venue_ready        boolean := false;

  -- Quality
  v_feat_tier          text := 'elo_only';
  v_elo_home_val       numeric;
  v_elo_away_val       numeric;
  v_home_l5            smallint := 0;
  v_away_l5            smallint := 0;
  v_brier              numeric;
  v_pred_status        text;
  v_inj_warning        text;

  -- Status
  v_status             text := 'blocked';
  v_warnings           text[] := '{}';
  v_blockers           text[] := '{}';
  v_enrichment_score   smallint := 0;

  v_result             model_lab.upcoming_match_readiness;
BEGIN
  -- Load match
  SELECT m.*, cs.competition_name, cs.season_label,
         ht.name AS home_team_name, at.name AS away_team_name,
         ht.id AS home_team_uuid, at.id AS away_team_uuid
  INTO v_match
  FROM public.matches m
  JOIN public.competition_seasons cs ON cs.id = m.competition_season_id
  JOIN public.teams ht ON ht.id = m.home_team_id
  JOIN public.teams at ON at.id = m.away_team_id
  WHERE m.id = p_match_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- 1. ELO readiness
  SELECT rated_elo, rated_through INTO v_elo_home
  FROM public.team_elo_ratings
  WHERE team_id = v_match.home_team_uuid AND elo_version = 'elo_v2_ha0_k20_global'
  ORDER BY rated_through DESC LIMIT 1;

  SELECT rated_elo, rated_through INTO v_elo_away
  FROM public.team_elo_ratings
  WHERE team_id = v_match.away_team_uuid AND elo_version = 'elo_v2_ha0_k20_global'
  ORDER BY rated_through DESC LIMIT 1;

  v_elo_home_val := (v_elo_home).rated_elo;
  v_elo_away_val := (v_elo_away).rated_elo;
  v_elo_ready := v_elo_home IS NOT NULL AND v_elo_away IS NOT NULL;

  IF NOT v_elo_ready THEN
    v_blockers := array_append(v_blockers, 'missing_elo');
  END IF;

  -- 2. Feature readiness (from feature snapshot)
  SELECT feature_quality_tier, has_form_features,
         matches_l5_home, matches_l5_away
  INTO v_snapshot
  FROM model_lab.prematch_upcoming_feature_snapshots
  WHERE match_id = p_match_id;

  IF v_snapshot IS NOT NULL THEN
    v_feat_tier := COALESCE(v_snapshot.feature_quality_tier, 'elo_only');
    v_home_l5   := COALESCE(v_snapshot.matches_l5_home, 0);
    v_away_l5   := COALESCE(v_snapshot.matches_l5_away, 0);
    v_feature_ready := v_snapshot.has_form_features OR v_feat_tier = 'elo_form_stats';
  ELSE
    -- Fallback: check feature matrix v2
    SELECT feature_quality_tier, has_form_features,
           home_l5_matches_available, away_l5_matches_available
    INTO v_feature
    FROM model_lab.match_feature_matrix_v2
    WHERE match_id = p_match_id
    LIMIT 1;

    IF v_feature IS NOT NULL THEN
      v_feat_tier   := COALESCE(v_feature.feature_quality_tier, 'elo_only');
      v_home_l5     := COALESCE(v_feature.home_l5_matches_available, 0);
      v_away_l5     := COALESCE(v_feature.away_l5_matches_available, 0);
      v_feature_ready := COALESCE(v_feature.has_form_features, false);
    END IF;
  END IF;

  IF NOT v_feature_ready THEN
    v_warnings := array_append(v_warnings, 'missing_form_features');
  END IF;

  -- 3. Calibration readiness
  SELECT rolling_brier_l50 INTO v_brier
  FROM model_lab.league_calibration_state
  WHERE competition_name = v_match.competition_name
  LIMIT 1;

  v_cal_ready := v_brier IS NOT NULL;
  IF NOT v_cal_ready THEN
    v_warnings := array_append(v_warnings, 'missing_calibration');
  END IF;

  -- 4. Lineup availability
  BEGIN
    EXECUTE format('SELECT COUNT(*) > 0 FROM af.fixture_lineups WHERE fixture_id = %L', v_match.api_football_fixture_id)
    INTO v_lineup_ready;
  EXCEPTION WHEN OTHERS THEN
    v_lineup_ready := false;
  END;

  -- 5. Stats availability
  SELECT has_stats INTO v_stats_ready
  FROM model_lab.prematch_feature_matrix_snapshot_v1
  WHERE match_id = p_match_id
  LIMIT 1;

  v_stats_ready := COALESCE(v_stats_ready, false);

  -- 6. Prediction readiness
  SELECT status INTO v_pred_status
  FROM model_lab.prematch_prediction_drafts
  WHERE match_id = p_match_id AND status NOT IN ('hidden', 'rejected')
  LIMIT 1;
  v_pred_ready := v_pred_status IS NOT NULL;

  -- 7. Scenario readiness
  v_scenario_ready := EXISTS (
    SELECT 1 FROM model_lab.match_story_drafts
    WHERE match_id = p_match_id AND status NOT IN ('hidden', 'rejected')
  );

  -- 8. Enrichment readiness — resolve AF IDs
  SELECT afm.af_fixture_id INTO v_af_fixture_id
  FROM public.af_fixture_mappings afm
  WHERE afm.match_id = p_match_id
  LIMIT 1;

  IF v_af_fixture_id IS NOT NULL THEN
    SELECT league_id, season INTO v_af_league_id, v_af_season
    FROM shared.af_fixtures_raw
    WHERE fixture_id = v_af_fixture_id LIMIT 1;

    SELECT
      (raw_response->'teams'->'home'->>'id')::integer,
      (raw_response->'teams'->'away'->>'id')::integer
    INTO v_af_home_team_id, v_af_away_team_id
    FROM shared.af_fixtures_raw
    WHERE fixture_id = v_af_fixture_id LIMIT 1;
  END IF;

  -- Standings readiness
  IF v_af_league_id IS NOT NULL AND v_af_home_team_id IS NOT NULL THEN
    v_standings_ready := EXISTS (
      SELECT 1 FROM public.af_standings_normalized
      WHERE af_league_id = v_af_league_id AND af_season = v_af_season
        AND af_team_id = v_af_home_team_id
    ) AND EXISTS (
      SELECT 1 FROM public.af_standings_normalized
      WHERE af_league_id = v_af_league_id AND af_season = v_af_season
        AND af_team_id = v_af_away_team_id
    );
  END IF;

  IF NOT v_standings_ready THEN
    v_warnings := array_append(v_warnings, 'missing_standings');
  END IF;

  -- Injuries readiness (fixture or league scope)
  IF v_af_fixture_id IS NOT NULL THEN
    v_injuries_ready := EXISTS (
      SELECT 1 FROM public.af_injuries_normalized
      WHERE af_fixture_id = v_af_fixture_id
    ) OR EXISTS (
      SELECT 1 FROM public.af_injuries_normalized
      WHERE af_league_id = v_af_league_id AND af_season = v_af_season
        AND af_fixture_id IS NULL
    );

    -- Injury warning
    DECLARE
      v_inj_count integer;
    BEGIN
      SELECT SUM(cnt) INTO v_inj_count FROM (
        SELECT COUNT(*) AS cnt FROM public.af_injuries_normalized
        WHERE af_fixture_id = v_af_fixture_id
        UNION ALL
        SELECT 0
      ) t;
      IF COALESCE(v_inj_count, 0) >= 6 THEN v_inj_warning := 'severe';
        v_warnings := array_append(v_warnings, 'high_context_uncertainty');
      ELSIF COALESCE(v_inj_count, 0) >= 3 THEN v_inj_warning := 'moderate';
        v_warnings := array_append(v_warnings, 'key_player_absence_detected');
      ELSIF COALESCE(v_inj_count, 0) >= 1 THEN v_inj_warning := 'mild';
      ELSE v_inj_warning := 'none';
      END IF;
    END;
  END IF;

  IF NOT v_injuries_ready THEN
    v_warnings := array_append(v_warnings, 'missing_injuries');
  END IF;

  -- Team statistics readiness
  IF v_af_league_id IS NOT NULL AND v_af_home_team_id IS NOT NULL THEN
    v_team_stats_ready := EXISTS (
      SELECT 1 FROM public.af_team_statistics_normalized
      WHERE af_league_id = v_af_league_id AND af_season = v_af_season
        AND af_team_id = v_af_home_team_id
    ) AND EXISTS (
      SELECT 1 FROM public.af_team_statistics_normalized
      WHERE af_league_id = v_af_league_id AND af_season = v_af_season
        AND af_team_id = v_af_away_team_id
    );
  END IF;

  IF NOT v_team_stats_ready THEN
    v_warnings := array_append(v_warnings, 'missing_team_statistics');
  END IF;

  -- Venue readiness
  IF v_af_fixture_id IS NOT NULL THEN
    v_venue_ready := EXISTS (
      SELECT 1 FROM shared.af_fixtures_raw afr
      JOIN public.af_venues_normalized vn
        ON vn.af_venue_id = (afr.raw_response->'fixture'->'venue'->>'id')::integer
      WHERE afr.fixture_id = v_af_fixture_id
    );
  END IF;

  IF NOT v_venue_ready THEN
    v_warnings := array_append(v_warnings, 'missing_venue');
  END IF;

  -- Enrichment score
  v_enrichment_score :=
    (v_standings_ready::int) +
    (v_injuries_ready::int) +
    (v_team_stats_ready::int) +
    (v_venue_ready::int);

  -- Overall status
  -- ready = elo AND (feature OR cal) — enrichment is optional
  IF v_elo_ready AND v_feature_ready AND v_cal_ready THEN
    v_status := 'ready';
  ELSIF v_elo_ready AND (v_feature_ready OR v_cal_ready) THEN
    v_status := 'partial';
  ELSE
    v_status := 'blocked';
    IF NOT v_elo_ready THEN
      v_blockers := array_append(v_blockers, 'elo_missing');
    END IF;
  END IF;

  -- Upsert
  INSERT INTO model_lab.upcoming_match_readiness (
    match_id, competition_name, season_label, match_date, kickoff_utc,
    home_team_name, away_team_name,
    elo_readiness, feature_readiness, calibration_readiness,
    lineup_availability, stats_availability, prediction_readiness, scenario_readiness,
    standings_readiness, injuries_readiness, team_statistics_readiness, venue_readiness,
    enrichment_score, injury_warning_level,
    feature_quality_tier, elo_home, elo_away,
    home_l5_available, away_l5_available,
    calibration_brier_l50, prediction_status,
    warnings, overall_status, blocking_reasons,
    assessed_at, assessment_version
  )
  VALUES (
    p_match_id, v_match.competition_name, v_match.season_label,
    to_timestamp(v_match.timestamp)::date, to_timestamp(v_match.timestamp),
    v_match.home_team_name, v_match.away_team_name,
    v_elo_ready, v_feature_ready, v_cal_ready,
    v_lineup_ready, v_stats_ready, v_pred_ready, v_scenario_ready,
    v_standings_ready, v_injuries_ready, v_team_stats_ready, v_venue_ready,
    v_enrichment_score, v_inj_warning,
    v_feat_tier, v_elo_home_val, v_elo_away_val,
    v_home_l5, v_away_l5,
    v_brier, v_pred_status,
    v_warnings, v_status, v_blockers,
    now(), 'v2'
  )
  ON CONFLICT (match_id) DO UPDATE SET
    elo_readiness             = EXCLUDED.elo_readiness,
    feature_readiness         = EXCLUDED.feature_readiness,
    calibration_readiness     = EXCLUDED.calibration_readiness,
    lineup_availability       = EXCLUDED.lineup_availability,
    stats_availability        = EXCLUDED.stats_availability,
    prediction_readiness      = EXCLUDED.prediction_readiness,
    scenario_readiness        = EXCLUDED.scenario_readiness,
    standings_readiness       = EXCLUDED.standings_readiness,
    injuries_readiness        = EXCLUDED.injuries_readiness,
    team_statistics_readiness = EXCLUDED.team_statistics_readiness,
    venue_readiness           = EXCLUDED.venue_readiness,
    enrichment_score          = EXCLUDED.enrichment_score,
    injury_warning_level      = EXCLUDED.injury_warning_level,
    feature_quality_tier      = EXCLUDED.feature_quality_tier,
    elo_home                  = EXCLUDED.elo_home,
    elo_away                  = EXCLUDED.elo_away,
    home_l5_available         = EXCLUDED.home_l5_available,
    away_l5_available         = EXCLUDED.away_l5_available,
    calibration_brier_l50     = EXCLUDED.calibration_brier_l50,
    prediction_status         = EXCLUDED.prediction_status,
    warnings                  = EXCLUDED.warnings,
    overall_status            = EXCLUDED.overall_status,
    blocking_reasons          = EXCLUDED.blocking_reasons,
    assessed_at               = now(),
    assessment_version        = 'v2';

  SELECT * INTO v_result
  FROM model_lab.upcoming_match_readiness
  WHERE match_id = p_match_id;

  RETURN v_result;
END;
$$;

-- ============================================================
-- REBUILD generate_prematch_brain_package with enrichment awareness
-- ============================================================

CREATE OR REPLACE FUNCTION model_lab.generate_prematch_brain_package(
  p_match_id   uuid,
  p_triggered_by text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_pred       record;
  v_readiness  record;
  v_cal        record;
  v_feat       record;
  v_draw_prior record;
  v_snap       record;  -- enrichment snapshot

  -- Probability
  v_p_home     numeric;
  v_p_draw     numeric;
  v_p_away     numeric;
  v_confidence numeric;
  v_conf_tier  text;

  -- Derived signals
  v_elo_gap        numeric;
  v_draw_risk      text;
  v_upset_risk     text;
  v_upset_prob     numeric;
  v_fav_fragility  text;
  v_tempo          text;
  v_late_pressure  text;
  v_closeness      numeric;

  -- Enrichment signals
  v_standings_gap  integer;  -- home_rank - away_rank
  v_inj_warning    text;
  v_goals_for_home numeric;
  v_goals_for_away numeric;
  v_altitude_warn  text;

  -- Master brain
  v_publish_rec    text;
  v_review_required boolean := false;
  v_data_warnings  text[] := '{}';

  v_result         jsonb;
BEGIN
  -- Load prediction
  SELECT * INTO v_pred
  FROM model_lab.prematch_prediction_drafts
  WHERE match_id = p_match_id AND status NOT IN ('hidden', 'rejected')
  ORDER BY generated_at DESC LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'no_prediction_draft', 'match_id', p_match_id);
  END IF;

  -- Load readiness
  SELECT * INTO v_readiness
  FROM model_lab.upcoming_match_readiness
  WHERE match_id = p_match_id;

  -- Load calibration
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

  -- ── DRAW RISK BRAIN ──────────────────────────────────────
  v_draw_risk := CASE
    WHEN v_p_draw >= 0.30 THEN 'high'
    WHEN v_p_draw >= 0.22 THEN 'medium'
    ELSE 'low'
  END;

  -- ── UPSET RISK BRAIN (standings-aware) ───────────────────
  v_standings_gap := v_snap.standings_rank_gap;  -- NULL if no standings

  v_fav_fragility := CASE
    WHEN abs(COALESCE(v_elo_gap, 0)) < 50 THEN 'high'
    WHEN abs(COALESCE(v_elo_gap, 0)) < 150 THEN 'medium'
    ELSE 'low'
  END;

  -- If favorite is at home but standings show they are lower ranked, flag
  IF v_standings_gap IS NOT NULL AND v_standings_gap > 5 AND v_elo_gap > 0 THEN
    v_fav_fragility := 'medium';  -- standings gap contradicts ELO advantage
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

  -- ── TEMPO BRAIN (team-stats-aware) ──────────────────────
  v_goals_for_home := COALESCE(v_snap.season_goals_for_avg_home, v_feat.rolling_goals_for_home_l5);
  v_goals_for_away := COALESCE(v_snap.season_goals_for_avg_away, v_feat.rolling_goals_for_away_l5);

  v_tempo := CASE
    WHEN COALESCE(v_goals_for_home, 0) + COALESCE(v_goals_for_away, 0) > 3.2 THEN 'high'
    WHEN COALESCE(v_goals_for_home, 0) + COALESCE(v_goals_for_away, 0) > 2.0 THEN 'balanced'
    ELSE 'low'
  END;

  -- ── LATE PRESSURE BRAIN ──────────────────────────────────
  v_late_pressure := CASE
    WHEN v_p_draw >= 0.28 AND v_closeness >= 0.6 THEN 'high'
    WHEN v_p_draw >= 0.22 THEN 'medium'
    ELSE 'low'
  END;

  -- ── DATA QUALITY BRAIN (enrichment-aware) ────────────────
  IF v_pred.has_data_warning THEN
    v_data_warnings := array_append(v_data_warnings, 'elo_only_prediction');
  END IF;
  IF NOT COALESCE((v_readiness).standings_readiness, false) THEN
    v_data_warnings := array_append(v_data_warnings, 'missing_standings');
  END IF;
  IF NOT COALESCE((v_readiness).injuries_readiness, false) THEN
    v_data_warnings := array_append(v_data_warnings, 'missing_injuries');
  END IF;
  IF NOT COALESCE((v_readiness).team_statistics_readiness, false) THEN
    v_data_warnings := array_append(v_data_warnings, 'missing_team_statistics');
  END IF;
  IF NOT COALESCE((v_readiness).venue_readiness, false) THEN
    v_data_warnings := array_append(v_data_warnings, 'missing_venue');
  END IF;

  -- Altitude warning (WC2026 context)
  IF v_snap.venue_altitude_meters IS NOT NULL AND v_snap.venue_altitude_meters > 1000 THEN
    v_altitude_warn := v_snap.venue_context_warning;
    v_data_warnings := array_append(v_data_warnings, 'altitude_context');
  END IF;

  -- Injury warning triggers review
  v_inj_warning := COALESCE(v_snap.injury_warning_level, v_readiness.injury_warning_level);
  IF v_inj_warning IN ('moderate', 'severe') THEN
    v_review_required := true;
    v_data_warnings := array_append(v_data_warnings, 'injury_warning_' || v_inj_warning);
  END IF;

  -- ── MASTER BRAIN — PUBLISH RECOMMENDATION ─────────────────
  -- do_not_publish: core data weak AND most enrichment missing
  -- review_required: injuries moderate/severe OR low confidence + missing enrichment
  -- publish_with_caveats: confidence medium + some enrichment missing
  -- publish: confidence high + all core present
  DECLARE
    v_enrichment_score smallint := COALESCE((v_readiness).enrichment_score, 0);
    v_core_ok boolean := COALESCE((v_readiness).elo_readiness, false)
                      AND COALESCE((v_readiness).feature_readiness, false)
                      AND COALESCE((v_readiness).calibration_readiness, false);
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

  -- ── ASSEMBLE OUTPUT ──────────────────────────────────────
  v_result := jsonb_build_object(
    'match_id', p_match_id,
    'generated_at', now(),

    'probability', jsonb_build_object(
      'p_home', round(v_p_home::numeric, 3),
      'p_draw', round(v_p_draw::numeric, 3),
      'p_away', round(v_p_away::numeric, 3),
      'confidence', round(v_confidence::numeric, 3),
      'confidence_tier', v_conf_tier
    ),

    'draw_risk', jsonb_build_object(
      'level', v_draw_risk,
      'p_draw', round(v_p_draw::numeric, 3),
      'closeness', round(v_closeness::numeric, 3),
      'league_draw_prior', COALESCE(v_draw_prior.post_covid_draw_rate, v_draw_prior.overall_draw_rate)
    ),

    'upset_risk', jsonb_build_object(
      'level', v_upset_risk,
      'upset_probability', round(v_upset_prob::numeric, 3),
      'favorite_fragility', v_fav_fragility,
      'standings_gap', v_standings_gap,
      'elo_gap', round(COALESCE(v_elo_gap, 0)::numeric, 1),
      'standings_context', CASE
        WHEN v_standings_gap IS NOT NULL
          THEN jsonb_build_object(
            'home_rank', v_snap.standings_rank_home,
            'away_rank', v_snap.standings_rank_away,
            'home_points', v_snap.standings_points_home,
            'away_points', v_snap.standings_points_away,
            'home_form', v_snap.standings_form_home,
            'away_form', v_snap.standings_form_away
          )
        ELSE NULL
      END
    ),

    'tempo', jsonb_build_object(
      'level', v_tempo,
      'goals_for_home_season_avg', v_snap.season_goals_for_avg_home,
      'goals_for_away_season_avg', v_snap.season_goals_for_avg_away,
      'clean_sheet_rate_home', v_snap.season_clean_sheet_rate_home,
      'clean_sheet_rate_away', v_snap.season_clean_sheet_rate_away,
      'home_attack_baseline', v_snap.home_attack_baseline,
      'away_attack_baseline', v_snap.away_attack_baseline
    ),

    'late_pressure', jsonb_build_object(
      'level', v_late_pressure,
      'draw_risk', v_draw_risk,
      'closeness', round(v_closeness::numeric, 3)
    ),

    'calibration', jsonb_build_object(
      'league', v_pred.competition_name,
      'home_bias', v_cal.current_home_correction,
      'brier_l50', v_cal.rolling_brier_l50,
      'production_candidate', COALESCE(v_cal.is_production_candidate, false)
    ),

    'injuries', jsonb_build_object(
      'warning_level', COALESCE(v_inj_warning, 'none'),
      'injury_count_home', COALESCE(v_snap.injury_count_home, 0),
      'injury_count_away', COALESCE(v_snap.injury_count_away, 0),
      'injury_count_total', COALESCE(v_snap.injury_count_total, 0),
      'data_available', COALESCE((v_readiness).injuries_readiness, false)
    ),

    'venue', jsonb_build_object(
      'venue_name', v_snap.venue_name,
      'city', v_snap.venue_city,
      'surface', v_snap.venue_surface,
      'capacity', v_snap.venue_capacity,
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
      'feature_quality_tier', COALESCE(v_pred.feature_quality_tier, 'elo_only'),
      'elo_readiness', COALESCE((v_readiness).elo_readiness, false),
      'feature_readiness', COALESCE((v_readiness).feature_readiness, false),
      'calibration_readiness', COALESCE((v_readiness).calibration_readiness, false),
      'standings_readiness', COALESCE((v_readiness).standings_readiness, false),
      'injuries_readiness', COALESCE((v_readiness).injuries_readiness, false),
      'team_statistics_readiness', COALESCE((v_readiness).team_statistics_readiness, false),
      'venue_readiness', COALESCE((v_readiness).venue_readiness, false),
      'enrichment_score', COALESCE((v_readiness).enrichment_score, 0),
      'warnings', v_data_warnings,
      'severity', CASE
        WHEN array_length(v_data_warnings, 1) >= 4 THEN 'high'
        WHEN array_length(v_data_warnings, 1) >= 2 THEN 'medium'
        ELSE 'low'
      END
    ),

    'master_summary', jsonb_build_object(
      'publish_recommendation', v_publish_rec,
      'review_required', v_review_required,
      'confidence_tier', v_conf_tier,
      'enrichment_score', COALESCE((v_readiness).enrichment_score, 0),
      'enrichment_max', 4,
      'enrichment_coverage_pct', round((COALESCE((v_readiness).enrichment_score, 0)::numeric / 4.0) * 100),
      'data_warning_count', COALESCE(array_length(v_data_warnings, 1), 0),
      'altitude_warning', v_altitude_warn IS NOT NULL
    )
  );

  -- Store brain package
  INSERT INTO model_lab.prematch_brain_packages (
    match_id, brain_package, generated_at, triggered_by
  )
  VALUES (p_match_id, v_result, now(), p_triggered_by)
  ON CONFLICT (match_id) DO UPDATE SET
    brain_package = EXCLUDED.brain_package,
    generated_at  = now(),
    triggered_by  = EXCLUDED.triggered_by;

  RETURN v_result;
END;
$$;
