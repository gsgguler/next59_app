/*
  # Fix generate_prematch_scenario format() specifiers

  ## Summary
  PostgreSQL format() only supports %s, %I, %L. Both overloads of
  generate_prematch_scenario used %.0f, %.1f, %.2f, %.3f which crash at
  runtime with "unrecognized format() type specifier '.'".

  Fix: replace all invalid format() calls with string concatenation using
  round(val, N)::text or (val*100)::int::text.
  
  Only the uuid-overload is fixed here (called by generate_full_prematch_package).
  The text-overload is the older brain-package path (not currently in use).
*/
CREATE OR REPLACE FUNCTION model_lab.generate_prematch_scenario(
  p_match_id     uuid,
  p_triggered_by uuid DEFAULT NULL::uuid
)
RETURNS model_lab.match_story_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'model_lab', 'public'
AS $function$
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

-- Load feature matrix (optional)
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
    v_home_label || ' enter as clear favorites at home (ELO gap: ' || round(abs(v_elo_gap))::text || ' pts); ' ||
    v_away_label || ' will need to absorb early pressure to stay competitive.'
  WHEN abs(v_elo_gap) >= 200 AND v_draft.p_away > 0.55 THEN
    v_away_label || ' are the significant away favorites (ELO gap: ' || round(abs(v_elo_gap))::text || ' pts); ' ||
    'this is a difficult assignment for ' || v_home_label || '.'
  WHEN abs(v_elo_gap) < 50 THEN
    'A closely matched fixture — ' || v_home_label || ' vs ' || v_away_label ||
    ' are separated by only ' || round(abs(v_elo_gap))::text || ' ELO points, making the draw a live outcome.'
  WHEN v_draft.p_draw >= 0.26 THEN
    v_home_label || ' vs ' || v_away_label || ' is a competitive encounter with draw probability elevated at ' ||
    (v_draft.p_draw * 100)::int::text || '%.'
  ELSE
    v_home_label || ' vs ' || v_away_label || ' — ' || v_favorite_label ||
    ' hold a moderate edge (' || (GREATEST(v_draft.p_home, v_draft.p_away) * 100)::int::text || '% win probability).'
END;

-- === TACTICAL SUMMARY ===
IF v_feat.match_id IS NOT NULL AND v_feat.has_form_features THEN
  v_tactical_sum :=
    'Recent form: ' || v_home_label || ' carry ' ||
    round(COALESCE(v_feat.recent_form_points_home_l5, 0), 1)::text || ' pts/game over L5 ' ||
    '(attack index: ' || round(COALESCE(v_feat.attack_index_home_l5, 0), 2)::text ||
    ', defense index: ' || round(COALESCE(v_feat.defense_index_home_l5, 0), 2)::text || '). ' ||
    v_away_label || ' average ' ||
    round(COALESCE(v_feat.recent_form_points_away_l5, 0), 1)::text || ' pts/game over L5 ' ||
    '(attack index: ' || round(COALESCE(v_feat.attack_index_away_l5, 0), 2)::text ||
    ', defense index: ' || round(COALESCE(v_feat.defense_index_away_l5, 0), 2)::text || '). ' ||
    'Form differential favors ' ||
    CASE WHEN v_feat.form_gap_home >= 0 THEN v_home_label ELSE v_away_label END ||
    ' by ' || round(abs(COALESCE(v_feat.form_gap_home, 0)), 1)::text || ' pts/game.';
ELSE
  v_tactical_sum :=
    'Form data unavailable for this fixture. Assessment based on ELO ratings only: ' ||
    v_home_label || ' rated ' || round(COALESCE(v_draft.pre_match_elo_home, 1500))::text ||
    ' vs ' || v_away_label || ' rated ' || round(COALESCE(v_draft.pre_match_elo_away, 1500))::text ||
    ' (gap: ' || round(abs(v_elo_gap))::text || ' pts).';
END IF;

