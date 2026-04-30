import type {
  ArchiveMatch,
  EraBucket,
  DataAvailability,
  TeamStrength,
  LeagueAverages,
  FeatureSnapshot,
  ModelPrediction,
  ModelEvaluation,
  ConfidenceGrade,
} from './types';

// ─── Era bucket ───────────────────────────────────────────────────────────────

export function getEraBucket(seasonYear: number, seasonLabel: string): EraBucket {
  // season_year in DB is the start year (e.g. 2017 for "2017-2018")
  if (seasonLabel === '2018-2019') return 'bridge_2018_2019';
  if (seasonLabel === '2019-2020') return 'covid_disrupted';
  if (seasonLabel === '2020-2021') return 'covid_limited_crowd';
  if (seasonYear <= 2017) return 'historical_basic';
  if (seasonYear >= 2021 && seasonYear <= 2024) return 'modern_basic';
  if (seasonYear >= 2025) return 'live_partial';
  return 'modern_basic';
}

// ─── Data availability ────────────────────────────────────────────────────────

export function getDataAvailability(m: ArchiveMatch): DataAvailability {
  const hasFtScore =
    m.home_score_ft !== null && m.away_score_ft !== null;
  const hasHtScore =
    m.home_score_ht !== null && m.away_score_ht !== null;
  const hasResult = m.result === 'H' || m.result === 'D' || m.result === 'A';
  const hasReferee = typeof m.referee === 'string' && m.referee.trim() !== '';
  const hasShotData =
    m.home_total_shots !== null || m.away_total_shots !== null;
  const hasShotsOnGoalData =
    m.home_shots_on_goal !== null || m.away_shots_on_goal !== null;
  const hasCornerData =
    m.home_corner_kicks !== null || m.away_corner_kicks !== null;
  const hasFoulData = m.home_fouls !== null || m.away_fouls !== null;
  const hasCardData =
    m.home_yellow_cards !== null ||
    m.away_yellow_cards !== null ||
    m.home_red_cards !== null ||
    m.away_red_cards !== null;
  const hasRedCardData =
    m.home_red_cards !== null || m.away_red_cards !== null;
  const hasCompleteBasicScoreData = hasFtScore && hasResult;
  const hasCompleteBasicStatData =
    hasShotData && hasCornerData && hasCardData;

  return {
    has_ft_score: hasFtScore,
    has_ht_score: hasHtScore,
    has_result: hasResult,
    has_referee: hasReferee,
    has_shot_data: hasShotData,
    has_shots_on_goal_data: hasShotsOnGoalData,
    has_corner_data: hasCornerData,
    has_foul_data: hasFoulData,
    has_card_data: hasCardData,
    has_red_card_data: hasRedCardData,
    has_complete_basic_score_data: hasCompleteBasicScoreData,
    has_complete_basic_stat_data: hasCompleteBasicStatData,
  };
}

// ─── League averages ──────────────────────────────────────────────────────────

export function calculateLeagueAverages(
  priorMatches: ArchiveMatch[],
  competitionId?: string,
): LeagueAverages {
  const scored = priorMatches.filter(
    (m) =>
      m.home_score_ft !== null &&
      m.away_score_ft !== null &&
      (!competitionId || m.competition_id === competitionId),
  );

  if (scored.length === 0) {
    return {
      sampleSize: 0,
      homeGoalAvg: 1.5,
      awayGoalAvg: 1.15,
      totalGoalAvg: 2.65,
      homeWinRate: 0.45,
      drawRate: 0.26,
      awayWinRate: 0.29,
      homeShotAvg: null,
      awayShotAvg: null,
    };
  }

  const totalHomeGoals = scored.reduce((s, m) => s + (m.home_score_ft ?? 0), 0);
  const totalAwayGoals = scored.reduce((s, m) => s + (m.away_score_ft ?? 0), 0);
  const homeWins = scored.filter((m) => m.result === 'H').length;
  const draws = scored.filter((m) => m.result === 'D').length;
  const awayWins = scored.filter((m) => m.result === 'A').length;

  const shotMatches = scored.filter(
    (m) => m.home_total_shots !== null && m.away_total_shots !== null,
  );
  const homeShotAvg =
    shotMatches.length > 0
      ? shotMatches.reduce((s, m) => s + (m.home_total_shots ?? 0), 0) /
        shotMatches.length
      : null;
  const awayShotAvg =
    shotMatches.length > 0
      ? shotMatches.reduce((s, m) => s + (m.away_total_shots ?? 0), 0) /
        shotMatches.length
      : null;

  const n = scored.length;
  return {
    sampleSize: n,
    homeGoalAvg: totalHomeGoals / n,
    awayGoalAvg: totalAwayGoals / n,
    totalGoalAvg: (totalHomeGoals + totalAwayGoals) / n,
    homeWinRate: homeWins / n,
    drawRate: draws / n,
    awayWinRate: awayWins / n,
    homeShotAvg,
    awayShotAvg,
  };
}

