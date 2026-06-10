
-- Drop old 2-arg overload (fixture_id, publish) — replaced by 3-arg version with p_force
DROP FUNCTION IF EXISTS public.generate_wc2026_projected_match_stats(uuid, boolean);
