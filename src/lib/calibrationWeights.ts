export type CalibrationQualityBucket =
  | 'NORMAL'
  | 'HIGH_DATA_GAP'
  | 'POST_LINEUP_ENRICHED';

export interface DataQualityContext {
  has_official_lineup: boolean;
  has_referee: boolean;
  has_player_event_stats: boolean;
  projected_stats_confidence: number;
  internal_signal_available: boolean;
}

export interface CalibrationWeights {
  quality_bucket: CalibrationQualityBucket;
  base_model_weight: number;
  internal_signal_weight: number;
  public_label: string;
}

export function determineCalibrationWeights(ctx: DataQualityContext): CalibrationWeights {
  if (ctx.has_official_lineup && ctx.has_referee && ctx.has_player_event_stats) {
    return {
      quality_bucket: 'POST_LINEUP_ENRICHED',
      base_model_weight: 0.85,
      internal_signal_weight: 0.15,
      public_label: 'Next59 Kalibre Model Tahmini',
    };
  }
  if (
    !ctx.has_official_lineup ||
    !ctx.has_referee ||
    !ctx.has_player_event_stats ||
    ctx.projected_stats_confidence < 0.5
  ) {
    return {
      quality_bucket: 'HIGH_DATA_GAP',
      base_model_weight: 0.70,
      internal_signal_weight: 0.30,
      public_label: 'Next59 Kalibre Model Tahmini',
    };
  }
  return {
    quality_bucket: 'NORMAL',
    base_model_weight: 0.80,
    internal_signal_weight: 0.20,
    public_label: 'Next59 Kalibre Model Tahmini',
  };
}

export function applyCalibrationBlend(
  baseHome: number,
  baseDraw: number,
  baseAway: number,
  signalHome: number,
  signalDraw: number,
  signalAway: number,
  weights: CalibrationWeights,
): { calibrated_home_pct: number; calibrated_draw_pct: number; calibrated_away_pct: number } {
  const bw = weights.base_model_weight;
  const sw = weights.internal_signal_weight;

  let h = baseHome * bw + signalHome * sw;
  let d = baseDraw * bw + signalDraw * sw;
  let a = baseAway * bw + signalAway * sw;

  const sum = h + d + a;
  if (sum > 0 && Math.abs(sum - 1) > 0.0001) {
    h = h / sum;
    d = d / sum;
    a = a / sum;
  }

  return {
    calibrated_home_pct: parseFloat((h * 100).toFixed(4)),
    calibrated_draw_pct: parseFloat((d * 100).toFixed(4)),
    calibrated_away_pct: parseFloat((a * 100).toFixed(4)),
  };
}
