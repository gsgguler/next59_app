import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FlaskConical, ChevronRight, AlertCircle, Shield, TrendingDown, TrendingUp, Minus } from 'lucide-react';
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

const GROUP_TYPES = [
  'overall',
  'competition',
  'season',
  'era_bucket',
  'confidence_grade',
  'error_category',
  'predicted_result',
  'actual_result',
  'predicted_vs_actual',
  'high_confidence_wrong',
  'home_prediction_bias',
  'draw_prediction_bias',
  'away_prediction_bias',
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

export default function ModelLabKalibrasyonPage() {
  const [rows, setRows] = useState<CalibrationRow[]>([]);
  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adjLoading, setAdjLoading] = useState(true);
  const [groupType, setGroupType] = useState('overall');
  const [tab, setTab] = useState<'summary' | 'adjustments'>('summary');

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

  const showPva = groupType === 'predicted_vs_actual';
  const showBias = ['overall', 'competition', 'home_prediction_bias', 'draw_prediction_bias', 'away_prediction_bias', 'predicted_result', 'actual_result', 'high_confidence_wrong'].includes(groupType);
  const showMarkets = ['overall', 'competition', 'season', 'era_bucket', 'confidence_grade'].includes(groupType);

  return (
    <div className="min-h-screen bg-navy-950 p-6">
      <div className="max-w-6xl mx-auto">
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
            <p className="text-sm text-navy-400 mt-1">13 grup boyutunda kalibrasyon özeti ve düzeltme adayları.</p>
          </div>
        </div>

        {/* Tab selector */}
        <div className="flex gap-2 mb-6 border-b border-navy-800 pb-px">
          {(['summary', 'adjustments'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-sm font-medium px-4 py-2 border-b-2 transition-all -mb-px ${
                tab === t
                  ? 'border-champagne text-champagne'
                  : 'border-transparent text-navy-500 hover:text-white'
              }`}
            >
              {t === 'summary' ? 'Kalibrasyon Özeti' : 'Düzeltme Adayları'}
            </button>
          ))}
        </div>

        {tab === 'summary' && (
          <>
            {/* Group type tabs */}
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
                      {showPva && (
                        <th className="text-left text-navy-500 font-medium px-3 py-2.5">Matris</th>
                      )}
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
                            {r.predicted_vs_actual_json ? (
                              <span className="text-navy-500 font-mono">{JSON.stringify(r.predicted_vs_actual_json)}</span>
                            ) : '–'}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Error category JSON expansion for relevant groups */}
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
      </div>
    </div>
  );
}
