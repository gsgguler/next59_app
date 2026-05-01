import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  FlaskConical, ChevronRight, AlertCircle, Shield,
  TrendingDown, TrendingUp, Minus, RefreshCw,
  CheckCircle, AlertTriangle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface CalibrationRow {
  id: string;
  group_type: string;
  group_key: string;
  sample_size: number;
  avg_brier_1x2: number | null;
  avg_log_loss_1x2: number | null;
  result_accuracy: number | null;
  over_1_5_accuracy: number | null;
  over_2_5_accuracy: number | null;
  over_3_5_accuracy: number | null;
  btts_accuracy: number | null;
  home_prediction_bias: number | null;
  draw_prediction_bias: number | null;
  away_prediction_bias: number | null;
  high_confidence_wrong_rate: number | null;
  predicted_h_count: number | null;
  predicted_d_count: number | null;
  predicted_a_count: number | null;
  actual_h_count: number | null;
  actual_d_count: number | null;
  actual_a_count: number | null;
  h_correct: number | null;
  d_correct: number | null;
  a_correct: number | null;
  avg_confidence_score: number | null;
  calibration_error: number | null;
  error_category_json: Record<string, number> | null;
  predicted_vs_actual_json: Record<string, number> | null;
}

interface AdjustmentRow {
  id: string;
  group_type: string;
  group_key: string;
  adjustment_type: string;
  adjustment_value: number;
  sample_size: number;
  confidence: number | null;
  evidence_metric: number | null;
  before_metric: number | null;
  proposed_correction: number | null;
  reason: string | null;
  status: string;
  is_active: boolean;
}

interface SimulationRow {
  id: string;
  source_backtest_run_id: string;
  simulation_key: string;
  simulation_status: string;
  applied_adjustments: unknown[];
  sample_size: number;
  raw_avg_brier_1x2: number | null;
  adjusted_avg_brier_1x2: number | null;
  raw_avg_log_loss_1x2: number | null;
  adjusted_avg_log_loss_1x2: number | null;
  raw_result_accuracy: number | null;
  adjusted_result_accuracy: number | null;
  raw_pred_home_rate: number | null;
  raw_pred_draw_rate: number | null;
  raw_pred_away_rate: number | null;
  adjusted_pred_home_rate: number | null;
  adjusted_pred_draw_rate: number | null;
  adjusted_pred_away_rate: number | null;
  actual_home_rate: number | null;
  actual_draw_rate: number | null;
  actual_away_rate: number | null;
  per_competition_metrics: Record<string, unknown>;
  per_confidence_metrics: Record<string, unknown>;
  // decision-layer columns
  raw_decision_distribution_json: Record<string, number> | null;
  adjusted_decision_distribution_json: Record<string, number> | null;
  decision_rule_config: Record<string, unknown> | null;
  scenario_class_distribution_json: Record<string, number> | null;
  probability_unchanged: boolean | null;
  draw_capture_rate: number | null;
  home_overcall_reduction: number | null;
  confusion_matrix_json: Record<string, number> | null;
  // precision/recall/F1/ECE columns
  simulation_verdict: string | null;
  draw_precision: number | null;
  draw_recall: number | null;
  draw_f1: number | null;
  away_precision: number | null;
  away_recall: number | null;
  away_f1: number | null;
  expected_calibration_error_draw: number | null;
  reliability_bins_draw: Array<{bin:string;n:number;avg_pred_draw:number;actual_draw_rate:number;gap:number}> | null;
  probability_transform_config: Record<string, unknown> | null;
  rejection_flags: string[] | null;
  // skill + slope columns (temperature grid)
  brier_skill_vs_raw: number | null;
  brier_skill_vs_compbias: number | null;
  calibration_slope_draw: number | null;
  // pathology simulation columns
  pathology_focus: string | null;
  bias_transform_config: { mode: string; temperature: number; bias_type: string } | null;
  pathology_notes: {
    ligue1_pred_draw_pct: number;
    ligue1_n: number;
    ligue1_changed: number;
    ligue1_helped: number;
    ligue1_harmed: number;
    bundesliga_acc: number;
    bundesliga_acc_delta: number;
    bundesliga_n: number;
    bundesliga_changed: number;
    bundesliga_helped: number;
    bundesliga_harmed: number;
    reject_flags: string[];
    risky_flags: string[];
  } | null;
  argmax_stability_json: {
    global: { total: number; changed: number; changed_rate: number; changed_to_draw: number; helped: number; harmed: number };
  } | null;
  margin_bucket_metrics: {
    decisive: { n: number; acc: number; avg_brier: number };
    contested: { n: number; acc: number; avg_brier: number };
    close: { n: number; acc: number; avg_brier: number };
  } | null;
  notes: string | null;
  created_at: string;
  // bias refinement columns
  simulation_family: string | null;
  family_objective: string | null;
  pipeline_order: string | null;
  sigmoid_k: number | null;
  relative_cap_pct: number | null;
  per_competition_health_json: Array<{
    competition: string;
    total: number;
    accuracy: number;
    raw_accuracy: number;
    accuracy_delta: number;
    pred_draw_rate: number;
    helped: number;
    harmed: number;
    net: number;
  }> | null;
}

const DECISION_MODES = [
  'draw_margin_rule_05',
  'draw_margin_rule_08',
  'draw_margin_rule_10',
  'draw_floor_plus_competition_bias',
  'scenario_class_v1',
];

const DRAW_FLOOR_MODES = [
  'draw_floor_12_plus_competition_bias',
  'draw_floor_15_plus_competition_bias',
  'draw_floor_18_plus_competition_bias',
  'draw_floor_22_plus_competition_bias',
  'dynamic_draw_floor_60pct_by_competition',
  'dynamic_draw_floor_70pct_by_competition',
  'temp_scale_15_plus_competition_bias',
  'temp_scale_20_plus_competition_bias',
  'temp_scale_15_plus_draw_floor_15',
  'temp_scale_20_plus_draw_floor_15',
  'temp_scale_15_plus_dynamic_draw_floor_70pct',
  'temp_scale_20_plus_dynamic_draw_floor_70pct',
];

const REFINEMENT_MODES = [
  'temp160_sigmoid_cap008_k050',
  'temp160_sigmoid_cap008_k075',
  'temp160_sigmoid_cap009_k050',
  'temp160_sigmoid_cap009_k075',
  'temp160_sigmoid_cap010_k050',
  'temp160_sigmoid_cap010_k075',
  'temp160_dynamic_relative_cap_15pct',
  'temp160_dynamic_relative_cap_20pct',
  'temp160_dynamic_relative_cap_25pct',
  'temp160_sigmoid008_k075_relative20',
  'temp160_sigmoid009_k075_relative20',
  'temp160_sigmoid010_k075_relative20',
  'robust_cb_sigmoid009_k075_then_temp160',
  'robust_cb_sigmoid010_k075_then_temp160',
  'robust_cb_relative20_then_temp160',
  'temp160_sigmoid010_k075_ligue1_half_draw_bias',
  'temp160_sigmoid010_k075_bundesliga_half_away_bias',
  'temp160_sigmoid010_k075_l1_half_draw_bl_half_away',
];

const REFINEMENT_FAMILY_LABELS: Record<string, string> = {
  sigmoid_tuning:   'A — Sigmoid k Tuning',
  dynamic_relative: 'B — Dynamic Relative',
  hybrid:           'C — Hybrid',
  cb_then_t:        'D — CB→T Order',
  league_ablation:  'E — League Ablation',
};

const PATHOLOGY_MODES = [
  'temp160_compbias_cap_005',
  'temp160_compbias_cap_008',
  'temp160_compbias_cap_010',
  'temp160_compbias_sigmoid_cap_008',
  'temp160_compbias_sigmoid_cap_010',
  'temp160_compbias_multiplier_prior',
  'temp160_compbias_multiplier_prior_cap015',
  'temp160_compbias_entropy_scaled_additive',
  'temp160_compbias_entropy_scaled_sigmoid',
  'temp160_compbias_no_ligue1_draw_bias',
  'temp160_compbias_no_bundesliga_bias',
  'temp160_compbias_cap008_no_ligue1_draw_bias',
  'temp160_compbias_multiplier_no_ligue1_draw_bias',
];

const TEMP_GRID_MODES = [
  'temp_scale_120_plus_competition_bias',
  'temp_scale_130_plus_competition_bias',
  'temp_scale_140_plus_competition_bias',
  'temp_scale_150_plus_competition_bias',
  'temp_scale_160_plus_competition_bias',
  'temp_scale_170_plus_competition_bias',
  'temp_scale_180_plus_competition_bias',
  'compbias_then_temp_scale_130',
  'compbias_then_temp_scale_140',
  'compbias_then_temp_scale_150',
  'compbias_then_temp_scale_160',
  'compbias_then_temp_scale_170',
];

const GROUP_TYPES = [
  'overall', 'competition', 'season', 'era_bucket', 'confidence_grade',
  'error_category', 'predicted_result', 'actual_result', 'predicted_vs_actual',
  'high_confidence_wrong', 'home_prediction_bias', 'draw_prediction_bias', 'away_prediction_bias',
];

function BiasChip({ value }: { value: number | null }) {
  if (value === null) return <span className="text-navy-600">–</span>;
  const abs = Math.abs(value);
  const pct = (value * 100).toFixed(1);
  if (abs < 0.02) return <span className="text-navy-400 tabular-nums">{pct}%</span>;
  if (value > 0) return (
    <span className="flex items-center gap-0.5 text-amber-400 tabular-nums">
      <TrendingUp className="w-3 h-3" />{pct}%
    </span>
  );
  return (
    <span className="flex items-center gap-0.5 text-sky-400 tabular-nums">
      <TrendingDown className="w-3 h-3" />{pct}%
    </span>
  );
}

function AccBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-navy-600">–</span>;
  const pct = (Number(value) * 100).toFixed(1);
  const good = Number(value) > 0.5;
  return <span className={good ? 'text-emerald-400 tabular-nums' : 'text-navy-400 tabular-nums'}>{pct}%</span>;
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'candidate') return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">candidate</span>
  );
  if (status === 'manual_review') return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/25">manual review</span>
  );
  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-navy-700 text-navy-400">{status}</span>;
}

function DeltaCell({ raw, adj }: { raw: number | null; adj: number | null }) {
  if (raw === null || adj === null) return <span className="text-navy-600">–</span>;
  const delta = Number(adj) - Number(raw);
  const improved = delta < 0;
  return (
    <span className={`tabular-nums ${improved ? 'text-emerald-400' : 'text-red-400'}`}>
      {delta > 0 ? '+' : ''}{delta.toFixed(6)}
    </span>
  );
}

function DeltaAccCell({ raw, adj }: { raw: number | null; adj: number | null }) {
  if (raw === null || adj === null) return <span className="text-navy-600">–</span>;
  const delta = Number(adj) - Number(raw);
  const improved = delta > 0;
  return (
    <span className={`tabular-nums ${improved ? 'text-emerald-400' : 'text-red-400'}`}>
      {delta > 0 ? '+' : ''}{(delta * 100).toFixed(2)}pp
    </span>
  );
}

function RateBar({ raw, adj, actual, label }: { raw: number | null; adj: number | null; actual: number | null; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-navy-500 w-3">{label}</span>
      <span className="text-navy-400 tabular-nums w-10">{(Number(raw ?? 0) * 100).toFixed(1)}%</span>
      <span className="text-navy-600">→</span>
      <span className="text-white tabular-nums w-10">{(Number(adj ?? 0) * 100).toFixed(1)}%</span>
      <span className="text-navy-600">(actual:</span>
      <span className="text-champagne tabular-nums">{(Number(actual ?? 0) * 100).toFixed(1)}%)</span>
    </div>
  );
}

function SimNotes({ notes }: { notes: string | null }) {
  if (!notes) return (
    <span className="text-emerald-400 text-xs flex items-center gap-1">
      <CheckCircle className="w-3 h-3" />No risk flags
    </span>
  );
  const isRisk = notes.includes('RISK') || notes.includes('WARNING');
  return (
    <div className={`flex items-start gap-1.5 text-xs rounded-lg px-2 py-1.5 ${
      isRisk
        ? 'bg-red-500/10 border border-red-500/20 text-red-300'
        : 'bg-amber-500/10 border border-amber-500/20 text-amber-300'
    }`}>
      <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
      <span>{notes}</span>
    </div>
  );
}

