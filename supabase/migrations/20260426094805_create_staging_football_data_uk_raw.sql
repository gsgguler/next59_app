/*
  # Create staging table for football-data.co.uk CSV ingestion

  1. New Tables
    - `staging_football_data_uk_raw`
      - Raw CSV landing table before normalization into matches/match_statistics/etc.
      - All columns nullable except metadata fields to safely accept partial CSV rows
      - Core match fields: Div, Date, Time, HomeTeam, AwayTeam, scores, referee
      - Match statistics: shots, fouls, corners, cards
      - Betting odds: 47 columns covering all major bookmakers and market types
        (1X2, over/under, Asian handicap, Betbrain aggregates)
      - Metadata: source_file, league_code, season_code, imported_at, row_hash,
        deterministic_source_match_id
  2. Indexes
    - deterministic_source_match_id (lookup for upsert)
    - league_code (filter by league)
    - season_code (filter by season)
    - match_date (date range queries)
    - home_team, away_team (team lookups)
  3. Constraints
    - UNIQUE on (league_code, season_code, deterministic_source_match_id)
      to enforce idempotent ingestion
  4. Security
    - RLS enabled, no public policies (service-role only)
*/

CREATE TABLE IF NOT EXISTS public.staging_football_data_uk_raw (
  id                              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- === CSV core fields ===
  div                             text,
  match_date                      date,
  match_time                      text,
  home_team                       text,
  away_team                       text,

  -- Full-time result
  fthg                            smallint,
  ftag                            smallint,
  ftr                             char(1),

  -- Half-time result
  hthg                            smallint,
  htag                            smallint,
  htr                             char(1),

  -- Referee
  referee                         text,

  -- === Match statistics ===
  hs                              smallint,   -- Home shots
  as_col                          smallint,   -- Away shots (AS is reserved keyword)
  hst                             smallint,   -- Home shots on target
  ast                             smallint,   -- Away shots on target
  hf                              smallint,   -- Home fouls
  af                              smallint,   -- Away fouls
  hc                              smallint,   -- Home corners
  ac                              smallint,   -- Away corners
  hy                              smallint,   -- Home yellows
  ay                              smallint,   -- Away yellows
  hr                              smallint,   -- Home reds
  ar                              smallint,   -- Away reds

  -- === Betting odds: 1X2 market ===
  b365h                           numeric,    -- Bet365 home
  b365d                           numeric,    -- Bet365 draw
  b365a                           numeric,    -- Bet365 away
  bwh                             numeric,    -- Betway home
  bwd                             numeric,    -- Betway draw
  bwa                             numeric,    -- Betway away
  iwh                             numeric,    -- Interwetten home
  iwd                             numeric,    -- Interwetten draw
  iwa                             numeric,    -- Interwetten away
  psh                             numeric,    -- Pinnacle home
  psd                             numeric,    -- Pinnacle draw
  psa                             numeric,    -- Pinnacle away
  whh                             numeric,    -- William Hill home
  whd                             numeric,    -- William Hill draw
  wha                             numeric,    -- William Hill away
  vch                             numeric,    -- VC Bet home
  vcd                             numeric,    -- VC Bet draw
  vca                             numeric,    -- VC Bet away

  -- === Betting odds: closing 1X2 ===
  b365ch                          numeric,
  b365cd                          numeric,
  b365ca                          numeric,
  bwch                            numeric,
  bwcd                            numeric,
  bwca                            numeric,
  iwch                            numeric,
  iwcd                            numeric,
  iwca                            numeric,
  psch                            numeric,
  pscd                            numeric,
  psca                            numeric,
  whch                            numeric,
  whcd                            numeric,
  whca                            numeric,
  vcch                            numeric,
  vccd                            numeric,
  vcca                            numeric,

  -- === Betbrain aggregates ===
  bb1x2                           smallint,   -- Number of 1X2 bookmakers
  bbmxh                           numeric,    -- Max home odds
  bbavh                           numeric,    -- Avg home odds
  bbmxd                           numeric,    -- Max draw odds
  bbavd                           numeric,    -- Avg draw odds
  bbmxa                           numeric,    -- Max away odds
  bbava                           numeric,    -- Avg away odds

  -- === Over/Under 2.5 ===
  b365_over_2_5                   numeric,
  b365_under_2_5                  numeric,
  p_over_2_5                      numeric,    -- Pinnacle O2.5
  p_under_2_5                     numeric,    -- Pinnacle U2.5
  bbou                            smallint,   -- Number of O/U bookmakers
  bbmx_over_2_5                   numeric,
  bbav_over_2_5                   numeric,
  bbmx_under_2_5                  numeric,
  bbav_under_2_5                  numeric,

  -- === Asian Handicap ===
  bbah                            smallint,   -- Number of AH bookmakers
  bbahh                           numeric,    -- AH home line
  bbmxahh                         numeric,    -- Max AH home odds
  bbavahh                         numeric,    -- Avg AH home odds
  bbmxaha                         numeric,    -- Max AH away odds
  bbavaha                         numeric,    -- Avg AH away odds
  psch_ah                         numeric,    -- Pinnacle closing AH home
  psca_ah                         numeric,    -- Pinnacle closing AH away

  -- === Metadata ===
  source_file                     text        NOT NULL,
  league_code                     text        NOT NULL,
  season_code                     text        NOT NULL,
  imported_at                     timestamptz NOT NULL DEFAULT now(),
  row_hash                        text        NOT NULL,
  deterministic_source_match_id   text        NOT NULL,

  -- === Uniqueness constraint for idempotent ingestion ===
  CONSTRAINT uq_staging_fd_uk_match
    UNIQUE (league_code, season_code, deterministic_source_match_id)
);

-- === Indexes ===
CREATE INDEX IF NOT EXISTS idx_staging_fd_uk_source_match_id
  ON public.staging_football_data_uk_raw (deterministic_source_match_id);

CREATE INDEX IF NOT EXISTS idx_staging_fd_uk_league_code
  ON public.staging_football_data_uk_raw (league_code);

CREATE INDEX IF NOT EXISTS idx_staging_fd_uk_season_code
  ON public.staging_football_data_uk_raw (season_code);

CREATE INDEX IF NOT EXISTS idx_staging_fd_uk_match_date
  ON public.staging_football_data_uk_raw (match_date);

CREATE INDEX IF NOT EXISTS idx_staging_fd_uk_home_team
  ON public.staging_football_data_uk_raw (home_team);

CREATE INDEX IF NOT EXISTS idx_staging_fd_uk_away_team
  ON public.staging_football_data_uk_raw (away_team);

-- === RLS ===
ALTER TABLE public.staging_football_data_uk_raw ENABLE ROW LEVEL SECURITY;
