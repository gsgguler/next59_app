/*
  # Delete dirty football-data.co.uk rows, preserve validated T1 1213

  1. Context
    - A Render ingestion worker imported unvalidated data before being suspended
    - 5,772 dirty matches and their satellite rows need removal
    - 306 validated T1 1213 matches must be preserved

  2. Scope
    - ONLY deletes rows with source_provider = 'football-data.co.uk'
    - Preserves matches whose source_match_id exists in validated staging rows
    - Validated staging criteria: league_code='T1', season_code='1213',
      non-null date/teams/scores

  3. Delete Order (FK-safe)
    a. actual_outcomes (child of matches)
    b. match_context (child of matches)
    c. match_statistics (child of matches)
    d. matches (parent)

  4. Not Touched
    - staging_football_data_uk_raw
    - teams, competitions, competition_seasons
    - Any non-football-data.co.uk data
*/

-- Step 1: Delete dirty actual_outcomes
DELETE FROM public.actual_outcomes
WHERE match_id IN (
  SELECT m.id
  FROM public.matches m
  WHERE m.source_provider = 'football-data.co.uk'
    AND m.source_match_id NOT IN (
      SELECT s.deterministic_source_match_id
      FROM public.staging_football_data_uk_raw s
      WHERE s.league_code = 'T1'
        AND s.season_code = '1213'
        AND s.match_date IS NOT NULL
        AND s.home_team IS NOT NULL
        AND s.away_team IS NOT NULL
        AND s.fthg IS NOT NULL
        AND s.ftag IS NOT NULL
    )
);

-- Step 2: Delete dirty match_context
DELETE FROM public.match_context
WHERE match_id IN (
  SELECT m.id
  FROM public.matches m
  WHERE m.source_provider = 'football-data.co.uk'
    AND m.source_match_id NOT IN (
      SELECT s.deterministic_source_match_id
      FROM public.staging_football_data_uk_raw s
      WHERE s.league_code = 'T1'
        AND s.season_code = '1213'
        AND s.match_date IS NOT NULL
        AND s.home_team IS NOT NULL
        AND s.away_team IS NOT NULL
        AND s.fthg IS NOT NULL
        AND s.ftag IS NOT NULL
    )
);

-- Step 3: Delete dirty match_statistics
DELETE FROM public.match_statistics
WHERE match_id IN (
  SELECT m.id
  FROM public.matches m
  WHERE m.source_provider = 'football-data.co.uk'
    AND m.source_match_id NOT IN (
      SELECT s.deterministic_source_match_id
      FROM public.staging_football_data_uk_raw s
      WHERE s.league_code = 'T1'
        AND s.season_code = '1213'
        AND s.match_date IS NOT NULL
        AND s.home_team IS NOT NULL
        AND s.away_team IS NOT NULL
        AND s.fthg IS NOT NULL
        AND s.ftag IS NOT NULL
    )
);

-- Step 4: Delete dirty matches
DELETE FROM public.matches
WHERE source_provider = 'football-data.co.uk'
  AND source_match_id NOT IN (
    SELECT s.deterministic_source_match_id
    FROM public.staging_football_data_uk_raw s
    WHERE s.league_code = 'T1'
      AND s.season_code = '1213'
      AND s.match_date IS NOT NULL
      AND s.home_team IS NOT NULL
      AND s.away_team IS NOT NULL
      AND s.fthg IS NOT NULL
      AND s.ftag IS NOT NULL
  );
