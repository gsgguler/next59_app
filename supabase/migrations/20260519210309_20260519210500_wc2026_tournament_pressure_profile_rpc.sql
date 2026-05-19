/*
  # WC2026 Tournament Pressure Profile RPC

  ## Summary
  Exposes tournament pressure diagnostics for all 48 WC2026 teams to the admin UI.

  ## New Functions
  - `wc2026_get_tournament_pressure_profile()` — returns one row per team with:
    - tournament_pressure_index (0-100)
    - historical_wc_matches (integer) — primary WC experience source from calibration engine
    - last_wc_year — most recent WC appearance year
    - tournament_experience_score (0-1 normalised)
    - fatigue_risk (0-1)
    - chaos_probability (0-1)
    - calibration_confidence ('high'/'medium'/'low'/'none')
    - first_time_qualifier (boolean) — derived: historical_wc_matches = 0
    - pressure_tier ('elite'/'experienced'/'returning'/'debutant') — derived tiering
    - group_fixture_count — scheduled group-stage fixtures for this team
    - has_knockout_fixture — whether team appears in any knockout-stage row
    - iso2, confederation — from wc2026_team_pool
    - missing_data_warnings (jsonb)

  ## Data Sources
  - wc2026_team_calibration_profiles (DISTINCT ON api_football_team_id, latest calibrated_at)
  - wc2026_team_pool (iso2, confederation, api_football_team_id)
  - wc2026_fixtures (group + knockout fixture counts per team)

  ## Security
  - SECURITY DEFINER, search_path locked to public
  - GRANT to authenticated only (admin-only via app-level check)
*/

CREATE OR REPLACE FUNCTION public.wc2026_get_tournament_pressure_profile()
RETURNS TABLE (
  api_football_team_id       int,
  team_name                  text,
  iso2                       text,
  confederation              text,
  -- pressure indices
  tournament_pressure_index  numeric,
  historical_wc_matches      int,
  last_wc_year               int,
  tournament_experience_score numeric,
  fatigue_risk               numeric,
  chaos_probability          numeric,
  calibration_confidence     text,
  -- derived
  first_time_qualifier       boolean,
  pressure_tier              text,
  -- fixture context
  group_fixture_count        int,
  has_knockout_fixture       boolean,
  -- metadata
  missing_data_warnings      jsonb,
  calibrated_at              timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH latest_calib AS (
    SELECT DISTINCT ON (api_football_team_id)
      api_football_team_id,
      team_name,
      coalesce(wc2026_tournament_pressure_index, 50)::numeric AS tournament_pressure_index,
      coalesce(historical_wc_matches, 0)::int                 AS historical_wc_matches,
      last_wc_year::int,
      coalesce(tournament_experience_score, 0)::numeric       AS tournament_experience_score,
      coalesce(wc2026_fatigue_risk, 0)::numeric               AS fatigue_risk,
      coalesce(wc2026_chaos_probability, 0)::numeric          AS chaos_probability,
      coalesce(calibration_confidence, 'none')                AS calibration_confidence,
      missing_data_warnings,
      calibrated_at
    FROM wc2026_team_calibration_profiles
    ORDER BY api_football_team_id, calibrated_at DESC NULLS LAST
  ),
  pool AS (
    SELECT
      p.api_football_team_id,
      p.iso2,
      p.confederation
    FROM wc2026_team_pool p
  ),
  group_counts AS (
    SELECT
      t.api_football_team_id,
      count(*) FILTER (WHERE f.stage_code = 'GROUP') AS group_fixture_count
    FROM wc2026_team_pool t
    LEFT JOIN wc2026_fixtures f
      ON (f.home_api_team_id = t.api_football_team_id
       OR f.away_api_team_id = t.api_football_team_id)
      AND f.stage_code = 'GROUP'
    GROUP BY t.api_football_team_id
  ),
  knockout_flag AS (
    SELECT
      t.api_football_team_id,
      bool_or(
        f.stage_code IS NOT NULL AND f.stage_code <> 'GROUP'
        AND (f.home_api_team_id = t.api_football_team_id
          OR f.away_api_team_id = t.api_football_team_id)
      ) AS has_knockout_fixture
    FROM wc2026_team_pool t
    LEFT JOIN wc2026_fixtures f
      ON (f.home_api_team_id = t.api_football_team_id
       OR f.away_api_team_id = t.api_football_team_id)
      AND f.stage_code IS DISTINCT FROM 'GROUP'
    GROUP BY t.api_football_team_id
  )
  SELECT
    p.api_football_team_id,
    coalesce(c.team_name, tp.team_name)::text                 AS team_name,
    coalesce(p.iso2, '')::text                                 AS iso2,
    coalesce(p.confederation, 'UNK')::text                    AS confederation,
    coalesce(c.tournament_pressure_index, 50)                  AS tournament_pressure_index,
    coalesce(c.historical_wc_matches, 0)                       AS historical_wc_matches,
    c.last_wc_year,
    coalesce(c.tournament_experience_score, 0)                 AS tournament_experience_score,
    coalesce(c.fatigue_risk, 0)                                AS fatigue_risk,
    coalesce(c.chaos_probability, 0)                           AS chaos_probability,
    coalesce(c.calibration_confidence, 'none')::text           AS calibration_confidence,
    -- first-time qualifier: never appeared in a WC
    (coalesce(c.historical_wc_matches, 0) = 0)                 AS first_time_qualifier,
    -- pressure tier
    CASE
      WHEN coalesce(c.historical_wc_matches, 0) >= 10 THEN 'elite'
      WHEN coalesce(c.historical_wc_matches, 0) >= 5  THEN 'experienced'
      WHEN coalesce(c.historical_wc_matches, 0) >= 1  THEN 'returning'
      ELSE 'debutant'
    END::text                                                  AS pressure_tier,
    coalesce(gc.group_fixture_count, 0)::int                   AS group_fixture_count,
    coalesce(kf.has_knockout_fixture, false)                    AS has_knockout_fixture,
    coalesce(c.missing_data_warnings, '[]'::jsonb)             AS missing_data_warnings,
    c.calibrated_at
  FROM pool p
  JOIN wc2026_team_pool tp ON tp.api_football_team_id = p.api_football_team_id
  LEFT JOIN latest_calib c ON c.api_football_team_id = p.api_football_team_id
  LEFT JOIN group_counts gc ON gc.api_football_team_id = p.api_football_team_id
  LEFT JOIN knockout_flag kf ON kf.api_football_team_id = p.api_football_team_id
  ORDER BY coalesce(c.tournament_pressure_index, 50) DESC, team_name;
$$;

GRANT EXECUTE ON FUNCTION public.wc2026_get_tournament_pressure_profile() TO authenticated;
