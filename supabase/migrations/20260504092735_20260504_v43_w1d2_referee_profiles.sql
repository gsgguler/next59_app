/*
  # v4.3-W1-D2 Part B: Referee Profiles

  Creates shared.referee_profiles and populates from matches + match_stats.
  Only referees with >= 10 matches officiated included.
  active column: plain boolean, refreshed at compute time (not generated).

  Source: 22,712 matches with referee + stats.
  Referee fill rate: 35.7% overall.
*/

CREATE TABLE IF NOT EXISTS shared.referee_profiles (
  referee_name                 TEXT PRIMARY KEY,
  matches_officiated           INTEGER NOT NULL,

  avg_yellow_cards             NUMERIC(4,2),
  avg_red_cards                NUMERIC(4,3),
  avg_fouls                    NUMERIC(5,2),

  home_yellow_rate             NUMERIC(4,3),
  away_yellow_rate             NUMERIC(4,3),
  home_bias_score              NUMERIC(6,4),

  card_intensity_percentile    INTEGER,
  whistle_intensity_percentile INTEGER,

  first_match_date             DATE,
  last_match_date              DATE,
  active                       BOOLEAN,

  computed_at                  TIMESTAMPTZ DEFAULT NOW(),
  notes                        TEXT
);

ALTER TABLE shared.referee_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read referee_profiles"
  ON shared.referee_profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_referee_active
  ON shared.referee_profiles(active);
