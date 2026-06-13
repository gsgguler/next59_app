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
  injury_adjusted_strength_index: number | null;
  qualifier_form_factor: number | null;
  wc2026_late_goal_risk: number;
  wc2026_chaos_probability: number;
  wc2026_fatigue_risk: number;
  wc2026_scenario_confidence: number;
  tournament_experience_score: number;
  calibration_confidence: string;
  calibrated_at: string;
}

export interface WcQualifierStats {
  team_name_en: string;
  team_name_tr: string;
  api_football_team_id: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
  win_rate: number;
  goals_per_game: number;
  gd_per_game: number;
}

interface UseWcScenariosResult {
  scenarios: Map<string, WcScenarioData>;
  teamProfiles: Map<number, WcTeamProfile>;
  qualifierStats: Map<number, WcQualifierStats>;
  loading: boolean;
  error: string | null;
  calibratedAt: string | null;
}

export function useWcScenarios(): UseWcScenariosResult {
  const [scenarios, setScenarios] = useState<Map<number, WcScenarioData>>(new Map());
  const [teamProfiles, setTeamProfiles] = useState<Map<number, WcTeamProfile>>(new Map());
  const [qualifierStats, setQualifierStats] = useState<Map<number, WcQualifierStats>>(new Map());
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
          .order('matches_processed', { ascending: false })
          .order('completed_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (runErr) throw new Error(runErr.message);
        if (!run) { if (!cancelled) setLoading(false); return; }

        // 2. Fetch all scenario calibrations for this run (keyed by team pair)
        const { data: scenarioRows, error: scenErr } = await supabase
          .from('wc2026_match_scenario_calibration')
          .select('*')
          .eq('calibration_run_id', run.id);

        if (scenErr) throw new Error(scenErr.message);

        const scenarioMap = new Map<string, WcScenarioData>();
        for (const row of scenarioRows ?? []) {
          if (row.home_team_name && row.away_team_name) {
            scenarioMap.set(`${row.home_team_name}||${row.away_team_name}`, row as WcScenarioData);
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

        // 5. Fetch UEFA qualifier stats
        const { data: qualifierRows, error: qualErr } = await supabase
          .from('wc2026_uefa_qualifier_team_stats')
          .select('team_name_en,team_name_tr,api_football_team_id,played,wins,draws,losses,goals_for,goals_against,goal_difference,points,win_rate,goals_per_game,gd_per_game')
          .not('api_football_team_id', 'is', null);

        if (qualErr) throw new Error(qualErr.message);

        const qualMap = new Map<number, WcQualifierStats>();
        for (const row of qualifierRows ?? []) {
          if (row.api_football_team_id) {
            qualMap.set(row.api_football_team_id, {
              ...row,
              win_rate: Number(row.win_rate),
              goals_per_game: Number(row.goals_per_game),
              gd_per_game: Number(row.gd_per_game),
            } as WcQualifierStats);
          }
        }

        if (!cancelled) {
          setScenarios(scenarioMap);
          setTeamProfiles(profileMap);
          setQualifierStats(qualMap);
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

  return { scenarios, teamProfiles, qualifierStats, loading, error, calibratedAt };
}
