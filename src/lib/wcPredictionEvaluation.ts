export type WcOutcome = "home" | "draw" | "away";

export function getActualOutcome(
  homeScore: number,
  awayScore: number,
): WcOutcome {
  if (homeScore > awayScore) return "home";
  if (awayScore > homeScore) return "away";
  return "draw";
}

export function getPredictedOutcomeFromProbabilities(
  homeProbability: number | null | undefined,
  drawProbability: number | null | undefined,
  awayProbability: number | null | undefined,
): WcOutcome | null {
  const values = [
    { outcome: "home" as const, value: Number(homeProbability) },
    { outcome: "draw" as const, value: Number(drawProbability) },
    { outcome: "away" as const, value: Number(awayProbability) },
  ];

  if (values.some(({ value }) => !Number.isFinite(value))) return null;

  const maxValue = Math.max(...values.map(({ value }) => value));
  const leaders = values.filter(
    ({ value }) => Math.abs(value - maxValue) < 0.000000001,
  );

  return leaders.length === 1 ? leaders[0].outcome : null;
}

export function getOutcomeLabel(
  outcome: WcOutcome | null,
  homeTeamName: string,
  awayTeamName: string,
): string {
  if (outcome === "home") return `${homeTeamName} galibiyeti`;
  if (outcome === "away") return `${awayTeamName} galibiyeti`;
  if (outcome === "draw") return "Beraberlik";
  return "Net favori yok";
}

export function probabilityToPercent(
  probability: number | string | null | undefined,
): number | null {
  if (probability == null) return null;
  const numeric = Number(probability);
  if (!Number.isFinite(numeric)) return null;
  return Math.round((numeric <= 1 ? numeric * 100 : numeric) * 10) / 10;
}
