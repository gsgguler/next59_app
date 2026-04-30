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

function transformPredictions(predictions: DbPrediction[]): UIPrediction | null {
  if (!predictions || predictions.length === 0) return null;

  const resultPred = predictions.find(p => p.prediction_type === 'match_result');
  if (!resultPred) return null;

  const explanation = resultPred.explanation_json ?? {};
  const homeProb = (explanation as Record<string, number>).home_prob ?? resultPred.confidence;
  const drawProb = (explanation as Record<string, number>).draw_prob ?? 0.33;
  const awayProb = (explanation as Record<string, number>).away_prob ?? (1 - homeProb - drawProb);

  const goalPred = predictions.find(p => p.prediction_type === 'over_under');
  const bttsPred = predictions.find(p => p.prediction_type === 'btts');

  return {
    home_prob: homeProb,
    draw_prob: drawProb,
    away_prob: Math.max(0, awayProb),
    confidence: resultPred.confidence,
    high_scoring: goalPred ? goalPred.confidence : 0.5,
    mutual_scoring: bttsPred ? bttsPred.confidence : 0.5,
  };
}

function buildKickoffAt(raw: DbMatch): string {
  if (raw.match_time) {
    return `${raw.match_date}T${raw.match_time}`;
  }
  return raw.match_date;
}

export function transformMatch(
  raw: DbMatch,
  predictions: DbPrediction[],
): UIMatch {
  return {
    id: raw.id,
    home_team: transformTeam(raw.home_team),
    away_team: transformTeam(raw.away_team),
    kickoff_at: buildKickoffAt(raw),
    stadium: transformVenue(raw.venue),
    status: STATUS_MAP[(raw.status_short ?? 'ns').toLowerCase()] ?? 'scheduled',
    round_name: raw.round ?? '',
    prediction: transformPredictions(predictions),
    home_elo: null,
    away_elo: null,
  };
}