-- === EXPECTED TEMPO ===
IF v_feat.match_id IS NOT NULL AND v_feat.has_stats_features THEN
  v_expected_tempo :=
    v_home_label || ' average ' ||
    round(COALESCE(v_feat.rolling_shots_home_l5, 0), 1)::text || ' shots/game (L5); ' ||
    v_away_label || ' average ' ||
    round(COALESCE(v_feat.rolling_shots_away_l5, 0), 1)::text || ' shots/game (L5). ' ||
    'Expected match tempo is ' ||
    CASE
      WHEN COALESCE(v_feat.rolling_shots_home_l5, 0) + COALESCE(v_feat.rolling_shots_away_l5, 0) > 24
        THEN 'high-intensity (>24 combined shots per game)'
      WHEN COALESCE(v_feat.rolling_shots_home_l5, 0) + COALESCE(v_feat.rolling_shots_away_l5, 0) > 18
        THEN 'moderate (18-24 combined shots per game)'
      ELSE 'lower-tempo (<18 combined shots per game)'
    END || ' based on combined shot volume.';
ELSIF v_snap.match_id IS NOT NULL AND v_snap.home_shots_avg_l5 IS NOT NULL THEN
  v_expected_tempo :=
    'Shot volume (L5 avg): ' || v_home_label || ' ' ||
    round(COALESCE(v_snap.home_shots_avg_l5, 0), 1)::text || ' shots/game, ' ||
    v_away_label || ' ' ||
    round(COALESCE(v_snap.away_shots_avg_l5, 0), 1)::text || ' shots/game.';
ELSE
  v_expected_tempo := 'Shot and possession data unavailable; tempo assessment not computable from current data tier.';
END IF;

-- === KEY PRESSURE ZONES ===
IF v_snap.match_id IS NOT NULL THEN
  v_pressure_zones :=
    v_home_label || ' late-goal-for rate (L5): ' ||
    (COALESCE(v_snap.home_ev_late_goal_for_rate, 0) * 100)::int::text || '%. ' ||
    v_away_label || ' late-goal-for rate (L5): ' ||
    (COALESCE(v_snap.away_ev_late_goal_for_rate, 0) * 100)::int::text || '%. ' ||
    'Late pressure indicator: ' ||
    CASE
      WHEN COALESCE(v_snap.home_ev_late_pressure, 0) > 0.4
        THEN v_home_label || ' frequently force late pressure situations'
      WHEN COALESCE(v_snap.away_ev_late_pressure, 0) > 0.4
        THEN v_away_label || ' tend to threaten in final stages'
      ELSE 'Neither team shows a dominant late-game pressure pattern'
    END || '.';
ELSE
  v_pressure_zones := 'Event-level data unavailable; pressure zone analysis requires event features.';
END IF;

-- === FIRST GOAL SENSITIVITY ===
v_first_goal_sens := CASE
  WHEN v_draft.p_home > 0.55 THEN
    'If ' || v_home_label || ' score first, the win probability escalates significantly given their base advantage. ' ||
    v_away_label || ' would need to respond quickly to prevent momentum from solidifying.'
  WHEN v_draft.p_away > 0.55 THEN
    'If ' || v_away_label || ' score first on the road, the match context shifts to damage control for ' || v_home_label || '. ' ||
    'The underdog role diminishes significantly with an early away goal.'
  ELSE
    'With probabilities closely balanced (Home ' || (v_draft.p_home * 100)::int::text ||
    '% / Draw ' || (v_draft.p_draw * 100)::int::text ||
    '% / Away ' || (v_draft.p_away * 100)::int::text || '%), ' ||
    'the first goal will disproportionately shape the outcome trajectory.'
END;

