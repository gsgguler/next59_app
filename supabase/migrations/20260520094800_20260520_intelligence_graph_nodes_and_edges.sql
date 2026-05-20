/*
  # Intelligence Graph — Nodes and Edges (V1)

  ## Summary
  Additive, non-destructive graph layer that links every intelligence artifact
  in the system. No source tables are modified. This layer is purely additive.

  ## New Tables
  1. model_lab.intelligence_graph_nodes
     - One row per unique intelligence artifact (prediction draft, brain run,
       story draft, publication, feature snapshot, live state, evaluation,
       calibration profile, provider response, WC2026 scenario).
     - Unique on (entity_schema, entity_table, entity_id).
     - Nullable canonical_match_id / team_id / competition_id / season_id for
       cross-cutting queries.
     - RLS: admin-only read.

  2. model_lab.intelligence_graph_edges
     - Directed edges between nodes with a relationship_type label.
     - Unique on (from_node_id, to_node_id, relationship_type).
     - RLS: admin-only read.

  ## Security
  - Both tables: RLS enabled, admin-only SELECT via profiles.role = 'admin'.
  - No direct INSERT policy — all writes go through SECURITY DEFINER functions.

  ## Notes
  - This migration only creates tables + RLS.
  - The rebuild function and views are in a separate migration to stay
    under migration size limits.
*/

-- ─── Nodes ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_lab.intelligence_graph_nodes (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type             text        NOT NULL,
  entity_schema           text        NOT NULL,
  entity_table            text        NOT NULL,
  entity_id               text        NOT NULL,
  canonical_match_id      uuid,
  canonical_team_id       uuid,
  canonical_competition_id uuid,
  canonical_season_id     uuid,
  model_version           text,
  feature_version         text,
  calibration_version     text,
  scenario_version        text,
  source_provider         text,
  status                  text,
  confidence_score        numeric(5,4),
  risk_level              text        CHECK (risk_level IN ('low','medium','high','blocked')),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  metadata_json           jsonb,

  CONSTRAINT intelligence_graph_nodes_entity_unique
    UNIQUE (entity_schema, entity_table, entity_id),

  CONSTRAINT intelligence_graph_nodes_entity_type_check
    CHECK (entity_type IN (
      'match','team','competition','season',
      'prediction','feature_snapshot','brain_run','master_brain',
      'story_draft','publication','live_state','live_outcome',
      'evaluation','calibration_profile','provider_response',
      'wc2026_scenario','wc2026_squad','ingestion_run'
    ))
);

CREATE INDEX IF NOT EXISTS idx_igraph_nodes_match
  ON model_lab.intelligence_graph_nodes (canonical_match_id)
  WHERE canonical_match_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_igraph_nodes_team
  ON model_lab.intelligence_graph_nodes (canonical_team_id)
  WHERE canonical_team_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_igraph_nodes_type
  ON model_lab.intelligence_graph_nodes (entity_type);

CREATE INDEX IF NOT EXISTS idx_igraph_nodes_updated
  ON model_lab.intelligence_graph_nodes (updated_at DESC);

ALTER TABLE model_lab.intelligence_graph_nodes
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read intelligence graph nodes"
  ON model_lab.intelligence_graph_nodes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- ─── Edges ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_lab.intelligence_graph_edges (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  from_node_id      uuid        NOT NULL REFERENCES model_lab.intelligence_graph_nodes(id) ON DELETE CASCADE,
  to_node_id        uuid        NOT NULL REFERENCES model_lab.intelligence_graph_nodes(id) ON DELETE CASCADE,
  relationship_type text        NOT NULL,
  confidence        numeric(5,4),
  created_at        timestamptz NOT NULL DEFAULT now(),
  metadata_json     jsonb,

  CONSTRAINT intelligence_graph_edges_unique
    UNIQUE (from_node_id, to_node_id, relationship_type),

  CONSTRAINT intelligence_graph_edges_no_self_loop
    CHECK (from_node_id <> to_node_id),

  CONSTRAINT intelligence_graph_edges_rel_type_check
    CHECK (relationship_type IN (
      'generated_from','evaluated_by','published_as',
      'calibrated_by','references_provider','depends_on_feature',
      'explains','supersedes','conflicts_with',
      'belongs_to_match','belongs_to_team','belongs_to_competition',
      'has_brain_run','has_story','has_publication',
      'linked_prediction','linked_evaluation','linked_live_state'
    ))
);

CREATE INDEX IF NOT EXISTS idx_igraph_edges_from
  ON model_lab.intelligence_graph_edges (from_node_id);

CREATE INDEX IF NOT EXISTS idx_igraph_edges_to
  ON model_lab.intelligence_graph_edges (to_node_id);

CREATE INDEX IF NOT EXISTS idx_igraph_edges_rel
  ON model_lab.intelligence_graph_edges (relationship_type);

ALTER TABLE model_lab.intelligence_graph_edges
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read intelligence graph edges"
  ON model_lab.intelligence_graph_edges
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );
