/*
  # Add detailed match statistics and odds columns

  1. Modified Tables

    ## `matches`
      - `referee_name` (text) — referee name from CSV data; kept as text
        because CSV data does not contain a referee registry to join against

    ## `actual_outcomes`
      - `home_shots` (smallint) — total shots by home team
      - `away_shots` (smallint) — total shots by away team
      - `home_shots_on_target` (smallint) — shots on target by home team
      - `away_shots_on_target` (smallint) — shots on target by away team
      - `home_fouls` (smallint) — fouls committed by home team
      - `away_fouls` (smallint) — fouls committed by away team
      - `home_yellow_cards` (smallint) — yellow cards for home team
      - `away_yellow_cards` (smallint) — yellow cards for away team
      - `home_red_cards` (smallint) — red cards for home team
      - `away_red_cards` (smallint) — red cards for away team
      - `home_corners` (smallint) — corners won by home team
      - `away_corners` (smallint) — corners won by away team
      - `ht_result` (char(1)) — half-time result H/D/A
      - `odds_over_2_5` (numeric) — average over 2.5 goals odds
      - `odds_under_2_5` (numeric) — average under 2.5 goals odds
      - `closing_odds` (jsonb) — closing 1x2 odds from multiple bookmakers
      - `asian_handicap` (jsonb) — Asian handicap line + odds

  2. Notes
    - All new columns are nullable so existing rows are not affected
    - Per-team stats (home/away split) are essential for the prediction engine
    - JSONB columns (`closing_odds`, `asian_handicap`) future-proof additional
      bookmaker data without needing further schema changes
    - No data is deleted or modified
*/

-- matches: referee name
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'matches'
    AND column_name = 'referee_name'
  ) THEN
    ALTER TABLE matches ADD COLUMN referee_name text;
  END IF;
END $$;

-- actual_outcomes: per-team stats
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'actual_outcomes'
    AND column_name = 'home_shots'
  ) THEN
    ALTER TABLE actual_outcomes
      ADD COLUMN home_shots smallint,
      ADD COLUMN away_shots smallint,
      ADD COLUMN home_shots_on_target smallint,
      ADD COLUMN away_shots_on_target smallint,
      ADD COLUMN home_fouls smallint,
      ADD COLUMN away_fouls smallint,
      ADD COLUMN home_yellow_cards smallint,
      ADD COLUMN away_yellow_cards smallint,
      ADD COLUMN home_red_cards smallint,
      ADD COLUMN away_red_cards smallint,
      ADD COLUMN home_corners smallint,
      ADD COLUMN away_corners smallint,
      ADD COLUMN ht_result char(1),
      ADD COLUMN odds_over_2_5 numeric,
      ADD COLUMN odds_under_2_5 numeric,
      ADD COLUMN closing_odds jsonb,
      ADD COLUMN asian_handicap jsonb;
  END IF;
END $$;
