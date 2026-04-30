interface PredictionInput {
  home_prob: number;
  draw_prob: number;
  away_prob: number;
  confidence: number;
}

export function generateNarrativePreview(
  prediction: PredictionInput | null,
  homeName: string,
  awayName: string,
): string {
  if (!prediction) return 'Analiz yak\u0131nda eklenecektir.';

  const { home_prob, draw_prob, away_prob, confidence } = prediction;
  const parts: string[] = [];

  if (home_prob > 0.55) {
    parts.push(`${homeName} veri setinde \u00fcst\u00fcnl\u00fck g\u00f6steriyor.`);
  } else if (away_prob > 0.55) {
    parts.push(`${awayName} veri setinde g\u00fc\u00e7l\u00fc g\u00f6r\u00fcn\u00fcyor.`);
  } else if (draw_prob > 0.35) {
    parts.push('Dengeli bir m\u00fccadele \u00f6ng\u00f6r\u00fcl\u00fcyor.');
  } else if (home_prob > away_prob) {
    parts.push(`${homeName} hafif avantajl\u0131 g\u00f6r\u00fcn\u00fcyor.`);
  } else if (away_prob > home_prob) {
    parts.push(`${awayName} \u00f6ne \u00e7\u0131k\u0131yor.`);
  } else {
    parts.push('Dengeli bir m\u00fccadele bekleniyor.');
  }

  if (parts.length < 2) {
    if (confidence > 0.8) {
      parts.push('Y\u00fcksek g\u00fcvenilirlik.');
    } else if (confidence < 0.5) {
      parts.push('S\u0131n\u0131rl\u0131 veri seti ile haz\u0131rlanm\u0131\u015ft\u0131r.');
    }
  }

  return parts.join(' ');
}

const confidenceMap: Record<string, number> = {
  very_high: 0.95,
  high: 0.8,
  medium: 0.6,
  low: 0.4,
  very_low: 0.2,
};

export function labelToConfidence(label: string): number {
  return confidenceMap[label] ?? 0.6;
}
