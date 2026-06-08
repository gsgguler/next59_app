
-- Admin RPC: paginated per-match prediction accuracy summary
-- Groups ensemble_prediction_snapshots by match, joins team names,
-- supports outcome/type filters and full-text search on team names.

CREATE OR REPLACE FUNCTION public.admin_ne_dedik_ne_oldu(
  p_outcome_filter  text    DEFAULT 'all',
  p_type_filter     text    DEFAULT 'all',
  p_search          text    DEFAULT NULL,
  p_page            int     DEFAULT 0,
  p_page_size       int     DEFAULT 15
)
RETURNS TABLE (
  match_id            uuid,
  home_team           text,
  away_team           text,
  actual_outcome      text,
  snapshot_count      bigint,
  avg_brier           double precision,
  last_was_correct    boolean,
  last_predicted      text,
  last_confidence     double precision,
  last_snapshot_at    timestamptz,
  last_home_prob      double precision,
  last_draw_prob      double precision,
  last_away_prob      double precision,
  last_explanation    jsonb,
  last_brain_outputs  jsonb,
  last_weights        jsonb,
  total_count         bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH
  filtered_snaps AS (
    SELECT
      eps.match_id,
      eps.snapshot_version,
      eps.snapshot_type,
      eps.predicted_outcome,
      eps.ensemble_confidence,
      eps.actual_outcome,
      eps.brier_score,
      eps.was_correct,
      eps.home_prob,
      eps.draw_prob,
      eps.away_prob,
      eps.created_at,
      eps.explanation_json,
      eps.brain_outputs,
      eps.effective_weights
    FROM ensemble_prediction_snapshots eps
    WHERE (p_type_filter = 'all' OR eps.snapshot_type = p_type_filter)
  ),

  -- Aggregate per match: counts + avg brier + max snapshot version
  agg AS (
    SELECT
      fs.match_id,
      COUNT(*)         AS snapshot_count,
      AVG(fs.brier_score) AS avg_brier,
      MAX(fs.snapshot_version) AS max_version
    FROM filtered_snaps fs
    GROUP BY fs.match_id
  ),

  -- Last snapshot for each match (by max version)
  last_snap AS (
    SELECT DISTINCT ON (fs.match_id)
      fs.match_id,
      fs.actual_outcome,
      fs.was_correct,
      fs.predicted_outcome  AS last_predicted,
      fs.ensemble_confidence AS last_confidence,
      fs.created_at         AS last_snapshot_at,
      fs.home_prob          AS last_home_prob,
      fs.draw_prob          AS last_draw_prob,
      fs.away_prob          AS last_away_prob,
      fs.explanation_json   AS last_explanation,
      fs.brain_outputs      AS last_brain_outputs,
      fs.effective_weights  AS last_weights
    FROM filtered_snaps fs
    ORDER BY fs.match_id, fs.snapshot_version DESC
  ),

  -- Join agg + last_snap + team names
  with_names AS (
    SELECT
      agg.match_id,
      agg.snapshot_count,
      agg.avg_brier,
      ls.actual_outcome,
      ls.was_correct        AS last_was_correct,
      ls.last_predicted,
      ls.last_confidence,
      ls.last_snapshot_at,
      ls.last_home_prob,
      ls.last_draw_prob,
      ls.last_away_prob,
      ls.last_explanation,
      ls.last_brain_outputs,
      ls.last_weights,
      COALESCE(ht.name, '') AS home_team,
      COALESCE(at2.name,'') AS away_team
    FROM agg
    JOIN last_snap ls  ON ls.match_id = agg.match_id
    LEFT JOIN matches m   ON m.id = agg.match_id
    LEFT JOIN teams   ht  ON ht.id = m.home_team_id
    LEFT JOIN teams   at2 ON at2.id = m.away_team_id
  ),

  outcome_filtered AS (
    SELECT wn.*
    FROM with_names wn
    WHERE
      CASE p_outcome_filter
        WHEN 'pending' THEN wn.actual_outcome IS NULL
        WHEN 'correct' THEN wn.last_was_correct = TRUE
        WHEN 'wrong'   THEN wn.last_was_correct = FALSE
        ELSE TRUE
      END
  ),

  searched AS (
    SELECT of2.*
    FROM outcome_filtered of2
    WHERE
      p_search IS NULL
      OR p_search = ''
      OR LOWER(of2.home_team) LIKE '%' || LOWER(p_search) || '%'
      OR LOWER(of2.away_team) LIKE '%' || LOWER(p_search) || '%'
  ),

  counted AS (
    SELECT *, COUNT(*) OVER () AS total_count
    FROM searched
  )

  SELECT
    c.match_id,
    c.home_team,
    c.away_team,
    c.actual_outcome,
    c.snapshot_count,
    c.avg_brier,
    c.last_was_correct,
    c.last_predicted,
    c.last_confidence,
    c.last_snapshot_at,
    c.last_home_prob,
    c.last_draw_prob,
    c.last_away_prob,
    c.last_explanation,
    c.last_brain_outputs,
    c.last_weights,
    c.total_count
  FROM counted c
  ORDER BY c.last_snapshot_at DESC NULLS LAST
  LIMIT  p_page_size
  OFFSET p_page * p_page_size;
$$;

REVOKE ALL ON FUNCTION public.admin_ne_dedik_ne_oldu FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_ne_dedik_ne_oldu TO authenticated;
