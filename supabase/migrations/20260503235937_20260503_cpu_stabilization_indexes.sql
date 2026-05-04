CREATE INDEX IF NOT EXISTS idx_matches_home_team_date
  ON public.matches (home_team_id, match_date DESC);

CREATE INDEX IF NOT EXISTS idx_matches_away_team_date
  ON public.matches (away_team_id, match_date DESC);
