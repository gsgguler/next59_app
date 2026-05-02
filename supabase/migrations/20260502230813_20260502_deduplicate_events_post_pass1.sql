/*
  # Deduplicate events after pass-1 re-ingestion

  ## Summary
  Pass-1 events were re-fetched against already-ingested data (no offset).
  Remove the second set, keeping oldest created_at per logical key.
*/

DELETE FROM wc_history.events a
USING wc_history.events b
WHERE a.match_id = b.match_id
  AND a.elapsed IS NOT DISTINCT FROM b.elapsed
  AND a.extra_time IS NOT DISTINCT FROM b.extra_time
  AND a.event_type IS NOT DISTINCT FROM b.event_type
  AND a.event_detail IS NOT DISTINCT FROM b.event_detail
  AND a.player_id IS NOT DISTINCT FROM b.player_id
  AND a.player_name IS NOT DISTINCT FROM b.player_name
  AND a.created_at > b.created_at;