export default function ModelLabKalibrasyonPage() {
  const [rows, setRows] = useState<CalibrationRow[]>([]);
  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>([]);
  const [simulations, setSimulations] = useState<SimulationRow[]>([]);
  const [decisionSims, setDecisionSims] = useState<SimulationRow[]>([]);
  const [drawFloorSims, setDrawFloorSims] = useState<SimulationRow[]>([]);
  const [tempGridSims, setTempGridSims] = useState<SimulationRow[]>([]);
  const [pathologySims, setPathologySims] = useState<SimulationRow[]>([]);
  const [pathologyLoading, setPathologyLoading] = useState(true);
  const [refinementSims, setRefinementSims] = useState<SimulationRow[]>([]);
  const [refinementLoading, setRefinementLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [adjLoading, setAdjLoading] = useState(true);
  const [simLoading, setSimLoading] = useState(true);
  const [decisionLoading, setDecisionLoading] = useState(true);
  const [drawFloorLoading, setDrawFloorLoading] = useState(true);
  const [tempGridLoading, setTempGridLoading] = useState(true);
  const [groupType, setGroupType] = useState('overall');
  const [expandedBins, setExpandedBins] = useState<string | null>(null);
  const [tab, setTab] = useState<'summary' | 'adjustments' | 'simulations' | 'decision' | 'drawfloor' | 'tempgrid' | 'pathology' | 'refinement'>('summary');

  useEffect(() => {
    document.title = 'Kalibrasyon | Model Lab | Admin | Next59';
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase.rpc('ml_get_calibration_summary', {
        p_run_id: null,
        p_group_type: groupType,
      });
      setRows(((data as unknown[]) ?? []) as CalibrationRow[]);
      setLoading(false);
    }
    if (tab === 'summary') load();
  }, [groupType, tab]);

  useEffect(() => {
    async function loadAdj() {
      setAdjLoading(true);
      const { data } = await supabase.rpc('ml_get_calibration_adjustments', { p_run_id: null });
      setAdjustments(((data as unknown[]) ?? []) as AdjustmentRow[]);
      setAdjLoading(false);
    }
    if (tab === 'adjustments') loadAdj();
  }, [tab]);

  useEffect(() => {
    async function loadSims() {
      setSimLoading(true);
      const { data } = await supabase.rpc('ml_get_adjustment_simulations', { p_run_id: null });
      const all = ((data as unknown[]) ?? []) as SimulationRow[];
      setSimulations(all.filter(s => !DECISION_MODES.includes(s.simulation_key) && !DRAW_FLOOR_MODES.includes(s.simulation_key)));
      setSimLoading(false);
    }
    if (tab === 'simulations') loadSims();
  }, [tab]);

  useEffect(() => {
    async function loadDecision() {
      setDecisionLoading(true);
      const { data } = await supabase.rpc('ml_get_adjustment_simulations', { p_run_id: null });
      const all = ((data as unknown[]) ?? []) as SimulationRow[];
      setDecisionSims(all.filter(s => DECISION_MODES.includes(s.simulation_key)));
      setDecisionLoading(false);
    }
    if (tab === 'decision') loadDecision();
  }, [tab]);

  useEffect(() => {
    async function loadDrawFloor() {
      setDrawFloorLoading(true);
      const { data } = await supabase.rpc('ml_get_adjustment_simulations', { p_run_id: null });
      const all = ((data as unknown[]) ?? []) as SimulationRow[];
      setDrawFloorSims(all.filter(s => DRAW_FLOOR_MODES.includes(s.simulation_key))
        .sort((a, b) => DRAW_FLOOR_MODES.indexOf(a.simulation_key) - DRAW_FLOOR_MODES.indexOf(b.simulation_key)));
      setDrawFloorLoading(false);
    }
    if (tab === 'drawfloor') loadDrawFloor();
  }, [tab]);

  useEffect(() => {
    async function loadTempGrid() {
      setTempGridLoading(true);
      const { data } = await supabase.rpc('ml_get_adjustment_simulations', { p_run_id: null });
      const all = ((data as unknown[]) ?? []) as SimulationRow[];
      setTempGridSims(all.filter(s => TEMP_GRID_MODES.includes(s.simulation_key))
        .sort((a, b) => TEMP_GRID_MODES.indexOf(a.simulation_key) - TEMP_GRID_MODES.indexOf(b.simulation_key)));
      setTempGridLoading(false);
    }
    if (tab === 'tempgrid') loadTempGrid();
  }, [tab]);

  useEffect(() => {
    async function loadPathology() {
      setPathologyLoading(true);
      const { data } = await supabase.rpc('ml_get_adjustment_simulations', { p_run_id: null });
      const all = ((data as unknown[]) ?? []) as SimulationRow[];
      setPathologySims(all.filter(s => PATHOLOGY_MODES.includes(s.simulation_key))
        .sort((a, b) => PATHOLOGY_MODES.indexOf(a.simulation_key) - PATHOLOGY_MODES.indexOf(b.simulation_key)));
      setPathologyLoading(false);
    }
    if (tab === 'pathology') loadPathology();
  }, [tab]);

  useEffect(() => {
    async function loadRefinement() {
      setRefinementLoading(true);
      const { data } = await supabase.rpc('ml_get_adjustment_simulations', { p_run_id: null });
      const all = ((data as unknown[]) ?? []) as SimulationRow[];
      setRefinementSims(all.filter(s => REFINEMENT_MODES.includes(s.simulation_key))
        .sort((a, b) => REFINEMENT_MODES.indexOf(a.simulation_key) - REFINEMENT_MODES.indexOf(b.simulation_key)));
      setRefinementLoading(false);
    }
    if (tab === 'refinement') loadRefinement();
  }, [tab]);

  const showPva    = groupType === 'predicted_vs_actual';
  const showBias   = ['overall','competition','home_prediction_bias','draw_prediction_bias','away_prediction_bias','predicted_result','actual_result','high_confidence_wrong'].includes(groupType);
  const showMarkets = ['overall','competition','season','era_bucket','confidence_grade'].includes(groupType);

  return (
    <div className="min-h-screen bg-navy-950 p-6">
      <div className="max-w-6xl mx-auto">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-navy-500 mb-6">
          <Link to="/admin/model-lab" className="hover:text-champagne transition-colors">Model Lab</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-navy-400">Kalibrasyon</span>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-2.5 mb-6 flex items-center gap-2">
          <Shield className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300">Bu alan yalnızca model araştırma içindir. Public kullanıcıya gösterilmez.</p>
        </div>

        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
            <FlaskConical className="w-6 h-6 text-champagne" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white font-display">Kalibrasyon</h1>
            <p className="text-sm text-navy-400 mt-1">13 grup boyutunda kalibrasyon özeti, düzeltme adayları ve simülasyonlar.</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-navy-800 pb-px flex-wrap">
          {(['summary', 'adjustments', 'simulations', 'decision', 'drawfloor', 'tempgrid', 'pathology', 'refinement'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-sm font-medium px-4 py-2 border-b-2 transition-all -mb-px whitespace-nowrap ${
                tab === t
                  ? 'border-champagne text-champagne'
                  : 'border-transparent text-navy-500 hover:text-white'
              }`}
            >
              {t === 'summary' ? 'Kalibrasyon Özeti'
                : t === 'adjustments' ? 'Düzeltme Adayları'
                : t === 'simulations' ? 'Olasılık Simülasyonları'
                : t === 'decision' ? 'Decision Calibration'
                : t === 'drawfloor' ? 'Draw Floor & Temp'
                : t === 'tempgrid' ? 'T Grid Search'
                : t === 'pathology' ? 'Comp. Pathology'
                : 'Bias Refinement'}
            </button>
          ))}
        </div>

        {/* ── Summary ─────────────────────────────────────────────────────────── */}
        {tab === 'summary' && (
          <>
            <div className="flex flex-wrap gap-2 mb-5">
              {GROUP_TYPES.map((g) => (
                <button
                  key={g}
                  onClick={() => setGroupType(g)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
                    groupType === g
                      ? 'bg-champagne/10 border-champagne/30 text-champagne'
                      : 'bg-navy-900 border-navy-700 text-navy-400 hover:text-white'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-14 bg-navy-900/50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-3">
                <AlertCircle className="w-8 h-8 text-navy-700" />
                <p className="text-sm text-navy-500 text-center">Bu grup için kalibrasyon verisi yok.</p>
                <p className="text-xs text-navy-600 text-center max-w-sm">Backtest tamamlandıktan sonra otomatik hesaplanır.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-navy-800">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-navy-800 bg-navy-900/60">
                      <th className="text-left text-navy-500 font-medium px-3 py-2.5 whitespace-nowrap">Grup</th>
                      <th className="text-right text-navy-500 font-medium px-3 py-2.5">N</th>
                      <th className="text-right text-navy-500 font-medium px-3 py-2.5">Brier</th>
                      <th className="text-right text-navy-500 font-medium px-3 py-2.5">Log Loss</th>
                      <th className="text-right text-navy-500 font-medium px-3 py-2.5">Doğruluk</th>
                      {showMarkets && <>
                        <th className="text-right text-navy-500 font-medium px-3 py-2.5">O/U 2.5</th>
                        <th className="text-right text-navy-500 font-medium px-3 py-2.5">BTTS</th>
                      </>}
                      {showBias && <>
                        <th className="text-right text-navy-500 font-medium px-3 py-2.5 whitespace-nowrap">Ev Bias</th>
                        <th className="text-right text-navy-500 font-medium px-3 py-2.5 whitespace-nowrap">Ber Bias</th>
                        <th className="text-right text-navy-500 font-medium px-3 py-2.5 whitespace-nowrap">Dep Bias</th>
                      </>}
                      <th className="text-right text-navy-500 font-medium px-3 py-2.5 whitespace-nowrap">HCW%</th>
                      <th className="text-right text-navy-500 font-medium px-3 py-2.5 whitespace-nowrap">Cal Err</th>
                      {showPva && <th className="text-left text-navy-500 font-medium px-3 py-2.5">Matris</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-800/40">
                    {rows.map((r) => (
                      <tr key={r.id} className="hover:bg-navy-900/40 transition-colors">
                        <td className="px-3 py-2.5 text-white font-medium whitespace-nowrap max-w-[180px] truncate">{r.group_key}</td>
                        <td className="px-3 py-2.5 text-navy-300 tabular-nums text-right">{r.sample_size.toLocaleString('tr-TR')}</td>
                        <td className="px-3 py-2.5 text-navy-300 tabular-nums text-right">{r.avg_brier_1x2 !== null ? Number(r.avg_brier_1x2).toFixed(4) : '–'}</td>
                        <td className="px-3 py-2.5 text-navy-300 tabular-nums text-right">{r.avg_log_loss_1x2 !== null ? Number(r.avg_log_loss_1x2).toFixed(4) : '–'}</td>
                        <td className="px-3 py-2.5 text-right"><AccBadge value={r.result_accuracy} /></td>
                        {showMarkets && <>
                          <td className="px-3 py-2.5 text-right"><AccBadge value={r.over_2_5_accuracy} /></td>
                          <td className="px-3 py-2.5 text-right"><AccBadge value={r.btts_accuracy} /></td>
                        </>}
                        {showBias && <>
                          <td className="px-3 py-2.5 text-right"><BiasChip value={r.home_prediction_bias !== null ? Number(r.home_prediction_bias) : null} /></td>
                          <td className="px-3 py-2.5 text-right"><BiasChip value={r.draw_prediction_bias !== null ? Number(r.draw_prediction_bias) : null} /></td>
                          <td className="px-3 py-2.5 text-right"><BiasChip value={r.away_prediction_bias !== null ? Number(r.away_prediction_bias) : null} /></td>
                        </>}
                        <td className="px-3 py-2.5 text-right">
                          {r.high_confidence_wrong_rate !== null
                            ? <span className={Number(r.high_confidence_wrong_rate) > 0.35 ? 'text-red-400 tabular-nums' : 'text-navy-400 tabular-nums'}>
                                {(Number(r.high_confidence_wrong_rate) * 100).toFixed(1)}%
                              </span>
                            : <span className="text-navy-600">–</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right text-navy-400 tabular-nums">
                          {r.calibration_error !== null ? Number(r.calibration_error).toFixed(4) : '–'}
                        </td>
                        {showPva && (
                          <td className="px-3 py-2.5">
                            {r.predicted_vs_actual_json
                              ? <span className="text-navy-500 font-mono">{JSON.stringify(r.predicted_vs_actual_json)}</span>
                              : '–'}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!loading && rows.length > 0 && rows[0].error_category_json && (
              <div className="mt-4 p-4 bg-navy-900/60 rounded-xl border border-navy-800">
                <p className="text-xs font-medium text-navy-400 mb-2">Hata Kategorisi Dağılımı ({rows[0].group_key})</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(rows[0].error_category_json).sort((a, b) => b[1] - a[1]).map(([cat, cnt]) => (
                    <span key={cat} className="flex items-center gap-1.5 px-2.5 py-1 bg-navy-800 rounded-lg text-xs">
                      <span className={cat === 'correct' ? 'text-emerald-400' : cat === 'high_confidence_wrong' ? 'text-red-400' : 'text-amber-400'}>{cat}</span>
                      <span className="text-white font-medium tabular-nums">{cnt}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Adjustments ─────────────────────────────────────────────────────── */}
        {tab === 'adjustments' && (
          <>
            {adjLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-16 bg-navy-900/50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : adjustments.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-3">
                <Minus className="w-8 h-8 text-navy-700" />
                <p className="text-sm text-navy-500">Henüz düzeltme adayı yok.</p>
                <p className="text-xs text-navy-600 max-w-sm text-center">Backtest tamamlandıktan sonra otomatik hesaplanır. Hiçbir aday otomatik aktif edilmez.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {adjustments.map((adj) => (
                  <div key={adj.id} className="bg-navy-900/60 border border-navy-800 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge status={adj.status} />
                        <span className="text-xs font-mono text-champagne">{adj.adjustment_type}</span>
                        <span className="text-xs text-navy-500">{adj.group_type} / <span className="text-navy-300">{adj.group_key}</span></span>
                      </div>
                      <div className="flex items-center gap-3 text-xs shrink-0">
                        <span className="text-navy-500">N={adj.sample_size}</span>
                        {adj.confidence !== null && (
                          <span className="text-navy-400">conf={Number(adj.confidence).toFixed(2)}</span>
                        )}
                        <span className={adj.is_active ? 'text-emerald-400' : 'text-navy-600'}>
                          {adj.is_active ? 'ACTIVE' : 'inactive'}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mb-2 text-xs">
                      <div className="bg-navy-800/60 rounded-lg p-2">
                        <p className="text-navy-500 mb-0.5">Ölçülen bias</p>
                        <p className="text-white font-mono tabular-nums">{adj.evidence_metric !== null ? Number(adj.evidence_metric).toFixed(4) : '–'}</p>
                      </div>
                      <div className="bg-navy-800/60 rounded-lg p-2">
                        <p className="text-navy-500 mb-0.5">Düzeltme değeri</p>
                        <p className={`font-mono tabular-nums ${Number(adj.adjustment_value) > 0 ? 'text-sky-400' : 'text-amber-400'}`}>
                          {Number(adj.adjustment_value) > 0 ? '+' : ''}{Number(adj.adjustment_value).toFixed(4)}
                        </p>
                      </div>
                      <div className="bg-navy-800/60 rounded-lg p-2">
                        <p className="text-navy-500 mb-0.5">Baseline Brier</p>
                        <p className="text-navy-300 font-mono tabular-nums">{adj.before_metric !== null ? Number(adj.before_metric).toFixed(4) : '–'}</p>
                      </div>
                    </div>
                    {adj.reason && (
                      <p className="text-xs text-navy-400 leading-relaxed">{adj.reason}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Simulations ─────────────────────────────────────────────────────── */}
        {tab === 'simulations' && (
          <>
            <div className="bg-navy-900/60 border border-navy-800 rounded-xl px-4 py-3 mb-5 text-xs text-navy-400">
              Simülasyonlar, orijinal tahminleri veya değerlendirmeleri değiştirmez. Yalnızca aday düzeltmelerin uygulandığı durumda ne olacağını hesaplar.
              Hiçbir aday otomatik aktif edilmez.
            </div>

            {simLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-40 bg-navy-900/50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : simulations.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-3">
                <RefreshCw className="w-8 h-8 text-navy-700" />
                <p className="text-sm text-navy-500">Henüz simülasyon yok.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {simulations.map((sim) => {
                  const brierImproved = Number(sim.adjusted_avg_brier_1x2 ?? 1) < Number(sim.raw_avg_brier_1x2 ?? 0);
                  const llImproved    = Number(sim.adjusted_avg_log_loss_1x2 ?? 1) < Number(sim.raw_avg_log_loss_1x2 ?? 0);
                  const accImproved   = Number(sim.adjusted_result_accuracy ?? 0) > Number(sim.raw_result_accuracy ?? 1);

                  return (
                    <div key={sim.id} className="bg-navy-900/60 border border-navy-800 rounded-xl p-5">
                      {/* Header */}
                      <div className="flex items-center justify-between gap-4 mb-4">
                        <div>
                          <span className="text-sm font-bold text-white font-mono">{sim.simulation_key}</span>
                          <span className="ml-2 text-xs text-navy-500">N={sim.sample_size.toLocaleString('tr-TR')}</span>
                        </div>
                        {brierImproved && llImproved && accImproved
                          ? <span className="flex items-center gap-1 text-xs font-medium text-emerald-400"><CheckCircle className="w-3.5 h-3.5" />Tüm metrikler iyileşti</span>
                          : <span className="flex items-center gap-1 text-xs font-medium text-amber-400"><AlertTriangle className="w-3.5 h-3.5" />Kısmi iyileşme</span>
                        }
                      </div>

                      {/* Metric cards */}
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        <div className="bg-navy-800/50 rounded-xl p-3">
                          <p className="text-[10px] text-navy-500 font-medium uppercase tracking-wider mb-2">Brier 1X2</p>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-navy-400">Ham</span>
                              <span className="tabular-nums text-navy-300">{Number(sim.raw_avg_brier_1x2).toFixed(6)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-navy-400">Düzeltilmiş</span>
                              <span className={`tabular-nums font-medium ${brierImproved ? 'text-emerald-400' : 'text-red-400'}`}>
                                {Number(sim.adjusted_avg_brier_1x2).toFixed(6)}
                              </span>
                            </div>
                            <div className="flex justify-between border-t border-navy-700/50 pt-1">
                              <span className="text-navy-500">Δ</span>
                              <DeltaCell raw={sim.raw_avg_brier_1x2} adj={sim.adjusted_avg_brier_1x2} />
                            </div>
                          </div>
                        </div>

                        <div className="bg-navy-800/50 rounded-xl p-3">
                          <p className="text-[10px] text-navy-500 font-medium uppercase tracking-wider mb-2">Log Loss</p>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-navy-400">Ham</span>
                              <span className="tabular-nums text-navy-300">{Number(sim.raw_avg_log_loss_1x2).toFixed(6)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-navy-400">Düzeltilmiş</span>
                              <span className={`tabular-nums font-medium ${llImproved ? 'text-emerald-400' : 'text-red-400'}`}>
                                {Number(sim.adjusted_avg_log_loss_1x2).toFixed(6)}
                              </span>
                            </div>
                            <div className="flex justify-between border-t border-navy-700/50 pt-1">
                              <span className="text-navy-500">Δ</span>
                              <DeltaCell raw={sim.raw_avg_log_loss_1x2} adj={sim.adjusted_avg_log_loss_1x2} />
                            </div>
                          </div>
                        </div>

                        <div className="bg-navy-800/50 rounded-xl p-3">
                          <p className="text-[10px] text-navy-500 font-medium uppercase tracking-wider mb-2">Doğruluk</p>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-navy-400">Ham</span>
                              <span className="tabular-nums text-navy-300">{(Number(sim.raw_result_accuracy) * 100).toFixed(2)}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-navy-400">Düzeltilmiş</span>
                              <span className={`tabular-nums font-medium ${accImproved ? 'text-emerald-400' : 'text-red-400'}`}>
                                {(Number(sim.adjusted_result_accuracy) * 100).toFixed(2)}%
                              </span>
                            </div>
                            <div className="flex justify-between border-t border-navy-700/50 pt-1">
                              <span className="text-navy-500">Δ</span>
                              <DeltaAccCell raw={sim.raw_result_accuracy} adj={sim.adjusted_result_accuracy} />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Class distribution */}
                      <div className="bg-navy-800/30 rounded-xl p-3 mb-3">
                        <p className="text-[10px] text-navy-500 font-medium uppercase tracking-wider mb-2">
                          Tahmin Dağılımı (Ham → Düzeltilmiş | Gerçek)
                        </p>
                        <div className="space-y-1.5">
                          <RateBar raw={sim.raw_pred_home_rate} adj={sim.adjusted_pred_home_rate} actual={sim.actual_home_rate} label="H" />
                          <RateBar raw={sim.raw_pred_draw_rate} adj={sim.adjusted_pred_draw_rate} actual={sim.actual_draw_rate} label="D" />
                          <RateBar raw={sim.raw_pred_away_rate} adj={sim.adjusted_pred_away_rate} actual={sim.actual_away_rate} label="A" />
                        </div>
                      </div>

                      <SimNotes notes={sim.notes} />
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── Decision Calibration ─────────────────────────────────────────────── */}
        {tab === 'decision' && (
          <>
            <div className="bg-navy-900/60 border border-navy-800 rounded-xl px-4 py-3 mb-5 text-xs text-navy-400">
              Decision-layer kalibrasyonu: olasılıklar sabit tutularak veya önce kompetisyon düzeltmesi uygulanarak tahmin kararı (H/D/A) yeniden belirlenir.
              Orijinal tahminler ve değerlendirmeler değiştirilmez. Hiçbir kural otomatik aktif edilmez.
            </div>

            {decisionLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-36 bg-navy-900/50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : decisionSims.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-3">
                <RefreshCw className="w-8 h-8 text-navy-700" />
                <p className="text-sm text-navy-500">Henüz decision simülasyonu yok.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {decisionSims.map((sim) => {
                  const isScenario = sim.simulation_key === 'scenario_class_v1';
                  const accImproved = Number(sim.adjusted_result_accuracy ?? 0) > Number(sim.raw_result_accuracy ?? 1);
                  const drawRateOk  = Number(sim.adjusted_pred_draw_rate ?? 0) >= 0.05;
                  const drawCapture = sim.draw_capture_rate !== null ? Number(sim.draw_capture_rate) : null;
                  const homeReduction = sim.home_overcall_reduction !== null ? Number(sim.home_overcall_reduction) : null;
                  const hasGoodNote = sim.notes?.includes('GOOD');
                  const hasRisk     = sim.notes?.includes('RISK') || sim.notes?.includes('WARNING');

                  return (
                    <div key={sim.id} className="bg-navy-900/60 border border-navy-800 rounded-xl p-5">
                      {/* Header */}
                      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-white font-mono">{sim.simulation_key}</span>
                          <span className="text-xs text-navy-500">N={sim.sample_size.toLocaleString('tr-TR')}</span>
                          {sim.probability_unchanged && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-sky-500/10 border border-sky-500/20 text-sky-400">
                              prob unchanged
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {hasGoodNote && !hasRisk
                            ? <span className="flex items-center gap-1 text-xs font-medium text-emerald-400"><CheckCircle className="w-3.5 h-3.5" />Promising</span>
                            : hasRisk
                            ? <span className="flex items-center gap-1 text-xs font-medium text-red-400"><AlertTriangle className="w-3.5 h-3.5" />Risk flags</span>
                            : <span className="flex items-center gap-1 text-xs font-medium text-navy-500"><Minus className="w-3.5 h-3.5" />Neutral</span>
                          }
                        </div>
                      </div>

                      {isScenario ? (
                        /* Scenario class distribution */
                        <div className="bg-navy-800/30 rounded-xl p-3 mb-3">
                          <p className="text-[10px] text-navy-500 font-medium uppercase tracking-wider mb-2">Scenario Sınıf Dağılımı</p>
                          <div className="flex flex-wrap gap-2">
                            {sim.scenario_class_distribution_json && Object.entries(sim.scenario_class_distribution_json)
                              .sort((a, b) => b[1] - a[1])
                              .map(([cls, cnt]) => (
                                <div key={cls} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-navy-800 rounded-lg text-xs">
                                  <span className={
                                    cls === 'home_control' ? 'text-amber-400'
                                    : cls === 'away_control' ? 'text-sky-400'
                                    : cls === 'volatile' ? 'text-red-400'
                                    : cls === 'balanced' ? 'text-emerald-400'
                                    : 'text-navy-300'
                                  }>{cls}</span>
                                  <span className="text-white font-medium tabular-nums">{cnt}</span>
                                  <span className="text-navy-500">({((cnt / sim.sample_size) * 100).toFixed(1)}%)</span>
                                </div>
                              ))}
                          </div>
                          <p className="text-xs text-navy-500 mt-2">
                            home_control dominates ({sim.scenario_class_distribution_json?.home_control ?? 0}/{sim.sample_size} = {((Number(sim.scenario_class_distribution_json?.home_control ?? 0)/sim.sample_size)*100).toFixed(0)}%) — confirms structural home bias in raw model output.
                          </p>
                        </div>
                      ) : (
                        <>
                          {/* Metric row */}
                          <div className="grid grid-cols-2 gap-3 mb-4 sm:grid-cols-4">
                            <div className="bg-navy-800/50 rounded-xl p-3 text-xs">
                              <p className="text-[10px] text-navy-500 uppercase tracking-wider mb-1.5">Doğruluk</p>
                              <p className="text-navy-400">Ham: <span className="text-navy-300 tabular-nums">{(Number(sim.raw_result_accuracy)*100).toFixed(2)}%</span></p>
                              <p className="text-navy-400">Adj: <span className={`tabular-nums font-medium ${accImproved ? 'text-emerald-400' : 'text-red-400'}`}>{(Number(sim.adjusted_result_accuracy)*100).toFixed(2)}%</span></p>
                            </div>
                            <div className="bg-navy-800/50 rounded-xl p-3 text-xs">
                              <p className="text-[10px] text-navy-500 uppercase tracking-wider mb-1.5">Draw Yakalama</p>
                              <p className={`text-lg font-bold tabular-nums ${drawCapture !== null && drawCapture > 0.10 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {drawCapture !== null ? (drawCapture * 100).toFixed(1) + '%' : '0%'}
                              </p>
                              <p className="text-navy-500">gerçek berabere tahmini</p>
                            </div>
                            <div className="bg-navy-800/50 rounded-xl p-3 text-xs">
                              <p className="text-[10px] text-navy-500 uppercase tracking-wider mb-1.5">Home Overcall Azaltma</p>
                              <p className={`text-lg font-bold tabular-nums ${homeReduction !== null && homeReduction > 0.05 ? 'text-emerald-400' : 'text-navy-400'}`}>
                                {homeReduction !== null ? (homeReduction * 100).toFixed(1) + 'pp' : '0pp'}
                              </p>
                              <p className="text-navy-500">ev tahmin azalması</p>
                            </div>
                            <div className={`rounded-xl p-3 text-xs ${drawRateOk ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-navy-800/50'}`}>
                              <p className="text-[10px] text-navy-500 uppercase tracking-wider mb-1.5">Pred D Rate</p>
                              <p className={`text-lg font-bold tabular-nums ${drawRateOk ? 'text-emerald-400' : 'text-red-400'}`}>
                                {(Number(sim.adjusted_pred_draw_rate ?? 0)*100).toFixed(1)}%
                              </p>
                              <p className="text-navy-500">Gerçek: {(Number(sim.actual_draw_rate ?? 0)*100).toFixed(1)}%</p>
                            </div>
                          </div>

                          {/* H/D/A distribution */}
                          <div className="bg-navy-800/30 rounded-xl p-3 mb-3">
                            <p className="text-[10px] text-navy-500 font-medium uppercase tracking-wider mb-2">
                              Tahmin Dağılımı (Ham → Düzeltilmiş | Gerçek)
                            </p>
                            <div className="space-y-1.5">
                              <RateBar raw={sim.raw_pred_home_rate} adj={sim.adjusted_pred_home_rate} actual={sim.actual_home_rate} label="H" />
                              <RateBar raw={sim.raw_pred_draw_rate} adj={sim.adjusted_pred_draw_rate} actual={sim.actual_draw_rate} label="D" />
                              <RateBar raw={sim.raw_pred_away_rate} adj={sim.adjusted_pred_away_rate} actual={sim.actual_away_rate} label="A" />
                            </div>
                          </div>
                        </>
                      )}

                      <SimNotes notes={sim.notes} />
                    </div>
                  );
                })}

                {/* Summary comparison table */}
                <div className="bg-navy-900/60 border border-navy-800 rounded-xl p-5 mt-2">
                  <p className="text-xs font-semibold text-white mb-3">Karşılaştırma Özeti</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-navy-800">
                          <th className="text-left text-navy-500 font-medium px-2 py-2">Mod</th>
                          <th className="text-right text-navy-500 font-medium px-2 py-2">Accuracy</th>
                          <th className="text-right text-navy-500 font-medium px-2 py-2">Pred D%</th>
                          <th className="text-right text-navy-500 font-medium px-2 py-2">Draw Capture</th>
                          <th className="text-right text-navy-500 font-medium px-2 py-2">Home Reduction</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-navy-800/40">
                        {decisionSims.filter(s => s.simulation_key !== 'scenario_class_v1').map((sim) => (
                          <tr key={sim.id} className="hover:bg-navy-900/40 transition-colors">
                            <td className="px-2 py-2 text-white font-mono">{sim.simulation_key}</td>
                            <td className="px-2 py-2 text-right tabular-nums">
                              <span className={Number(sim.adjusted_result_accuracy ?? 0) > Number(sim.raw_result_accuracy ?? 0) ? 'text-emerald-400' : 'text-navy-400'}>
                                {(Number(sim.adjusted_result_accuracy ?? 0)*100).toFixed(2)}%
                              </span>
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums">
                              <span className={Number(sim.adjusted_pred_draw_rate ?? 0) >= 0.05 ? 'text-emerald-400' : 'text-red-400'}>
                                {(Number(sim.adjusted_pred_draw_rate ?? 0)*100).toFixed(1)}%
                              </span>
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums">
                              <span className={Number(sim.draw_capture_rate ?? 0) > 0.10 ? 'text-emerald-400' : 'text-navy-400'}>
                                {sim.draw_capture_rate !== null ? (Number(sim.draw_capture_rate)*100).toFixed(1)+'%' : '0%'}
                              </span>
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-navy-300">
                              {sim.home_overcall_reduction !== null ? (Number(sim.home_overcall_reduction)*100).toFixed(1)+'pp' : '0pp'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Draw Floor & Temperature ─────────────────────────────────────────── */}
        {tab === 'drawfloor' && (
          <>
            <div className="bg-navy-900/60 border border-navy-800 rounded-xl px-4 py-3 mb-5 text-xs text-navy-400 leading-relaxed">
              Draw Floor &amp; Temperature Calibration simülasyonları. Orijinal tahminler veya değerlendirmeler
              değiştirilmez. Asimetrik draw-floor redistribüsyonu uygulanır: away olasılığı korunur, draw
              floor'u gerekli olduğunda önce home'dan kesilir. Hiçbir ayarlama aktif edilmez.
            </div>

            {drawFloorLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-14 bg-navy-900/50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : drawFloorSims.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-3">
                <RefreshCw className="w-8 h-8 text-navy-700" />
                <p className="text-sm text-navy-500">Henüz draw floor simülasyonu yok.</p>
              </div>
            ) : (
              <>
                {/* Summary comparison table */}
                <div className="overflow-x-auto rounded-xl border border-navy-800 mb-6">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-navy-800 bg-navy-900/60">
                        <th className="text-left text-navy-500 font-medium px-3 py-2.5 whitespace-nowrap">Mod</th>
                        <th className="text-center text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">Verdict</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">Brier adj</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">LL adj</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">Acc adj</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">Pred H</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">Pred D</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">Pred A</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">D-Prec</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">D-Rec</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">D-F1</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">A-Rec</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">Home↓</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">ECE-D</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-navy-800/40">
                      {drawFloorSims.map((sim) => {
                        const verdict = sim.simulation_verdict ?? 'neutral';
                        const verdictColor = verdict === 'promising' ? 'text-emerald-400'
                          : verdict === 'rejected' ? 'text-red-400'
                          : verdict === 'risky' ? 'text-amber-400'
                          : 'text-navy-500';
                        const brierBetter = Number(sim.adjusted_avg_brier_1x2 ?? 1) < Number(sim.raw_avg_brier_1x2 ?? 0);
                        const accBetter   = Number(sim.adjusted_result_accuracy ?? 0) > Number(sim.raw_result_accuracy ?? 1);
                        return (
                          <tr key={sim.id} className="hover:bg-navy-900/40 transition-colors">
                            <td className="px-3 py-2.5 text-white font-mono text-[11px] whitespace-nowrap max-w-[200px] truncate" title={sim.simulation_key}>
                              {sim.simulation_key}
                            </td>
                            <td className="px-2 py-2.5 text-center">
                              <span className={`text-[10px] font-semibold uppercase ${verdictColor}`}>{verdict}</span>
                            </td>
                            <td className={`px-2 py-2.5 text-right tabular-nums ${brierBetter ? 'text-emerald-400' : 'text-red-400'}`}>
                              {Number(sim.adjusted_avg_brier_1x2 ?? 0).toFixed(5)}
                            </td>
                            <td className={`px-2 py-2.5 text-right tabular-nums ${Number(sim.adjusted_avg_log_loss_1x2 ?? 1) < Number(sim.raw_avg_log_loss_1x2 ?? 0) ? 'text-emerald-400' : 'text-red-400'}`}>
                              {Number(sim.adjusted_avg_log_loss_1x2 ?? 0).toFixed(5)}
                            </td>
                            <td className={`px-2 py-2.5 text-right tabular-nums ${accBetter ? 'text-emerald-400' : 'text-navy-400'}`}>
                              {(Number(sim.adjusted_result_accuracy ?? 0)*100).toFixed(2)}%
                            </td>
                            <td className="px-2 py-2.5 text-right tabular-nums text-navy-300">{(Number(sim.adjusted_pred_home_rate ?? 0)*100).toFixed(1)}%</td>
                            <td className={`px-2 py-2.5 text-right tabular-nums ${Number(sim.adjusted_pred_draw_rate ?? 0) >= 0.12 ? 'text-emerald-400' : 'text-amber-400'}`}>
                              {(Number(sim.adjusted_pred_draw_rate ?? 0)*100).toFixed(1)}%
                            </td>
                            <td className={`px-2 py-2.5 text-right tabular-nums ${Number(sim.adjusted_pred_away_rate ?? 0) >= 0.08 ? 'text-navy-300' : 'text-red-400'}`}>
                              {(Number(sim.adjusted_pred_away_rate ?? 0)*100).toFixed(1)}%
                            </td>
                            <td className="px-2 py-2.5 text-right tabular-nums text-navy-400">
                              {sim.draw_precision !== null ? (Number(sim.draw_precision)*100).toFixed(1)+'%' : '–'}
                            </td>
                            <td className="px-2 py-2.5 text-right tabular-nums text-navy-400">
                              {sim.draw_recall !== null ? (Number(sim.draw_recall)*100).toFixed(1)+'%' : '–'}
                            </td>
                            <td className={`px-2 py-2.5 text-right tabular-nums font-medium ${Number(sim.draw_f1 ?? 0) > 0.20 ? 'text-emerald-400' : Number(sim.draw_f1 ?? 0) > 0.10 ? 'text-amber-400' : 'text-red-400'}`}>
                              {sim.draw_f1 !== null ? Number(sim.draw_f1).toFixed(3) : '–'}
                            </td>
                            <td className="px-2 py-2.5 text-right tabular-nums text-navy-400">
                              {sim.away_recall !== null ? (Number(sim.away_recall)*100).toFixed(1)+'%' : '–'}
                            </td>
                            <td className="px-2 py-2.5 text-right tabular-nums text-navy-300">
                              {sim.home_overcall_reduction !== null ? (Number(sim.home_overcall_reduction)*100).toFixed(1)+'pp' : '–'}
                            </td>
                            <td className={`px-2 py-2.5 text-right tabular-nums ${Number(sim.expected_calibration_error_draw ?? 1) < 0.04 ? 'text-emerald-400' : 'text-amber-400'}`}>
                              {sim.expected_calibration_error_draw !== null ? Number(sim.expected_calibration_error_draw).toFixed(4) : '–'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Actual vs target row */}
                <div className="bg-navy-900/40 border border-navy-800 rounded-xl px-4 py-3 mb-6 text-xs text-navy-400 flex flex-wrap gap-4">
                  <span>Gerçek H/D/A: <span className="text-white tabular-nums">44.9% / 26.1% / 29.0%</span></span>
                  <span>Raw Pred H/D/A: <span className="text-amber-400 tabular-nums">96.3% / 0.0% / 3.7%</span></span>
                  <span>Raw Brier: <span className="text-white tabular-nums">0.211876</span></span>
                  <span>Raw Log Loss: <span className="text-white tabular-nums">1.054530</span></span>
                  <span>Raw Accuracy: <span className="text-white tabular-nums">46.70%</span></span>
                </div>

                {/* Detail cards with reliability bins */}
                <div className="space-y-3">
                  {drawFloorSims.map((sim) => {
                    const isExpanded = expandedBins === sim.id;
                    const verdict = sim.simulation_verdict ?? 'neutral';
                    const flags = sim.rejection_flags ?? [];
                    return (
                      <div key={sim.id} className="bg-navy-900/60 border border-navy-800 rounded-xl p-4">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <span className="text-xs font-bold text-white font-mono">{sim.simulation_key}</span>
                            {verdict === 'promising' && <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">PROMISING</span>}
                            {verdict === 'rejected' && <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/15 text-red-400 border border-red-500/25">REJECTED</span>}
                            {verdict === 'risky' && <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/25">RISKY</span>}
                          </div>
                          {(sim.reliability_bins_draw?.length ?? 0) > 0 && (
                            <button
                              onClick={() => setExpandedBins(isExpanded ? null : sim.id)}
                              className="text-[10px] text-navy-500 hover:text-champagne transition-colors flex items-center gap-1"
                            >
                              Reliability Bins {isExpanded ? '▲' : '▼'}
                            </button>
                          )}
                        </div>

                        {/* Rejection flags */}
                        {flags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {flags.map((f, i) => (
                              <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full border ${
                                f.startsWith('REJECTED') ? 'bg-red-500/10 border-red-500/20 text-red-300'
                                : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                              }`}>{f}</span>
                            ))}
                          </div>
                        )}

                        {/* Key metrics inline */}
                        <div className="grid grid-cols-4 gap-2 text-xs sm:grid-cols-8">
                          <div className="bg-navy-800/40 rounded-lg p-2">
                            <p className="text-[9px] text-navy-500 uppercase mb-0.5">D-F1</p>
                            <p className={`font-bold tabular-nums ${Number(sim.draw_f1??0)>0.20 ? 'text-emerald-400' : Number(sim.draw_f1??0)>0.10 ? 'text-amber-400' : 'text-red-400'}`}>
                              {sim.draw_f1 !== null ? Number(sim.draw_f1).toFixed(3) : '–'}
                            </p>
                          </div>
                          <div className="bg-navy-800/40 rounded-lg p-2">
                            <p className="text-[9px] text-navy-500 uppercase mb-0.5">D-Prec</p>
                            <p className="text-white tabular-nums">{sim.draw_precision !== null ? (Number(sim.draw_precision)*100).toFixed(0)+'%' : '–'}</p>
                          </div>
                          <div className="bg-navy-800/40 rounded-lg p-2">
                            <p className="text-[9px] text-navy-500 uppercase mb-0.5">D-Rec</p>
                            <p className="text-white tabular-nums">{sim.draw_recall !== null ? (Number(sim.draw_recall)*100).toFixed(0)+'%' : '–'}</p>
                          </div>
                          <div className="bg-navy-800/40 rounded-lg p-2">
                            <p className="text-[9px] text-navy-500 uppercase mb-0.5">Draw↑</p>
                            <p className={`tabular-nums ${Number(sim.adjusted_pred_draw_rate??0)>=0.12?'text-emerald-400':'text-amber-400'}`}>
                              {(Number(sim.adjusted_pred_draw_rate??0)*100).toFixed(1)}%
                            </p>
                          </div>
                          <div className="bg-navy-800/40 rounded-lg p-2">
                            <p className="text-[9px] text-navy-500 uppercase mb-0.5">A-F1</p>
                            <p className="text-navy-300 tabular-nums">{sim.away_f1 !== null ? Number(sim.away_f1).toFixed(3) : '–'}</p>
                          </div>
                          <div className="bg-navy-800/40 rounded-lg p-2">
                            <p className="text-[9px] text-navy-500 uppercase mb-0.5">Home↓</p>
                            <p className="text-sky-400 tabular-nums">{sim.home_overcall_reduction !== null ? (Number(sim.home_overcall_reduction)*100).toFixed(1)+'pp' : '–'}</p>
                          </div>
                          <div className="bg-navy-800/40 rounded-lg p-2">
                            <p className="text-[9px] text-navy-500 uppercase mb-0.5">Acc adj</p>
                            <p className={`tabular-nums ${Number(sim.adjusted_result_accuracy??0)>Number(sim.raw_result_accuracy??0)?'text-emerald-400':'text-navy-400'}`}>
                              {(Number(sim.adjusted_result_accuracy??0)*100).toFixed(2)}%
                            </p>
                          </div>
                          <div className="bg-navy-800/40 rounded-lg p-2">
                            <p className="text-[9px] text-navy-500 uppercase mb-0.5">ECE-D</p>
                            <p className={`tabular-nums ${Number(sim.expected_calibration_error_draw??1)<0.04?'text-emerald-400':'text-amber-400'}`}>
                              {sim.expected_calibration_error_draw !== null ? Number(sim.expected_calibration_error_draw).toFixed(4) : '–'}
                            </p>
                          </div>
                        </div>

                        {/* Reliability bins (expandable) */}
                        {isExpanded && sim.reliability_bins_draw && sim.reliability_bins_draw.length > 0 && (
                          <div className="mt-3 overflow-x-auto">
                            <table className="w-full text-[10px]">
                              <thead>
                                <tr className="border-b border-navy-800">
                                  <th className="text-left text-navy-500 font-medium px-2 py-1.5">Bin (p_draw)</th>
                                  <th className="text-right text-navy-500 font-medium px-2 py-1.5">N</th>
                                  <th className="text-right text-navy-500 font-medium px-2 py-1.5">Avg Pred D</th>
                                  <th className="text-right text-navy-500 font-medium px-2 py-1.5">Actual D Rate</th>
                                  <th className="text-right text-navy-500 font-medium px-2 py-1.5">Gap</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-navy-800/40">
                                {sim.reliability_bins_draw.map((bin) => (
                                  <tr key={bin.bin} className="hover:bg-navy-800/30">
                                    <td className="px-2 py-1.5 text-white font-mono">{bin.bin}</td>
                                    <td className="px-2 py-1.5 text-right text-navy-400 tabular-nums">{bin.n}</td>
                                    <td className="px-2 py-1.5 text-right text-navy-300 tabular-nums">{(bin.avg_pred_draw*100).toFixed(1)}%</td>
                                    <td className="px-2 py-1.5 text-right text-champagne tabular-nums">{(bin.actual_draw_rate*100).toFixed(1)}%</td>
                                    <td className={`px-2 py-1.5 text-right tabular-nums ${bin.gap < 0.05 ? 'text-emerald-400' : bin.gap < 0.10 ? 'text-amber-400' : 'text-red-400'}`}>
                                      {(bin.gap*100).toFixed(1)}pp
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {/* ── Temperature Grid Search ──────────────────────────────────────────── */}
        {tab === 'tempgrid' && (
          <>
            <div className="bg-navy-900/60 border border-navy-800 rounded-xl px-4 py-3 mb-5 text-xs text-navy-400 leading-relaxed">
              Sıcaklık ölçekleme (T) grid araması — T=1.2 ile T=1.8 arası, adım 0.1. Ana sıra: temp → compbias.
              Ters sıra: compbias → temp (T=1.3–1.7). Formül: p_i^(1/T) / Σ p_j^(1/T). Orijinal tahminler değiştirilmez.
            </div>

            {/* Baseline reference bar */}
            <div className="bg-navy-900/40 border border-navy-800 rounded-xl px-4 py-3 mb-5 text-xs text-navy-400 flex flex-wrap gap-4">
              <span>Gerçek H/D/A: <span className="text-white tabular-nums">44.9% / 26.1% / 29.0%</span></span>
              <span>Raw Brier: <span className="text-white tabular-nums">0.21187602</span></span>
              <span>Raw Log Loss: <span className="text-white tabular-nums">1.05452988</span></span>
              <span>Raw Accuracy: <span className="text-white tabular-nums">46.70%</span></span>
              <span>CompBias Brier: <span className="text-champagne tabular-nums">0.20738331</span></span>
              <span>CompBias Accuracy: <span className="text-champagne tabular-nums">48.38%</span></span>
            </div>

            {tempGridLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-14 bg-navy-900/50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : tempGridSims.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-3">
                <RefreshCw className="w-8 h-8 text-navy-700" />
                <p className="text-sm text-navy-500">Henüz temperature grid simülasyonu yok.</p>
              </div>
            ) : (
              <>
                {/* Main comparison table */}
                <div className="overflow-x-auto rounded-xl border border-navy-800 mb-6">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-navy-800 bg-navy-900/60">
                        <th className="text-left text-navy-500 font-medium px-3 py-2.5 whitespace-nowrap">Mod</th>
                        <th className="text-center text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">Sıra</th>
                        <th className="text-center text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">T</th>
                        <th className="text-center text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">Verdict</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">Brier adj</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">Skill/Raw</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">Skill/CB</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">LL adj</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">Acc adj</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">Pred H</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">Pred D</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">Pred A</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">D-Prec</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">D-Rec</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">D-F1</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">A-Rec</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">Home↓</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">ECE-D</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">CalSlope</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-navy-800/40">
                      {tempGridSims.map((sim) => {
                        const verdict = sim.simulation_verdict ?? 'neutral';
                        const verdictColor = verdict === 'promising' ? 'text-emerald-400'
                          : verdict === 'rejected' ? 'text-red-400'
                          : verdict === 'risky' ? 'text-amber-400'
                          : 'text-navy-500';
                        const cfg = sim.probability_transform_config as Record<string, unknown> | null;
                        const pipelineLabel = cfg?.pipeline_order as string ?? '–';
                        const tVal = cfg?.temperature as number ?? null;
                        const skillRaw = sim.brier_skill_vs_raw;
                        const skillCB  = sim.brier_skill_vs_compbias;
                        const slope    = sim.calibration_slope_draw;
                        const slopeOk  = slope !== null && slope >= 0.9 && slope <= 1.1;
                        return (
                          <tr key={sim.id} className="hover:bg-navy-900/40 transition-colors">
                            <td className="px-3 py-2.5 text-white font-mono text-[11px] max-w-[180px] truncate whitespace-nowrap" title={sim.simulation_key}>
                              {sim.simulation_key}
                            </td>
                            <td className="px-2 py-2.5 text-center">
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                                pipelineLabel === 'temp_then_compbias'
                                  ? 'bg-sky-500/10 text-sky-400'
                                  : 'bg-amber-500/10 text-amber-400'
                              }`}>
                                {pipelineLabel === 'temp_then_compbias' ? 'T→CB' : 'CB→T'}
                              </span>
                            </td>
                            <td className="px-2 py-2.5 text-center text-white font-mono font-bold tabular-nums">
                              {tVal !== null ? tVal.toFixed(2) : '–'}
                            </td>
                            <td className="px-2 py-2.5 text-center">
                              <span className={`text-[10px] font-semibold uppercase ${verdictColor}`}>{verdict}</span>
                            </td>
                            <td className={`px-2 py-2.5 text-right tabular-nums font-mono ${Number(sim.adjusted_avg_brier_1x2??1) < 0.21187602 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {Number(sim.adjusted_avg_brier_1x2 ?? 0).toFixed(6)}
                            </td>
                            <td className={`px-2 py-2.5 text-right tabular-nums ${skillRaw !== null && Number(skillRaw) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {skillRaw !== null ? (Number(skillRaw) * 100).toFixed(3) + '%' : '–'}
                            </td>
                            <td className={`px-2 py-2.5 text-right tabular-nums ${skillCB !== null && Number(skillCB) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {skillCB !== null ? (Number(skillCB) * 100).toFixed(3) + '%' : '–'}
                            </td>
                            <td className={`px-2 py-2.5 text-right tabular-nums ${Number(sim.adjusted_avg_log_loss_1x2??1) < 1.05452988 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {Number(sim.adjusted_avg_log_loss_1x2 ?? 0).toFixed(6)}
                            </td>
                            <td className={`px-2 py-2.5 text-right tabular-nums ${Number(sim.adjusted_result_accuracy??0) > 0.466965 ? 'text-emerald-400' : 'text-navy-400'}`}>
                              {(Number(sim.adjusted_result_accuracy ?? 0)*100).toFixed(2)}%
                            </td>
                            <td className="px-2 py-2.5 text-right tabular-nums text-navy-300">{(Number(sim.adjusted_pred_home_rate??0)*100).toFixed(1)}%</td>
                            <td className={`px-2 py-2.5 text-right tabular-nums ${Number(sim.adjusted_pred_draw_rate??0) >= 0.12 ? 'text-emerald-400' : Number(sim.adjusted_pred_draw_rate??0) >= 0.08 ? 'text-amber-400' : 'text-red-400'}`}>
                              {(Number(sim.adjusted_pred_draw_rate ?? 0)*100).toFixed(1)}%
                            </td>
                            <td className={`px-2 py-2.5 text-right tabular-nums ${Number(sim.adjusted_pred_away_rate??0) >= 0.08 ? 'text-navy-300' : 'text-red-400'}`}>
                              {(Number(sim.adjusted_pred_away_rate ?? 0)*100).toFixed(1)}%
                            </td>
                            <td className="px-2 py-2.5 text-right tabular-nums text-navy-400">
                              {sim.draw_precision !== null ? (Number(sim.draw_precision)*100).toFixed(1)+'%' : '–'}
                            </td>
                            <td className="px-2 py-2.5 text-right tabular-nums text-navy-400">
                              {sim.draw_recall !== null ? (Number(sim.draw_recall)*100).toFixed(1)+'%' : '–'}
                            </td>
                            <td className={`px-2 py-2.5 text-right tabular-nums font-medium ${Number(sim.draw_f1??0) > 0.20 ? 'text-emerald-400' : Number(sim.draw_f1??0) > 0.15 ? 'text-amber-400' : 'text-red-400'}`}>
                              {sim.draw_f1 !== null ? Number(sim.draw_f1).toFixed(3) : '–'}
                            </td>
                            <td className="px-2 py-2.5 text-right tabular-nums text-navy-400">
                              {sim.away_recall !== null ? (Number(sim.away_recall)*100).toFixed(1)+'%' : '–'}
                            </td>
                            <td className="px-2 py-2.5 text-right tabular-nums text-navy-300">
                              {sim.home_overcall_reduction !== null ? (Number(sim.home_overcall_reduction)*100).toFixed(1)+'pp' : '–'}
                            </td>
                            <td className={`px-2 py-2.5 text-right tabular-nums ${Number(sim.expected_calibration_error_draw??1) < 0.04 ? 'text-emerald-400' : 'text-amber-400'}`}>
                              {sim.expected_calibration_error_draw !== null ? Number(sim.expected_calibration_error_draw).toFixed(4) : '–'}
                            </td>
                            <td className={`px-2 py-2.5 text-right tabular-nums font-mono ${slopeOk ? 'text-emerald-400' : slope !== null ? 'text-amber-400' : 'text-navy-600'}`}>
                              {slope !== null ? Number(slope).toFixed(3) : 'n/a'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Detail cards with flags + bins */}
                <div className="space-y-3">
                  {tempGridSims.map((sim) => {
                    const isExpanded = expandedBins === sim.id;
                    const verdict = sim.simulation_verdict ?? 'neutral';
                    const flags = sim.rejection_flags ?? [];
                    const cfg = sim.probability_transform_config as Record<string, unknown> | null;
                    const pipelineLabel = cfg?.pipeline_order as string ?? '–';
                    const tVal = cfg?.temperature as number ?? null;
                    return (
                      <div key={sim.id} className="bg-navy-900/60 border border-navy-800 rounded-xl p-4">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-white font-mono">{sim.simulation_key}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              pipelineLabel === 'temp_then_compbias' ? 'bg-sky-500/10 text-sky-400' : 'bg-amber-500/10 text-amber-400'
                            }`}>
                              {pipelineLabel === 'temp_then_compbias' ? 'T → CB' : 'CB → T'}
                            </span>
                            {tVal !== null && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-navy-800 text-navy-300 font-mono">T={tVal}</span>
                            )}
                            {verdict === 'promising' && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">PROMISING</span>}
                            {verdict === 'rejected' && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/15 text-red-400 border border-red-500/25">REJECTED</span>}
                            {verdict === 'risky' && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/25">RISKY</span>}
                          </div>
                          {(sim.reliability_bins_draw?.length ?? 0) > 0 && (
                            <button
                              onClick={() => setExpandedBins(isExpanded ? null : sim.id)}
                              className="text-[10px] text-navy-500 hover:text-champagne transition-colors flex items-center gap-1 shrink-0"
                            >
                              Reliability Bins {isExpanded ? '▲' : '▼'}
                            </button>
                          )}
                        </div>

                        {flags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {flags.map((f, i) => (
                              <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full border ${
                                f.startsWith('REJECTED') ? 'bg-red-500/10 border-red-500/20 text-red-300'
                                : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                              }`}>{f}</span>
                            ))}
                          </div>
                        )}

                        <div className="grid grid-cols-4 gap-2 text-xs sm:grid-cols-8">
                          <div className="bg-navy-800/40 rounded-lg p-2">
                            <p className="text-[9px] text-navy-500 uppercase mb-0.5">D-F1</p>
                            <p className={`font-bold tabular-nums ${Number(sim.draw_f1??0) > 0.20 ? 'text-emerald-400' : Number(sim.draw_f1??0) > 0.15 ? 'text-amber-400' : 'text-red-400'}`}>
                              {sim.draw_f1 !== null ? Number(sim.draw_f1).toFixed(3) : '–'}
                            </p>
                          </div>
                          <div className="bg-navy-800/40 rounded-lg p-2">
                            <p className="text-[9px] text-navy-500 uppercase mb-0.5">D-Prec</p>
                            <p className="text-white tabular-nums">{sim.draw_precision !== null ? (Number(sim.draw_precision)*100).toFixed(0)+'%' : '–'}</p>
                          </div>
                          <div className="bg-navy-800/40 rounded-lg p-2">
                            <p className="text-[9px] text-navy-500 uppercase mb-0.5">D-Rec</p>
                            <p className="text-white tabular-nums">{sim.draw_recall !== null ? (Number(sim.draw_recall)*100).toFixed(0)+'%' : '–'}</p>
                          </div>
                          <div className="bg-navy-800/40 rounded-lg p-2">
                            <p className="text-[9px] text-navy-500 uppercase mb-0.5">Draw Rate</p>
                            <p className={`tabular-nums ${Number(sim.adjusted_pred_draw_rate??0) >= 0.12 ? 'text-emerald-400' : 'text-amber-400'}`}>
                              {(Number(sim.adjusted_pred_draw_rate??0)*100).toFixed(1)}%
                            </p>
                          </div>
                          <div className="bg-navy-800/40 rounded-lg p-2">
                            <p className="text-[9px] text-navy-500 uppercase mb-0.5">Skill/Raw</p>
                            <p className={`tabular-nums ${Number(sim.brier_skill_vs_raw??0) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {sim.brier_skill_vs_raw !== null ? (Number(sim.brier_skill_vs_raw)*100).toFixed(3)+'%' : '–'}
                            </p>
                          </div>
                          <div className="bg-navy-800/40 rounded-lg p-2">
                            <p className="text-[9px] text-navy-500 uppercase mb-0.5">Skill/CB</p>
                            <p className={`tabular-nums ${Number(sim.brier_skill_vs_compbias??0) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {sim.brier_skill_vs_compbias !== null ? (Number(sim.brier_skill_vs_compbias)*100).toFixed(3)+'%' : '–'}
                            </p>
                          </div>
                          <div className="bg-navy-800/40 rounded-lg p-2">
                            <p className="text-[9px] text-navy-500 uppercase mb-0.5">Cal Slope</p>
                            <p className={`tabular-nums font-mono ${sim.calibration_slope_draw !== null && Number(sim.calibration_slope_draw) >= 0.9 && Number(sim.calibration_slope_draw) <= 1.1 ? 'text-emerald-400' : sim.calibration_slope_draw !== null ? 'text-amber-400' : 'text-navy-600'}`}>
                              {sim.calibration_slope_draw !== null ? Number(sim.calibration_slope_draw).toFixed(3) : 'n/a'}
                            </p>
                          </div>
                          <div className="bg-navy-800/40 rounded-lg p-2">
                            <p className="text-[9px] text-navy-500 uppercase mb-0.5">ECE-D</p>
                            <p className={`tabular-nums ${Number(sim.expected_calibration_error_draw??1) < 0.04 ? 'text-emerald-400' : 'text-amber-400'}`}>
                              {sim.expected_calibration_error_draw !== null ? Number(sim.expected_calibration_error_draw).toFixed(4) : '–'}
                            </p>
                          </div>
                        </div>

                        {isExpanded && sim.reliability_bins_draw && sim.reliability_bins_draw.length > 0 && (
                          <div className="mt-3 overflow-x-auto">
                            <table className="w-full text-[10px]">
                              <thead>
                                <tr className="border-b border-navy-800">
                                  <th className="text-left text-navy-500 font-medium px-2 py-1.5">Bin (p_draw)</th>
                                  <th className="text-right text-navy-500 font-medium px-2 py-1.5">N</th>
                                  <th className="text-right text-navy-500 font-medium px-2 py-1.5">Avg Pred D</th>
                                  <th className="text-right text-navy-500 font-medium px-2 py-1.5">Actual D Rate</th>
                                  <th className="text-right text-navy-500 font-medium px-2 py-1.5">Gap</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-navy-800/40">
                                {sim.reliability_bins_draw.map((bin) => (
                                  <tr key={bin.bin} className="hover:bg-navy-800/30">
                                    <td className="px-2 py-1.5 text-white font-mono">{bin.bin}</td>
                                    <td className="px-2 py-1.5 text-right text-navy-400 tabular-nums">{bin.n}</td>
                                    <td className="px-2 py-1.5 text-right text-navy-300 tabular-nums">{(bin.avg_pred_draw*100).toFixed(1)}%</td>
                                    <td className="px-2 py-1.5 text-right text-champagne tabular-nums">{(bin.actual_draw_rate*100).toFixed(1)}%</td>
                                    <td className={`px-2 py-1.5 text-right tabular-nums ${bin.gap < 0.05 ? 'text-emerald-400' : bin.gap < 0.10 ? 'text-amber-400' : 'text-red-400'}`}>
                                      {(bin.gap*100).toFixed(1)}pp
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {/* ── Competition Pathology Simülasyonları ────────────────────────────── */}
        {tab === 'pathology' && (
          <>
            <div className="bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3 mb-5 text-xs text-red-300 leading-relaxed">
              <strong className="text-red-200">Patoloji Tanı:</strong> T=1.6 aday rerun sonrası tespit edilen iki kritik patoloji için 13 robust bias
              transform modu. Ligue 1: ham eklemeli bias sonrası tahmin beraberlik oranı %78.8 (hedef ≤%40).
              Bundesliga: doğruluk −3.85pp (hedef ≥−2pp). Tüm modlar REJECT — kapsamlı düzeltme gerekiyor.
            </div>

            {/* Diagnosis summary cards */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-navy-900/60 border border-red-500/30 rounded-xl p-4">
                <p className="text-[10px] text-red-400 font-semibold uppercase tracking-wider mb-2">Ligue 1 Patolojisi</p>
                <p className="text-2xl font-bold text-red-400 tabular-nums mb-1">78.8%</p>
                <p className="text-xs text-navy-400 mb-3">Tahmin Beraberlik Oranı (hedef: ≤40%)</p>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-navy-500">Ham bias (draw)</span>
                    <span className="text-amber-400 tabular-nums font-mono">+0.0927</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-navy-500">Ham bias (home)</span>
                    <span className="text-sky-400 tabular-nums font-mono">−0.1429</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-navy-500">Sonuç (127/137)</span>
                    <span className="text-red-400 tabular-nums">%92.7 argmax değişti</span>
                  </div>
                </div>
              </div>
              <div className="bg-navy-900/60 border border-amber-500/30 rounded-xl p-4">
                <p className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider mb-2">Bundesliga Patolojisi</p>
                <p className="text-2xl font-bold text-amber-400 tabular-nums mb-1">−3.85pp</p>
                <p className="text-xs text-navy-400 mb-3">Doğruluk Düşüşü (hedef: ≥−2pp)</p>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-navy-500">Ham bias (away)</span>
                    <span className="text-amber-400 tabular-nums font-mono">+0.0559</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-navy-500">Ham bias (draw)</span>
                    <span className="text-sky-400 tabular-nums font-mono">−0.0422</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-navy-500">Sonuç (21/104)</span>
                    <span className="text-amber-400 tabular-nums">10 zarar, 6 katkı</span>
                  </div>
                </div>
              </div>
            </div>

            {pathologyLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-28 bg-navy-900/50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : pathologySims.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-3">
                <RefreshCw className="w-8 h-8 text-navy-700" />
                <p className="text-sm text-navy-500">Patoloji simülasyonu bulunamadı.</p>
                <p className="text-xs text-navy-600 text-center max-w-sm">
                  ml_run_pathology_simulation() RPC'si çalıştırıldıktan sonra görünür.
                </p>
              </div>
            ) : (
              <>
                {/* Comparison table */}
                <div className="overflow-x-auto rounded-xl border border-navy-800 mb-6">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-navy-800 bg-navy-900/60">
                        <th className="text-left text-navy-500 font-medium px-3 py-2.5 whitespace-nowrap">Mod</th>
                        <th className="text-left text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">Transform</th>
                        <th className="text-center text-navy-500 font-medium px-2 py-2.5">Verdict</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5">Brier</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5">Acc</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5">Pred D%</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5">D-F1</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">Skill/CB</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">Cal Slope</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">L1 D%</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">BL Δacc</th>
                        <th className="text-right text-navy-500 font-medium px-2 py-2.5 whitespace-nowrap">Changed%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-navy-800/40">
                      {pathologySims.map((sim) => {
                        const verdict = sim.simulation_verdict ?? 'REJECT';
                        const verdictUpper = verdict.toUpperCase();
                        const verdictColor = verdictUpper === 'PROMISING' ? 'text-emerald-400'
                          : verdictUpper === 'NEUTRAL' ? 'text-sky-400'
                          : verdictUpper === 'RISKY' ? 'text-amber-400'
                          : 'text-red-400';
                        const pn = sim.pathology_notes;
                        const stab = sim.argmax_stability_json?.global;
                        const l1Pct = pn?.ligue1_pred_draw_pct ?? null;
                        const blDelta = pn?.bundesliga_acc_delta ?? null;
                        const changedRate = stab ? stab.changed_rate : null;
                        const slope = sim.calibration_slope_draw;
                        const biasType = sim.bias_transform_config?.bias_type ?? '—';
                        return (
                          <tr key={sim.id} className="hover:bg-navy-900/40 transition-colors">
                            <td className="px-3 py-2.5 text-white font-mono text-[10px] whitespace-nowrap max-w-[200px] truncate" title={sim.simulation_key}>
                              {sim.simulation_key.replace('temp160_compbias_', '')}
                            </td>
                            <td className="px-2 py-2.5 text-navy-400 text-[10px] whitespace-nowrap">{biasType}</td>
                            <td className="px-2 py-2.5 text-center">
                              <span className={`text-[10px] font-semibold ${verdictColor}`}>{verdictUpper}</span>
                            </td>
                            <td className={`px-2 py-2.5 text-right tabular-nums ${Number(sim.adjusted_avg_brier_1x2 ?? 1) < 0.21187602 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {sim.adjusted_avg_brier_1x2 !== null ? Number(sim.adjusted_avg_brier_1x2).toFixed(6) : '–'}
                            </td>
                            <td className="px-2 py-2.5 text-right tabular-nums text-navy-300">
                              {sim.adjusted_result_accuracy !== null ? Number(sim.adjusted_result_accuracy).toFixed(2) + '%' : '–'}
                            </td>
                            <td className={`px-2 py-2.5 text-right tabular-nums ${Number(sim.adjusted_pred_draw_rate ?? 0) >= 5 ? 'text-emerald-400' : 'text-amber-400'}`}>
                              {sim.adjusted_pred_draw_rate !== null ? Number(sim.adjusted_pred_draw_rate).toFixed(1) + '%' : '–'}
                            </td>
                            <td className={`px-2 py-2.5 text-right tabular-nums font-medium ${Number(sim.draw_f1 ?? 0) > 15 ? 'text-emerald-400' : Number(sim.draw_f1 ?? 0) > 5 ? 'text-amber-400' : 'text-red-400'}`}>
                              {sim.draw_f1 !== null ? Number(sim.draw_f1).toFixed(1) : '–'}
                            </td>
                            <td className={`px-2 py-2.5 text-right tabular-nums ${Number(sim.brier_skill_vs_compbias ?? 0) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {sim.brier_skill_vs_compbias !== null ? (Number(sim.brier_skill_vs_compbias) * 100).toFixed(3) + '%' : '–'}
                            </td>
                            <td className={`px-2 py-2.5 text-right tabular-nums font-mono ${slope !== null && Number(slope) >= 0.8 && Number(slope) <= 1.2 ? 'text-emerald-400' : slope !== null ? 'text-red-400' : 'text-navy-600'}`}>
                              {slope !== null ? Number(slope).toFixed(3) : 'n/a'}
                            </td>
                            <td className={`px-2 py-2.5 text-right tabular-nums ${l1Pct !== null && l1Pct <= 40 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {l1Pct !== null ? l1Pct.toFixed(1) + '%' : '–'}
                            </td>
                            <td className={`px-2 py-2.5 text-right tabular-nums ${blDelta !== null && blDelta >= -2 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {blDelta !== null ? (blDelta >= 0 ? '+' : '') + blDelta.toFixed(2) + 'pp' : '–'}
                            </td>
                            <td className={`px-2 py-2.5 text-right tabular-nums ${changedRate !== null && changedRate <= 45 ? 'text-navy-300' : 'text-amber-400'}`}>
                              {changedRate !== null ? changedRate.toFixed(1) + '%' : '–'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Detail cards */}
                <div className="space-y-3">
                  {pathologySims.map((sim) => {
                    const isExpanded = expandedBins === sim.id;
                    const verdict = (sim.simulation_verdict ?? 'REJECT').toUpperCase();
                    const pn = sim.pathology_notes;
                    const stab = sim.argmax_stability_json?.global;
                    const mb = sim.margin_bucket_metrics;
                    const rejectFlags = pn?.reject_flags ?? [];
                    const riskyFlags = pn?.risky_flags ?? [];
                    return (
                      <div key={sim.id} className="bg-navy-900/60 border border-navy-800 rounded-xl p-4">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-white font-mono">
                              {sim.simulation_key.replace('temp160_compbias_', '')}
                            </span>
                            {verdict === 'PROMISING' && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">PROMISING</span>}
                            {verdict === 'NEUTRAL' && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-sky-500/15 text-sky-400 border border-sky-500/25">NEUTRAL</span>}
                            {verdict === 'RISKY' && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/25">RISKY</span>}
                            {verdict === 'REJECT' && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/15 text-red-400 border border-red-500/25">REJECT</span>}
                            {sim.bias_transform_config && (
                              <span className="text-[10px] text-navy-500 font-mono">{sim.bias_transform_config.bias_type}</span>
                            )}
                          </div>
                          {(sim.reliability_bins_draw?.length ?? 0) > 0 && (
                            <button
                              onClick={() => setExpandedBins(isExpanded ? null : sim.id)}
                              className="text-[10px] text-navy-500 hover:text-champagne transition-colors flex items-center gap-1 shrink-0"
                            >
                              Reliability Bins {isExpanded ? '▲' : '▼'}
                            </button>
                          )}
                        </div>

                        {/* Reject / risky flags */}
                        {(rejectFlags.length > 0 || riskyFlags.length > 0) && (
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {rejectFlags.map((f, i) => (
                              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-300">{f}</span>
                            ))}
                            {riskyFlags.map((f, i) => (
                              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300">{f}</span>
                            ))}
                          </div>
                        )}

                        {/* Pathology metrics */}
                        {pn && (
                          <div className="grid grid-cols-2 gap-3 mb-3">
                            <div className="bg-navy-800/40 rounded-xl p-3">
                              <p className="text-[9px] text-red-400 font-semibold uppercase tracking-wider mb-2">Ligue 1</p>
                              <div className="grid grid-cols-3 gap-2 text-xs">
                                <div>
                                  <p className="text-[9px] text-navy-500 mb-0.5">Pred D%</p>
                                  <p className={`font-bold tabular-nums ${pn.ligue1_pred_draw_pct <= 40 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {pn.ligue1_pred_draw_pct.toFixed(1)}%
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[9px] text-navy-500 mb-0.5">Değişen</p>
                                  <p className="text-navy-300 tabular-nums">{pn.ligue1_changed}/{pn.ligue1_n}</p>
                                </div>
                                <div>
                                  <p className="text-[9px] text-navy-500 mb-0.5">Katkı/Zarar</p>
                                  <p className="tabular-nums">
                                    <span className="text-emerald-400">+{pn.ligue1_helped}</span>
                                    <span className="text-navy-600"> / </span>
                                    <span className="text-red-400">−{pn.ligue1_harmed}</span>
                                  </p>
                                </div>
                              </div>
                            </div>
                            <div className="bg-navy-800/40 rounded-xl p-3">
                              <p className="text-[9px] text-amber-400 font-semibold uppercase tracking-wider mb-2">Bundesliga</p>
                              <div className="grid grid-cols-3 gap-2 text-xs">
                                <div>
                                  <p className="text-[9px] text-navy-500 mb-0.5">Acc Delta</p>
                                  <p className={`font-bold tabular-nums ${pn.bundesliga_acc_delta >= -2 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {pn.bundesliga_acc_delta >= 0 ? '+' : ''}{pn.bundesliga_acc_delta.toFixed(2)}pp
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[9px] text-navy-500 mb-0.5">Değişen</p>
                                  <p className="text-navy-300 tabular-nums">{pn.bundesliga_changed}/{pn.bundesliga_n}</p>
                                </div>
                                <div>
                                  <p className="text-[9px] text-navy-500 mb-0.5">Katkı/Zarar</p>
                                  <p className="tabular-nums">
                                    <span className="text-emerald-400">+{pn.bundesliga_helped}</span>
                                    <span className="text-navy-600"> / </span>
                                    <span className="text-red-400">−{pn.bundesliga_harmed}</span>
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Global metrics + margin buckets */}
                        <div className="grid grid-cols-4 gap-2 text-xs sm:grid-cols-8 mb-2">
                          <div className="bg-navy-800/40 rounded-lg p-2">
                            <p className="text-[9px] text-navy-500 uppercase mb-0.5">Brier</p>
                            <p className={`font-bold tabular-nums ${Number(sim.adjusted_avg_brier_1x2 ?? 1) < 0.21187602 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {sim.adjusted_avg_brier_1x2 !== null ? Number(sim.adjusted_avg_brier_1x2).toFixed(5) : '–'}
                            </p>
                          </div>
                          <div className="bg-navy-800/40 rounded-lg p-2">
                            <p className="text-[9px] text-navy-500 uppercase mb-0.5">Acc</p>
                            <p className="text-white tabular-nums">
                              {sim.adjusted_result_accuracy !== null ? Number(sim.adjusted_result_accuracy).toFixed(2) + '%' : '–'}
                            </p>
                          </div>
                          <div className="bg-navy-800/40 rounded-lg p-2">
                            <p className="text-[9px] text-navy-500 uppercase mb-0.5">D-F1</p>
                            <p className={`font-bold tabular-nums ${Number(sim.draw_f1 ?? 0) > 15 ? 'text-emerald-400' : Number(sim.draw_f1 ?? 0) > 5 ? 'text-amber-400' : 'text-red-400'}`}>
                              {sim.draw_f1 !== null ? Number(sim.draw_f1).toFixed(1) : '–'}
                            </p>
                          </div>
                          <div className="bg-navy-800/40 rounded-lg p-2">
                            <p className="text-[9px] text-navy-500 uppercase mb-0.5">Cal Slope</p>
                            <p className={`tabular-nums font-mono ${sim.calibration_slope_draw !== null && Number(sim.calibration_slope_draw) >= 0.8 && Number(sim.calibration_slope_draw) <= 1.2 ? 'text-emerald-400' : sim.calibration_slope_draw !== null ? 'text-red-400' : 'text-navy-600'}`}>
                              {sim.calibration_slope_draw !== null ? Number(sim.calibration_slope_draw).toFixed(3) : 'n/a'}
                            </p>
                          </div>
                          {stab && <>
                            <div className="bg-navy-800/40 rounded-lg p-2">
                              <p className="text-[9px] text-navy-500 uppercase mb-0.5">Changed%</p>
                              <p className={`tabular-nums ${stab.changed_rate <= 45 ? 'text-navy-300' : 'text-amber-400'}`}>
                                {stab.changed_rate.toFixed(1)}%
                              </p>
                            </div>
                            <div className="bg-navy-800/40 rounded-lg p-2">
                              <p className="text-[9px] text-navy-500 uppercase mb-0.5">→Draw</p>
                              <p className="text-navy-300 tabular-nums">{stab.changed_to_draw}</p>
                            </div>
                            <div className="bg-navy-800/40 rounded-lg p-2">
                              <p className="text-[9px] text-navy-500 uppercase mb-0.5">Katkı</p>
                              <p className="text-emerald-400 tabular-nums">+{stab.helped}</p>
                            </div>
                            <div className="bg-navy-800/40 rounded-lg p-2">
                              <p className="text-[9px] text-navy-500 uppercase mb-0.5">Zarar</p>
                              <p className="text-red-400 tabular-nums">−{stab.harmed}</p>
                            </div>
                          </>}
                        </div>

                        {/* Margin buckets */}
                        {mb && (
                          <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                            {(['decisive', 'contested', 'close'] as const).map((bucket) => (
                              <div key={bucket} className="bg-navy-800/30 rounded-lg p-2">
                                <p className="text-[9px] text-navy-500 uppercase mb-1 tracking-wider">{bucket}</p>
                                <p className="text-navy-400 tabular-nums">N={mb[bucket].n}</p>
                                <p className="text-white tabular-nums">{mb[bucket].acc !== null ? mb[bucket].acc.toFixed(1) + '%' : '–'}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Reliability bins (expandable) */}
                        {isExpanded && Array.isArray(sim.reliability_bins_draw) && sim.reliability_bins_draw.length > 0 && (
                          <div className="mt-2 overflow-x-auto">
                            <table className="w-full text-[10px]">
                              <thead>
                                <tr className="border-b border-navy-800">
                                  <th className="text-left text-navy-500 font-medium px-2 py-1.5">Bin</th>
                                  <th className="text-right text-navy-500 font-medium px-2 py-1.5">N</th>
                                  <th className="text-right text-navy-500 font-medium px-2 py-1.5">Avg Pred</th>
                                  <th className="text-right text-navy-500 font-medium px-2 py-1.5">Actual Rate</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-navy-800/40">
                                {(sim.reliability_bins_draw as Array<{ bin: string; count: number; avg_pred: number | null; actual_rate: number | null }>).map((b) => (
                                  <tr key={b.bin} className="hover:bg-navy-800/30">
                                    <td className="px-2 py-1.5 text-white font-mono">{b.bin}</td>
                                    <td className="px-2 py-1.5 text-right text-navy-400 tabular-nums">{b.count}</td>
                                    <td className="px-2 py-1.5 text-right text-navy-300 tabular-nums">
                                      {b.avg_pred !== null ? (b.avg_pred * 100).toFixed(1) + '%' : '–'}
                                    </td>
                                    <td className="px-2 py-1.5 text-right text-champagne tabular-nums">
                                      {b.actual_rate !== null ? (b.actual_rate * 100).toFixed(1) + '%' : '–'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Conclusion panel */}
                <div className="mt-6 bg-navy-900/60 border border-navy-800 rounded-xl p-5">
                  <p className="text-xs font-semibold text-white mb-3">Tanı Sonucu</p>
                  <div className="space-y-2 text-xs text-navy-400 leading-relaxed">
                    <p>Tüm 13 robust bias transform modu REJECT sonucu verdi. Temel neden: T=1.6 sonrası
                    düzleşen dağılıma ham eklemeli bias uygulamak yapısal olarak uyumsuz.</p>
                    <p>Ligue 1 draw bias (+0.093) T=1.6 sonrası p_draw değerini neredeyse her maçta argmax
                    konumuna taşıyor. Cap/sigmoid transformları Ligue 1 sorununu çözüyor ancak Bundesliga
                    away bias problemini çözemiyor; multiplicative formlar draw tahminini tamamen bastırıyor.</p>
                    <p className="text-amber-300 font-medium">Önerilen sonraki adım: Bias kalibrasyonunu T ölçeklemesinden ÖNCE uygulamak
                    (CB→T sırası) ve daha küçük delta değerleriyle yeniden optimize etmek.</p>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ── Bias Refinement ─────────────────────────────────────────────────── */}
        {tab === 'refinement' && (
          <>
            {/* Header cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-navy-900/60 border border-navy-800 rounded-xl p-4">
                <p className="text-xs text-navy-500 mb-1">Toplam Mod</p>
                <p className="text-2xl font-bold text-white tabular-nums">{REFINEMENT_MODES.length}</p>
                <p className="text-xs text-navy-500 mt-0.5">5 aile · T→CB &amp; CB→T pipeline</p>
              </div>
              <div className="bg-navy-900/60 border border-navy-800 rounded-xl p-4">
                <p className="text-xs text-navy-500 mb-1">Geçen / Reddedilen</p>
                <p className="text-2xl font-bold tabular-nums">
                  <span className="text-emerald-400">{refinementSims.filter(s => s.simulation_verdict === 'PASS').length}</span>
                  <span className="text-navy-600 mx-1">/</span>
                  <span className="text-red-400">{refinementSims.filter(s => s.simulation_verdict === 'REJECT').length}</span>
                </p>
                <p className="text-xs text-navy-500 mt-0.5">{refinementSims.length} simülasyon yüklendi</p>
              </div>
              <div className="bg-navy-900/60 border border-navy-800 rounded-xl p-4">
                <p className="text-xs text-navy-500 mb-1">En İyi Brier</p>
                {refinementSims.length > 0 ? (() => {
                  const best = [...refinementSims].filter(s => s.adjusted_avg_brier_1x2 !== null)
                    .sort((a, b) => Number(a.adjusted_avg_brier_1x2) - Number(b.adjusted_avg_brier_1x2))[0];
                  return best ? (
                    <>
                      <p className="text-2xl font-bold text-white tabular-nums font-mono">{Number(best.adjusted_avg_brier_1x2).toFixed(6)}</p>
                      <p className="text-xs text-navy-500 mt-0.5 truncate">{best.simulation_key}</p>
                    </>
                  ) : <p className="text-navy-600 text-sm">–</p>;
                })() : <p className="text-navy-600 text-sm">–</p>}
              </div>
            </div>

            {/* Global diagnosis panel */}
            <div className="mb-6 bg-red-500/8 border border-red-500/20 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="space-y-1.5 text-xs text-navy-300 leading-relaxed">
                  <p className="text-red-300 font-semibold">17 modun tamamı REJECT — Yapısal uyumsuzluk devam ediyor</p>
                  <p>
                    Raw model çıktıları üzerine T=1.6 uygulandıktan sonra p_draw ~0.20–0.25 bandına çekiliyor.
                    OLS kalibrasyon eğimini hesaplamak için yeterli draw tahmini (<span className="text-white">pred_draw_rate &lt;5%</span>) ve
                    yeterli bin doluluk yok. Tüm modlarda <span className="text-white">cal_slope 0.35–0.66</span> arasında — eşik 0.80–1.20.
                  </p>
                  <p>
                    Family A (sigmoid k tuning): draw_f1 0.84–11.76 — hiçbiri 15.0 eşiğini geçemiyor.
                    Family B (relative clipping): pred_draw_rate ≈0% — draw tamamen bastırılıyor.
                    Family C (hybrid): aynı sorun, relative cap sigmoid sonrası sıfır draw üretiyor.
                    Family D (CB→T): pred_draw_rate=0%, Bundesliga accuracy −2pp+ düşüyor.
                    Family E (ablation): Ligue 1 draw yarıya düşürülse bile cal_slope sorunu çözülmüyor.
                  </p>
                  <p className="text-amber-300 font-medium">
                    Sonraki adım önerisi: Competition bias değerlerini T=1.6 sonrası proba göre yeniden optimize etmek
                    (mevcut değerler raw proba göre hesaplanmış). Yeni hedef: bias uygulaması sonrası pred_draw_rate ≥12%.
                  </p>
                </div>
              </div>
            </div>

            {refinementLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-12 bg-navy-900/50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : refinementSims.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-3">
                <AlertCircle className="w-8 h-8 text-navy-700" />
                <p className="text-sm text-navy-500">Refinement simülasyonu yok.</p>
                <p className="text-xs text-navy-600">ml_run_bias_refinement_simulation RPC ile çalıştırın.</p>
              </div>
            ) : (
              <>
                {/* Comparison table */}
                <div className="overflow-x-auto rounded-xl border border-navy-800 mb-6">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-navy-800 bg-navy-900/60">
                        <th className="text-left text-navy-500 font-medium px-3 py-2.5 whitespace-nowrap">Mod</th>
                        <th className="text-left text-navy-500 font-medium px-3 py-2.5 whitespace-nowrap">Aile</th>
                        <th className="text-left text-navy-500 font-medium px-3 py-2.5 whitespace-nowrap">Pipeline</th>
                        <th className="text-right text-navy-500 font-medium px-3 py-2.5">Brier</th>
                        <th className="text-right text-navy-500 font-medium px-3 py-2.5">ΔBrier</th>
                        <th className="text-right text-navy-500 font-medium px-3 py-2.5">Acc</th>
                        <th className="text-right text-navy-500 font-medium px-3 py-2.5">Draw F1</th>
                        <th className="text-right text-navy-500 font-medium px-3 py-2.5 whitespace-nowrap">Cal Slope</th>
                        <th className="text-right text-navy-500 font-medium px-3 py-2.5 whitespace-nowrap">Pred D%</th>
                        <th className="text-right text-navy-500 font-medium px-3 py-2.5 whitespace-nowrap">Helped</th>
                        <th className="text-right text-navy-500 font-medium px-3 py-2.5 whitespace-nowrap">Harmed</th>
                        <th className="text-left text-navy-500 font-medium px-3 py-2.5">Verdict</th>
                        <th className="text-left text-navy-500 font-medium px-3 py-2.5 whitespace-nowrap">Reject Flags</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-navy-800/40">
                      {refinementSims.map((s) => {
                        const flags = Array.isArray(s.rejection_flags) ? s.rejection_flags
                          : typeof s.rejection_flags === 'string' ? JSON.parse(s.rejection_flags as unknown as string)
                          : [];
                        const stability = s.argmax_stability_json as {
                          helped?: number; harmed?: number; net_accuracy_impact?: number;
                          global?: { helped?: number; harmed?: number };
                        } | null;
                        const helped = stability?.helped ?? stability?.global?.helped;
                        const harmed = stability?.harmed ?? stability?.global?.harmed;
                        const family = s.simulation_family;
                        const pipeline = s.pipeline_order ?? 'T→CB';
                        const brier = Number(s.adjusted_avg_brier_1x2);
                        const rawBrier = Number(s.raw_avg_brier_1x2);
                        const deltaB = brier - rawBrier;
                        const calSlope = s.calibration_slope_draw;
                        const slopeOk = calSlope !== null && Number(calSlope) >= 0.80 && Number(calSlope) <= 1.20;
                        const isPass = s.simulation_verdict === 'PASS';
                        return (
                          <tr key={s.simulation_key} className="hover:bg-navy-900/30 transition-colors">
                            <td className="px-3 py-2 font-mono text-[10px] text-navy-300 max-w-[200px] truncate whitespace-nowrap">{s.simulation_key}</td>
                            <td className="px-3 py-2 text-navy-400 whitespace-nowrap">{REFINEMENT_FAMILY_LABELS[family ?? ''] ?? family ?? '–'}</td>
                            <td className="px-3 py-2">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${
                                pipeline === 'CB→T' ? 'bg-sky-500/15 text-sky-400' : 'bg-navy-700 text-navy-300'
                              }`}>{pipeline}</span>
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-white tabular-nums">{brier.toFixed(6)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              <span className={deltaB > 0 ? 'text-red-400' : 'text-emerald-400'}>
                                {deltaB > 0 ? '+' : ''}{deltaB.toFixed(6)}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right text-white tabular-nums">{Number(s.adjusted_result_accuracy).toFixed(2)}%</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              <span className={Number(s.draw_f1) >= 15 ? 'text-emerald-400' : 'text-red-400'}>
                                {Number(s.draw_f1 ?? 0).toFixed(2)}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              <span className={slopeOk ? 'text-emerald-400' : 'text-red-400'}>
                                {calSlope !== null ? Number(calSlope).toFixed(4) : '–'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              <span className={Number(s.adjusted_pred_draw_rate) >= 0.05 ? 'text-white' : 'text-red-400'}>
                                {(Number(s.adjusted_pred_draw_rate ?? 0) * 100).toFixed(1)}%
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right text-emerald-400 tabular-nums">{helped ?? '–'}</td>
                            <td className="px-3 py-2 text-right text-red-400 tabular-nums">{harmed ?? '–'}</td>
                            <td className="px-3 py-2">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isPass
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                                  : 'bg-red-500/15 text-red-400 border border-red-500/25'
                              }`}>{s.simulation_verdict ?? '–'}</span>
                            </td>
                            <td className="px-3 py-2 max-w-[220px]">
                              <div className="flex flex-wrap gap-1">
                                {flags.slice(0, 3).map((f: string) => (
                                  <span key={f} className="px-1 py-0.5 rounded text-[9px] bg-red-500/10 text-red-400 border border-red-500/20 whitespace-nowrap">
                                    {f.replace(/_/g, ' ')}
                                  </span>
                                ))}
                                {flags.length > 3 && (
                                  <span className="text-[9px] text-navy-500">+{flags.length - 3}</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Family summary cards */}
                {(['sigmoid_tuning', 'dynamic_relative', 'hybrid', 'cb_then_t', 'league_ablation'] as const).map((fam) => {
                  const famSims = refinementSims.filter(s => s.simulation_family === fam);
                  if (famSims.length === 0) return null;
                  const bestBrier = [...famSims].filter(s => s.adjusted_avg_brier_1x2 !== null)
                    .sort((a, b) => Number(a.adjusted_avg_brier_1x2) - Number(b.adjusted_avg_brier_1x2))[0];
                  const bestF1 = [...famSims].filter(s => s.draw_f1 !== null)
                    .sort((a, b) => Number(b.draw_f1) - Number(a.draw_f1))[0];
                  const passCount = famSims.filter(s => s.simulation_verdict === 'PASS').length;

                  const familyDiagnosis: Record<string, string> = {
                    sigmoid_tuning:   'k=0.50/0.75 ile sigmoid cap 0.08–0.10 arasında tarama. Tüm modlar cal_slope <0.80 ve draw_f1 <15. Sigmoid k düşürülmesi Brier\'ı iyileştiriyor ancak draw bastırma sorunu çözülemiyor.',
                    dynamic_relative: 'T-scaled prob\'a göre ±15–25% göreli cap. pred_draw_rate ≈0% — relative cap bias\'ı tamamen elimine ediyor. F1=0.',
                    hybrid:           'Sigmoid ardından relative cap. İki aşamalı sıkıştırma draw\'ı tamamen bastırıyor. pred_draw_rate=0% her modda.',
                    cb_then_t:        'Bias raw prob\'a uygulandıktan sonra T=1.6. pred_draw_rate=0, Bundesliga −2pp kayıp. Pipeline sırası temel sorunu çözmüyor.',
                    league_ablation:  'L1 draw bias ve BL away bias yarıya indirildi. Cal slope sorunu devam ediyor (0.42–0.44). Ablasyon draw F1\'i biraz artırıyor ancak eşiğe ulaşamıyor.',
                  };

                  return (
                    <div key={fam} className="mb-4 bg-navy-900/50 border border-navy-800 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div>
                          <p className="text-sm font-semibold text-white">{REFINEMENT_FAMILY_LABELS[fam]}</p>
                          <p className="text-xs text-navy-400 mt-0.5">{famSims.length} mod · {passCount} geçti</p>
                        </div>
                        <div className="flex gap-3 shrink-0">
                          {bestBrier && (
                            <div className="text-right">
                              <p className="text-[10px] text-navy-600">En iyi Brier</p>
                              <p className="text-xs font-mono text-white tabular-nums">{Number(bestBrier.adjusted_avg_brier_1x2).toFixed(6)}</p>
                            </div>
                          )}
                          {bestF1 && (
                            <div className="text-right">
                              <p className="text-[10px] text-navy-600">En iyi Draw F1</p>
                              <p className="text-xs font-mono tabular-nums text-amber-400">{Number(bestF1.draw_f1).toFixed(2)}</p>
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-navy-400 leading-relaxed mb-3">{familyDiagnosis[fam]}</p>
                      {/* Per-competition health for best-brier mode */}
                      {bestBrier && bestBrier.per_competition_health_json && (() => {
                        const health = bestBrier.per_competition_health_json ?? [];
                        if (!Array.isArray(health) || health.length === 0) return null;
                        return (
                          <div className="mt-2">
                            <p className="text-[10px] text-navy-600 mb-1.5">En iyi Brier modu per-competition health ({bestBrier.simulation_key})</p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {health.map((c) => (
                                <div key={c.competition} className="bg-navy-800/50 rounded-lg px-2.5 py-2">
                                  <p className="text-[10px] font-medium text-white truncate">{c.competition}</p>
                                  <div className="mt-1 space-y-0.5">
                                    <div className="flex justify-between">
                                      <span className="text-[9px] text-navy-500">Acc</span>
                                      <span className="text-[9px] text-white tabular-nums">{c.accuracy}%</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-[9px] text-navy-500">ΔAcc</span>
                                      <span className={`text-[9px] tabular-nums ${c.accuracy_delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {c.accuracy_delta > 0 ? '+' : ''}{c.accuracy_delta}pp
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-[9px] text-navy-500">Pred D%</span>
                                      <span className="text-[9px] text-navy-300 tabular-nums">{c.pred_draw_rate}%</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-[9px] text-navy-500">Net</span>
                                      <span className={`text-[9px] tabular-nums font-medium ${(c.helped - c.harmed) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {c.helped - c.harmed > 0 ? '+' : ''}{c.helped - c.harmed}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}

                {/* Final conclusion */}
                <div className="mt-4 bg-navy-900/60 border border-navy-800 rounded-xl p-5">
                  <p className="text-xs font-semibold text-white mb-3">Bias Refinement Sonucu</p>
                  <div className="space-y-2 text-xs text-navy-400 leading-relaxed">
                    <p>17 modun tamamı REJECT. Temel sorun: mevcut competition bias değerleri <span className="text-white">raw proba göre hesaplanmış</span>, ancak T=1.6 uygulamasından sonra prob dağılımı önemli ölçüde değişiyor.</p>
                    <p>Sigmoid k ve cap parametrelerinin hiçbir kombinasyonu, aynı anda <span className="text-white">draw_f1 ≥15</span>, <span className="text-white">cal_slope 0.80–1.20</span> ve <span className="text-white">pred_draw_rate ≥5%</span> üç gate&#39;ini de geçemiyor.</p>
                    <p className="text-amber-300 font-medium">
                      Sonraki araştırma ekseni: Competition bias değerlerini T=1.6 sonrası prob uzayında yeniden optimize et.
                      Hedef: her lig için post-T p_draw üzerinden bias tahmin et ve additive yerine multiplicative ratio olarak uygula.
                    </p>
                  </div>
                </div>
              </>
            )}
          </>
        )}

      </div>
    </div>
  );
}
