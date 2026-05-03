/*
  # Fix wch_editions view — remove host_country IS NOT NULL filter

  2010–2022 editions now have host_country populated.
  The previous WHERE clause excluded them. Replace view with no filter.
*/
CREATE OR REPLACE VIEW public.wch_editions AS
SELECT
  edition_year,
  host_country,
  champion,
  total_matches,
  total_teams,
  start_date,
  end_date
FROM wc_history.editions;

GRANT SELECT ON public.wch_editions TO anon, authenticated;