// ─── Team home/away strength (Bayesian shrinkage) ─────────────────────────────

export function calculateTeamHomeAwayStrength(
  teamId: string,
  priorMatches: ArchiveMatch[],
  leagueAvg: LeagueAverages,
  shrinkageWeight = 0.3,
): TeamStrength {
  const MIN_SAMPLE = 10;

  const homeMatches = priorMatches.filter(
    (m) =>
      m.home_team_id === teamId &&
      m.home_score_ft !== null &&
      m.away_score_ft !== null,
  );
  const awayMatches = priorMatches.filter(
    (m) =>
      m.away_team_id === teamId &&
      m.home_score_ft !== null &&
      m.away_score_ft !== null,
  );

  const allMatches = [...homeMatches, ...awayMatches];
  const sampleSize = allMatches.length;

  // Empirical Bayesian shrinkage: blend observed with league mean
  const shrink = (observed: number, prior: number, n: number): number => {
    if (n === 0) return prior;
    const w = Math.max(0, Math.min(1, n / (n + MIN_SAMPLE * shrinkageWeight * 10)));
    return w * observed + (1 - w) * prior;
  };

  // Home attack/defense raw (goals scored/conceded per game)
  const rawHomeAttack =
    homeMatches.length > 0
      ? homeMatches.reduce((s, m) => s + (m.home_score_ft ?? 0), 0) /
        homeMatches.length
      : leagueAvg.homeGoalAvg;
  const rawHomeDefense =
    homeMatches.length > 0
      ? homeMatches.reduce((s, m) => s + (m.away_score_ft ?? 0), 0) /
        homeMatches.length
      : leagueAvg.awayGoalAvg;

  const rawAwayAttack =
    awayMatches.length > 0
      ? awayMatches.reduce((s, m) => s + (m.away_score_ft ?? 0), 0) /
        awayMatches.length
      : leagueAvg.awayGoalAvg;
  const rawAwayDefense =
    awayMatches.length > 0
      ? awayMatches.reduce((s, m) => s + (m.home_score_ft ?? 0), 0) /
        awayMatches.length
      : leagueAvg.homeGoalAvg;

  const homeAttack = shrink(rawHomeAttack, leagueAvg.homeGoalAvg, homeMatches.length);
  const homeDefense = shrink(rawHomeDefense, leagueAvg.awayGoalAvg, homeMatches.length);
  const awayAttack = shrink(rawAwayAttack, leagueAvg.awayGoalAvg, awayMatches.length);
  const awayDefense = shrink(rawAwayDefense, leagueAvg.homeGoalAvg, awayMatches.length);

  // Goal rate per game overall
  const homeGoalRate =
    homeMatches.length > 0
      ? homeMatches.reduce((s, m) => s + (m.home_score_ft ?? 0), 0) / homeMatches.length
      : leagueAvg.homeGoalAvg;
  const awayGoalRate =
    awayMatches.length > 0
      ? awayMatches.reduce((s, m) => s + (m.away_score_ft ?? 0), 0) / awayMatches.length
      : leagueAvg.awayGoalAvg;

  // Shot rate (if available)
  const homeShotMatches = homeMatches.filter((m) => m.home_total_shots !== null);
  const awayShotMatches = awayMatches.filter((m) => m.away_total_shots !== null);
  const homeShotRate =
    homeShotMatches.length >= 5 && leagueAvg.homeShotAvg
      ? homeShotMatches.reduce((s, m) => s + (m.home_total_shots ?? 0), 0) /
        homeShotMatches.length
      : null;
  const awayShotRate =
    awayShotMatches.length >= 5 && leagueAvg.awayShotAvg
      ? awayShotMatches.reduce((s, m) => s + (m.away_total_shots ?? 0), 0) /
        awayShotMatches.length
      : null;

  // Recent form: last N games (all venues)
  const formLast5 = calculateRecentForm(teamId, priorMatches, 5);
  const formLast10 = calculateRecentForm(teamId, priorMatches, 10);

  return {
    teamId,
    sampleSize,
    homeAttack,
    homeDefense,
    awayAttack,
    awayDefense,
    homeShotRate,
    awayShotRate,
    homeGoalRate,
    awayGoalRate,
    formLast5,
    formLast10,
  };
}

