
/*
  # Pre-Match Macro Scenario Generation — Phase 4

  ## Purpose
  `model_lab.generate_prematch_scenario(p_match_id uuid, p_triggered_by uuid)`

  Generates a structured analytical narrative for a match based solely on:
    - The existing prediction draft (probabilities, confidence, warnings)
    - Feature matrix signals (form, attack/defense indices, stats availability)
    - ELO gap context
    - League calibration context

  ## STRICT CONSTRAINT: No hallucinated events
    - No fabricated goals, cards, timestamps, or scorelines
    - No invented player actions or tactical instructions
    - All narrative derived exclusively from computed signals
    - Narrative describes TENDENCIES and RISK LEVELS — not outcomes

  ## Sections generated (all probabilistic language only)
    headline              — one sentence framing based on ELO gap and p_home
    tactical_summary      — form differential, attack vs defense balance
    expected_tempo        — based on attack_index and shots_avg signals
    key_pressure_zones    — based on xg_lite and late_goal signals
    first_goal_sensitivity — how match trajectory changes with first goal
    draw_risk_analysis    — structured draw risk from p_draw and closeness
    favorite_fragility    — ELO gap + form consistency signals
    late_goal_pressure    — ev_late_pressure signal if available
    scenario_narrative    — full paragraph combining above signals
    confidence_caveats    — data quality and calibration warnings

  ## Status flow
    pending_review (requires admin review before publish)
*/

CREATE OR REPLACE FUNCTION model_lab.generate_prematch_scenario(
  p_match_id     uuid,
  p_triggered_by uuid DEFAULT NULL
)
RETURNS model_lab.match_story_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_draft          model_lab.prematch_prediction_drafts;
  v_feat           model_lab.match_feature_matrix_v2%ROWTYPE;
  v_snap           model_lab.prematch_feature_matrix_snapshot_v1%ROWTYPE;

  v_headline         text;
  v_tactical_sum     text;
  v_expected_tempo   text;
  v_pressure_zones   text;
  v_first_goal_sens  text;
  v_draw_risk_txt    text;
  v_fav_frag_txt     text;
  v_late_goal_txt    text;
  v_scenario_narr    text;
  v_conf_caveats     text;
  v_full_narrative   text;

  v_elo_gap          numeric;
  v_home_label       text;
  v_away_label       text;
  v_favorite_label   text;
  v_underdog_label   text;

  v_job_id           uuid;
  v_result           model_lab.match_story_drafts;
