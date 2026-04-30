export interface DbTeam {
  id: string;
  country_id: string | null;
  api_football_id: number | null;
  name: string;
  short_name: string | null;
  code: string | null;
  logo_url: string | null;
  venue_id: string | null;
  founded: number | null;
  created_at: string;
}

export interface DbVenue {
  id: string;
  api_football_id: number | null;
  name: string;
  city: string;
  country_id: string | null;
  capacity: number | null;
  image_url: string | null;
  created_at: string;
}

export interface DbMatch {
  id: string;
  competition_season_id: string;
  home_team_id: string;
  away_team_id: string;
  venue_id: string | null;
  api_football_fixture_id: number | null;
  deterministic_source_match_id: string | null;
  match_date: string;
  match_time: string | null;
  timezone: string | null;
  timestamp: number | null;
  status_short: string;
  status_long: string | null;
  status_elapsed: number | null;
  status_extra: number | null;
  home_score_ft: number | null;
  away_score_ft: number | null;
  home_score_ht: number | null;
  away_score_ht: number | null;
  home_score_et: number | null;
  away_score_et: number | null;
  home_score_pen: number | null;
  away_score_pen: number | null;
  result: string | null;
  referee: string | null;
  round: string | null;
  attendance: number | null;
  source_id: string | null;
  ingestion_run_id: string | null;
  created_at: string;
  updated_at: string;
  half_time_result: string | null;
  home_team: DbTeam;
  away_team: DbTeam;
  venue: DbVenue | null;
}

export interface DbPrediction {
  id: string;
  match_id: string;
  model_version_id: string | null;
  prediction_type: string;
  predicted_outcome: string;
  confidence: number;
  odds_fair: number | null;
  explanation_json: Record<string, unknown> | null;
  is_elite_only: boolean;
  superseded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbProfile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  personal_organization_id: string | null;
  created_at: string;
  updated_at: string;
}
