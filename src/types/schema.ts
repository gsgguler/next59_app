export interface DbTeam {
  id: string;
  name: string;
  short_name: string | null;
  tla: string | null;
  country_code: string;
  fifa_code: string | null;
  logo_url: string | null;
  team_type: string;
  is_active: boolean;
}

export interface DbStadium {
  id: string;
  name: string;
  city: string;
  country_code: string;
  capacity: number | null;
  timezone: string | null;
}

export interface DbMatch {
  id: string;
  competition_season_id: string;
  matchweek: number | null;
  round_name: string | null;
  home_team_id: string;
  away_team_id: string;
  stadium_id: string | null;
  kickoff_at: string;
  timezone: string | null;
  status: string;
  home_goals_ft: number | null;
  away_goals_ft: number | null;
  stage: string | null;
  group_name: string | null;
  home_team: DbTeam;
  away_team: DbTeam;
  stadium: DbStadium | null;
}

export interface DbTeamStrength {
  id: string;
  team_id: string;
  elo_rating: number;
  form_score: number;
  attack_score: number | null;
  defense_score: number | null;
}

export interface DbPrediction {
  id: string;
  match_id: string;
  version: number;
  is_current: boolean;
  cassandra_code: string;
  statement: string;
  probability: number;
  confidence_label: string;
  category: string;
  model_version: string;
  model_input_features: Record<string, unknown>;
  model_output_raw: Record<string, unknown> | null;
  access_level: string;
  generated_at: string;
}

export interface DbMatchWithRelations extends DbMatch {
  home_strength: DbTeamStrength | null;
  away_strength: DbTeamStrength | null;
  predictions: DbPrediction[];
}
