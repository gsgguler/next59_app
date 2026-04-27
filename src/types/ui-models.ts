export interface UITeam {
  id: string;
  name: string;
  short_name: string;
  country_code: string;
  fifa_code: string;
}

export interface UIStadium {
  name: string;
  city: string;
}

export interface UIPrediction {
  home_prob: number;
  draw_prob: number;
  away_prob: number;
  confidence: number;
  high_scoring: number;
  mutual_scoring: number;
}

export interface UIMatch {
  id: string;
  home_team: UITeam;
  away_team: UITeam;
  kickoff_at: string;
  stadium: UIStadium | null;
  status: 'scheduled' | 'live' | 'finished';
  round_name: string;
  prediction: UIPrediction | null;
  home_elo: number | null;
  away_elo: number | null;
}
