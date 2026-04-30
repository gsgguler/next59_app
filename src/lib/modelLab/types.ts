// ─── Source match shape from v_historical_match_archive ──────────────────────

export interface ArchiveMatch {
  match_id: string;
  match_date: string;
  season_year: number;
  season_label: string;
  season_id: string;
  competition_id: string;
  competition_name: string;
  home_team_id: string;
  home_team_name: string;
  away_team_id: string;
  away_team_name: string;
  home_score_ft: number | null;
  away_score_ft: number | null;
  home_score_ht: number | null;
  away_score_ht: number | null;
  result: 'H' | 'D' | 'A' | null;
  result_label: string | null;
  total_goals_ft: number | null;
  referee: string | null;
  attendance: number | null;
  home_total_shots: number | null;
  away_total_shots: number | null;
  home_shots_on_goal: number | null;
  away_shots_on_goal: number | null;
  home_shots_off_goal: number | null;
  away_shots_off_goal: number | null;
  home_corner_kicks: number | null;
  away_corner_kicks: number | null;
  home_fouls: number | null;
  away_fouls: number | null;
  home_yellow_cards: number | null;
  away_yellow_cards: number | null;
  home_red_cards: number | null;
  away_red_cards: number | null;
  has_ft_score: boolean;
  has_shot_data: boolean;
  has_corner_data: boolean;
  has_card_data: boolean;
}

// ─── Era buckets ──────────────────────────────────────────────────────────────

export type EraBucket =
  | 'historical_basic'
  | 'bridge_2018_2019'
  | 'covid_disrupted'
  | 'covid_limited_crowd'
  | 'modern_basic'
  | 'live_partial';

// ─── Data availability flags ──────────────────────────────────────────────────

export interface DataAvailability {
  has_ft_score: boolean;
  has_ht_score: boolean;
  has_result: boolean;
  has_referee: boolean;
  has_shot_data: boolean;
  has_shots_on_goal_data: boolean;
  has_corner_data: boolean;
  has_foul_data: boolean;
  has_card_data: boolean;
  has_red_card_data: boolean;
  has_complete_basic_score_data: boolean;
  has_complete_basic_stat_data: boolean;
}

// ─── Team strength snapshot ───────────────────────────────────────────────────

export interface TeamStrength {
  teamId: string;
  sampleSize: number;
  homeAttack: number;
  homeDefense: number;
  awayAttack: number;
  awayDefense: number;
  homeShotRate: number | null;
  awayShotRate: number | null;
  homeGoalRate: number;
  awayGoalRate: number;
  formLast5: number;
  formLast10: number;
}

// ─── League averages ──────────────────────────────────────────────────────────

export interface LeagueAverages {
  sampleSize: number;
  homeGoalAvg: number;
  awayGoalAvg: number;
  totalGoalAvg: number;
  homeWinRate: number;
  drawRate: number;
  awayWinRate: number;
  homeShotAvg: number | null;
  awayShotAvg: number | null;
}

// ─── Feature snapshot ─────────────────────────────────────────────────────────

export interface FeatureSnapshot {
  cutoffDate: string;
  eraBucket: EraBucket;
  leagueAverages: LeagueAverages;
  homeTeam: TeamStrength;
  awayTeam: TeamStrength;
  dataAvailability: DataAvailability;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  attackIndexHome: number;
  attackIndexAway: number;
  xgLiteInternalHome: number;
  xgLiteInternalAway: number;
}

// ─── Prediction output ────────────────────────────────────────────────────────

export type ConfidenceGrade = 'A' | 'B+' | 'B' | 'C' | 'D' | 'F';

export interface ModelPrediction {
  matchId: string;
  matchDate: string;
  featureCutoffDate: string;
  trainedUntilDate: string;
  eraBucket: EraBucket;
  pHome: number;
  pDraw: number;
  pAway: number;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  pOver15: number;
  pOver25: number;
  pOver35: number;
  pBtts: number;
  attackIndexHome: number;
  attackIndexAway: number;
  xgLiteInternalHome: number;
  xgLiteInternalAway: number;
  predictedResult: 'H' | 'D' | 'A';
  confidenceScore: number;
  confidenceGrade: ConfidenceGrade;
  decisionSummary: string;
  featureSnapshot: FeatureSnapshot;
  modelDebug: Record<string, unknown>;
}

// ─── Evaluation output ────────────────────────────────────────────────────────

export interface ModelEvaluation {
  predictionId: string;
  matchId: string;
  actualResult: 'H' | 'D' | 'A';
  actualHomeScore: number;
  actualAwayScore: number;
  actualTotalGoals: number;
  actualBtts: boolean;
  actualOver15: boolean;
  actualOver25: boolean;
  actualOver35: boolean;
  predictedResult: 'H' | 'D' | 'A';
  isResultCorrect: boolean;
  brier1x2: number;
  logLoss1x2: number;
  over15Correct: boolean;
  over25Correct: boolean;
  over35Correct: boolean;
  bttsCorrect: boolean;
  errorCategory: string;
  errorNotes: string;
  calibrationBucket: string;
}
