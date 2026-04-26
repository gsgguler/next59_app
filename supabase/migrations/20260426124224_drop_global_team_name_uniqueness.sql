/*
  # Drop global UNIQUE(name) constraints on teams table

  1. Problem
    - `teams_name_key` and `teams_name_unique` enforce global uniqueness on `teams.name`
    - This blocks multi-country imports where the same team name exists in different countries
      (e.g., "Sporting" in PT and ES, "Nacional" in PT and UY)

  2. Changes
    - DROP CONSTRAINT `teams_name_key` (UNIQUE on name)
    - DROP CONSTRAINT `teams_name_unique` (UNIQUE on name, redundant duplicate)

  3. Preserved
    - `uq_teams_name_country_lower` UNIQUE INDEX on (lower(name), country_code) remains intact
    - This correctly prevents duplicate team names within the same country
    - All other indexes, constraints, FKs, and data are untouched

  4. Impact
    - Zero data changes
    - Zero FK changes
    - Zero column changes
    - Unlocks global multi-league team imports
*/

ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_name_key;
ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_name_unique;
