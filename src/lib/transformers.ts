import type { DbMatch, DbTeam, DbTeamStrength, DbPrediction } from '../types/schema';
import type { UIMatch, UITeam, UIStadium, UIPrediction } from '../types/ui-models';
import { labelToConfidence } from '../utils/narrativeEngine';

const STATUS_MAP: Record<string, UIMatch['status']> = {
  scheduled: 'scheduled',
  timed: 'scheduled',
  in_play: 'live',
  live: 'live',
  paused: 'live',
  finished: 'finished',
  awarded: 'finished',
  postponed: 'scheduled',
  cancelled: 'finished',
  suspended: 'scheduled',
};

function transformTeam(raw: DbTeam): UITeam {
  const name = raw?.name ?? 'Bilinmiyor';
  return {
    id: raw?.id ?? '',
    name,
    short_name: raw?.short_name ?? raw?.tla ?? name,
    country_code: raw?.country_code ?? 'TR',
    fifa_code: raw?.fifa_code ?? raw?.tla ?? raw?.country_code ?? 'TR',
  };
}

function transformStadium(raw: { name: string; city: string } | null): UIStadium | null {
  if (!raw) return null;
  return { name: raw.name, city: raw.city };
}

function transformPredictions(predictions: DbPrediction[]): UIPrediction | null {
  if (!predictions || predictions.length === 0) return null;

  const resultPred = predictions.find(p => p.category === 'result');
  const goalPred = predictions.find(p => p.category === 'goals');
  const mutualPred = predictions.find(p => p.category === 'mutual_scoring');

  if (!resultPred) return null;

  const output = resultPred.model_output_raw ?? {};
  const homeProb = (output as Record<string, number>).home_prob ?? resultPred.probability;
  const drawProb = (output as Record<string, number>).draw_prob ?? 0.33;
  const awayProb = (output as Record<string, number>).away_prob ?? (1 - homeProb - drawProb);

  return {
    home_prob: homeProb,
    draw_prob: drawProb,
    away_prob: Math.max(0, awayProb),
    confidence: labelToConfidence(resultPred.confidence_label),
    high_scoring: goalPred ? goalPred.probability : 0.5,
    mutual_scoring: mutualPred ? mutualPred.probability : 0.5,
  };
}

export function transformMatch(
  raw: DbMatch,
  homeStrength: DbTeamStrength | null,
  awayStrength: DbTeamStrength | null,
  predictions: DbPrediction[],
): UIMatch {
  return {
    id: raw.id,
    home_team: transformTeam(raw.home_team),
    away_team: transformTeam(raw.away_team),
    kickoff_at: raw.kickoff_at,
    stadium: transformStadium(raw.stadium),
    status: STATUS_MAP[raw.status.toLowerCase()] ?? 'scheduled',
    round_name: raw.round_name ?? '',
    prediction: transformPredictions(predictions),
    home_elo: homeStrength?.elo_rating ?? null,
    away_elo: awayStrength?.elo_rating ?? null,
  };
}

export function transformMockToUI(mockData: {
  id: string;
  home_team: { id: string; name: string; short_name: string; country_code: string; fifa_code: string };
  away_team: { id: string; name: string; short_name: string; country_code: string; fifa_code: string };
  kickoff_at: string;
  stadium: { name: string; city: string } | null;
  status: string;
  round_name: string;
  prediction: {
    home_prob: number;
    draw_prob: number;
    away_prob: number;
    confidence: number;
    over_2_5?: number;
    btts?: number;
    high_scoring?: number;
    mutual_scoring?: number;
  } | null;
  home_elo: number | null;
  away_elo: number | null;
}): UIMatch {
  const pred = mockData.prediction;
  return {
    id: mockData.id,
    home_team: mockData.home_team,
    away_team: mockData.away_team,
    kickoff_at: mockData.kickoff_at,
    stadium: mockData.stadium,
    status: (STATUS_MAP[mockData.status] ?? 'scheduled') as UIMatch['status'],
    round_name: mockData.round_name,
    prediction: pred
      ? {
          home_prob: pred.home_prob,
          draw_prob: pred.draw_prob,
          away_prob: pred.away_prob,
          confidence: pred.confidence,
          high_scoring: pred.high_scoring ?? pred.over_2_5 ?? 0.5,
          mutual_scoring: pred.mutual_scoring ?? pred.btts ?? 0.5,
        }
      : null,
    home_elo: mockData.home_elo,
    away_elo: mockData.away_elo,
  };
}
