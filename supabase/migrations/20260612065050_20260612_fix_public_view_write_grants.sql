-- Revoke write privileges from anon on public live views
-- Only SELECT should be granted to anon/authenticated on these read-only public views

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON wc2026_live_match_state_public FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON wc2026_live_5min_scenarios_public FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON wc2026_live_events_public FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON wc2026_live_statistics_public FROM anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON wc2026_live_match_state_public FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON wc2026_live_5min_scenarios_public FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON wc2026_live_events_public FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON wc2026_live_statistics_public FROM authenticated;

-- Ensure SELECT is granted
GRANT SELECT ON wc2026_live_match_state_public TO anon, authenticated;
GRANT SELECT ON wc2026_live_5min_scenarios_public TO anon, authenticated;
GRANT SELECT ON wc2026_live_events_public TO anon, authenticated;
GRANT SELECT ON wc2026_live_statistics_public TO anon, authenticated;