// ─── Recent form (0-1 scale, 1=max wins) ─────────────────────────────────────

export function calculateRecentForm(
  teamId: string,
  priorMatches: ArchiveMatch[],
  n: number,
): number {
  const teamMatches = priorMatches
    .filter(
      (m) =>
        (m.home_team_id === teamId || m.away_team_id === teamId) &&
        m.result !== null,
    )
    .sort((a, b) => (a.match_date > b.match_date ? -1 : 1))
    .slice(0, n);

  if (teamMatches.length === 0) return 0.33;

  let points = 0;
  for (const m of teamMatches) {
    const isHome = m.home_team_id === teamId;
    if (
      (isHome && m.result === 'H') ||
      (!isHome && m.result === 'A')
    ) {
      points += 3;
    } else if (m.result === 'D') {
      points += 1;
    }
  }
  return points / (teamMatches.length * 3);
}

// ─── Attack index (internal, shot-count based) ────────────────────────────────

export function calculateAttackIndex(
  teamShotRate: number | null,
  leagueShotAvg: number | null,
  teamGoalRate: number,
  leagueGoalAvg: number,
): number {
  if (teamShotRate !== null && leagueShotAvg !== null && leagueShotAvg > 0) {
    return teamShotRate / leagueShotAvg;
  }
  if (leagueGoalAvg > 0) {
    return teamGoalRate / leagueGoalAvg;
  }
  return 1.0;
}

// ─── xG-lite internal (never expose publicly as "real xG") ───────────────────

export function calculateXgLiteInternal(
  attackIndex: number,
  teamGoalRate: number,
  leagueGoalAvg: number,
): number {
  if (leagueGoalAvg <= 0) return teamGoalRate;
  return attackIndex * leagueGoalAvg * 0.7 + teamGoalRate * 0.3;
}

// ─── Expected goals using Dixon-Coles style attack/defense ratio ──────────────

export function calculateExpectedGoals(
  attackingTeamAttack: number,
  defendingTeamDefense: number,
  leagueGoalAvg: number,
  homeAdvantage = 1.15,
  isHome = true,
): number {
  if (leagueGoalAvg <= 0) return 1.3;
  const attackStrength = attackingTeamAttack / leagueGoalAvg;
  const defenseWeakness = defendingTeamDefense / leagueGoalAvg;
  const base = leagueGoalAvg * attackStrength * defenseWeakness;
  return isHome ? base * homeAdvantage : base;
}

// ─── Poisson probability ──────────────────────────────────────────────────────

