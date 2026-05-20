/*
  # Fix: Pipeline duplicate guard + Intelligence graph confidence_score cast

  ## Changes

  ### 1. run_daily_prematch_pipeline — duplicate guard fix
  The existing guard excluded `elo_only` tier predictions from counting as
  "already generated", causing 16 new prediction drafts to be inserted on
  every run regardless of whether a draft already existed for that match today.

  Fix: remove the `feature_quality_tier IS DISTINCT FROM 'elo_only'` condition.
  Any non-rejected/non-hidden draft generated today counts as existing.

  ### 2. rebuild_intelligence_graph — state_confidence text→numeric cast fix
  `live_state_outcomes.state_confidence` is type `text`, but was being assigned
  directly to `confidence_score numeric(5,4)`, causing a type cast error on
  every rebuild involving live_outcome nodes.

  Fix: cast `state_confidence` to numeric with a safe CASE guard (NULL if not
  a valid decimal, preserving the EXCEPTION handler behaviour).
*/

-- ── Fix 1: duplicate guard in run_daily_prematch_pipeline ───────────────────

CREATE OR REPLACE FUNCTION model_lab.run_daily_prematch_pipeline(
  p_horizon_days integer DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'model_lab', 'public'
AS $function$
DECLARE
v_from_date   date := CURRENT_DATE;
v_to_date     date := CURRENT_DATE + p_horizon_days;
v_run_id      uuid;
v_match       RECORD;

c_seen        int := 0;
c_readiness   int := 0;
c_features    int := 0;
c_predictions int := 0;
c_brains      int := 0;
c_scenarios   int := 0;
c_stories     int := 0;
c_skipped     int := 0;
c_blocked     int := 0;
c_errors      int := 0;

v_errors_arr  jsonb[] := ARRAY[]::jsonb[];
v_has_pred    boolean;
v_has_brain   boolean;
v_has_story   boolean;
v_pkg         jsonb;
v_err         text;
v_feat_result jsonb;
BEGIN
INSERT INTO model_lab.prematch_pipeline_runs (status, horizon_days)
VALUES ('running', p_horizon_days)
RETURNING id INTO v_run_id;

-- Step 1: batch feature snapshots for entire horizon
BEGIN
  v_feat_result := model_lab.ml_generate_upcoming_feature_snapshot_batch(v_from_date, v_to_date);
  c_features := COALESCE((v_feat_result->>'processed')::int, 0);
EXCEPTION WHEN OTHERS THEN
  v_err := SQLERRM;
  c_errors := c_errors + 1;
  v_errors_arr := array_append(v_errors_arr,
    jsonb_build_object('step','feature_batch','error',v_err));
END;

-- Step 2: per-match loop
FOR v_match IN (
  SELECT
    m.id          AS match_id,
    ht.name       AS home_team,
    at.name       AS away_team,
    m.match_date
  FROM public.matches m
  JOIN public.teams ht ON ht.id = m.home_team_id
  JOIN public.teams at ON at.id = m.away_team_id
  WHERE m.status_short IN ('NS','TBD','PST')
  AND m.match_date BETWEEN v_from_date AND v_to_date
  ORDER BY m.match_date ASC
) LOOP
  c_seen := c_seen + 1;

  -- 2a: re-assess readiness
  BEGIN
    PERFORM model_lab.assess_upcoming_match_readiness(v_match.match_id);
    c_readiness := c_readiness + 1;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- 2b: skip if blocked
  IF EXISTS (
    SELECT 1 FROM model_lab.upcoming_match_readiness
    WHERE match_id = v_match.match_id AND overall_status = 'blocked'
  ) THEN
    c_blocked := c_blocked + 1;
    CONTINUE;
  END IF;

  -- 2c: Prediction — skip if ANY non-hidden/non-rejected draft exists today
  --     (removed elo_only exclusion: elo_only draft is still a valid draft)
  SELECT EXISTS (
    SELECT 1 FROM model_lab.prematch_prediction_drafts
    WHERE match_id = v_match.match_id
    AND generated_at >= CURRENT_DATE::timestamptz
    AND status NOT IN ('hidden','rejected')
  ) INTO v_has_pred;

  IF NOT v_has_pred THEN
    BEGIN
      PERFORM model_lab.generate_prematch_prediction(v_match.match_id, NULL::uuid);
      c_predictions := c_predictions + 1;
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      c_errors := c_errors + 1;
      v_errors_arr := array_append(v_errors_arr,
        jsonb_build_object('step','prediction','match',v_match.match_id,'error',v_err));
      CONTINUE;
    END;
  ELSE
    c_skipped := c_skipped + 1;
  END IF;

  -- 2d: Brain — skip if brain run exists today
  SELECT EXISTS (
    SELECT 1 FROM model_lab.prematch_brain_runs
    WHERE match_id = v_match.match_id
    AND generated_at >= CURRENT_DATE::timestamptz
    AND status = 'completed'
  ) INTO v_has_brain;

  IF NOT v_has_brain THEN
    BEGIN
      PERFORM model_lab.generate_prematch_brain_package(v_match.match_id, 'daily_pipeline');
      c_brains := c_brains + 1;
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      c_errors := c_errors + 1;
      v_errors_arr := array_append(v_errors_arr,
        jsonb_build_object('step','brain','match',v_match.match_id,'error',v_err));
    END;
  END IF;

  -- 2e: Story draft — skip if non-hidden story draft exists today
  SELECT EXISTS (
    SELECT 1 FROM model_lab.match_story_drafts
    WHERE match_id = v_match.match_id
    AND generated_at >= CURRENT_DATE::timestamptz
    AND status NOT IN ('hidden','rejected')
  ) INTO v_has_story;

  IF NOT v_has_story THEN
    BEGIN
      PERFORM model_lab.generate_prematch_scenario(v_match.match_id, NULL::uuid);
      c_stories := c_stories + 1;
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      c_errors := c_errors + 1;
      v_errors_arr := array_append(v_errors_arr,
        jsonb_build_object('step','story','match',v_match.match_id,'error',v_err));
    END;
  END IF;

END LOOP;

UPDATE model_lab.prematch_pipeline_runs SET
  completed_at             = now(),
  status                   = 'completed',
  fixtures_seen            = c_seen,
  readiness_processed      = c_readiness,
  features_generated       = c_features,
  predictions_generated    = c_predictions,
  brain_packages_generated = c_brains,
  scenarios_generated      = c_brains,
  story_drafts_generated   = c_stories,
  skipped_existing         = c_skipped,
  blocked_count            = c_blocked,
  error_count              = c_errors,
  errors_json              = to_jsonb(v_errors_arr)
WHERE id = v_run_id;

BEGIN
  PERFORM model_lab.evaluate_finished_prematch_predictions();
EXCEPTION WHEN OTHERS THEN NULL;
END;

RETURN jsonb_build_object(
  'run_id',                v_run_id,
  'fixtures_seen',         c_seen,
  'eligible_matches',      c_seen - c_blocked,
  'generated_predictions', c_predictions,
  'generated_brains',      c_brains,
  'generated_scenarios',   c_brains,
  'generated_stories',     c_stories,
  'skipped',               c_skipped,
  'blocked',               c_blocked,
  'errors',                c_errors
);

EXCEPTION WHEN OTHERS THEN
  UPDATE model_lab.prematch_pipeline_runs SET
    completed_at = now(),
    status       = 'failed',
    error_count  = 1,
    errors_json  = jsonb_build_array(jsonb_build_object('step','pipeline','error',SQLERRM))
  WHERE id = v_run_id;
  RAISE;
END;
$function$;

-- ── Fix 2: rebuild_intelligence_graph — state_confidence text→numeric cast ──

CREATE OR REPLACE FUNCTION model_lab.rebuild_intelligence_graph(
  p_scope text DEFAULT 'recent'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'model_lab', 'public'
AS $function$
DECLARE
v_nodes_upserted  integer := 0;
v_edges_upserted  integer := 0;
v_warnings        text[]  := ARRAY[]::text[];
v_errors          text[]  := ARRAY[]::text[];
v_cutoff          timestamptz;
v_n               integer;
r_pred    RECORD;
r_brain   RECORD;
r_story   RECORD;
r_pub     RECORD;
r_eval    RECORD;
r_snap    RECORD;
r_live    RECORD;
r_wc_cal  RECORD;
r_wc_scen RECORD;
BEGIN
v_cutoff := CASE
  WHEN p_scope = 'wc2026' THEN '2026-01-01'::timestamptz
  WHEN p_scope = 'all'    THEN '2000-01-01'::timestamptz
  ELSE now() - interval '7 days'
END;

-- Prediction drafts
IF p_scope <> 'wc2026' THEN
  FOR r_pred IN
    SELECT id, match_id, status, confidence_score, model_version,
           feature_version, calibration_version, prediction_formula, generated_at
    FROM model_lab.prematch_prediction_drafts WHERE generated_at >= v_cutoff
  LOOP
    INSERT INTO model_lab.intelligence_graph_nodes (
      entity_type, entity_schema, entity_table, entity_id,
      canonical_match_id, model_version, feature_version, calibration_version,
      status, confidence_score, updated_at, metadata_json
    ) VALUES (
      'prediction','model_lab','prematch_prediction_drafts', r_pred.id::text,
      r_pred.match_id, r_pred.model_version, r_pred.feature_version,
      r_pred.calibration_version, r_pred.status, r_pred.confidence_score, now(),
      jsonb_build_object('prediction_formula', r_pred.prediction_formula)
    )
    ON CONFLICT (entity_schema, entity_table, entity_id) DO UPDATE
      SET status=EXCLUDED.status, confidence_score=EXCLUDED.confidence_score, updated_at=now();
    v_nodes_upserted := v_nodes_upserted + 1;
  END LOOP;
END IF;

-- Feature snapshots
IF p_scope <> 'wc2026' THEN
  FOR r_snap IN
    SELECT match_id::text AS entity_id, match_id, snapshot_run_key,
           data_quality_tier, leakage_check_passed, snapshot_created_at
    FROM model_lab.prematch_feature_matrix_snapshot_v1 WHERE snapshot_created_at >= v_cutoff
  LOOP
    INSERT INTO model_lab.intelligence_graph_nodes (
      entity_type, entity_schema, entity_table, entity_id,
      canonical_match_id, feature_version, status, updated_at, metadata_json
    ) VALUES (
      'feature_snapshot','model_lab','prematch_feature_matrix_snapshot_v1',
      r_snap.entity_id, r_snap.match_id, r_snap.snapshot_run_key, 'ready', now(),
      jsonb_build_object('data_quality_tier',r_snap.data_quality_tier,'leakage_check_passed',r_snap.leakage_check_passed)
    )
    ON CONFLICT (entity_schema, entity_table, entity_id) DO UPDATE
      SET updated_at=now(), feature_version=EXCLUDED.feature_version;
    v_nodes_upserted := v_nodes_upserted + 1;
  END LOOP;
END IF;

-- Brain runs
IF p_scope <> 'wc2026' THEN
  FOR r_brain IN
    SELECT id, match_id, status, model_version, feature_version, generated_at
    FROM model_lab.prematch_brain_runs WHERE generated_at >= v_cutoff
  LOOP
    INSERT INTO model_lab.intelligence_graph_nodes (
      entity_type, entity_schema, entity_table, entity_id,
      canonical_match_id, model_version, feature_version, status, updated_at
    ) VALUES (
      'brain_run','model_lab','prematch_brain_runs', r_brain.id::text,
      r_brain.match_id, r_brain.model_version, r_brain.feature_version, r_brain.status, now()
    )
    ON CONFLICT (entity_schema, entity_table, entity_id) DO UPDATE
      SET status=EXCLUDED.status, updated_at=now();
    v_nodes_upserted := v_nodes_upserted + 1;
  END LOOP;
END IF;

-- Story drafts
IF p_scope <> 'wc2026' THEN
  FOR r_story IN
    SELECT id, match_id, prediction_draft_id, status,
           model_version, feature_version, calibration_version, generated_at
    FROM model_lab.match_story_drafts WHERE generated_at >= v_cutoff
  LOOP
    INSERT INTO model_lab.intelligence_graph_nodes (
      entity_type, entity_schema, entity_table, entity_id,
      canonical_match_id, model_version, feature_version, calibration_version, status, updated_at
    ) VALUES (
      'story_draft','model_lab','match_story_drafts', r_story.id::text,
      r_story.match_id, r_story.model_version, r_story.feature_version,
      r_story.calibration_version, r_story.status, now()
    )
    ON CONFLICT (entity_schema, entity_table, entity_id) DO UPDATE
      SET status=EXCLUDED.status, updated_at=now();
    v_nodes_upserted := v_nodes_upserted + 1;
  END LOOP;
END IF;

-- Publications
IF p_scope <> 'wc2026' THEN
  FOR r_pub IN
    SELECT id, match_id, story_draft_id, prediction_draft_id,
           is_visible, model_version, feature_version, calibration_version, published_at
    FROM model_lab.match_story_publications WHERE published_at >= v_cutoff
  LOOP
    INSERT INTO model_lab.intelligence_graph_nodes (
      entity_type, entity_schema, entity_table, entity_id,
      canonical_match_id, model_version, feature_version, calibration_version,
      status, updated_at, metadata_json
    ) VALUES (
      'publication','model_lab','match_story_publications', r_pub.id::text,
      r_pub.match_id, r_pub.model_version, r_pub.feature_version, r_pub.calibration_version,
      CASE WHEN r_pub.is_visible THEN 'visible' ELSE 'hidden' END,
      now(), jsonb_build_object('is_visible', r_pub.is_visible)
    )
    ON CONFLICT (entity_schema, entity_table, entity_id) DO UPDATE
      SET status=EXCLUDED.status, updated_at=now();
    v_nodes_upserted := v_nodes_upserted + 1;
  END LOOP;
END IF;

-- Evaluations
IF p_scope <> 'wc2026' THEN
  FOR r_eval IN
    SELECT id, match_id, prediction_draft_id, was_correct,
           brier_score, confidence_score, evaluated_at
    FROM model_lab.prediction_evaluations WHERE evaluated_at >= v_cutoff
  LOOP
    INSERT INTO model_lab.intelligence_graph_nodes (
      entity_type, entity_schema, entity_table, entity_id,
      canonical_match_id, confidence_score, status, updated_at, metadata_json
    ) VALUES (
      'evaluation','model_lab','prediction_evaluations', r_eval.id::text,
      r_eval.match_id, r_eval.confidence_score,
      CASE WHEN r_eval.was_correct THEN 'correct' ELSE 'incorrect' END,
      now(), jsonb_build_object('brier_score',r_eval.brier_score,'was_correct',r_eval.was_correct)
    )
    ON CONFLICT (entity_schema, entity_table, entity_id) DO UPDATE
      SET status=EXCLUDED.status, updated_at=now();
    v_nodes_upserted := v_nodes_upserted + 1;
  END LOOP;
END IF;

-- Live state outcomes — state_confidence is TEXT, cast safely to numeric
IF p_scope <> 'wc2026' THEN
  FOR r_live IN
    SELECT id, fixture_id AS match_id, current_live_state,
           state_confidence, created_at
    FROM model_lab.live_state_outcomes WHERE created_at >= v_cutoff
  LOOP
    INSERT INTO model_lab.intelligence_graph_nodes (
      entity_type, entity_schema, entity_table, entity_id,
      canonical_match_id, confidence_score, status, updated_at
    ) VALUES (
      'live_outcome','model_lab','live_state_outcomes', r_live.id::text,
      r_live.match_id,
      -- state_confidence is text (e.g. 'high','medium','low' or a decimal string)
      CASE
        WHEN r_live.state_confidence ~ '^[0-9]+(\.[0-9]+)?$'
          THEN r_live.state_confidence::numeric
        WHEN r_live.state_confidence = 'high'   THEN 0.85
        WHEN r_live.state_confidence = 'medium' THEN 0.60
        WHEN r_live.state_confidence = 'low'    THEN 0.35
        ELSE NULL
      END,
      r_live.current_live_state, now()
    )
    ON CONFLICT (entity_schema, entity_table, entity_id) DO UPDATE
      SET status=EXCLUDED.status, updated_at=now();
    v_nodes_upserted := v_nodes_upserted + 1;
  END LOOP;
END IF;

-- WC2026 team calibration profiles
IF p_scope IN ('wc2026','all','recent') THEN
  FOR r_wc_cal IN
    SELECT id, api_football_team_id, calibration_confidence,
           wc2026_team_strength_index, wc2026_scenario_confidence
    FROM public.wc2026_team_calibration_profiles
  LOOP
    INSERT INTO model_lab.intelligence_graph_nodes (
      entity_type, entity_schema, entity_table, entity_id,
      calibration_version, confidence_score, status, updated_at, metadata_json
    ) VALUES (
      'calibration_profile','public','wc2026_team_calibration_profiles', r_wc_cal.id::text,
      'wc2026_v1',
      CASE r_wc_cal.calibration_confidence
        WHEN 'high'   THEN 0.85
        WHEN 'medium' THEN 0.60
        WHEN 'low'    THEN 0.35
        ELSE 0.20
      END,
      r_wc_cal.calibration_confidence, now(),
      jsonb_build_object('api_football_team_id',r_wc_cal.api_football_team_id,
        'team_strength_index',r_wc_cal.wc2026_team_strength_index,
        'scenario_confidence',r_wc_cal.wc2026_scenario_confidence)
    )
    ON CONFLICT (entity_schema, entity_table, entity_id) DO UPDATE
      SET status=EXCLUDED.status, confidence_score=EXCLUDED.confidence_score, updated_at=now();
    v_nodes_upserted := v_nodes_upserted + 1;
  END LOOP;
END IF;

-- WC2026 match scenario calibrations
IF p_scope IN ('wc2026','all','recent') THEN
  FOR r_wc_scen IN
    SELECT id, api_football_fixture_id, calibration_confidence,
           home_win_probability, draw_probability, away_win_probability
    FROM public.wc2026_match_scenario_calibration
  LOOP
    INSERT INTO model_lab.intelligence_graph_nodes (
      entity_type, entity_schema, entity_table, entity_id,
      calibration_version, confidence_score, status, updated_at, metadata_json
    ) VALUES (
      'wc2026_scenario','public','wc2026_match_scenario_calibration', r_wc_scen.id::text,
      'wc2026_v1',
      CASE r_wc_scen.calibration_confidence
        WHEN 'high'   THEN 0.85
        WHEN 'medium' THEN 0.60
        WHEN 'low'    THEN 0.35
        ELSE 0.20
      END,
      r_wc_scen.calibration_confidence, now(),
      jsonb_build_object('api_football_fixture_id',r_wc_scen.api_football_fixture_id,
        'home_win_probability',r_wc_scen.home_win_probability,
        'draw_probability',r_wc_scen.draw_probability,
        'away_win_probability',r_wc_scen.away_win_probability)
    )
    ON CONFLICT (entity_schema, entity_table, entity_id) DO UPDATE
      SET status=EXCLUDED.status, updated_at=now();
    v_nodes_upserted := v_nodes_upserted + 1;
  END LOOP;
END IF;

-- EDGES
IF p_scope <> 'wc2026' THEN
  INSERT INTO model_lab.intelligence_graph_edges (from_node_id, to_node_id, relationship_type)
  SELECT pred_n.id, snap_n.id, 'depends_on_feature'
  FROM model_lab.intelligence_graph_nodes pred_n
  JOIN model_lab.intelligence_graph_nodes snap_n
    ON snap_n.entity_table='prematch_feature_matrix_snapshot_v1'
    AND snap_n.canonical_match_id=pred_n.canonical_match_id
  WHERE pred_n.entity_table='prematch_prediction_drafts'
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_edges_upserted := v_edges_upserted + v_n;

  INSERT INTO model_lab.intelligence_graph_edges (from_node_id, to_node_id, relationship_type)
  SELECT brain_n.id, pred_n.id, 'generated_from'
  FROM model_lab.intelligence_graph_nodes brain_n
  JOIN model_lab.intelligence_graph_nodes pred_n
    ON pred_n.entity_table='prematch_prediction_drafts'
    AND pred_n.canonical_match_id=brain_n.canonical_match_id
  WHERE brain_n.entity_table='prematch_brain_runs'
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_edges_upserted := v_edges_upserted + v_n;

  INSERT INTO model_lab.intelligence_graph_edges (from_node_id, to_node_id, relationship_type)
  SELECT story_n.id, pred_n.id, 'generated_from'
  FROM model_lab.intelligence_graph_nodes story_n
  JOIN model_lab.match_story_drafts sd ON sd.id::text=story_n.entity_id AND sd.prediction_draft_id IS NOT NULL
  JOIN model_lab.intelligence_graph_nodes pred_n
    ON pred_n.entity_id=sd.prediction_draft_id::text AND pred_n.entity_table='prematch_prediction_drafts'
  WHERE story_n.entity_table='match_story_drafts'
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_edges_upserted := v_edges_upserted + v_n;

  INSERT INTO model_lab.intelligence_graph_edges (from_node_id, to_node_id, relationship_type)
  SELECT pub_n.id, story_n.id, 'published_as'
  FROM model_lab.intelligence_graph_nodes pub_n
  JOIN model_lab.match_story_publications msp ON msp.id::text=pub_n.entity_id
  JOIN model_lab.intelligence_graph_nodes story_n
    ON story_n.entity_id=msp.story_draft_id::text AND story_n.entity_table='match_story_drafts'
  WHERE pub_n.entity_table='match_story_publications'
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_edges_upserted := v_edges_upserted + v_n;

  INSERT INTO model_lab.intelligence_graph_edges (from_node_id, to_node_id, relationship_type)
  SELECT eval_n.id, pred_n.id, 'evaluated_by'
  FROM model_lab.intelligence_graph_nodes eval_n
  JOIN model_lab.prediction_evaluations pe ON pe.id::text=eval_n.entity_id AND pe.prediction_draft_id IS NOT NULL
  JOIN model_lab.intelligence_graph_nodes pred_n
    ON pred_n.entity_id=pe.prediction_draft_id::text AND pred_n.entity_table='prematch_prediction_drafts'
  WHERE eval_n.entity_table='prediction_evaluations'
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_edges_upserted := v_edges_upserted + v_n;

  INSERT INTO model_lab.intelligence_graph_edges (from_node_id, to_node_id, relationship_type)
  SELECT live_n.id, pred_n.id, 'linked_prediction'
  FROM model_lab.intelligence_graph_nodes live_n
  JOIN model_lab.intelligence_graph_nodes pred_n
    ON pred_n.entity_table='prematch_prediction_drafts' AND pred_n.canonical_match_id=live_n.canonical_match_id
  WHERE live_n.entity_table='live_state_outcomes' AND live_n.canonical_match_id IS NOT NULL
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_edges_upserted := v_edges_upserted + v_n;
END IF;

-- Orphan warnings
SELECT count(*) INTO v_n FROM model_lab.intelligence_graph_nodes n WHERE n.entity_type='story_draft'
  AND NOT EXISTS (SELECT 1 FROM model_lab.intelligence_graph_edges e WHERE e.from_node_id=n.id AND e.relationship_type='generated_from');
IF v_n > 0 THEN v_warnings := v_warnings || format('%s story drafts without prediction link', v_n); END IF;

SELECT count(*) INTO v_n FROM model_lab.intelligence_graph_nodes n WHERE n.entity_type='publication'
  AND NOT EXISTS (SELECT 1 FROM model_lab.intelligence_graph_edges e WHERE e.from_node_id=n.id AND e.relationship_type='published_as');
IF v_n > 0 THEN v_warnings := v_warnings || format('%s publications without story link', v_n); END IF;

SELECT count(*) INTO v_n FROM model_lab.intelligence_graph_nodes n WHERE n.entity_type='prediction'
  AND NOT EXISTS (SELECT 1 FROM model_lab.intelligence_graph_edges e WHERE e.from_node_id=n.id AND e.relationship_type='depends_on_feature');
IF v_n > 0 THEN v_warnings := v_warnings || format('%s predictions without feature snapshot', v_n); END IF;

RETURN jsonb_build_object(
  'nodes_upserted', v_nodes_upserted, 'edges_upserted', v_edges_upserted,
  'warnings', to_jsonb(v_warnings), 'errors', to_jsonb(v_errors),
  'scope', p_scope, 'run_at', now()
);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'nodes_upserted', v_nodes_upserted, 'edges_upserted', v_edges_upserted,
    'warnings', to_jsonb(v_warnings), 'errors', to_jsonb(ARRAY[SQLERRM]),
    'scope', p_scope, 'run_at', now()
  );
END;
$function$;
