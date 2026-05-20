import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface ActiveModelStack {
  freeze_label: string;
  elo_version: string;
  feature_version: string;
  prediction_formula: string;
  calibration_version: string | null;
  scenario_version: string | null;
  narrative_policy_version: string | null;
  wc2026_calibration_version: string | null;
  frozen_at: string;
  notes: string | null;
}

interface UseActiveModelStackResult {
  stack: ActiveModelStack | null;
  loading: boolean;
  error: string | null;
}

export function useActiveModelStack(): UseActiveModelStackResult {
  const [stack, setStack] = useState<ActiveModelStack | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc('get_active_model_stack').then(({ data, error: err }) => {
      if (err) {
        setError(err.message);
      } else {
        setStack((data as ActiveModelStack) ?? null);
      }
      setLoading(false);
    });
  }, []);

  return { stack, loading, error };
}