-- === DRAW RISK ANALYSIS ===
v_draw_risk_txt :=
  'Draw probability: ' || (v_draft.p_draw * 100)::int::text ||
  '% (league prior: ' ||
  ((COALESCE((v_draft.generated_payload->>'draw_prior')::numeric, 0.26)) * 100)::int::text || '%). ' ||
  'Draw risk level: ' || UPPER(COALESCE((v_draft.generated_payload->>'draw_risk')::text, 'medium')) || '. ' ||
  CASE
    WHEN v_draft.p_draw >= 0.28 THEN
      'Both teams'' defensive organization and equivalent strength make a stalemate a genuine expected outcome.'
    WHEN v_draft.p_draw >= 0.22 THEN
      'Draw remains in play but either side has enough quality differential to force a decision.'
    ELSE
      'Low draw probability reflects a clear gap in team quality; a decisive result is the more likely outcome.'
  END;

-- === FAVORITE FRAGILITY ===
v_fav_frag_txt :=
  v_favorite_label || ' as favorite: ELO gap of ' || round(abs(v_elo_gap))::text || ' pts. ' ||
  'Fragility assessment: ' || UPPER(COALESCE((v_draft.generated_payload->>'fav_fragility')::text, 'medium')) || '. ' ||
  CASE
    WHEN COALESCE((v_draft.generated_payload->>'fav_fragility')::text, '') = 'high' THEN
      'Teams are closely matched — the favorite''s edge is narrow and a single defensive lapse or set-piece can swing the match.'
    WHEN COALESCE((v_draft.generated_payload->>'fav_fragility')::text, '') = 'medium' THEN
      'A moderate quality gap exists, but it is not insurmountable. The underdog has pathways to a result.'
    ELSE
      'The quality gap is substantial. For the underdog to prevail, a near-perfect defensive performance combined with clinical counter-attacking would be required.'
  END;

-- === LATE GOAL PRESSURE ===
IF v_snap.match_id IS NOT NULL THEN
  v_late_goal_txt :=
    v_home_label || ' late-goal pressure index: ' ||
    round(COALESCE(v_snap.home_ev_late_pressure, 0), 2)::text || '. ' ||
    v_away_label || ' late-goal pressure index: ' ||
    round(COALESCE(v_snap.away_ev_late_pressure, 0), 2)::text || '. ' ||
    'Matches between these sides historically ' ||
    CASE
      WHEN COALESCE(v_snap.home_ev_late_pressure, 0) + COALESCE(v_snap.away_ev_late_pressure, 0) > 0.7
        THEN 'tend to generate significant late-game action'
      ELSE 'do not show elevated late-game pressure patterns in recent form'
    END || '.';
ELSE
  v_late_goal_txt := 'Late-pressure event data not available for this fixture.';
END IF;

-- === CONFIDENCE CAVEATS ===
IF array_length(v_draft.warnings, 1) > 0 THEN
  v_conf_caveats :=
    'Data quality tier: ' || v_draft.feature_quality_tier ||
    '. Confidence: ' || UPPER(v_draft.confidence_tier) ||
    ' (' || (v_draft.confidence_score * 100)::int::text || '%). ' ||
    'Active warnings: ' || array_to_string(v_draft.warnings, '; ') || '.';
ELSE
  v_conf_caveats :=
    'Data quality tier: ' || v_draft.feature_quality_tier ||
    '. Confidence: ' || UPPER(v_draft.confidence_tier) ||
    ' (' || (v_draft.confidence_score * 100)::int::text || '%). ' ||
    'No data or calibration warnings.';
END IF;

-- === FULL NARRATIVE ===
v_full_narrative := v_headline || E'\n\n'
  || v_tactical_sum || E'\n\n'
  || v_expected_tempo || E'\n\n'
  || 'DRAW RISK: '         || v_draw_risk_txt    || E'\n\n'
  || 'FIRST GOAL SENSITIVITY: ' || v_first_goal_sens || E'\n\n'
  || 'LATE PRESSURE: '     || v_late_goal_txt    || E'\n\n'
  || 'FAVORITE FRAGILITY: '|| v_fav_frag_txt     || E'\n\n'
  || 'CONFIDENCE CAVEATS: '|| v_conf_caveats;

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
$function$;

GRANT EXECUTE ON FUNCTION model_lab.generate_prematch_scenario(uuid, uuid) TO authenticated;
