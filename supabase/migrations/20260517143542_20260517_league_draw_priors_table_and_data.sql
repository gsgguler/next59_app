/*
  # TASK 1 — League Draw Priors Table

  Creates and populates model_lab.league_draw_priors with actual historical
  draw rates computed from public.matches, split by period:
  - normal:      2019-2020 (pre-COVID last full normal season)
  - covid:       2020-2021 (COVID season, no crowds)
  - post_covid:  2021-2022 onwards

  Join path: matches → competition_seasons → seasons.label (for season_label),
                      → competitions.name (for competition_name)

  Columns:
    competition_name       text PK
    sample_start_season    text
    sample_end_season      text
    normal_draw_rate       numeric   -- pre-COVID draw rate (2019-2020)
    covid_draw_rate        numeric   -- COVID-era draw rate (2020-2021)
    post_covid_draw_rate   numeric   -- post-COVID draw rate (2021-2022+)
    overall_draw_rate      numeric   -- full 2019-2025 average (primary prior for formula v2)
    sample_size            integer   -- total matches used for computation
    created_at             timestamptz
*/

CREATE TABLE IF NOT EXISTS model_lab.league_draw_priors (
  competition_name      text PRIMARY KEY,
  sample_start_season   text NOT NULL,
  sample_end_season     text NOT NULL,
  normal_draw_rate      numeric(6,4),
  covid_draw_rate       numeric(6,4),
  post_covid_draw_rate  numeric(6,4),
  overall_draw_rate     numeric(6,4) NOT NULL,
  sample_size           integer NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE model_lab.league_draw_priors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read league draw priors"
  ON model_lab.league_draw_priors
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Populate from actual match outcomes
-- Join path: matches → competition_seasons → seasons (for label) → competitions (for name)
INSERT INTO model_lab.league_draw_priors
  (competition_name, sample_start_season, sample_end_season,
   normal_draw_rate, covid_draw_rate, post_covid_draw_rate,
   overall_draw_rate, sample_size)
SELECT
  c.name AS competition_name,
  MIN(s.label) AS sample_start_season,
  MAX(s.label) AS sample_end_season,

  -- Normal: 2019-2020 only (pre-COVID)
  ROUND(
    SUM(CASE WHEN s.label = '2019-2020' AND m.home_score_ft = m.away_score_ft THEN 1 ELSE 0 END)::numeric /
    NULLIF(SUM(CASE WHEN s.label = '2019-2020' THEN 1 ELSE 0 END), 0),
    4
  ) AS normal_draw_rate,

  -- COVID: 2020-2021
  ROUND(
    SUM(CASE WHEN s.label = '2020-2021' AND m.home_score_ft = m.away_score_ft THEN 1 ELSE 0 END)::numeric /
    NULLIF(SUM(CASE WHEN s.label = '2020-2021' THEN 1 ELSE 0 END), 0),
    4
  ) AS covid_draw_rate,

  -- Post-COVID: 2021-2022 through 2024-2025
  ROUND(
    SUM(CASE WHEN s.label >= '2021-2022' AND m.home_score_ft = m.away_score_ft THEN 1 ELSE 0 END)::numeric /
    NULLIF(SUM(CASE WHEN s.label >= '2021-2022' THEN 1 ELSE 0 END), 0),
    4
  ) AS post_covid_draw_rate,

  -- Overall draw rate across full 2019-2025 sample
  ROUND(
    SUM(CASE WHEN m.home_score_ft = m.away_score_ft THEN 1 ELSE 0 END)::numeric /
    COUNT(*),
    4
  ) AS overall_draw_rate,

  COUNT(*) AS sample_size

FROM public.matches m
JOIN public.competition_seasons cs ON m.competition_season_id = cs.id
JOIN public.seasons s ON cs.season_id = s.id
JOIN public.competitions c ON cs.competition_id = c.id
WHERE s.label BETWEEN '2019-2020' AND '2024-2025'
  AND m.home_score_ft IS NOT NULL
  AND m.away_score_ft IS NOT NULL
  AND c.name IN (
    'Bundesliga', 'Premier League', 'La Liga', 'Serie A',
    'Ligue 1', 'Championship', 'Süper Lig'
  )
GROUP BY c.name
ON CONFLICT (competition_name) DO UPDATE SET
  normal_draw_rate     = EXCLUDED.normal_draw_rate,
  covid_draw_rate      = EXCLUDED.covid_draw_rate,
  post_covid_draw_rate = EXCLUDED.post_covid_draw_rate,
  overall_draw_rate    = EXCLUDED.overall_draw_rate,
  sample_size          = EXCLUDED.sample_size,
  sample_end_season    = EXCLUDED.sample_end_season,
  created_at           = now();
