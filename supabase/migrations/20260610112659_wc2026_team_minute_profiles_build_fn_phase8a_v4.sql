
-- ============================================================
-- Phase 8A v4: build_team_minute_profiles — corrected for actual schema
-- wc_history.teams: name_en (not name)
-- wc_history.events: team_id only (no team_name), elapsed, event_type
-- ============================================================

CREATE OR REPLACE FUNCTION public.build_team_minute_profiles(
  p_team_name  text DEFAULT NULL,
  p_scope      text DEFAULT 'combined'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, wc_history
AS $$
DECLARE
  v_rows_qual  integer := 0;
  v_rows_wch   integer := 0;
  v_teams_done integer := 0;
BEGIN

  -- ── QUALIFIER SCOPE ───────────────────────────────────────────────────
  IF p_scope IN ('qualifiers', 'combined') THEN
    WITH
    match_counts AS (
      SELECT team_name, COUNT(DISTINCT provider_fixture_id) AS n
      FROM wc_qualifier_team_match_stats
      WHERE (p_team_name IS NULL OR team_name = p_team_name)
      GROUP BY team_name
    ),
    events_bucketed AS (
      SELECT
        e.team_name,
        (FLOOR(LEAST(e.elapsed, 89) / 5) * 5)::integer        AS b_start,
        ((FLOOR(LEAST(e.elapsed, 89) / 5) * 5) + 5)::integer  AS b_end,
        SUM(CASE WHEN e.is_goal         THEN 1 ELSE 0 END)     AS goals_for,
        SUM(CASE WHEN e.is_card AND NOT e.is_red_card
                                        THEN 1 ELSE 0 END)     AS yellows,
        SUM(CASE WHEN e.is_red_card     THEN 1 ELSE 0 END)     AS reds,
        SUM(CASE WHEN e.is_substitution THEN 1 ELSE 0 END)     AS subs
      FROM wc_qualifier_events e
      WHERE e.elapsed IS NOT NULL
        AND e.elapsed BETWEEN 0 AND 94
        AND (p_team_name IS NULL OR e.team_name = p_team_name)
      GROUP BY e.team_name, b_start, b_end
    ),
    stats_agg AS (
      SELECT
        team_name,
        AVG(total_shots)        / 18.0 AS shots_bucket_rate,
        AVG(fouls)              / 18.0 AS fouls_bucket_rate,
        AVG(corner_kicks)       / 18.0 AS corners_bucket_rate,
        AVG(offsides)           / 18.0 AS offsides_bucket_rate,
        AVG(ball_possession_pct)       AS possession_avg,
        AVG(expected_goals)     / 18.0 AS xg_bucket_rate
      FROM wc_qualifier_team_match_stats
      WHERE (p_team_name IS NULL OR team_name = p_team_name)
      GROUP BY team_name
    )
    INSERT INTO team_minute_profiles
      (team_name, source_scope, bucket_label,
       goals_for_rate, yellow_cards_rate, red_cards_rate,
       substitutions_rate, shots_rate, fouls_rate,
       corners_rate, offsides_rate, possession_avg, xg_for_rate,
       sample_matches, data_confidence, raw_sources_json, updated_at)
    SELECT
      eb.team_name,
      'qualifiers',
      eb.b_start::text || '-' || eb.b_end::text,
      ROUND((eb.goals_for::numeric  / NULLIF(mc.n, 0)), 4),
      ROUND((eb.yellows::numeric    / NULLIF(mc.n, 0)), 4),
      ROUND((eb.reds::numeric       / NULLIF(mc.n, 0)), 4),
      ROUND((eb.subs::numeric       / NULLIF(mc.n, 0)), 4),
      ROUND(COALESCE(sa.shots_bucket_rate,    0), 4),
      ROUND(COALESCE(sa.fouls_bucket_rate,    0), 4),
      ROUND(COALESCE(sa.corners_bucket_rate,  0), 4),
      ROUND(COALESCE(sa.offsides_bucket_rate, 0), 4),
      ROUND(COALESCE(sa.possession_avg,       0), 2),
      ROUND(COALESCE(sa.xg_bucket_rate,       0), 4),
      mc.n::integer,
      LEAST(mc.n::numeric / 10.0, 1.0),
      jsonb_build_object('source', 'wc_qualifier_events', 'matches', mc.n),
      now()
    FROM events_bucketed eb
    JOIN match_counts mc ON mc.team_name = eb.team_name
    LEFT JOIN stats_agg sa ON sa.team_name = eb.team_name
    ON CONFLICT (team_name, source_scope, bucket_label)
    DO UPDATE SET
      goals_for_rate     = EXCLUDED.goals_for_rate,
      yellow_cards_rate  = EXCLUDED.yellow_cards_rate,
      red_cards_rate     = EXCLUDED.red_cards_rate,
      substitutions_rate = EXCLUDED.substitutions_rate,
      shots_rate         = EXCLUDED.shots_rate,
      fouls_rate         = EXCLUDED.fouls_rate,
      corners_rate       = EXCLUDED.corners_rate,
      offsides_rate      = EXCLUDED.offsides_rate,
      possession_avg     = EXCLUDED.possession_avg,
      xg_for_rate        = EXCLUDED.xg_for_rate,
      sample_matches     = EXCLUDED.sample_matches,
      data_confidence    = EXCLUDED.data_confidence,
      raw_sources_json   = EXCLUDED.raw_sources_json,
      updated_at         = now();

    GET DIAGNOSTICS v_rows_qual = ROW_COUNT;
  END IF;

  -- ── WC HISTORY SCOPE ──────────────────────────────────────────────────
  -- wc_history.events has team_id; join to wc_history.teams.name_en
  IF p_scope IN ('wc_history', 'combined') THEN
    WITH
    wch_match_counts AS (
      SELECT
        ht.name_en AS team_name,
        COUNT(DISTINCT e.match_id) AS n
      FROM wc_history.events e
      JOIN wc_history.teams ht ON ht.id = e.team_id
      WHERE ht.name_en IS NOT NULL
        AND (p_team_name IS NULL OR ht.name_en = p_team_name)
      GROUP BY ht.name_en
    ),
    wch_bucketed AS (
      SELECT
        ht.name_en                                               AS team_name,
        (FLOOR(LEAST(e.elapsed, 89) / 5) * 5)::integer          AS b_start,
        ((FLOOR(LEAST(e.elapsed, 89) / 5) * 5) + 5)::integer    AS b_end,
        SUM(CASE WHEN e.event_type IN ('Goal','Own Goal','goal','own_goal')
                                   THEN 1 ELSE 0 END)            AS goals,
        SUM(CASE WHEN e.event_type IN ('Yellow Card','yellow_card')
                                   THEN 1 ELSE 0 END)            AS yellows,
        SUM(CASE WHEN e.event_type IN ('Red Card','red_card')
                                   THEN 1 ELSE 0 END)            AS reds,
        SUM(CASE WHEN e.event_type IN ('Substitution','substitution')
                                   THEN 1 ELSE 0 END)            AS subs
      FROM wc_history.events e
      JOIN wc_history.teams ht ON ht.id = e.team_id
      WHERE e.elapsed IS NOT NULL
        AND e.elapsed BETWEEN 0 AND 94
        AND ht.name_en IS NOT NULL
        AND (p_team_name IS NULL OR ht.name_en = p_team_name)
      GROUP BY ht.name_en, b_start, b_end
    )
    INSERT INTO team_minute_profiles
      (team_name, source_scope, bucket_label,
       goals_for_rate, yellow_cards_rate, red_cards_rate,
       substitutions_rate, sample_matches, data_confidence,
       raw_sources_json, updated_at)
    SELECT
      wb.team_name,
      'wc_history',
      wb.b_start::text || '-' || wb.b_end::text,
      ROUND((wb.goals::numeric   / NULLIF(wmc.n, 0)), 4),
      ROUND((wb.yellows::numeric / NULLIF(wmc.n, 0)), 4),
      ROUND((wb.reds::numeric    / NULLIF(wmc.n, 0)), 4),
      ROUND((wb.subs::numeric    / NULLIF(wmc.n, 0)), 4),
      wmc.n::integer,
      LEAST(wmc.n::numeric / 5.0, 1.0),
      jsonb_build_object('source', 'wc_history.events', 'matches', wmc.n),
      now()
    FROM wch_bucketed wb
    JOIN wch_match_counts wmc ON wmc.team_name = wb.team_name
    ON CONFLICT (team_name, source_scope, bucket_label)
    DO UPDATE SET
      goals_for_rate     = EXCLUDED.goals_for_rate,
      yellow_cards_rate  = EXCLUDED.yellow_cards_rate,
      red_cards_rate     = EXCLUDED.red_cards_rate,
      substitutions_rate = EXCLUDED.substitutions_rate,
      sample_matches     = EXCLUDED.sample_matches,
      data_confidence    = EXCLUDED.data_confidence,
      raw_sources_json   = EXCLUDED.raw_sources_json,
      updated_at         = now();

    GET DIAGNOSTICS v_rows_wch = ROW_COUNT;
  END IF;

  SELECT COUNT(DISTINCT team_name) INTO v_teams_done
  FROM team_minute_profiles
  WHERE updated_at >= now() - interval '30 seconds';

  RETURN jsonb_build_object(
    'status',          'ok',
    'scope',           p_scope,
    'rows_qualifiers', v_rows_qual,
    'rows_wc_history', v_rows_wch,
    'teams_done',      v_teams_done,
    'run_at',          now()::text
  );
END;
$$;

-- Public RPC
CREATE OR REPLACE FUNCTION public.rpc_build_team_minute_profiles(
  p_team_name text DEFAULT NULL,
  p_scope     text DEFAULT 'combined'
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.build_team_minute_profiles(p_team_name, p_scope);
$$;

GRANT EXECUTE ON FUNCTION public.rpc_build_team_minute_profiles(text, text) TO authenticated;

-- Schedule monthly refresh
SELECT cron.schedule(
  'wc2026-rebuild-team-minute-profiles',
  '0 3 * * 1',  -- every Monday at 03:00 UTC
  $$SELECT public.build_team_minute_profiles(NULL, 'combined');$$
);

-- Initial population run
SELECT public.build_team_minute_profiles(NULL, 'combined');
