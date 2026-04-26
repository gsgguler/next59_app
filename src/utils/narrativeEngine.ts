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
  if (!prediction) return 'Analiz yakinda eklenecektir.';

  const { home_prob, draw_prob, away_prob, confidence } = prediction;
  const parts: string[] = [];

  if (home_prob > 0.55) {
    parts.push(`${homeName} veri setinde ustunluk gosteriyor.`);
  } else if (away_prob > 0.55) {
    parts.push(`${awayName} veri setinde guclu gorunuyor.`);
  } else if (draw_prob > 0.35) {
    parts.push('Dengeli bir mucadele ongoruluyor.');
  } else if (home_prob > away_prob) {
    parts.push(`${homeName} hafif avantajli gorunuyor.`);
  } else if (away_prob > home_prob) {
    parts.push(`${awayName} one cikiyor.`);
  } else {
    parts.push('Dengeli bir mucadele bekleniyor.');
  }

  if (parts.length < 2) {
    if (confidence > 0.8) {
      parts.push('Yuksek guvenilirlik.');
    } else if (confidence < 0.5) {
      parts.push('Sinirli veri seti ile hazirlanmistir.');
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
