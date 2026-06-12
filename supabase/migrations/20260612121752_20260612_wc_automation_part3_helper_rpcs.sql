-- Helper RPCs used by Part 3 edge functions

CREATE OR REPLACE FUNCTION wc2026_increment_live_poll_count(p_fixture_id bigint)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE wc2026_fixtures
  SET live_poll_count = COALESCE(live_poll_count, 0) + 1,
      updated_at = now()
  WHERE api_football_fixture_id = p_fixture_id;
$$;

CREATE OR REPLACE FUNCTION wc2026_prune_quota_snapshots()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM wc_api_quota_snapshots
  WHERE id NOT IN (
    SELECT id FROM wc_api_quota_snapshots
    ORDER BY checked_at DESC
    LIMIT 200
  );
END;
$$;
