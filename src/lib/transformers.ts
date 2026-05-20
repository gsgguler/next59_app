import type { DbMatch, DbTeam, DbVenue, DbPrediction } from '../types/schema';
import type { UIMatch, UITeam, UIStadium, UIPrediction } from '../types/ui-models';

const STATUS_MAP: Record<string, UIMatch['status']> = {
  ns: 'scheduled',
  tbd: 'scheduled',
  pst: 'scheduled',
  '1h': 'live',
  ht: 'live',
  '2h': 'live',
  et: 'live',
  bt: 'live',
  p: 'live',
  susp: 'live',
  int: 'live',
  live: 'live',
  ft: 'finished',
  aet: 'finished',
  pen: 'finished',
  aw: 'finished',
  abd: 'finished',
  wo: 'finished',
  canc: 'finished',
};

function transformTeam(raw: DbTeam): UITeam {
  const name = raw?.name ?? 'Bilinmiyor';
  return {
    id: raw?.id ?? '',
    name,
    short_name: raw?.short_name ?? raw?.code ?? name,
    country_code: raw?.code ?? '',
    fifa_code: raw?.code ?? '',
  };
}

function transformVenue(raw: DbVenue | null): UIStadium | null {
  if (!raw) return null;
  return { name: raw.name, city: raw.city };
}

// New prediction shape from model_lab.prematch_prediction_drafts via get_match_prediction RPC
interface NewPrediction {
  p_home: number;
  p_draw: number;
  p_away: number;
  p_ht_home: number | null;
  p_ht_draw: number | null;
  p_ht_away: number | null;
  over_2_5: number | null;
  btts: number | null;
  expected_goals_home: number | null;
  expected_goals_away: number | null;
  predicted_score: string | null;
  predicted_score_ht: string | null;
  confidence_score: number;
  pre_match_elo_home: number | null;
  pre_match_elo_away: number | null;
}

function transformNewPrediction(data: NewPrediction): UIPrediction {
  const over25 = data.over_2_5 ?? 0.5;
  const btts   = data.btts ?? 0.5;
  return {
    home_prob:          data.p_home,
    draw_prob:          data.p_draw,
    away_prob:          data.p_away,
    ht_home_prob:       data.p_ht_home ?? null,
    ht_draw_prob:       data.p_ht_draw ?? null,
    ht_away_prob:       data.p_ht_away ?? null,
    over_2_5:           over25,
    btts,
    confidence:         data.confidence_score,
    high_scoring:       over25,
    mutual_scoring:     btts,
    xg_home:            data.expected_goals_home,
    xg_away:            data.expected_goals_away,
    predicted_score:    data.predicted_score,
    predicted_score_ht: data.predicted_score_ht,
    elo_home:           data.pre_match_elo_home,
    elo_away:           data.pre_match_elo_away,
  };
}

function transformLegacyPredictions(predictions: DbPrediction[]): UIPrediction | null {
  if (!predictions || predictions.length === 0) return null;

  const resultPred = predictions.find(p => p.prediction_type === 'match_result');
  if (!resultPred) return null;

  const explanation = resultPred.explanation_json ?? {};
  const homeProb = (explanation as Record<string, number>).home_prob ?? resultPred.confidence;
  const drawProb = (explanation as Record<string, number>).draw_prob ?? 0.33;
  const awayProb = (explanation as Record<string, number>).away_prob ?? (1 - homeProb - drawProb);

  const goalPred = predictions.find(p => p.prediction_type === 'over_under');
  const bttsPred = predictions.find(p => p.prediction_type === 'btts');
  const over25   = goalPred ? goalPred.confidence : 0.5;
  const btts     = bttsPred ? bttsPred.confidence : 0.5;

  return {
    home_prob:          homeProb,
    draw_prob:          drawProb,
    away_prob:          Math.max(0, awayProb),
    ht_home_prob:       null,
    ht_draw_prob:       null,
    ht_away_prob:       null,
    over_2_5:           over25,
    btts,
    confidence:         resultPred.confidence,
    high_scoring:       over25,
    mutual_scoring:     btts,
    xg_home:            null,
    xg_away:            null,
    predicted_score:    null,
    predicted_score_ht: null,
    elo_home:           null,
    elo_away:           null,
  };
}

function buildKickoffAt(raw: DbMatch): string {
  if (raw.match_time) {
    return `${raw.match_date}T${raw.match_time}:00+03:00`;
  }
  return `${raw.match_date}T00:00:00+03:00`;
}

export function transformMatch(
  raw: DbMatch,
  predictions: DbPrediction[],
  newPredData?: NewPrediction | null,
): UIMatch {
  // Prefer new prediction system over legacy
  let prediction: UIPrediction | null = null;
  let hasNewPrediction = false;

  if (newPredData && newPredData.p_home != null) {
    prediction = transformNewPrediction(newPredData);
    hasNewPrediction = true;
  } else {
    prediction = transformLegacyPredictions(predictions);
  }

  const eloHome = newPredData?.pre_match_elo_home ?? null;
  const eloAway = newPredData?.pre_match_elo_away ?? null;

  return {
    id: raw.id,
    home_team: transformTeam(raw.home_team),
    away_team: transformTeam(raw.away_team),
    kickoff_at: buildKickoffAt(raw),
    stadium: transformVenue(raw.venue),
    status: STATUS_MAP[(raw.status_short ?? 'ns').toLowerCase()] ?? 'scheduled',
    round_name: raw.round ?? '',
    prediction,
    home_elo: eloHome,
    away_elo: eloAway,
    has_new_prediction: hasNewPrediction,
  };
}
