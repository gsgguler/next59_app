/*
  # Intelligence Graph — Rebuild Function (V1)

  ## Summary
  Creates model_lab.rebuild_intelligence_graph(p_scope) which upserts nodes
  and edges from all existing intelligence artifact tables.

  Scope modes:
  - 'recent'  — last 7 days + upcoming (default)
  - 'all'     — all available artifacts
  - 'wc2026'  — WC2026-only artifacts

  The function:
  - does NOT modify any source table
  - skips missing FK references gracefully
  - returns summary JSON with counts and warnings

  ## Notes
  - Uses ON CONFLICT DO UPDATE (upsert) so safe to re-run at any time.
  - All inserts are done as service-role via SECURITY DEFINER.
  - Warnings collected via text[] and returned in summary.
*/

CREATE OR REPLACE FUNCTION model_lab.rebuild_intelligence_graph(
  p_scope text DEFAULT 'recent'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_nodes_upserted  integer := 0;
  v_edges_upserted  integer := 0;
  v_warnings        text[]  := ARRAY[]::text[];
  v_errors          text[]  := ARRAY[]::text[];
  v_cutoff          timestamptz;
  v_node_id         uuid;
  v_from_id         uuid;
  v_to_id           uuid;
  v_n               integer;

  -- cursor records
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
  -- Determine time cutoff
  v_cutoff := CASE
    WHEN p_scope = 'wc2026' THEN '2026-01-01'::timestamptz
    WHEN p_scope = 'all'    THEN '2000-01-01'::timestamptz
    ELSE now() - interval '7 days'  -- 'recent'
  END;

  -- ─── 1. Prediction drafts ──────────────────────────────────────────────────
  IF p_scope <> 'wc2026' THEN
    FOR r_pred IN
      SELECT id, match_id, status, confidence_score, model_version,
             feature_version, calibration_version, prediction_formula,
             generated_at
      FROM model_lab.prematch_prediction_drafts
      WHERE generated_at >= v_cutoff
    LOOP
      INSERT INTO model_lab.intelligence_graph_nodes (
        entity_type, entity_schema, entity_table, entity_id,
        canonical_match_id, model_version, feature_version,
        calibration_version, status, confidence_score, updated_at,
        metadata_json
      ) VALUES (
        'prediction', 'model_lab', 'prematch_prediction_drafts',
        r_pred.id::text, r_pred.match_id,
        r_pred.model_version, r_pred.feature_version,
        r_pred.calibration_version, r_pred.status,
        r_pred.confidence_score, now(),
        jsonb_build_object('prediction_formula', r_pred.prediction_formula)
      )
      ON CONFLICT (entity_schema, entity_table, entity_id) DO UPDATE
        SET status           = EXCLUDED.status,
            confidence_score = EXCLUDED.confidence_score,
            updated_at       = now();
      v_nodes_upserted := v_nodes_upserted + 1;
    END LOOP;
  END IF;

  -- ─── 2. Feature snapshots ──────────────────────────────────────────────────
  IF p_scope <> 'wc2026' THEN
    FOR r_snap IN
      SELECT match_id::text AS entity_id, match_id, feature_version,
             data_quality_tier, leakage_check_passed, snapshot_created_at
      FROM model_lab.prematch_feature_matrix_snapshot_v1
      WHERE snapshot_created_at >= v_cutoff
    LOOP
      INSERT INTO model_lab.intelligence_graph_nodes (
        entity_type, entity_schema, entity_table, entity_id,
        canonical_match_id, feature_version, status, updated_at,
        metadata_json
      ) VALUES (
        'feature_snapshot', 'model_lab', 'prematch_feature_matrix_snapshot_v1',
        r_snap.entity_id, r_snap.match_id,
        r_snap.feature_version, 'ready', now(),
        jsonb_build_object(
          'data_quality_tier', r_snap.data_quality_tier,
          'leakage_check_passed', r_snap.leakage_check_passed
        )
      )
      ON CONFLICT (entity_schema, entity_table, entity_id) DO UPDATE
        SET updated_at = now();
      v_nodes_upserted := v_nodes_upserted + 1;
    END LOOP;
  END IF;

  -- ─── 3. Brain runs ─────────────────────────────────────────────────────────
  IF p_scope <> 'wc2026' THEN
    FOR r_brain IN
      SELECT id, match_id, status, model_version, feature_version,
             formula_version, generated_at
      FROM model_lab.prematch_brain_runs
      WHERE generated_at >= v_cutoff
    LOOP
      INSERT INTO model_lab.intelligence_graph_nodes (
        entity_type, entity_schema, entity_table, entity_id,
        canonical_match_id, model_version, feature_version,
        status, updated_at
      ) VALUES (
        'brain_run', 'model_lab', 'prematch_brain_runs',
        r_brain.id::text, r_brain.match_id,
        r_brain.model_version, r_brain.feature_version,
        r_brain.status, now()
      )
      ON CONFLICT (entity_schema, entity_table, entity_id) DO UPDATE
        SET status     = EXCLUDED.status,
            updated_at = now();
      v_nodes_upserted := v_nodes_upserted + 1;
    END LOOP;
  END IF;

  -- ─── 4. Story drafts ───────────────────────────────────────────────────────
  IF p_scope <> 'wc2026' THEN
    FOR r_story IN
      SELECT id, match_id, prediction_draft_id, status,
             model_version, feature_version, calibration_version,
             generated_at
      FROM model_lab.match_story_drafts
      WHERE generated_at >= v_cutoff
    LOOP
      INSERT INTO model_lab.intelligence_graph_nodes (
        entity_type, entity_schema, entity_table, entity_id,
        canonical_match_id, model_version, feature_version,
        calibration_version, status, updated_at
      ) VALUES (
        'story_draft', 'model_lab', 'match_story_drafts',
        r_story.id::text, r_story.match_id,
        r_story.model_version, r_story.feature_version,
        r_story.calibration_version, r_story.status, now()
      )
      ON CONFLICT (entity_schema, entity_table, entity_id) DO UPDATE
        SET status     = EXCLUDED.status,
            updated_at = now();
      v_nodes_upserted := v_nodes_upserted + 1;
    END LOOP;
  END IF;

  -- ─── 5. Publications ───────────────────────────────────────────────────────
  IF p_scope <> 'wc2026' THEN
    FOR r_pub IN
      SELECT id, match_id, story_draft_id, prediction_draft_id,
             is_visible, model_version, feature_version,
             calibration_version, published_at
      FROM model_lab.match_story_publications
      WHERE published_at >= v_cutoff
    LOOP
      INSERT INTO model_lab.intelligence_graph_nodes (
        entity_type, entity_schema, entity_table, entity_id,
        canonical_match_id, model_version, feature_version,
        calibration_version,
        status, updated_at,
        metadata_json
      ) VALUES (
        'publication', 'model_lab', 'match_story_publications',
        r_pub.id::text, r_pub.match_id,
        r_pub.model_version, r_pub.feature_version,
        r_pub.calibration_version,
        CASE WHEN r_pub.is_visible THEN 'visible' ELSE 'hidden' END,
        now(),
        jsonb_build_object('is_visible', r_pub.is_visible)
      )
      ON CONFLICT (entity_schema, entity_table, entity_id) DO UPDATE
        SET status     = EXCLUDED.status,
            updated_at = now();
      v_nodes_upserted := v_nodes_upserted + 1;
    END LOOP;
  END IF;

  -- ─── 6. Evaluations ────────────────────────────────────────────────────────
  IF p_scope <> 'wc2026' THEN
    FOR r_eval IN
      SELECT id, match_id, prediction_draft_id, was_correct,
             brier_score, confidence_score, evaluated_at
      FROM model_lab.prediction_evaluations
      WHERE evaluated_at >= v_cutoff
    LOOP
      INSERT INTO model_lab.intelligence_graph_nodes (
        entity_type, entity_schema, entity_table, entity_id,
        canonical_match_id, confidence_score, status, updated_at,
        metadata_json
      ) VALUES (
        'evaluation', 'model_lab', 'prediction_evaluations',
        r_eval.id::text, r_eval.match_id,
        r_eval.confidence_score,
        CASE WHEN r_eval.was_correct THEN 'correct' ELSE 'incorrect' END,
        now(),
        jsonb_build_object('brier_score', r_eval.brier_score,
                           'was_correct', r_eval.was_correct)
      )
      ON CONFLICT (entity_schema, entity_table, entity_id) DO UPDATE
        SET status     = EXCLUDED.status,
            updated_at = now();
      v_nodes_upserted := v_nodes_upserted + 1;
    END LOOP;
  END IF;

  -- ─── 7. Live state outcomes ────────────────────────────────────────────────
  IF p_scope <> 'wc2026' THEN
    FOR r_live IN
      SELECT id, fixture_id AS match_id, current_live_state,
             state_confidence, recorded_at
      FROM model_lab.live_state_outcomes
      WHERE recorded_at >= v_cutoff
    LOOP
      INSERT INTO model_lab.intelligence_graph_nodes (
        entity_type, entity_schema, entity_table, entity_id,
        canonical_match_id, confidence_score, status, updated_at
      ) VALUES (
        'live_outcome', 'model_lab', 'live_state_outcomes',
        r_live.id::text, r_live.match_id,
        r_live.state_confidence, r_live.current_live_state, now()
      )
      ON CONFLICT (entity_schema, entity_table, entity_id) DO UPDATE
        SET status     = EXCLUDED.status,
            updated_at = now();
      v_nodes_upserted := v_nodes_upserted + 1;
    END LOOP;
  END IF;

  -- ─── 8. WC2026 team calibration profiles ──────────────────────────────────
  IF p_scope IN ('wc2026', 'all', 'recent') THEN
    FOR r_wc_cal IN
      SELECT id, api_football_team_id, calibration_confidence,
             wc2026_team_strength_index, wc2026_scenario_confidence,
             created_at AS cal_created_at
      FROM public.wc2026_team_calibration_profiles
    LOOP
      INSERT INTO model_lab.intelligence_graph_nodes (
        entity_type, entity_schema, entity_table, entity_id,
        canonical_team_id, calibration_version,
        confidence_score, status, updated_at,
        metadata_json
      ) VALUES (
        'calibration_profile', 'public', 'wc2026_team_calibration_profiles',
        r_wc_cal.id::text, NULL,
        'wc2026_v1',
        CASE
          WHEN r_wc_cal.calibration_confidence = 'high'   THEN 0.85
          WHEN r_wc_cal.calibration_confidence = 'medium' THEN 0.60
          WHEN r_wc_cal.calibration_confidence = 'low'    THEN 0.35
          ELSE 0.20
        END,
        r_wc_cal.calibration_confidence,
        now(),
        jsonb_build_object(
          'api_football_team_id',      r_wc_cal.api_football_team_id,
          'team_strength_index',        r_wc_cal.wc2026_team_strength_index,
          'scenario_confidence',        r_wc_cal.wc2026_scenario_confidence
        )
      )
      ON CONFLICT (entity_schema, entity_table, entity_id) DO UPDATE
        SET status     = EXCLUDED.status,
            confidence_score = EXCLUDED.confidence_score,
            updated_at = now();
      v_nodes_upserted := v_nodes_upserted + 1;
    END LOOP;
  END IF;

  -- ─── 9. WC2026 match scenario calibrations ─────────────────────────────────
  IF p_scope IN ('wc2026', 'all', 'recent') THEN
    FOR r_wc_scen IN
      SELECT id, api_football_fixture_id, calibration_confidence,
             home_win_probability, draw_probability, away_win_probability,
             created_at AS scen_created_at
      FROM public.wc2026_match_scenario_calibration
    LOOP
      INSERT INTO model_lab.intelligence_graph_nodes (
        entity_type, entity_schema, entity_table, entity_id,
        calibration_version, confidence_score, status, updated_at,
        metadata_json
      ) VALUES (
        'wc2026_scenario', 'public', 'wc2026_match_scenario_calibration',
        r_wc_scen.id::text, 'wc2026_v1',
        CASE
          WHEN r_wc_scen.calibration_confidence = 'high'   THEN 0.85
          WHEN r_wc_scen.calibration_confidence = 'medium' THEN 0.60
          WHEN r_wc_scen.calibration_confidence = 'low'    THEN 0.35
          ELSE 0.20
        END,
        r_wc_scen.calibration_confidence, now(),
        jsonb_build_object(
          'api_football_fixture_id', r_wc_scen.api_football_fixture_id,
          'home_win_probability',    r_wc_scen.home_win_probability,
          'draw_probability',        r_wc_scen.draw_probability,
          'away_win_probability',    r_wc_scen.away_win_probability
        )
      )
      ON CONFLICT (entity_schema, entity_table, entity_id) DO UPDATE
        SET status       = EXCLUDED.status,
            updated_at   = now();
      v_nodes_upserted := v_nodes_upserted + 1;
    END LOOP;
  END IF;

  -- ─── EDGES: prediction → feature_snapshot (depends_on_feature) ─────────────
  IF p_scope <> 'wc2026' THEN
    INSERT INTO model_lab.intelligence_graph_edges
      (from_node_id, to_node_id, relationship_type)
    SELECT pred_n.id, snap_n.id, 'depends_on_feature'
    FROM model_lab.intelligence_graph_nodes pred_n
    JOIN model_lab.intelligence_graph_nodes snap_n
      ON snap_n.entity_table = 'prematch_feature_matrix_snapshot_v1'
     AND snap_n.canonical_match_id = pred_n.canonical_match_id
    WHERE pred_n.entity_table = 'prematch_prediction_drafts'
    ON CONFLICT (from_node_id, to_node_id, relationship_type) DO NOTHING;

    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_edges_upserted := v_edges_upserted + v_n;
  END IF;

  -- EDGES: brain_run → prediction (generated_from)
  IF p_scope <> 'wc2026' THEN
    INSERT INTO model_lab.intelligence_graph_edges
      (from_node_id, to_node_id, relationship_type)
    SELECT brain_n.id, pred_n.id, 'generated_from'
    FROM model_lab.intelligence_graph_nodes brain_n
    JOIN model_lab.prematch_brain_runs br
      ON br.id::text = brain_n.entity_id
    JOIN model_lab.intelligence_graph_nodes pred_n
      ON pred_n.entity_table = 'prematch_prediction_drafts'
     AND pred_n.canonical_match_id = brain_n.canonical_match_id
    WHERE brain_n.entity_table = 'prematch_brain_runs'
    ON CONFLICT (from_node_id, to_node_id, relationship_type) DO NOTHING;

    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_edges_upserted := v_edges_upserted + v_n;
  END IF;

  -- EDGES: story_draft → prediction (generated_from)
  IF p_scope <> 'wc2026' THEN
    INSERT INTO model_lab.intelligence_graph_edges
      (from_node_id, to_node_id, relationship_type)
    SELECT story_n.id, pred_n.id, 'generated_from'
    FROM model_lab.intelligence_graph_nodes story_n
    JOIN model_lab.match_story_drafts sd
      ON sd.id::text = story_n.entity_id
     AND sd.prediction_draft_id IS NOT NULL
    JOIN model_lab.intelligence_graph_nodes pred_n
      ON pred_n.entity_id = sd.prediction_draft_id::text
     AND pred_n.entity_table = 'prematch_prediction_drafts'
    WHERE story_n.entity_table = 'match_story_drafts'
    ON CONFLICT (from_node_id, to_node_id, relationship_type) DO NOTHING;

    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_edges_upserted := v_edges_upserted + v_n;
  END IF;

  -- EDGES: publication → story_draft (published_as)
  IF p_scope <> 'wc2026' THEN
    INSERT INTO model_lab.intelligence_graph_edges
      (from_node_id, to_node_id, relationship_type)
    SELECT pub_n.id, story_n.id, 'published_as'
    FROM model_lab.intelligence_graph_nodes pub_n
    JOIN model_lab.match_story_publications msp
      ON msp.id::text = pub_n.entity_id
    JOIN model_lab.intelligence_graph_nodes story_n
      ON story_n.entity_id = msp.story_draft_id::text
     AND story_n.entity_table = 'match_story_drafts'
    WHERE pub_n.entity_table = 'match_story_publications'
    ON CONFLICT (from_node_id, to_node_id, relationship_type) DO NOTHING;

    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_edges_upserted := v_edges_upserted + v_n;
  END IF;

  -- EDGES: evaluation → prediction (evaluated_by)
  IF p_scope <> 'wc2026' THEN
    INSERT INTO model_lab.intelligence_graph_edges
      (from_node_id, to_node_id, relationship_type)
    SELECT eval_n.id, pred_n.id, 'evaluated_by'
    FROM model_lab.intelligence_graph_nodes eval_n
    JOIN model_lab.prediction_evaluations pe
      ON pe.id::text = eval_n.entity_id
     AND pe.prediction_draft_id IS NOT NULL
    JOIN model_lab.intelligence_graph_nodes pred_n
      ON pred_n.entity_id = pe.prediction_draft_id::text
     AND pred_n.entity_table = 'prematch_prediction_drafts'
    WHERE eval_n.entity_table = 'prediction_evaluations'
    ON CONFLICT (from_node_id, to_node_id, relationship_type) DO NOTHING;

    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_edges_upserted := v_edges_upserted + v_n;
  END IF;

  -- EDGES: live_outcome → prediction (belongs_to_match co-located)
  IF p_scope <> 'wc2026' THEN
    INSERT INTO model_lab.intelligence_graph_edges
      (from_node_id, to_node_id, relationship_type)
    SELECT live_n.id, pred_n.id, 'linked_prediction'
    FROM model_lab.intelligence_graph_nodes live_n
    JOIN model_lab.intelligence_graph_nodes pred_n
      ON pred_n.entity_table = 'prematch_prediction_drafts'
     AND pred_n.canonical_match_id = live_n.canonical_match_id
    WHERE live_n.entity_table = 'live_state_outcomes'
      AND live_n.canonical_match_id IS NOT NULL
    ON CONFLICT (from_node_id, to_node_id, relationship_type) DO NOTHING;

    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_edges_upserted := v_edges_upserted + v_n;
  END IF;

  -- Orphan warnings
  -- Story drafts without prediction
  SELECT count(*) INTO v_n
  FROM model_lab.intelligence_graph_nodes n
  WHERE n.entity_table = 'match_story_drafts'
    AND NOT EXISTS (
      SELECT 1 FROM model_lab.intelligence_graph_edges e
      WHERE e.from_node_id = n.id AND e.relationship_type = 'generated_from'
    );
  IF v_n > 0 THEN
    v_warnings := v_warnings || format('%s story drafts without linked prediction node', v_n);
  END IF;

  -- Publications without story
  SELECT count(*) INTO v_n
  FROM model_lab.intelligence_graph_nodes n
  WHERE n.entity_table = 'match_story_publications'
    AND NOT EXISTS (
      SELECT 1 FROM model_lab.intelligence_graph_edges e
      WHERE e.from_node_id = n.id AND e.relationship_type = 'published_as'
    );
  IF v_n > 0 THEN
    v_warnings := v_warnings || format('%s publications without story node link', v_n);
  END IF;

  -- Predictions without feature snapshot
  SELECT count(*) INTO v_n
  FROM model_lab.intelligence_graph_nodes n
  WHERE n.entity_table = 'prematch_prediction_drafts'
    AND NOT EXISTS (
      SELECT 1 FROM model_lab.intelligence_graph_edges e
      WHERE e.from_node_id = n.id AND e.relationship_type = 'depends_on_feature'
    );
  IF v_n > 0 THEN
    v_warnings := v_warnings || format('%s predictions without feature snapshot link', v_n);
  END IF;

  RETURN jsonb_build_object(
    'nodes_upserted', v_nodes_upserted,
    'edges_upserted', v_edges_upserted,
    'warnings',       to_jsonb(v_warnings),
    'errors',         to_jsonb(v_errors),
    'scope',          p_scope,
    'run_at',         now()
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'nodes_upserted', v_nodes_upserted,
    'edges_upserted', v_edges_upserted,
    'warnings',       to_jsonb(v_warnings),
    'errors',         to_jsonb(ARRAY[SQLERRM]),
    'scope',          p_scope,
    'run_at',         now()
  );
END;
$$;

-- Public admin wrapper
CREATE OR REPLACE FUNCTION public.admin_rebuild_intelligence_graph(p_scope text DEFAULT 'recent')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, model_lab
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'admin_rebuild_intelligence_graph: not admin';
  END IF;
  RETURN model_lab.rebuild_intelligence_graph(p_scope);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_rebuild_intelligence_graph TO authenticated;