BEGIN
  -- Load prediction draft (must exist)
  SELECT * INTO v_draft
  FROM model_lab.prematch_prediction_drafts
  WHERE match_id = p_match_id
  ORDER BY generated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No prediction draft found for match %; run generate_prematch_prediction() first', p_match_id;
  END IF;

  -- Log job
  INSERT INTO model_lab.admin_generation_jobs (
    id, job_type, match_id, competition, season_label,
    model_version, feature_version, status, triggered_by, started_at, created_at
  )
  VALUES (
    gen_random_uuid(), 'prematch_scenario', p_match_id,
    v_draft.competition_name, v_draft.season_label,
    v_draft.model_version, v_draft.feature_version,
    'queued', p_triggered_by, now(), now()
  )
  RETURNING id INTO v_job_id;

  -- Load feature matrix (optional — graceful)
  SELECT * INTO v_feat
  FROM model_lab.match_feature_matrix_v2
  WHERE match_id = p_match_id
  ORDER BY populated_at DESC
  LIMIT 1;

  -- Load richer snapshot (optional)
  SELECT * INTO v_snap
  FROM model_lab.prematch_feature_matrix_snapshot_v1
  WHERE match_id = p_match_id
  ORDER BY snapshot_created_at DESC
  LIMIT 1;

  -- Setup labels
  v_home_label := v_draft.home_team_name;
  v_away_label := v_draft.away_team_name;
  v_elo_gap    := v_draft.pre_match_elo_home - v_draft.pre_match_elo_away;

  IF v_draft.p_home >= v_draft.p_away THEN
    v_favorite_label := v_home_label;
    v_underdog_label := v_away_label;
  ELSE
    v_favorite_label := v_away_label;
    v_underdog_label := v_home_label;
  END IF;

  -- === HEADLINE ===
  v_headline := CASE
    WHEN abs(v_elo_gap) >= 200 AND v_draft.p_home > 0.55 THEN
      format('%s enter as clear favorites at home (ELO gap: %s pts); %s will need to absorb early pressure to stay competitive.',
        v_home_label, round(abs(v_elo_gap))::text, v_away_label)
    WHEN abs(v_elo_gap) >= 200 AND v_draft.p_away > 0.55 THEN
      format('%s are the significant away favorites (ELO gap: %s pts); this is a difficult assignment for %s.',
        v_away_label, round(abs(v_elo_gap))::text, v_home_label)
    WHEN abs(v_elo_gap) < 50 THEN
      format('A closely matched fixture — %s vs %s are separated by only %s ELO points, making the draw a live outcome.',
        v_home_label, v_away_label, round(abs(v_elo_gap))::text)
    WHEN v_draft.p_draw >= 0.26 THEN
      format('%s vs %s is a competitive encounter with draw probability elevated at %.0f%%.',
        v_home_label, v_away_label, v_draft.p_draw * 100)
    ELSE
      format('%s vs %s — %s hold a moderate edge (%.0f%% win probability).',
        v_home_label, v_away_label, v_favorite_label,
        GREATEST(v_draft.p_home, v_draft.p_away) * 100)
  END;

  -- === TACTICAL SUMMARY ===
  IF v_feat.match_id IS NOT NULL AND v_feat.has_form_features THEN
    v_tactical_sum := format(
      'Recent form: %s carry %.1f pts/game over L5 (attack index: %.2f, defense index: %.2f). '
      || '%s average %.1f pts/game over L5 (attack index: %.2f, defense index: %.2f). '
      || 'Form differential favors %s by %.1f pts/game.',
      v_home_label,
      COALESCE(v_feat.recent_form_points_home_l5, 0),
      COALESCE(v_feat.attack_index_home_l5, 0),
      COALESCE(v_feat.defense_index_home_l5, 0),
      v_away_label,
      COALESCE(v_feat.recent_form_points_away_l5, 0),
      COALESCE(v_feat.attack_index_away_l5, 0),
      COALESCE(v_feat.defense_index_away_l5, 0),
      CASE WHEN v_feat.form_gap_home >= 0 THEN v_home_label ELSE v_away_label END,
      abs(COALESCE(v_feat.form_gap_home, 0))
    );
  ELSE
    v_tactical_sum := format(
      'Form data unavailable for this fixture. Assessment based on ELO ratings only: '
      || '%s rated %.0f vs %s rated %.0f (gap: %s pts).',
      v_home_label, COALESCE(v_draft.pre_match_elo_home, 1500),
      v_away_label, COALESCE(v_draft.pre_match_elo_away, 1500),
      round(abs(v_elo_gap))::text
    );
  END IF;

  -- === EXPECTED TEMPO ===
  IF v_feat.match_id IS NOT NULL AND v_feat.has_stats_features THEN
    v_expected_tempo := format(
      '%s average %.1f shots/game (L5); %s average %.1f shots/game (L5). '
      || 'Expected match tempo is %s based on combined shot volume.',
      v_home_label, COALESCE(v_feat.rolling_shots_home_l5, 0),
      v_away_label, COALESCE(v_feat.rolling_shots_away_l5, 0),
      CASE
        WHEN COALESCE(v_feat.rolling_shots_home_l5, 0) + COALESCE(v_feat.rolling_shots_away_l5, 0) > 24 THEN 'high-intensity (>24 combined shots per game)'
        WHEN COALESCE(v_feat.rolling_shots_home_l5, 0) + COALESCE(v_feat.rolling_shots_away_l5, 0) > 18 THEN 'moderate (18-24 combined shots per game)'
        ELSE 'lower-tempo (<18 combined shots per game)'
      END
    );
  ELSIF v_snap.match_id IS NOT NULL AND v_snap.home_shots_avg_l5 IS NOT NULL THEN
    v_expected_tempo := format(
      'Shot volume (L5 avg): %s %.1f shots/game, %s %.1f shots/game.',
      v_home_label, COALESCE(v_snap.home_shots_avg_l5, 0),
      v_away_label, COALESCE(v_snap.away_shots_avg_l5, 0)
    );
  ELSE
    v_expected_tempo := 'Shot and possession data unavailable; tempo assessment not computable from current data tier.';
  END IF;

  -- === KEY PRESSURE ZONES ===
  IF v_snap.match_id IS NOT NULL THEN
    v_pressure_zones := format(
      '%s late-goal-for rate (L5): %.0f%%. %s late-goal-for rate (L5): %.0f%%. '
      || 'Late pressure indicator: %s.',
      v_home_label, COALESCE(v_snap.home_ev_late_goal_for_rate, 0) * 100,
      v_away_label, COALESCE(v_snap.away_ev_late_goal_for_rate, 0) * 100,
      CASE
        WHEN COALESCE(v_snap.home_ev_late_pressure, 0) > 0.4 THEN format('%s frequently force late pressure situations', v_home_label)
        WHEN COALESCE(v_snap.away_ev_late_pressure, 0) > 0.4 THEN format('%s tend to threaten in final stages', v_away_label)
        ELSE 'Neither team shows a dominant late-game pressure pattern'
      END
    );
  ELSE
    v_pressure_zones := 'Event-level data unavailable; pressure zone analysis requires event features.';
  END IF;

  -- === FIRST GOAL SENSITIVITY ===
  v_first_goal_sens := CASE
    WHEN v_draft.p_home > 0.55 THEN
      format('If %s score first, the win probability escalates significantly given their base advantage. '
        || '%s would need to respond quickly to prevent momentum from solidifying.',
        v_home_label, v_away_label)
    WHEN v_draft.p_away > 0.55 THEN
      format('If %s score first on the road, the match context shifts to damage control for %s. '
        || 'The underdog role diminishes significantly with an early away goal.',
        v_away_label, v_home_label)
    ELSE
      format('With probabilities closely balanced (Home %.0f%% / Draw %.0f%% / Away %.0f%%), '
        || 'the first goal will disproportionately shape the outcome trajectory.',
        v_draft.p_home * 100, v_draft.p_draw * 100, v_draft.p_away * 100)
  END;

  -- === DRAW RISK ANALYSIS ===
  v_draw_risk_txt := format(
    'Draw probability: %.0f%% (league prior: %.0f%%). '
    || 'Draw risk level: %s. %s',
    v_draft.p_draw * 100,
    COALESCE((v_draft.generated_payload->>'draw_prior')::numeric * 100, 26),
    UPPER((v_draft.generated_payload->>'draw_risk')::text),
    CASE
      WHEN v_draft.p_draw >= 0.28 THEN
        'Both teams'' defensive organization and equivalent strength make a stalemate a genuine expected outcome.'
      WHEN v_draft.p_draw >= 0.22 THEN
        'Draw remains in play but either side has enough quality differential to force a decision.'
      ELSE
        'Low draw probability reflects a clear gap in team quality; a decisive result is the more likely outcome.'
    END
  );

  -- === FAVORITE FRAGILITY ===
  v_fav_frag_txt := format(
    '%s as favorite: ELO gap of %s pts. Fragility assessment: %s. %s',
    v_favorite_label,
    round(abs(v_elo_gap))::text,
    UPPER((v_draft.generated_payload->>'fav_fragility')::text),
    CASE
      WHEN (v_draft.generated_payload->>'fav_fragility')::text = 'high' THEN
        'Teams are closely matched — the favorite''s edge is narrow and a single defensive lapse or set-piece can swing the match.'
      WHEN (v_draft.generated_payload->>'fav_fragility')::text = 'medium' THEN
        'A moderate quality gap exists, but it is not insurmountable. The underdog has pathways to a result.'
      ELSE
        'The quality gap is substantial. For the underdog to prevail, a near-perfect defensive performance combined with clinical counter-attacking would be required.'
    END
  );

  -- === LATE GOAL PRESSURE ===
  IF v_snap.match_id IS NOT NULL THEN
    v_late_goal_txt := format(
      '%s late-goal pressure index: %.2f. %s late-goal pressure index: %.2f. '
      || 'Matches between these sides historically %s.',
      v_home_label, COALESCE(v_snap.home_ev_late_pressure, 0),
      v_away_label, COALESCE(v_snap.away_ev_late_pressure, 0),
      CASE
        WHEN COALESCE(v_snap.home_ev_late_pressure, 0) + COALESCE(v_snap.away_ev_late_pressure, 0) > 0.7
          THEN 'tend to generate significant late-game action'
        ELSE 'do not show elevated late-game pressure patterns in recent form'
      END
    );
  ELSE
    v_late_goal_txt := 'Late-pressure event data not available for this fixture.';
  END IF;

  -- === CONFIDENCE CAVEATS ===
  IF array_length(v_draft.warnings, 1) > 0 THEN
    v_conf_caveats := format(
      'Data quality tier: %s. Confidence: %s (%.0f%%). Active warnings: %s.',
      v_draft.feature_quality_tier,
      UPPER(v_draft.confidence_tier),
      v_draft.confidence_score * 100,
      array_to_string(v_draft.warnings, '; ')
    );
  ELSE
    v_conf_caveats := format(
      'Data quality tier: %s. Confidence: %s (%.0f%%). No data or calibration warnings.',
      v_draft.feature_quality_tier,
      UPPER(v_draft.confidence_tier),
      v_draft.confidence_score * 100
    );
  END IF;

  -- === FULL NARRATIVE (combined) ===
  v_full_narrative := v_headline || E'\n\n'
    || v_tactical_sum || E'\n\n'
    || v_expected_tempo || E'\n\n'
    || 'DRAW RISK: ' || v_draw_risk_txt || E'\n\n'
    || 'FIRST GOAL SENSITIVITY: ' || v_first_goal_sens || E'\n\n'
    || 'LATE PRESSURE: ' || v_late_goal_txt || E'\n\n'
    || 'FAVORITE FRAGILITY: ' || v_fav_frag_txt || E'\n\n'
    || 'CONFIDENCE CAVEATS: ' || v_conf_caveats;

  -- Upsert scenario draft
  INSERT INTO model_lab.match_story_drafts (
    id, prediction_draft_id, match_id,
    competition_name, season_label, match_date,
    home_team_name, away_team_name,
    model_version, feature_version, calibration_version,
    headline, tactical_summary, expected_tempo, key_pressure_zones,
    first_goal_sensitivity, draw_risk_analysis, favorite_fragility,
    late_goal_pressure, scenario_narrative, confidence_caveats,
    full_narrative_text,
    p_home, p_draw, p_away,
    confidence_tier, feature_quality_tier,
    generated_payload, status, generated_by, generated_at, version
  )
  VALUES (
    gen_random_uuid(), v_draft.id, p_match_id,
    v_draft.competition_name, v_draft.season_label, v_draft.match_date,
    v_draft.home_team_name, v_draft.away_team_name,
    v_draft.model_version, v_draft.feature_version, 'cal_v1',
    v_headline, v_tactical_sum, v_expected_tempo, v_pressure_zones,
    v_first_goal_sens, v_draw_risk_txt, v_fav_frag_txt,
    v_late_goal_txt, v_full_narrative, v_conf_caveats,
    v_full_narrative,
    v_draft.p_home, v_draft.p_draw, v_draft.p_away,
    v_draft.confidence_tier, v_draft.feature_quality_tier,
    jsonb_build_object(
      'elo_gap',       v_elo_gap,
      'draw_prior',    v_draft.generated_payload->'draw_prior',
      'draw_risk',     v_draft.generated_payload->'draw_risk',
      'upset_risk',    v_draft.generated_payload->'upset_risk',
      'fav_fragility', v_draft.generated_payload->'fav_fragility',
      'scenario_version', 'v1',
      'generated_at',  now()::text
    ),
    'pending_review', p_triggered_by, now(), 1
  );

  -- Update job to completed
  UPDATE model_lab.admin_generation_jobs
  SET status = 'completed', completed_at = now()
  WHERE id = v_job_id;

  -- Refresh readiness
  BEGIN
    PERFORM model_lab.assess_upcoming_match_readiness(p_match_id);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  SELECT * INTO v_result
  FROM model_lab.match_story_drafts
  WHERE match_id = p_match_id
  ORDER BY generated_at DESC
  LIMIT 1;

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  IF v_job_id IS NOT NULL THEN
    UPDATE model_lab.admin_generation_jobs
    SET status = 'failed', error_message = SQLERRM, completed_at = now()
    WHERE id = v_job_id;
  END IF;
  RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION model_lab.generate_prematch_scenario(uuid, uuid) TO authenticated;

-- Convenience: generate prediction + scenario in one call
CREATE OR REPLACE FUNCTION model_lab.generate_full_prematch_package(
  p_match_id     uuid,
  p_triggered_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_pred     model_lab.prematch_prediction_drafts;
  v_scenario model_lab.match_story_drafts;
BEGIN
  v_pred     := model_lab.generate_prematch_prediction(p_match_id, p_triggered_by);
  v_scenario := model_lab.generate_prematch_scenario(p_match_id, p_triggered_by);

  RETURN jsonb_build_object(
    'match_id',          p_match_id,
    'prediction_id',     v_pred.id,
    'scenario_id',       v_scenario.id,
    'p_home',            v_pred.p_home,
    'p_draw',            v_pred.p_draw,
    'p_away',            v_pred.p_away,
    'confidence_tier',   v_pred.confidence_tier,
    'confidence_score',  v_pred.confidence_score,
    'feature_tier',      v_pred.feature_quality_tier,
    'status',            v_pred.status,
    'headline',          v_scenario.headline,
    'generated_at',      v_pred.generated_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION model_lab.generate_full_prematch_package(uuid, uuid) TO authenticated;