function poissonPmf(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 1; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

// ─── Score matrix + outcome derivations ───────────────────────────────────────

export function calculatePoissonMatrix(
  lambdaHome: number,
  lambdaAway: number,
  maxGoals = 6,
): number[][] {
  const matrix: number[][] = [];
  for (let h = 0; h <= maxGoals; h++) {
    matrix[h] = [];
    for (let a = 0; a <= maxGoals; a++) {
      matrix[h][a] = poissonPmf(lambdaHome, h) * poissonPmf(lambdaAway, a);
    }
  }
  return matrix;
}

export function deriveOutcomeProbabilities(
  matrix: number[][],
): { pHome: number; pDraw: number; pAway: number } {
  let pHome = 0;
  let pDraw = 0;
  let pAway = 0;
  const max = matrix.length - 1;
  for (let h = 0; h <= max; h++) {
    for (let a = 0; a <= max; a++) {
      const p = matrix[h][a];
      if (h > a) pHome += p;
      else if (h === a) pDraw += p;
      else pAway += p;
    }
  }
  // Normalize
  const total = pHome + pDraw + pAway;
  if (total <= 0) return { pHome: 0.45, pDraw: 0.26, pAway: 0.29 };
  return { pHome: pHome / total, pDraw: pDraw / total, pAway: pAway / total };
}

export function deriveOverUnderProbabilities(
  matrix: number[][],
): { pOver15: number; pOver25: number; pOver35: number } {
  let pOver15 = 0;
  let pOver25 = 0;
  let pOver35 = 0;
  const max = matrix.length - 1;
  for (let h = 0; h <= max; h++) {
    for (let a = 0; a <= max; a++) {
      const total = h + a;
      const p = matrix[h][a];
      if (total > 1.5) pOver15 += p;
      if (total > 2.5) pOver25 += p;
      if (total > 3.5) pOver35 += p;
    }
  }
  return { pOver15, pOver25, pOver35 };
}

export function deriveBttsProbability(matrix: number[][]): number {
  let pBtts = 0;
  const max = matrix.length - 1;
  for (let h = 1; h <= max; h++) {
    for (let a = 1; a <= max; a++) {
      pBtts += matrix[h][a];
    }
  }
  return pBtts;
}

// ─── Confidence ───────────────────────────────────────────────────────────────

export function calculateConfidenceScore(
  pHome: number,
  pDraw: number,
  pAway: number,
): number {
  const probs = [pHome, pDraw, pAway].sort((a, b) => b - a);
  return probs[0] - probs[1];
}

export function calculateConfidenceGrade(confidenceScore: number): ConfidenceGrade {
  if (confidenceScore >= 0.25) return 'A';
  if (confidenceScore >= 0.18) return 'B+';
  if (confidenceScore >= 0.12) return 'B';
  if (confidenceScore >= 0.07) return 'C';
  if (confidenceScore >= 0.03) return 'D';
  return 'F';
}

// ─── Scoring metrics ──────────────────────────────────────────────────────────

export function calculateBrier1x2(
  pHome: number,
  pDraw: number,
  pAway: number,
  actualResult: 'H' | 'D' | 'A',
): number {
  const oH = actualResult === 'H' ? 1 : 0;
  const oD = actualResult === 'D' ? 1 : 0;
  const oA = actualResult === 'A' ? 1 : 0;
  return (
    ((pHome - oH) ** 2 + (pDraw - oD) ** 2 + (pAway - oA) ** 2) / 3
  );
}

export function calculateLogLoss1x2(
  pHome: number,
  pDraw: number,
  pAway: number,
  actualResult: 'H' | 'D' | 'A',
): number {
  const eps = 1e-7;
  const pH = Math.max(eps, Math.min(1 - eps, pHome));
  const pD = Math.max(eps, Math.min(1 - eps, pDraw));
  const pA = Math.max(eps, Math.min(1 - eps, pAway));
  if (actualResult === 'H') return -Math.log(pH);
  if (actualResult === 'D') return -Math.log(pD);
  return -Math.log(pA);
}

// ─── Error categorization ─────────────────────────────────────────────────────

export function categorizeError(
  predicted: 'H' | 'D' | 'A',
  actual: 'H' | 'D' | 'A',
  confidenceGrade: ConfidenceGrade,
): { errorCategory: string; errorNotes: string; calibrationBucket: string } {
  if (predicted === actual) {
    return {
      errorCategory: 'correct',
      errorNotes: '',
      calibrationBucket: confidenceGrade,
    };
  }

  let errorCategory = 'wrong';
  let errorNotes = `Predicted ${predicted}, actual ${actual}`;

  if (predicted === 'H' && actual === 'A') errorCategory = 'home_overestimate';
  else if (predicted === 'A' && actual === 'H') errorCategory = 'away_overestimate';
  else if (predicted === 'H' && actual === 'D') errorCategory = 'draw_missed_home_bias';
  else if (predicted === 'A' && actual === 'D') errorCategory = 'draw_missed_away_bias';
  else if (predicted === 'D' && actual !== 'D') errorCategory = 'draw_overestimate';

  if ((confidenceGrade === 'A' || confidenceGrade === 'B+') && predicted !== actual) {
    errorCategory = 'high_confidence_wrong';
    errorNotes += ' (high confidence error)';
  }

  return {
    errorCategory,
    errorNotes,
    calibrationBucket: confidenceGrade,
  };
}

// ─── Main feature snapshot builder ───────────────────────────────────────────

export function buildHistoricalFeatureSnapshot(
  targetMatch: ArchiveMatch,
  priorMatches: ArchiveMatch[],
): FeatureSnapshot {
  const leagueAvg = calculateLeagueAverages(priorMatches, targetMatch.competition_id);
  const homeTeam = calculateTeamHomeAwayStrength(
    targetMatch.home_team_id,
    priorMatches,
    leagueAvg,
  );
  const awayTeam = calculateTeamHomeAwayStrength(
    targetMatch.away_team_id,
    priorMatches,
    leagueAvg,
  );
  const dataAvailability = getDataAvailability(targetMatch);

  // Expected goals: home uses home attack vs away defense
  const expectedHomeGoals = calculateExpectedGoals(
    homeTeam.homeAttack,
    awayTeam.awayDefense,
    leagueAvg.homeGoalAvg,
    1.15,
    true,
  );
  const expectedAwayGoals = calculateExpectedGoals(
    awayTeam.awayAttack,
    homeTeam.homeDefense,
    leagueAvg.awayGoalAvg,
    1.0,
    false,
  );

  const attackIndexHome = calculateAttackIndex(
    homeTeam.homeShotRate,
    leagueAvg.homeShotAvg,
    homeTeam.homeGoalRate,
    leagueAvg.homeGoalAvg,
  );
  const attackIndexAway = calculateAttackIndex(
    awayTeam.awayShotRate,
    leagueAvg.awayShotAvg,
    awayTeam.awayGoalRate,
    leagueAvg.awayGoalAvg,
  );
  const xgLiteInternalHome = calculateXgLiteInternal(
    attackIndexHome,
    homeTeam.homeGoalRate,
    leagueAvg.homeGoalAvg,
  );
  const xgLiteInternalAway = calculateXgLiteInternal(
    attackIndexAway,
    awayTeam.awayGoalRate,
    leagueAvg.awayGoalAvg,
  );

  return {
    cutoffDate: targetMatch.match_date,
    eraBucket: getEraBucket(targetMatch.season_year, targetMatch.season_label),
    leagueAverages: leagueAvg,
    homeTeam,
    awayTeam,
    dataAvailability,
    expectedHomeGoals,
    expectedAwayGoals,
    attackIndexHome,
    attackIndexAway,
    xgLiteInternalHome,
    xgLiteInternalAway,
  };
}

// ─── Full prediction builder ──────────────────────────────────────────────────

export function buildPrediction(
  targetMatch: ArchiveMatch,
  priorMatches: ArchiveMatch[],
  trainedUntilDate: string,
): ModelPrediction {
  const snapshot = buildHistoricalFeatureSnapshot(targetMatch, priorMatches);
  const matrix = calculatePoissonMatrix(
    snapshot.expectedHomeGoals,
    snapshot.expectedAwayGoals,
  );
  const { pHome, pDraw, pAway } = deriveOutcomeProbabilities(matrix);
  const { pOver15, pOver25, pOver35 } = deriveOverUnderProbabilities(matrix);
  const pBtts = deriveBttsProbability(matrix);

  const probArr: [number, 'H' | 'D' | 'A'][] = [
    [pHome, 'H'],
    [pDraw, 'D'],
    [pAway, 'A'],
  ];
  const predicted = probArr.sort((a, b) => b[0] - a[0])[0][1];
  const confidenceScore = calculateConfidenceScore(pHome, pDraw, pAway);
  const confidenceGrade = calculateConfidenceGrade(confidenceScore);

  const decisionSummary = [
    `${targetMatch.home_team_name} - ${targetMatch.away_team_name}`,
    `Tahmini: ${predicted} (${(Math.max(pHome, pDraw, pAway) * 100).toFixed(1)}%)`,
    `Güven: ${confidenceGrade} (${(confidenceScore * 100).toFixed(1)}%)`,
    `Beklenen gol: ${snapshot.expectedHomeGoals.toFixed(2)} - ${snapshot.expectedAwayGoals.toFixed(2)}`,
    `2.5 üst: ${(pOver25 * 100).toFixed(1)}%`,
  ].join(' | ');

  return {
    matchId: targetMatch.match_id,
    matchDate: targetMatch.match_date,
    featureCutoffDate: targetMatch.match_date,
    trainedUntilDate,
    eraBucket: snapshot.eraBucket,
    pHome,
    pDraw,
    pAway,
    expectedHomeGoals: snapshot.expectedHomeGoals,
    expectedAwayGoals: snapshot.expectedAwayGoals,
    pOver15,
    pOver25,
    pOver35,
    pBtts,
    attackIndexHome: snapshot.attackIndexHome,
    attackIndexAway: snapshot.attackIndexAway,
    xgLiteInternalHome: snapshot.xgLiteInternalHome,
    xgLiteInternalAway: snapshot.xgLiteInternalAway,
    predictedResult: predicted,
    confidenceScore,
    confidenceGrade,
    decisionSummary,
    featureSnapshot: snapshot,
    modelDebug: {
      matrixSize: matrix.length,
      leagueSampleSize: snapshot.leagueAverages.sampleSize,
      homeTeamSampleSize: snapshot.homeTeam.sampleSize,
      awayTeamSampleSize: snapshot.awayTeam.sampleSize,
      priorMatchesUsed: priorMatches.length,
    },
  };
}

// ─── Evaluation builder ───────────────────────────────────────────────────────

export function buildEvaluation(
  predictionId: string,
  prediction: ModelPrediction,
  actual: ArchiveMatch,
): ModelEvaluation | null {
  if (
    !actual.has_ft_score ||
    actual.result === null ||
    actual.home_score_ft === null ||
    actual.away_score_ft === null
  ) {
    return null;
  }

  const actualResult = actual.result as 'H' | 'D' | 'A';
  const actualTotalGoals = (actual.home_score_ft ?? 0) + (actual.away_score_ft ?? 0);
  const actualBtts =
    (actual.home_score_ft ?? 0) > 0 && (actual.away_score_ft ?? 0) > 0;
  const actualOver15 = actualTotalGoals > 1.5;
  const actualOver25 = actualTotalGoals > 2.5;
  const actualOver35 = actualTotalGoals > 3.5;

  const brier1x2 = calculateBrier1x2(
    prediction.pHome,
    prediction.pDraw,
    prediction.pAway,
    actualResult,
  );
  const logLoss1x2 = calculateLogLoss1x2(
    prediction.pHome,
    prediction.pDraw,
    prediction.pAway,
    actualResult,
  );

  const { errorCategory, errorNotes, calibrationBucket } = categorizeError(
    prediction.predictedResult,
    actualResult,
    prediction.confidenceGrade,
  );

  return {
    predictionId,
    matchId: actual.match_id,
    actualResult,
    actualHomeScore: actual.home_score_ft,
    actualAwayScore: actual.away_score_ft,
    actualTotalGoals,
    actualBtts,
    actualOver15,
    actualOver25,
    actualOver35,
    predictedResult: prediction.predictedResult,
    isResultCorrect: prediction.predictedResult === actualResult,
    brier1x2,
    logLoss1x2,
    over15Correct: prediction.pOver15 > 0.5 === actualOver15,
    over25Correct: prediction.pOver25 > 0.5 === actualOver25,
    over35Correct: prediction.pOver35 > 0.5 === actualOver35,
    bttsCorrect: prediction.pBtts > 0.5 === actualBtts,
    errorCategory,
    errorNotes,
    calibrationBucket,
  };
}
