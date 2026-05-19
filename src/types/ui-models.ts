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
  ht_home_prob: number;
  ht_draw_prob: number;
  ht_away_prob: number;
  over_2_5: number;
  btts: number;
  confidence: number;
  high_scoring: number;
  mutual_scoring: number;
  xg_home: number | null;
  xg_away: number | null;
  predicted_score: string | null;
  predicted_score_ht: string | null;
  elo_home: number | null;
  elo_away: number | null;
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
  has_new_prediction: boolean;
}
