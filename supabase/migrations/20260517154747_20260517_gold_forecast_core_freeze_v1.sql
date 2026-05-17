/*
  # Gold Forecast Core Freeze — Version Lock Table

  ## Purpose
  Creates a locked record of the production candidate stack for the Gold Forecast Core.
  This table is append-only. A new row is inserted for each freeze event.
  The active freeze is the one with is_active = true.

  ## Frozen Stack (Gold Replay V1)
  - ELO version:      elo_v2_ha0_k20_global
  - Feature matrix:   features_v2_domestic_2026_05
  - Formula:          formula_v2_draw_recalibrated
  - Replay behavior:  chronological, no leakage, COVID freeze active,
                      league-specific draw priors, confidence compression active

  ## Behavior Rules
  - is_active = true: this stack is used for all new replay runs and live predictions
  - Do not modify formula parameters after activation
  - New freeze requires explicit insert + deactivate previous
*/

CREATE TABLE IF NOT EXISTS model_lab.gold_forecast_core_freeze (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  freeze_label          text NOT NULL,
  elo_version           text NOT NULL,
  feature_version       text NOT NULL,
  prediction_formula    text NOT NULL,
  draw_prior_source     text NOT NULL DEFAULT 'league_draw_priors',
  chronological_only    boolean NOT NULL DEFAULT true,
  covid_freeze_active   boolean NOT NULL DEFAULT true,
  covid_freeze_start    date NOT NULL DEFAULT '2020-03-01',
  covid_freeze_end      date NOT NULL DEFAULT '2021-08-31',
  confidence_compression_active boolean NOT NULL DEFAULT true,
  notes                 text,
  is_active             boolean NOT NULL DEFAULT false,
  frozen_at             timestamptz NOT NULL DEFAULT now(),
  frozen_by             text NOT NULL DEFAULT 'system'
);

-- Prevent multiple active freezes
CREATE UNIQUE INDEX IF NOT EXISTS idx_gold_freeze_single_active
  ON model_lab.gold_forecast_core_freeze (is_active)
  WHERE is_active = true;

-- Insert the Gold Replay V1 freeze
INSERT INTO model_lab.gold_forecast_core_freeze (
  freeze_label,
  elo_version,
  feature_version,
  prediction_formula,
  draw_prior_source,
  chronological_only,
  covid_freeze_active,
  covid_freeze_start,
  covid_freeze_end,
  confidence_compression_active,
  notes,
  is_active,
  frozen_by
) VALUES (
  'gold_replay_v1',
  'elo_v2_ha0_k20_global',
  'features_v2_domestic_2026_05',
  'formula_v2_draw_recalibrated',
  'league_draw_priors',
  true,
  true,
  '2020-03-01',
  '2021-08-31',
  true,
  'Initial production candidate stack. ELO V2 with home advantage 0, K=20. Feature matrix V2 domestic coverage. Draw V2 with league-specific priors and closeness sensitivity, bounded [0.10, 0.32]. Bundesliga 2019-2020 pilot validated.',
  true,
  'admin'
);

-- RPC to get the active freeze
CREATE OR REPLACE FUNCTION model_lab.get_active_gold_freeze()
RETURNS model_lab.gold_forecast_core_freeze
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT * FROM model_lab.gold_forecast_core_freeze WHERE is_active = true LIMIT 1;
$$;

-- Expose to public schema for admin pages
GRANT SELECT ON model_lab.gold_forecast_core_freeze TO authenticated;
GRANT EXECUTE ON FUNCTION model_lab.get_active_gold_freeze() TO authenticated;
