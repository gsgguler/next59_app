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
  if (!prediction) return 'Analiz yakında eklenecektir.';

  const { home_prob, draw_prob, away_prob, confidence } = prediction;
  const parts: string[] = [];

  if (home_prob > 0.55) {
    parts.push(`${homeName} veri setinde üstünlük gösteriyor.`);
  } else if (away_prob > 0.55) {
    parts.push(`${awayName} veri setinde güçlü görünüyor.`);
  } else if (draw_prob > 0.35) {
    parts.push('Dengeli bir mücadele öngörülüyor.');
  } else if (home_prob > away_prob) {
    parts.push(`${homeName} hafif avantajlı görünüyor.`);
  } else if (away_prob > home_prob) {
    parts.push(`${awayName} öne çıkıyor.`);
  } else {
    parts.push('Dengeli bir mücadele bekleniyor.');
  }

  if (parts.length < 2) {
    if (confidence > 0.8) {
      parts.push('Yüksek güvenilirlik.');
    } else if (confidence < 0.5) {
      parts.push('Sınırlı veri seti ile hazırlanmıştır.');
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
