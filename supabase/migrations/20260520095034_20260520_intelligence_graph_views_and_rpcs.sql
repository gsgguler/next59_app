/*
  # Intelligence Graph — Views and Read RPCs (V1)

  ## Summary
  Creates five analytical views and public read RPCs for the admin UI.
  All views are SECURITY DEFINER functions (not actual SQL views) to enforce
  admin-only access cleanly.

  ## Views (as RPCs)
  1. admin_get_graph_health       — node/edge counts by type, orphan counts
  2. admin_get_match_intelligence_trace — full trace for one match_id
  3. admin_get_team_intelligence_profile — all nodes linked to a team
  4. admin_get_publication_trace  — publication → story → prediction → feature chain
  5. admin_get_provider_dependency_trace — which matches depend on which providers
  6. admin_get_wc2026_intelligence_trace — WC2026 calibration + scenario nodes
  7. admin_get_graph_nodes        — paginated node list
  8. admin_get_orphan_summary     — all orphan counts
*/

-- ─── 1. Graph health ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_get_graph_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, model_lab
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'not admin'; END IF;

  RETURN (
    SELECT jsonb_build_object(
      'total_nodes',     (SELECT count(*) FROM model_lab.intelligence_graph_nodes),
      'total_edges',     (SELECT count(*) FROM model_lab.intelligence_graph_edges),
      'nodes_by_type',   (
        SELECT jsonb_object_agg(entity_type, cnt)
        FROM (
          SELECT entity_type, count(*) AS cnt
          FROM model_lab.intelligence_graph_nodes
          GROUP BY entity_type
        ) t
      ),
      'edges_by_rel',    (
        SELECT jsonb_object_agg(relationship_type, cnt)
        FROM (
          SELECT relationship_type, count(*) AS cnt
          FROM model_lab.intelligence_graph_edges
          GROUP BY relationship_type
        ) t
      ),
      'last_updated',    (
        SELECT max(updated_at) FROM model_lab.intelligence_graph_nodes
      )
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_graph_health TO authenticated;

-- ─── 2. Match intelligence trace ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_get_match_intelligence_trace(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, model_lab
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'not admin'; END IF;

  RETURN (
    SELECT jsonb_agg(
      jsonb_build_object(
        'node_id',       n.id,
        'entity_type',   n.entity_type,
        'entity_table',  n.entity_table,
        'entity_id',     n.entity_id,
        'status',        n.status,
        'model_version', n.model_version,
        'feature_version', n.feature_version,
        'confidence_score', n.confidence_score,
        'risk_level',    n.risk_level,
        'updated_at',    n.updated_at,
        'metadata_json', n.metadata_json,
        'edges_out', (
          SELECT jsonb_agg(jsonb_build_object(
            'to_entity_type', t.entity_type,
            'to_entity_table', t.entity_table,
            'to_entity_id', t.entity_id,
            'relationship_type', e.relationship_type
          ))
          FROM model_lab.intelligence_graph_edges e
          JOIN model_lab.intelligence_graph_nodes t ON t.id = e.to_node_id
          WHERE e.from_node_id = n.id
        )
      )
      ORDER BY n.entity_type, n.updated_at DESC
    )
    FROM model_lab.intelligence_graph_nodes n
    WHERE n.canonical_match_id = p_match_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_match_intelligence_trace TO authenticated;

-- ─── 3. Publication trace ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_get_publication_trace(p_limit integer DEFAULT 20)
RETURNS TABLE (
  publication_id    text,
  match_id          uuid,
  pub_status        text,
  pub_updated_at    timestamptz,
  story_id          text,
  story_status      text,
  prediction_id     text,
  pred_status       text,
  pred_confidence   numeric,
  feature_snap_id   text,
  feature_version   text,
  has_feature_snap  boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, model_lab
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'not admin'; END IF;

  RETURN QUERY
  SELECT
    pub_n.entity_id                AS publication_id,
    pub_n.canonical_match_id       AS match_id,
    pub_n.status                   AS pub_status,
    pub_n.updated_at               AS pub_updated_at,
    story_n.entity_id              AS story_id,
    story_n.status                 AS story_status,
    pred_n.entity_id               AS prediction_id,
    pred_n.status                  AS pred_status,
    pred_n.confidence_score        AS pred_confidence,
    snap_n.entity_id               AS feature_snap_id,
    snap_n.feature_version         AS feature_version,
    (snap_n.id IS NOT NULL)        AS has_feature_snap
  FROM model_lab.intelligence_graph_nodes pub_n
  LEFT JOIN model_lab.intelligence_graph_edges e_pub_story
    ON e_pub_story.from_node_id = pub_n.id
   AND e_pub_story.relationship_type = 'published_as'
  LEFT JOIN model_lab.intelligence_graph_nodes story_n
    ON story_n.id = e_pub_story.to_node_id
  LEFT JOIN model_lab.intelligence_graph_edges e_story_pred
    ON e_story_pred.from_node_id = story_n.id
   AND e_story_pred.relationship_type = 'generated_from'
  LEFT JOIN model_lab.intelligence_graph_nodes pred_n
    ON pred_n.id = e_story_pred.to_node_id
  LEFT JOIN model_lab.intelligence_graph_edges e_pred_snap
    ON e_pred_snap.from_node_id = pred_n.id
   AND e_pred_snap.relationship_type = 'depends_on_feature'
  LEFT JOIN model_lab.intelligence_graph_nodes snap_n
    ON snap_n.id = e_pred_snap.to_node_id
  WHERE pub_n.entity_type = 'publication'
  ORDER BY pub_n.updated_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_publication_trace TO authenticated;

-- ─── 4. WC2026 intelligence trace ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_get_wc2026_intelligence_trace()
RETURNS TABLE (
  node_id           uuid,
  entity_type       text,
  entity_table      text,
  entity_id         text,
  calibration_version text,
  confidence_score  numeric,
  status            text,
  updated_at        timestamptz,
  metadata_json     jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, model_lab
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'not admin'; END IF;

  RETURN QUERY
  SELECT
    n.id, n.entity_type, n.entity_table, n.entity_id,
    n.calibration_version, n.confidence_score, n.status,
    n.updated_at, n.metadata_json
  FROM model_lab.intelligence_graph_nodes n
  WHERE n.entity_type IN ('calibration_profile', 'wc2026_scenario', 'wc2026_squad')
  ORDER BY n.entity_type, n.updated_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_wc2026_intelligence_trace TO authenticated;

-- ─── 5. Orphan summary ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_get_orphan_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, model_lab
AS $$
DECLARE
  v_role         text;
  v_stories_no_pred   bigint;
  v_pubs_no_story     bigint;
  v_preds_no_snap     bigint;
  v_evals_no_pred     bigint;
  v_live_no_match     bigint;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'not admin'; END IF;

  -- Stories without prediction link
  SELECT count(*) INTO v_stories_no_pred
  FROM model_lab.intelligence_graph_nodes n
  WHERE n.entity_type = 'story_draft'
    AND NOT EXISTS (
      SELECT 1 FROM model_lab.intelligence_graph_edges e
      WHERE e.from_node_id = n.id AND e.relationship_type = 'generated_from'
    );

  -- Publications without story link
  SELECT count(*) INTO v_pubs_no_story
  FROM model_lab.intelligence_graph_nodes n
  WHERE n.entity_type = 'publication'
    AND NOT EXISTS (
      SELECT 1 FROM model_lab.intelligence_graph_edges e
      WHERE e.from_node_id = n.id AND e.relationship_type = 'published_as'
    );

  -- Predictions without feature snapshot
  SELECT count(*) INTO v_preds_no_snap
  FROM model_lab.intelligence_graph_nodes n
  WHERE n.entity_type = 'prediction'
    AND NOT EXISTS (
      SELECT 1 FROM model_lab.intelligence_graph_edges e
      WHERE e.from_node_id = n.id AND e.relationship_type = 'depends_on_feature'
    );

  -- Evaluations without prediction
  SELECT count(*) INTO v_evals_no_pred
  FROM model_lab.intelligence_graph_nodes n
  WHERE n.entity_type = 'evaluation'
    AND NOT EXISTS (
      SELECT 1 FROM model_lab.intelligence_graph_edges e
      WHERE e.from_node_id = n.id AND e.relationship_type = 'evaluated_by'
    );

  -- Live outcomes without match-linked prediction
  SELECT count(*) INTO v_live_no_match
  FROM model_lab.intelligence_graph_nodes n
  WHERE n.entity_type = 'live_outcome'
    AND NOT EXISTS (
      SELECT 1 FROM model_lab.intelligence_graph_edges e
      WHERE e.from_node_id = n.id AND e.relationship_type = 'linked_prediction'
    );

  RETURN jsonb_build_object(
    'stories_without_prediction',   v_stories_no_pred,
    'publications_without_story',   v_pubs_no_story,
    'predictions_without_snapshot', v_preds_no_snap,
    'evaluations_without_prediction', v_evals_no_pred,
    'live_outcomes_without_prediction', v_live_no_match,
    'total_orphans', v_stories_no_pred + v_pubs_no_story + v_preds_no_snap + v_evals_no_pred + v_live_no_match
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_orphan_summary TO authenticated;

-- ─── 6. Paginated node list ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_get_graph_nodes(
  p_entity_type  text    DEFAULT NULL,
  p_match_id     uuid    DEFAULT NULL,
  p_limit        integer DEFAULT 50,
  p_offset       integer DEFAULT 0
)
RETURNS TABLE (
  id               uuid,
  entity_type      text,
  entity_schema    text,
  entity_table     text,
  entity_id        text,
  canonical_match_id uuid,
  model_version    text,
  feature_version  text,
  status           text,
  confidence_score numeric,
  risk_level       text,
  updated_at       timestamptz,
  metadata_json    jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, model_lab
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'not admin'; END IF;

  RETURN QUERY
  SELECT
    n.id, n.entity_type, n.entity_schema, n.entity_table,
    n.entity_id, n.canonical_match_id, n.model_version,
    n.feature_version, n.status, n.confidence_score,
    n.risk_level, n.updated_at, n.metadata_json
  FROM model_lab.intelligence_graph_nodes n
  WHERE (p_entity_type IS NULL OR n.entity_type = p_entity_type)
    AND (p_match_id    IS NULL OR n.canonical_match_id = p_match_id)
  ORDER BY n.updated_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_graph_nodes TO authenticated;
