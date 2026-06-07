import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface WcScenarioData {
  id: string;
  calibration_run_id: string;
  api_football_fixture_id: number;
  home_team_name: string;
  away_team_name: string;
  stage_code: string;
  group_label: string | null;
  home_team_strength_index: number;
  away_team_strength_index: number;
  strength_diff: number;
  home_win_probability: number;
  draw_probability: number;
  away_win_probability: number;
  predicted_score_home: number;
  predicted_score_away: number;
  first_15_tempo: string;
  first_15_pressure: number;
  first_half_goal_probability: number;
  first_half_card_risk: string;
  second_half_fatigue_factor: number;
  late_goal_probability: number;
  comeback_probability: number;
  set_piece_threat: string;
  wc2026_scenario_confidence: number;
  wc2026_late_goal_risk: number;
  wc2026_chaos_probability: number;
  wc2026_fatigue_risk: number;
  calibration_confidence: string;
  calibrated_at: string;
}

export interface WcTeamProfile {
  id: string;
  api_football_team_id: number;
  team_name: string;
  fifa_code: string | null;
  confederation: string | null;
  historical_elo_rating: number;
  recent_win_rate: number;
  recent_goal_diff_avg: number;
  recent_matches_available: number;
  wc2026_team_strength_index: number;
  wc2026_late_goal_risk: number;
  wc2026_chaos_probability: number;
  wc2026_fatigue_risk: number;
  wc2026_scenario_confidence: number;
  tournament_experience_score: number;
  calibration_confidence: string;
  calibrated_at: string;
}

interface UseWcScenariosResult {
  scenarios: Map<number, WcScenarioData>;
  teamProfiles: Map<number, WcTeamProfile>;
  loading: boolean;
  error: string | null;
  calibratedAt: string | null;
}

export function useWcScenarios(): UseWcScenariosResult {
  const [scenarios, setScenarios] = useState<Map<number, WcScenarioData>>(new Map());
  const [teamProfiles, setTeamProfiles] = useState<Map<number, WcTeamProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [calibratedAt, setCalibratedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // 1. Get latest completed calibration run
        const { data: run, error: runErr } = await supabase
          .from('wc2026_calibration_runs')
          .select('id, completed_at')
          .eq('run_status', 'completed')
          .gt('matches_processed', 0)
          .order('completed_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (runErr) throw new Error(runErr.message);
        if (!run) { if (!cancelled) setLoading(false); return; }

        // 2. Fetch fixture map: api_football_fixture_id → match_number
        const { data: fixtures, error: fixErr } = await supabase
          .from('wc2026_fixtures')
          .select('match_number, api_football_fixture_id, home_api_team_id, away_api_team_id');

        if (fixErr) throw new Error(fixErr.message);

        const fixtureByApiId = new Map<number, number>(); // api_fixture_id → match_number
        for (const f of fixtures ?? []) {
          if (f.api_football_fixture_id) {
            fixtureByApiId.set(f.api_football_fixture_id, f.match_number);
          }
        }

        // 3. Fetch all scenario calibrations for this run
        const { data: scenarioRows, error: scenErr } = await supabase
          .from('wc2026_match_scenario_calibration')
          .select('*')
          .eq('calibration_run_id', run.id);

        if (scenErr) throw new Error(scenErr.message);

        const scenarioMap = new Map<number, WcScenarioData>();
        for (const row of scenarioRows ?? []) {
          const matchNo = fixtureByApiId.get(row.api_football_fixture_id);
          if (matchNo !== undefined) {
            scenarioMap.set(matchNo, row as WcScenarioData);
          }
        }

        // 4. Fetch all team profiles for this run
        const { data: profileRows, error: profErr } = await supabase
          .from('wc2026_team_calibration_profiles')
          .select('*')
          .eq('calibration_run_id', run.id);

        if (profErr) throw new Error(profErr.message);

        const profileMap = new Map<number, WcTeamProfile>();
        for (const row of profileRows ?? []) {
          profileMap.set(row.api_football_team_id, row as WcTeamProfile);
        }

        if (!cancelled) {
          setScenarios(scenarioMap);
          setTeamProfiles(profileMap);
          setCalibratedAt(run.completed_at ?? null);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Unknown error');
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { scenarios, teamProfiles, loading, error, calibratedAt };
}
