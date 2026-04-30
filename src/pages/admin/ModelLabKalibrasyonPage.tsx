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
  notes: string | null;
  created_at: string;
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
  const [loading, setLoading] = useState(true);
  const [adjLoading, setAdjLoading] = useState(true);
  const [simLoading, setSimLoading] = useState(true);
  const [decisionLoading, setDecisionLoading] = useState(true);
  const [drawFloorLoading, setDrawFloorLoading] = useState(true);
  const [groupType, setGroupType] = useState('overall');
  const [expandedBins, setExpandedBins] = useState<string | null>(null);
  const [tab, setTab] = useState<'summary' | 'adjustments' | 'simulations' | 'decision' | 'drawfloor'>('summary');

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
          {(['summary', 'adjustments', 'simulations', 'decision', 'drawfloor'] as const).map((t) => (
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
                : 'Draw Floor & Temp'}
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

      </div>
    </div>
  );
}
