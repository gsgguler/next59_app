
-- Grant SELECT to anon role on the 3 WC calibration tables
-- (RLS policies exist but table-level grants were missing for anon)
GRANT SELECT ON TABLE public.wc2026_calibration_runs TO anon;
GRANT SELECT ON TABLE public.wc2026_match_scenario_calibration TO anon;
GRANT SELECT ON TABLE public.wc2026_team_calibration_profiles TO anon;
