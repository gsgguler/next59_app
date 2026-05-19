/*
  # WC2026 Squad Ops Dashboard RPCs

  ## Summary
  Two safe, read/write RPCs for the admin squad operations dashboard.

  1. `wc2026_get_team_pool_overview_v2` — replaces the existing overview RPC with
     the missing `iso2` column added to the result set, plus a `manual_review`
     flag derived from the team's notes field. No data is altered.

  2. `wc2026_mark_manual_review` — marks a team as needing manual review by
     setting `overall_status = 'manual_review'` and writing a timestamped note.
     Only operates on teams that already exist in `wc2026_team_pool`. Returns
     the updated team_name and new status.

  ## Security
  Both functions SECURITY DEFINER, locked search_path, granted to authenticated.
  The mark function only touches `notes` and `overall_status` on wc2026_team_pool
  — no player or calibration data is affected.
*/

-- ─── 1. wc2026_get_team_pool_overview_v2 ─────────────────────────────────────
-- Drops and recreates the existing overview function with iso2 + manual_review flag.

CREATE OR REPLACE FUNCTION public.wc2026_get_team_pool_overview_v2()
RETURNS TABLE (
  api_football_team_id    integer,
  team_name               text,
  fifa_code               text,
  iso2                    text,
  confederation           text,
  squad_status            text,
  squad_player_count      integer,
  squad_last_fetched_at   timestamptz,
  squad_valid_until       timestamptz,
  squad_source            text,
  lineup_status           text,
  lineup_last_fetched_at  timestamptz,
  perf_snapshot_status    text,
  perf_snapshot_date      date,
  overall_status          text,
  stale_warning           boolean,
  missing_warning         boolean,
  manual_review           boolean,
  probable_squad_count    bigint,
  player_pool_count       bigint,
  team_squads_count       bigint,
  last_fetch_status       text,
  last_fetch_at           timestamptz,
  notes                   text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
SELECT
  tp.api_football_team_id,
  tp.team_name,
  tp.fifa_code,
  tp.iso2,
  tp.confederation,
  tp.squad_status,
  tp.squad_player_count,
  tp.squad_last_fetched_at,
  tp.squad_valid_until,
  tp.squad_source,
  tp.lineup_status,
  tp.lineup_last_fetched_at,
  tp.perf_snapshot_status,
  tp.perf_snapshot_date,
  tp.overall_status,
  tp.stale_warning,
  tp.missing_warning,
  (tp.overall_status = 'manual_review')   AS manual_review,
  COALESCE(sq.cnt, 0)                     AS probable_squad_count,
  COALESCE(pp.cnt, 0)                     AS player_pool_count,
  COALESCE(ts.cnt, 0)                     AS team_squads_count,
  fl.fetch_status                         AS last_fetch_status,
  fl.fetched_at                           AS last_fetch_at,
  tp.notes
FROM public.wc2026_team_pool tp
LEFT JOIN (
  SELECT api_football_team_id, COUNT(*) AS cnt
  FROM public.wc2026_probable_squads
  GROUP BY api_football_team_id
) sq ON sq.api_football_team_id = tp.api_football_team_id
LEFT JOIN (
  SELECT api_football_team_id, COUNT(*) AS cnt
  FROM public.wc2026_player_pool
  GROUP BY api_football_team_id
) pp ON pp.api_football_team_id = tp.api_football_team_id
LEFT JOIN (
  SELECT api_football_team_id, COUNT(*) AS cnt
  FROM public.wc2026_team_squads
  GROUP BY api_football_team_id
) ts ON ts.api_football_team_id = tp.api_football_team_id
LEFT JOIN LATERAL (
  SELECT fetch_status, fetched_at
  FROM public.wc2026_provider_fetch_logs
  WHERE api_football_team_id = tp.api_football_team_id
  ORDER BY fetched_at DESC
  LIMIT 1
) fl ON true
ORDER BY tp.confederation, tp.team_name;
$$;

GRANT EXECUTE ON FUNCTION public.wc2026_get_team_pool_overview_v2() TO authenticated;


-- ─── 2. wc2026_mark_manual_review ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wc2026_mark_manual_review(
  p_api_team_id integer,
  p_reason      text DEFAULT 'Manuel kontrol gerekli'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_name text;
BEGIN
  SELECT team_name INTO v_team_name
  FROM public.wc2026_team_pool
  WHERE api_football_team_id = p_api_team_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team not found');
  END IF;

  UPDATE public.wc2026_team_pool
  SET
    overall_status = 'manual_review',
    notes          = COALESCE(notes || ' | ', '') || '[' || to_char(now(), 'YYYY-MM-DD HH24:MI') || '] ' || p_reason,
    updated_at     = now()
  WHERE api_football_team_id = p_api_team_id;

  RETURN jsonb_build_object(
    'success',    true,
    'team_name',  v_team_name,
    'team_id',    p_api_team_id,
    'new_status', 'manual_review',
    'reason',     p_reason
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wc2026_mark_manual_review(integer, text) TO authenticated;


-- ─── 3. wc2026_clear_manual_review ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wc2026_clear_manual_review(
  p_api_team_id integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_name text;
BEGIN
  SELECT team_name INTO v_team_name
  FROM public.wc2026_team_pool
  WHERE api_football_team_id = p_api_team_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team not found');
  END IF;

  UPDATE public.wc2026_team_pool
  SET
    overall_status = 'pending',
    updated_at     = now()
  WHERE api_football_team_id = p_api_team_id
    AND overall_status = 'manual_review';

  RETURN jsonb_build_object(
    'success',    true,
    'team_name',  v_team_name,
    'new_status', 'pending'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wc2026_clear_manual_review(integer) TO authenticated;
