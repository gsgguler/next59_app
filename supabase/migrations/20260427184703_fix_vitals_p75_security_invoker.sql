/*
  # Fix vitals_p75_by_page SECURITY DEFINER flag

  1. Problem
    - View `public.vitals_p75_by_page` is defined with SECURITY DEFINER,
      flagged by Supabase security advisor
    - This means the view executes with the privileges of the view owner
      rather than the calling user, bypassing RLS on underlying tables

  2. Fix
    - Drop and recreate the view with identical SELECT body
    - Add `WITH (security_invoker = true)` so it runs as the calling user
    - Reapply SELECT grants to anon, authenticated, service_role

  3. Changes
    - No columns changed
    - No SELECT logic changed
    - Only security context changed from DEFINER to INVOKER
*/

DROP VIEW IF EXISTS public.vitals_p75_by_page;

CREATE VIEW public.vitals_p75_by_page
WITH (security_invoker = true)
AS
SELECT page,
    metric,
    percentile_cont(0.75::double precision) WITHIN GROUP (ORDER BY (value::double precision)) AS p75_value,
    count(*) AS sample_count,
    count(*) FILTER (WHERE rating = 'poor'::text) AS poor_count,
    round(
        CASE
            WHEN count(*) > 0 THEN 100.0 * count(*) FILTER (WHERE rating = 'poor'::text)::numeric / count(*)::numeric
            ELSE 0::numeric
        END, 2) AS poor_percentage
FROM web_vitals
WHERE created_at >= (now() - '7 days'::interval)
GROUP BY page, metric;

GRANT SELECT ON public.vitals_p75_by_page TO anon, authenticated, service_role;
