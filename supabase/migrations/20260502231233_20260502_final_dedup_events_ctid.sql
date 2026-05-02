/*
  # Final events dedup via ctid (keep physically earliest row per logical key)

  ## Summary
  Some API-Football responses genuinely contain duplicate event rows for the
  same player+minute+type (e.g. double-issued cards). We keep the first
  physical row per logical key using ctid comparison, then add the unique index.
*/

DELETE FROM wc_history.events
WHERE ctid NOT IN (
  SELECT MIN(ctid)
  FROM wc_history.events
  GROUP BY
    match_id,
    COALESCE(elapsed, -1),
    COALESCE(extra_time, -1),
    COALESCE(event_type, ''),
    COALESCE(event_detail, ''),
    COALESCE(player_id, -1),
    COALESCE(player_name, '')
);

CREATE UNIQUE INDEX IF NOT EXISTS wc_history_events_logical_uq
  ON wc_history.events (
    match_id,
    COALESCE(elapsed, -1),
    COALESCE(extra_time, -1),
    COALESCE(event_type, ''),
    COALESCE(event_detail, ''),
    COALESCE(player_id, -1),
    COALESCE(player_name, '')
  );
