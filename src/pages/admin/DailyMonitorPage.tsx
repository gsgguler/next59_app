import { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Brain,
  BarChart3,
  Shield,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Eye,
  Ban,
  Zap,
  Target,
  Info,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────────

type TabId = 'overview' | 'blocked' | 'confidence' | 'brains' | 'reality' | 'calibration';
type DateFilter = 'today' | 'tomorrow' | 'week' | 'all';

interface ReadinessRow {
  match_id: string;
  competition_name: string;
  season_label: string;
  match_date: string;
  kickoff_utc: string | null;
  home_team_name: string;
  away_team_name: string;
  elo_readiness: boolean;
  feature_readiness: boolean;
  calibration_readiness: boolean;
  lineup_availability: boolean;
  stats_availability: boolean;
  prediction_readiness: boolean;
  scenario_readiness: boolean;
  feature_quality_tier: string | null;
  elo_home: number | null;
  elo_away: number | null;
  home_l5_available: number | null;
  away_l5_available: number | null;
  calibration_brier_l50: number | null;
  prediction_status: string | null;
  warnings: string[] | null;
  overall_status: string | null;
  blocking_reasons: string[] | null;
  assessed_at: string | null;
}

interface PredictionDraft {
  id: string;
  match_id: string;
  competition_name: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
  match_date: string | null;
  p_home: number | null;
  p_draw: number | null;
  p_away: number | null;
  confidence_score: number | null;
  confidence_tier: string | null;
  feature_quality_tier: string | null;
  has_calibration_warning: boolean | null;
  has_data_warning: boolean | null;
  warnings: string[] | null;
  status: string | null;
  generated_at: string | null;
}

interface BrainRun {
  id: string;
  match_id: string;
  status: string;
  generated_at: string;
}

interface MasterBrainRow {
  id: string;
  brain_run_id: string;
  final_readiness: string | null;
  final_confidence: string | null;
  scenario_tone: string | null;
  publish_recommendation: string | null;
  master_summary: string | null;
  warnings_json: unknown;
  created_at: string;
}

interface BrainOutput {
  brain_name: string;
  brain_version: string | null;
  output_json: unknown;
  confidence_score: number | null;
  warning_level: string | null;
  created_at: string;
}

interface EvalRow {
  id: string;
  match_id: string;
  competition_name: string | null;
  actual_result: string | null;
  home_score_ft: number | null;
  away_score_ft: number | null;
  p_home: number | null;
  p_draw: number | null;
  p_away: number | null;
  brier_score: number | null;
  log_loss: number | null;
  was_correct: boolean | null;
  was_overconfident: boolean | null;
  evaluated_at: string | null;
}

interface CalibrationRow {
  id: string;
  competition_name: string;
  rolling_brier_l50: number | null;
  home_bias_l50: number | null;
  draw_bias_l50: number | null;
  away_bias_l50: number | null;
  current_home_correction: number | null;
  matches_evaluated: number | null;
  updated_at: string | null;
}

interface KPIs {
  upcoming: number;
  ready: number;
  partial: number;
  blocked: number;
  predictionsGenerated: number;
  brainPackages: number;
  publishSafe: number;
  reviewRequired: number;
  doNotPublish: number;
  lowConfidence: number;
  missingLineup: number;
  calibrationWarnings: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(base: string, n: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTime(s: string | null) {
  if (!s) return '';
  return new Date(s).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function pct(n: number | null) {
  if (n == null) return '—';
  return (n * 100).toFixed(1) + '%';
}

function num(n: number | null, d = 3) {
  if (n == null) return '—';
  return n.toFixed(d);
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  color,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  sub?: string;
  color: string;
  icon: React.ElementType;
}) {
  return (
    <div className="bg-navy-800 rounded-xl border border-navy-700 p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-navy-400 uppercase tracking-wide">{label}</span>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-navy-500">{sub}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-navy-500 text-xs">—</span>;
  const map: Record<string, string> = {
    ready: 'bg-emerald-900/50 text-emerald-400 border border-emerald-700',
    partial: 'bg-amber-900/50 text-amber-400 border border-amber-700',
    blocked: 'bg-red-900/50 text-red-400 border border-red-700',
    completed: 'bg-emerald-900/50 text-emerald-400 border border-emerald-700',
    pending: 'bg-navy-700 text-navy-300 border border-navy-600',
    publish_safe: 'bg-emerald-900/50 text-emerald-400 border border-emerald-700',
    review_required: 'bg-amber-900/50 text-amber-400 border border-amber-700',
    do_not_publish: 'bg-red-900/50 text-red-400 border border-red-700',
    high: 'bg-emerald-900/50 text-emerald-400 border border-emerald-700',
    medium: 'bg-amber-900/50 text-amber-400 border border-amber-700',
    low: 'bg-red-900/50 text-red-400 border border-red-700',
    insufficient: 'bg-red-900/50 text-red-400 border border-red-700',
    none: 'bg-navy-700 text-navy-300 border border-navy-600',
    warning: 'bg-amber-900/50 text-amber-400 border border-amber-700',
    critical: 'bg-red-900/50 text-red-400 border border-red-700',
  };
  const cls = map[status] ?? 'bg-navy-700 text-navy-300 border border-navy-600';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function BoolCell({ v, label }: { v: boolean | null; label: string }) {
  if (v == null) return <span className="text-navy-500 text-xs">—</span>;
  return v ? (
    <span className="flex items-center gap-1 text-emerald-400 text-xs">
      <CheckCircle className="w-3.5 h-3.5" /> {label}
    </span>
  ) : (
    <span className="flex items-center gap-1 text-red-400 text-xs">
      <XCircle className="w-3.5 h-3.5" /> {label}
    </span>
  );
}

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-base font-semibold text-white">{title}</h2>
      {count != null && (
        <span className="bg-navy-700 text-navy-300 text-xs px-2 py-0.5 rounded-full">{count}</span>
      )}
    </div>
  );
}

function ExpandableJson({ label, data }: { label: string; data: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen(p => !p)}
        className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {label}
      </button>
      {open && (
        <pre className="mt-1 p-2 bg-navy-900 rounded text-[11px] text-navy-300 overflow-x-auto max-h-60 leading-relaxed">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function DriftTag({ diff, threshold }: { diff: number; threshold: number }) {
  if (Math.abs(diff) > threshold) {
    return (
      <span className="flex items-center gap-1 text-amber-400 text-xs">
        <AlertTriangle className="w-3 h-3" /> drift
      </span>
    );
  }
  return <span className="text-emerald-400 text-xs">ok</span>;
}

// ── Action button ──────────────────────────────────────────────────────────────

function ActionBtn({
  label,
  icon: Icon,
  onClick,
  disabled,
  disabledReason,
  loading,
  variant,
}: {
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
  loading?: boolean;
  variant?: 'default' | 'danger';
}) {
  const base =
    variant === 'danger'
      ? 'border-red-700 text-red-400 hover:bg-red-900/30'
      : 'border-navy-600 text-navy-300 hover:bg-navy-700 hover:text-white';
  return (
    <div className="relative group inline-block">
      <button
        onClick={onClick}
        disabled={disabled || loading}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors
          ${disabled || loading ? 'opacity-40 cursor-not-allowed' : base}`}
      >
        {loading ? (
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Icon className="w-3.5 h-3.5" />
        )}
        {label}
      </button>
      {disabled && disabledReason && (
        <div className="absolute bottom-full left-0 mb-1 px-2 py-1 bg-navy-900 border border-navy-600 rounded text-xs text-navy-300 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10">
          {disabledReason}
        </div>
      )}
    </div>
  );
}

// ── Tab: Overview ──────────────────────────────────────────────────────────────

function OverviewTab({
  readiness,
  predictions,
  masterBrains,
  brainRunMap,
  kpis,
  onAction,
  actionLoading,
}: {
  readiness: ReadinessRow[];
  predictions: PredictionDraft[];
  masterBrains: MasterBrainRow[];
  brainRunMap: Map<string, BrainRun>;
  kpis: KPIs;
  onAction: (action: string, matchId: string) => void;
  actionLoading: Record<string, string>;
}) {
  const predMap = new Map(predictions.map(p => [p.match_id, p]));
  const masterMap = new Map<string, MasterBrainRow>();
  for (const [mid, run] of brainRunMap) {
    const mb = masterBrains.find(m => m.brain_run_id === run.id);
    if (mb) masterMap.set(mid, mb);
  }

  return (
    <div className="space-y-8">
      {/* KPI Grid */}
      <div>
        <SectionHeader title="KPI Ozeti" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          <KpiCard label="Upcoming" value={kpis.upcoming} color="text-sky-400" icon={Clock} />
          <KpiCard label="Ready" value={kpis.ready} color="text-emerald-400" icon={CheckCircle} />
          <KpiCard label="Partial" value={kpis.partial} color="text-amber-400" icon={AlertTriangle} />
          <KpiCard label="Blocked" value={kpis.blocked} color="text-red-400" icon={XCircle} />
          <KpiCard label="Predictions" value={kpis.predictionsGenerated} color="text-sky-400" icon={Target} />
          <KpiCard label="Brain Packages" value={kpis.brainPackages} color="text-sky-300" icon={Brain} />
          <KpiCard label="Publish Safe" value={kpis.publishSafe} color="text-emerald-400" icon={Shield} />
          <KpiCard label="Review Required" value={kpis.reviewRequired} color="text-amber-400" icon={Eye} />
          <KpiCard label="Do Not Publish" value={kpis.doNotPublish} color="text-red-400" icon={Ban} />
          <KpiCard label="Low Confidence" value={kpis.lowConfidence} color="text-amber-400" icon={TrendingDown} />
          <KpiCard label="No Lineup" value={kpis.missingLineup} color="text-orange-400" icon={AlertTriangle} />
          <KpiCard label="Cal Warnings" value={kpis.calibrationWarnings} color="text-amber-400" icon={Activity} />
        </div>
      </div>

      {/* Match Table */}
      <div>
        <SectionHeader title="Mac Listesi" count={readiness.length} />
        <div className="overflow-x-auto rounded-xl border border-navy-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-700 bg-navy-800">
                <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase tracking-wide">Mac</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase tracking-wide">Lig</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase tracking-wide">Tarih</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase tracking-wide">Durum</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase tracking-wide">Tahmin</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase tracking-wide">Brain</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase tracking-wide">Yayın</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase tracking-wide">Islemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-700/50">
              {readiness.map(row => {
                const pred = predMap.get(row.match_id);
                const mb = masterMap.get(row.match_id);
                const run = brainRunMap.get(row.match_id);
                const isBlocked = row.overall_status === 'blocked';
                const loading = actionLoading[row.match_id];
                return (
                  <tr key={row.match_id} className="hover:bg-navy-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-white text-sm">
                        {row.home_team_name} — {row.away_team_name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-navy-400">{row.competition_name}</td>
                    <td className="px-4 py-3 text-xs text-navy-400">
                      <div>{fmtDate(row.match_date)}</div>
                      {row.kickoff_utc && <div className="text-navy-500">{fmtTime(row.kickoff_utc)}</div>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={row.overall_status} /></td>
                    <td className="px-4 py-3">
                      {pred ? (
                        <div className="text-xs space-y-0.5">
                          <div className="text-navy-300">
                            {pct(pred.p_home)} / {pct(pred.p_draw)} / {pct(pred.p_away)}
                          </div>
                          <StatusBadge status={pred.confidence_tier} />
                        </div>
                      ) : (
                        <span className="text-navy-500 text-xs">Yok</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {run ? (
                        <StatusBadge status={run.status} />
                      ) : (
                        <span className="text-navy-500 text-xs">Yok</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {mb ? (
                        <StatusBadge status={mb.publish_recommendation} />
                      ) : (
                        <span className="text-navy-500 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <ActionBtn
                          label="Readiness"
                          icon={RefreshCw}
                          loading={loading === 'readiness'}
                          onClick={() => onAction('readiness', row.match_id)}
                        />
                        <ActionBtn
                          label="Tahmin"
                          icon={Target}
                          loading={loading === 'prediction'}
                          disabled={isBlocked}
                          disabledReason={isBlocked ? (row.blocking_reasons?.[0] ?? 'Bloke') : undefined}
                          onClick={() => onAction('prediction', row.match_id)}
                        />
                        <ActionBtn
                          label="Brain"
                          icon={Brain}
                          loading={loading === 'brain'}
                          disabled={isBlocked}
                          disabledReason={isBlocked ? (row.blocking_reasons?.[0] ?? 'Bloke') : undefined}
                          onClick={() => onAction('brain', row.match_id)}
                        />
                        <ActionBtn
                          label="Senaryo"
                          icon={Zap}
                          loading={loading === 'scenario'}
                          disabled={isBlocked}
                          disabledReason={isBlocked ? (row.blocking_reasons?.[0] ?? 'Bloke') : undefined}
                          onClick={() => onAction('scenario', row.match_id)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {readiness.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-navy-500 text-sm">
                    Secilen tarih araliginda mac bulunamadi.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Blocked ───────────────────────────────────────────────────────────────

function BlockedTab({ readiness }: { readiness: ReadinessRow[] }) {
  const blocked = readiness.filter(
    r => r.overall_status === 'blocked' || r.overall_status === 'partial'
  );
  return (
    <div>
      <SectionHeader title="Bloke & Eksik Maclar" count={blocked.length} />
      {blocked.length === 0 && (
        <div className="text-navy-500 text-sm py-8 text-center">
          Bloke ya da eksik mac yok.
        </div>
      )}
      <div className="space-y-4">
        {blocked.map(row => (
          <div key={row.match_id} className="bg-navy-800 border border-navy-700 rounded-xl p-5">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="font-semibold text-white">
                  {row.home_team_name} — {row.away_team_name}
                </div>
                <div className="text-xs text-navy-400 mt-0.5">
                  {row.competition_name} · {fmtDate(row.match_date)}
                  {row.kickoff_utc && ` · ${fmtTime(row.kickoff_utc)}`}
                </div>
              </div>
              <StatusBadge status={row.overall_status} />
            </div>

            {/* Readiness checklist */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
              <div className="bg-navy-900/60 rounded-lg p-3">
                <div className="text-[10px] font-semibold text-navy-500 uppercase mb-1">ELO</div>
                <BoolCell v={row.elo_readiness} label="Hazir" />
              </div>
              <div className="bg-navy-900/60 rounded-lg p-3">
                <div className="text-[10px] font-semibold text-navy-500 uppercase mb-1">Feature</div>
                <BoolCell v={row.feature_readiness} label="Hazir" />
              </div>
              <div className="bg-navy-900/60 rounded-lg p-3">
                <div className="text-[10px] font-semibold text-navy-500 uppercase mb-1">Kalibrasyon</div>
                <BoolCell v={row.calibration_readiness} label="Hazir" />
              </div>
              <div className="bg-navy-900/60 rounded-lg p-3">
                <div className="text-[10px] font-semibold text-navy-500 uppercase mb-1">Kadro</div>
                <BoolCell v={row.lineup_availability} label="Mevcut" />
              </div>
              <div className="bg-navy-900/60 rounded-lg p-3">
                <div className="text-[10px] font-semibold text-navy-500 uppercase mb-1">Istatistik</div>
                <BoolCell v={row.stats_availability} label="Mevcut" />
              </div>
            </div>

            {/* Blocking reasons */}
            {row.blocking_reasons && row.blocking_reasons.length > 0 && (
              <div className="mb-3">
                <div className="text-xs font-semibold text-red-400 mb-1.5">Engelleme Nedenleri</div>
                <div className="flex flex-wrap gap-1.5">
                  {row.blocking_reasons.map((r, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 bg-red-900/30 border border-red-700/50 text-red-300 text-xs rounded"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Warnings */}
            {row.warnings && row.warnings.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-amber-400 mb-1.5">Uyarilar</div>
                <div className="flex flex-wrap gap-1.5">
                  {row.warnings.map((w, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 bg-amber-900/20 border border-amber-700/40 text-amber-300 text-xs rounded"
                    >
                      {w}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Extra info */}
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-navy-500">
              {row.feature_quality_tier && <span>Quality tier: <span className="text-navy-300">{row.feature_quality_tier}</span></span>}
              {row.home_l5_available != null && <span>Home L5: <span className="text-navy-300">{row.home_l5_available}</span></span>}
              {row.away_l5_available != null && <span>Away L5: <span className="text-navy-300">{row.away_l5_available}</span></span>}
              {row.calibration_brier_l50 != null && <span>Cal Brier: <span className="text-navy-300">{num(row.calibration_brier_l50)}</span></span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab: Low Confidence ────────────────────────────────────────────────────────

function ConfidenceTab({
  predictions,
  masterBrains,
  brainRunMap,
}: {
  predictions: PredictionDraft[];
  masterBrains: MasterBrainRow[];
  brainRunMap: Map<string, BrainRun>;
}) {
  const low = predictions.filter(
    p => p.confidence_tier === 'low' || p.confidence_tier === 'insufficient' || p.has_calibration_warning || p.has_data_warning
  );

  const masterMap = new Map<string, MasterBrainRow>();
  for (const [mid, run] of brainRunMap) {
    const mb = masterBrains.find(m => m.brain_run_id === run.id);
    if (mb) masterMap.set(mid, mb);
  }

  return (
    <div>
      <SectionHeader title="Dusuk Guven Tahminleri" count={low.length} />
      {low.length === 0 && (
        <div className="text-navy-500 text-sm py-8 text-center">Dusuk guvenli tahmin yok.</div>
      )}
      <div className="space-y-4">
        {low.map(pred => {
          const mb = masterMap.get(pred.match_id);
          return (
            <div key={pred.id} className="bg-navy-800 border border-navy-700 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="font-semibold text-white">
                    {pred.home_team_name ?? '?'} — {pred.away_team_name ?? '?'}
                  </div>
                  <div className="text-xs text-navy-400 mt-0.5">
                    {pred.competition_name} · {fmtDate(pred.match_date)}
                  </div>
                </div>
                <StatusBadge status={pred.confidence_tier} />
              </div>

              {/* Probability bar */}
              <div className="mb-4">
                <div className="flex gap-0 rounded-lg overflow-hidden h-6 text-xs font-medium">
                  <div
                    className="bg-emerald-800 text-emerald-100 flex items-center justify-center"
                    style={{ width: `${(pred.p_home ?? 0) * 100}%` }}
                  >
                    {pct(pred.p_home)}
                  </div>
                  <div
                    className="bg-navy-600 text-navy-200 flex items-center justify-center"
                    style={{ width: `${(pred.p_draw ?? 0) * 100}%` }}
                  >
                    {pct(pred.p_draw)}
                  </div>
                  <div
                    className="bg-sky-900 text-sky-200 flex items-center justify-center"
                    style={{ width: `${(pred.p_away ?? 0) * 100}%` }}
                  >
                    {pct(pred.p_away)}
                  </div>
                </div>
                <div className="flex justify-between text-[10px] text-navy-500 mt-0.5">
                  <span>Ev sahibi</span><span>Beraberlik</span><span>Deplasman</span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <div>
                  <div className="text-[10px] text-navy-500 uppercase">Guven Skoru</div>
                  <div className="text-sm font-semibold text-white">{num(pred.confidence_score, 2)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-navy-500 uppercase">Feature Tier</div>
                  <div className="text-sm font-semibold text-white">{pred.feature_quality_tier ?? '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-navy-500 uppercase">Senaryo Tonu</div>
                  <div className="text-sm font-semibold text-white">{mb?.scenario_tone ?? '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-navy-500 uppercase">Yayin Tavsiyesi</div>
                  <div className="mt-0.5"><StatusBadge status={mb?.publish_recommendation ?? null} /></div>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {pred.has_calibration_warning && (
                  <span className="px-2 py-0.5 bg-amber-900/30 border border-amber-700/50 text-amber-300 text-xs rounded">
                    Kalibrasyon uyarisi
                  </span>
                )}
                {pred.has_data_warning && (
                  <span className="px-2 py-0.5 bg-orange-900/30 border border-orange-700/50 text-orange-300 text-xs rounded">
                    Veri uyarisi
                  </span>
                )}
                {pred.warnings?.map((w, i) => (
                  <span key={i} className="px-2 py-0.5 bg-navy-700 text-navy-300 text-xs rounded">{w}</span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Tab: Brain Summary ─────────────────────────────────────────────────────────

function BrainsTab({
  readiness,
  brainRunMap,
  masterBrains,
}: {
  readiness: ReadinessRow[];
  brainRunMap: Map<string, BrainRun>;
  masterBrains: MasterBrainRow[];
}) {
  const [outputs, setOutputs] = useState<Map<string, BrainOutput[]>>(new Map());
  const [loadingRunId, setLoadingRunId] = useState<string | null>(null);

  async function loadBrainOutputs(runId: string) {
    if (outputs.has(runId)) return;
    setLoadingRunId(runId);
    const { data } = await supabase
      .schema('model_lab')
      .from('prematch_brain_outputs')
      .select('brain_name, brain_version, output_json, confidence_score, warning_level, created_at')
      .eq('brain_run_id', runId)
      .order('brain_name');
    setOutputs(prev => new Map(prev).set(runId, (data as BrainOutput[]) ?? []));
    setLoadingRunId(null);
  }

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  function toggle(mid: string, runId: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(mid)) { next.delete(mid); }
      else { next.add(mid); loadBrainOutputs(runId); }
      return next;
    });
  }

  const masterMap = new Map<string, MasterBrainRow>();
  for (const [mid, run] of brainRunMap) {
    const mb = masterBrains.find(m => m.brain_run_id === run.id);
    if (mb) masterMap.set(mid, mb);
  }

  const withRuns = readiness.filter(r => brainRunMap.has(r.match_id));

  return (
    <div>
      <SectionHeader title="Brain Paketleri" count={withRuns.length} />
      {withRuns.length === 0 && (
        <div className="text-navy-500 text-sm py-8 text-center">
          Brain paketi bulunan mac yok. Oncelikle readiness guncelle ve brain uret.
        </div>
      )}
      <div className="space-y-3">
        {withRuns.map(row => {
          const run = brainRunMap.get(row.match_id)!;
          const mb = masterMap.get(row.match_id);
          const isOpen = expanded.has(row.match_id);
          const brainList = outputs.get(run.id);

          return (
            <div key={row.match_id} className="bg-navy-800 border border-navy-700 rounded-xl overflow-hidden">
              {/* Header row */}
              <button
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-navy-750 transition-colors text-left"
                onClick={() => toggle(row.match_id, run.id)}
              >
                <div className="flex items-center gap-4">
                  <div>
                    <div className="font-medium text-white text-sm">
                      {row.home_team_name} — {row.away_team_name}
                    </div>
                    <div className="text-xs text-navy-400">{row.competition_name} · {fmtDate(row.match_date)}</div>
                  </div>
                  {mb && (
                    <div className="flex items-center gap-2">
                      <StatusBadge status={mb.final_readiness} />
                      <StatusBadge status={mb.final_confidence} />
                      <StatusBadge status={mb.publish_recommendation} />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 text-navy-400">
                  <span className="text-xs">{brainList ? `${brainList.length} brain` : ''}</span>
                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>
              </button>

              {/* Expanded content */}
              {isOpen && (
                <div className="border-t border-navy-700 px-5 pb-5 pt-4">
                  {loadingRunId === run.id && (
                    <div className="text-navy-500 text-sm py-4 text-center">Yukleniyor...</div>
                  )}

                  {/* Master Brain summary */}
                  {mb && (
                    <div className="mb-4 bg-navy-900/60 rounded-lg p-4">
                      <div className="text-xs font-semibold text-sky-400 uppercase mb-2">Master Brain</div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
                        <div>
                          <div className="text-[10px] text-navy-500">Hazirlik</div>
                          <StatusBadge status={mb.final_readiness} />
                        </div>
                        <div>
                          <div className="text-[10px] text-navy-500">Guven</div>
                          <StatusBadge status={mb.final_confidence} />
                        </div>
                        <div>
                          <div className="text-[10px] text-navy-500">Senaryo Tonu</div>
                          <div className="text-xs text-white">{mb.scenario_tone ?? '—'}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-navy-500">Yayın Tavsiyesi</div>
                          <StatusBadge status={mb.publish_recommendation} />
                        </div>
                      </div>
                      {mb.master_summary && (
                        <p className="text-xs text-navy-300 leading-relaxed">{mb.master_summary}</p>
                      )}
                      <ExpandableJson label="Uyarilar JSON" data={mb.warnings_json} />
                    </div>
                  )}

                  {/* Sub-brain outputs */}
                  {brainList && brainList.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {brainList.map(b => (
                        <div key={b.brain_name} className="bg-navy-900/60 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-semibold text-white capitalize">
                              {b.brain_name.replace(/_/g, ' ')}
                            </div>
                            <StatusBadge status={b.warning_level} />
                          </div>
                          <div className="flex items-center gap-3 mb-1">
                            <div>
                              <div className="text-[10px] text-navy-500">Guven</div>
                              <div className="text-xs text-white">{num(b.confidence_score, 2)}</div>
                            </div>
                          </div>
                          <ExpandableJson label="output JSON" data={b.output_json} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Tab: Prediction vs Reality ─────────────────────────────────────────────────

function RealityTab({ evals }: { evals: EvalRow[] }) {
  const falsConf = evals.filter(e => e.was_overconfident && !e.was_correct);

  return (
    <div className="space-y-8">
      {falsConf.length > 0 && (
        <div className="bg-red-950/30 border border-red-800/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2 text-red-400 font-semibold text-sm">
            <AlertTriangle className="w-4 h-4" />
            Yanlis Guven Uyarisi — {falsConf.length} mac
          </div>
          <p className="text-xs text-red-300">
            Bu maclarda model yuksek guvenle yanlis tahmin yapmistir. Kalibrasyon gozden gecirilmeli.
          </p>
        </div>
      )}

      <div>
        <SectionHeader title="Tahmin vs Gercek (Son 50)" count={evals.length} />
        <div className="overflow-x-auto rounded-xl border border-navy-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-700 bg-navy-800">
                <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">Mac</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">Lig</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">Tahmin H/B/D</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">Sonuc</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">Dogru?</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">Brier</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">LogLoss</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">Yanlis Guven</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-700/50">
              {evals.map(e => {
                const isFalse = e.was_overconfident && !e.was_correct;
                return (
                  <tr key={e.id} className={`hover:bg-navy-800/50 transition-colors ${isFalse ? 'bg-red-950/20' : ''}`}>
                    <td className="px-4 py-3 text-xs text-white">
                      {e.home_score_ft != null && e.away_score_ft != null
                        ? `${e.home_score_ft} – ${e.away_score_ft}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-navy-400">{e.competition_name ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-navy-300">
                      {pct(e.p_home)} / {pct(e.p_draw)} / {pct(e.p_away)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={e.actual_result} />
                    </td>
                    <td className="px-4 py-3">
                      {e.was_correct == null ? (
                        <span className="text-navy-500 text-xs">—</span>
                      ) : e.was_correct ? (
                        <span className="flex items-center gap-1 text-emerald-400 text-xs">
                          <CheckCircle className="w-3.5 h-3.5" /> Evet
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-red-400 text-xs">
                          <XCircle className="w-3.5 h-3.5" /> Hayir
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-navy-300">{num(e.brier_score)}</td>
                    <td className="px-4 py-3 text-xs text-navy-300">{num(e.log_loss)}</td>
                    <td className="px-4 py-3">
                      {isFalse ? (
                        <span className="flex items-center gap-1 text-red-400 text-xs font-semibold">
                          <AlertTriangle className="w-3.5 h-3.5" /> EVET
                        </span>
                      ) : (
                        <span className="text-navy-500 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {evals.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-navy-500 text-sm">
                    Degerlendirilen mac bulunamadi.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Calibration Drift ─────────────────────────────────────────────────────

function CalibrationTab({ calibration }: { calibration: CalibrationRow[] }) {
  return (
    <div>
      <SectionHeader title="Kalibrasyon Drift Durumu" count={calibration.length} />
      <div className="overflow-x-auto rounded-xl border border-navy-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-navy-700 bg-navy-800">
              <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">Lig</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">Brier L50</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">Home Bias</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">Draw Bias</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">Away Bias</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">Home Duzeltme</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">Mac Sayisi</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">Son Guncelleme</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">Drift</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-700/50">
            {calibration.map(row => {
              const brierWarn = (row.rolling_brier_l50 ?? 0) > 0.32;
              const homeWarn = Math.abs(row.home_bias_l50 ?? 0) > 0.08;
              const drawWarn = Math.abs(row.draw_bias_l50 ?? 0) > 0.05;
              const anyWarn = brierWarn || homeWarn || drawWarn;
              return (
                <tr key={row.id} className={`hover:bg-navy-800/50 transition-colors ${anyWarn ? 'bg-amber-950/10' : ''}`}>
                  <td className="px-4 py-3 font-medium text-white text-sm">{row.competition_name}</td>
                  <td className={`px-4 py-3 text-xs font-mono ${brierWarn ? 'text-amber-400 font-semibold' : 'text-navy-300'}`}>
                    {num(row.rolling_brier_l50)}
                    {brierWarn && <AlertTriangle className="inline w-3 h-3 ml-1" />}
                  </td>
                  <td className={`px-4 py-3 text-xs font-mono ${homeWarn ? 'text-amber-400 font-semibold' : 'text-navy-300'}`}>
                    {num(row.home_bias_l50)}
                    {homeWarn && <AlertTriangle className="inline w-3 h-3 ml-1" />}
                  </td>
                  <td className={`px-4 py-3 text-xs font-mono ${drawWarn ? 'text-amber-400 font-semibold' : 'text-navy-300'}`}>
                    {num(row.draw_bias_l50)}
                    {drawWarn && <AlertTriangle className="inline w-3 h-3 ml-1" />}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-navy-300">{num(row.away_bias_l50)}</td>
                  <td className="px-4 py-3 text-xs font-mono text-navy-300">{num(row.current_home_correction)}</td>
                  <td className="px-4 py-3 text-xs text-navy-400">{row.matches_evaluated ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-navy-500">{fmtDate(row.updated_at)}</td>
                  <td className="px-4 py-3">
                    {anyWarn ? (
                      <span className="flex items-center gap-1 text-amber-400 text-xs font-semibold">
                        <AlertTriangle className="w-3.5 h-3.5" /> UYARI
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-emerald-400 text-xs">
                        <CheckCircle className="w-3.5 h-3.5" /> Temiz
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {calibration.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-navy-500 text-sm">
                  Kalibrasyon verisi bulunamadi.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Drift thresholds legend */}
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-navy-500">
        <span className="flex items-center gap-1.5"><AlertTriangle className="w-3 h-3 text-amber-400" /> Brier L50 &gt; 0.32</span>
        <span className="flex items-center gap-1.5"><AlertTriangle className="w-3 h-3 text-amber-400" /> |Home Bias| &gt; 0.08</span>
        <span className="flex items-center gap-1.5"><AlertTriangle className="w-3 h-3 text-amber-400" /> |Draw Bias| &gt; 0.05</span>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Genel Bakis', icon: LayoutDashboardIcon },
  { id: 'blocked', label: 'Bloke & Eksik', icon: XCircle },
  { id: 'confidence', label: 'Dusuk Guven', icon: TrendingDown },
  { id: 'brains', label: 'Brain Ozeti', icon: Brain },
  { id: 'reality', label: 'Tahmin vs Gercek', icon: Target },
  { id: 'calibration', label: 'Kalibrasyon Drift', icon: BarChart3 },
];

function LayoutDashboardIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

export default function DailyMonitorPage() {
  const [tab, setTab] = useState<TabId>('overview');
  const [dateFilter, setDateFilter] = useState<DateFilter>('week');

  const [readiness, setReadiness] = useState<ReadinessRow[]>([]);
  const [predictions, setPredictions] = useState<PredictionDraft[]>([]);
  const [brainRunMap, setBrainRunMap] = useState<Map<string, BrainRun>>(new Map());
  const [masterBrains, setMasterBrains] = useState<MasterBrainRow[]>([]);
  const [evals, setEvals] = useState<EvalRow[]>([]);
  const [calibration, setCalibration] = useState<CalibrationRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({});
  const [actionMsg, setActionMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Date window — null means no date filter (show all)
  const dateRange = useCallback((): { start: string | null; end: string | null } => {
    const today = todayStr();
    if (dateFilter === 'today') return { start: today, end: today };
    if (dateFilter === 'tomorrow') {
      const t = addDays(today, 1);
      return { start: t, end: t };
    }
    if (dateFilter === 'all') return { start: null, end: null };
    // 'week': ±30 days so existing test/historical rows are always visible
    return { start: addDays(today, -30), end: addDays(today, 30) };
  }, [dateFilter]);

  const [queryErrors, setQueryErrors] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setQueryErrors([]);
    const errors: string[] = [];
    const { start, end } = dateRange();

    // 1. Readiness — apply date filter only when not 'all'
    let rdQuery = supabase
      .schema('model_lab')
      .from('upcoming_match_readiness')
      .select('*')
      .order('match_date', { ascending: true });
    if (start) rdQuery = rdQuery.gte('match_date', start);
    if (end) rdQuery = rdQuery.lte('match_date', end);

    const { data: rdData, error: rdErr } = await rdQuery;
    if (rdErr) {
      console.error('[DailyMonitor] upcoming_match_readiness:', rdErr);
      errors.push(`readiness: ${rdErr.message}`);
    }
    const rdRows = (rdData as ReadinessRow[]) ?? [];
    setReadiness(rdRows);

    const matchIds = rdRows.map(r => r.match_id);

    // 2. Predictions (latest per match)
    let predRows: PredictionDraft[] = [];
    if (matchIds.length > 0) {
      const { data: pData, error: pErr } = await supabase
        .schema('model_lab')
        .from('prematch_prediction_drafts')
        .select(
          'id, match_id, competition_name, home_team_name, away_team_name, match_date, p_home, p_draw, p_away, confidence_score, confidence_tier, feature_quality_tier, has_calibration_warning, has_data_warning, warnings, status, generated_at'
        )
        .in('match_id', matchIds)
        .order('generated_at', { ascending: false });
      if (pErr) {
        console.error('[DailyMonitor] prematch_prediction_drafts:', pErr);
        errors.push(`predictions: ${pErr.message}`);
      }
      // Dedup by match_id — keep latest
      const seen = new Set<string>();
      for (const p of (pData as PredictionDraft[]) ?? []) {
        if (!seen.has(p.match_id)) { predRows.push(p); seen.add(p.match_id); }
      }
    }
    setPredictions(predRows);

    // 3. Brain runs (latest completed per match)
    const runMap = new Map<string, BrainRun>();
    if (matchIds.length > 0) {
      const { data: runData, error: runErr } = await supabase
        .schema('model_lab')
        .from('prematch_brain_runs')
        .select('id, match_id, status, generated_at')
        .in('match_id', matchIds)
        .eq('status', 'completed')
        .order('generated_at', { ascending: false });
      if (runErr) {
        console.error('[DailyMonitor] prematch_brain_runs:', runErr);
        errors.push(`brain_runs: ${runErr.message}`);
      }
      for (const r of (runData as BrainRun[]) ?? []) {
        if (!runMap.has(r.match_id)) runMap.set(r.match_id, r);
      }
    }
    setBrainRunMap(runMap);

    // 4. Master brain outputs for those run IDs
    const runIds = Array.from(runMap.values()).map(r => r.id);
    let mbRows: MasterBrainRow[] = [];
    if (runIds.length > 0) {
      const { data: mbData, error: mbErr } = await supabase
        .schema('model_lab')
        .from('prematch_master_brain_outputs')
        .select('*')
        .in('brain_run_id', runIds);
      if (mbErr) {
        console.error('[DailyMonitor] prematch_master_brain_outputs:', mbErr);
        errors.push(`master_brains: ${mbErr.message}`);
      }
      mbRows = (mbData as MasterBrainRow[]) ?? [];
    }
    setMasterBrains(mbRows);

    // 5. Evaluations (last 50)
    const { data: evalData, error: evalErr } = await supabase
      .schema('model_lab')
      .from('replay_match_evaluations')
      .select(
        'id, match_id, competition_name, actual_result, home_score_ft, away_score_ft, p_home, p_draw, p_away, brier_score, log_loss, was_correct, was_overconfident, evaluated_at'
      )
      .order('evaluated_at', { ascending: false })
      .limit(50);
    if (evalErr) {
      console.error('[DailyMonitor] replay_match_evaluations:', evalErr);
      errors.push(`evaluations: ${evalErr.message}`);
    }
    setEvals((evalData as EvalRow[]) ?? []);

    // 6. Calibration state
    const { data: calData, error: calErr } = await supabase
      .schema('model_lab')
      .from('league_calibration_state')
      .select(
        'id, competition_name, rolling_brier_l50, home_bias_l50, draw_bias_l50, away_bias_l50, current_home_correction, matches_evaluated, updated_at'
      )
      .order('competition_name');
    if (calErr) {
      console.error('[DailyMonitor] league_calibration_state:', calErr);
      errors.push(`calibration: ${calErr.message}`);
    }
    setCalibration((calData as CalibrationRow[]) ?? []);

    setQueryErrors(errors);
    setLastRefresh(new Date());
    setLoading(false);
  }, [dateRange]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── KPI computation ──
  const kpis: KPIs = {
    upcoming: readiness.length,
    ready: readiness.filter(r => r.overall_status === 'ready').length,
    partial: readiness.filter(r => r.overall_status === 'partial').length,
    blocked: readiness.filter(r => r.overall_status === 'blocked').length,
    predictionsGenerated: predictions.length,
    brainPackages: brainRunMap.size,
    publishSafe: masterBrains.filter(m => m.publish_recommendation === 'publish_safe').length,
    reviewRequired: masterBrains.filter(m => m.publish_recommendation === 'review_required').length,
    doNotPublish: masterBrains.filter(m => m.publish_recommendation === 'do_not_publish').length,
    lowConfidence: predictions.filter(p => p.confidence_tier === 'low' || p.confidence_tier === 'insufficient').length,
    missingLineup: readiness.filter(r => !r.lineup_availability).length,
    calibrationWarnings: calibration.filter(c =>
      (c.rolling_brier_l50 ?? 0) > 0.32 ||
      Math.abs(c.home_bias_l50 ?? 0) > 0.08 ||
      Math.abs(c.draw_bias_l50 ?? 0) > 0.05
    ).length,
  };

  // ── Actions ──
  async function handleAction(action: string, matchId: string) {
    setActionLoading(prev => ({ ...prev, [matchId]: action }));
    setActionMsg(null);
    try {
      let rpcName = '';
      const params: Record<string, unknown> = { p_match_id: matchId };
      if (action === 'readiness') {
        rpcName = 'ml_assess_upcoming_match_readiness';
      } else if (action === 'prediction') {
        rpcName = 'ml_generate_prematch_prediction';
        params.p_triggered_by = 'admin_daily_monitor';
      } else if (action === 'brain') {
        rpcName = 'ml_generate_prematch_brain_package';
        params.p_triggered_by = 'admin_daily_monitor';
      } else if (action === 'scenario') {
        rpcName = 'ml_generate_full_prematch_package';
        params.p_triggered_by = 'admin_daily_monitor';
      }
      if (!rpcName) return;
      const { error } = await supabase.rpc(rpcName, params);
      if (error) {
        setActionMsg({ text: `Hata (${action}): ${error.message}`, ok: false });
      } else {
        setActionMsg({ text: `${action} islemi tamamlandi. Sayfa yenileniyor...`, ok: true });
        await loadData();
      }
    } catch (err) {
      setActionMsg({ text: `Beklenmeyen hata: ${String(err)}`, ok: false });
    } finally {
      setActionLoading(prev => { const n = { ...prev }; delete n[matchId]; return n; });
    }
  }

  return (
    <div className="min-h-screen bg-navy-900">
      {/* Internal ops banner */}
      <div className="bg-amber-950/60 border-b border-amber-800/50 px-6 py-2.5">
        <div className="flex items-center gap-2 text-amber-300 text-xs">
          <Shield className="w-3.5 h-3.5 shrink-0" />
          <span className="font-semibold">DAHILI OPERASYON MODU</span>
          <span className="text-amber-500">—</span>
          <span>Bu sayfa sadece admin kullanimine yoneliktir. Otomatik yayın devre disidir.</span>
        </div>
      </div>

      <div className="px-6 py-6 max-w-screen-2xl mx-auto">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">Gunluk Izleme Paneli</h1>
            <div className="text-xs text-navy-400 mt-0.5">
              {lastRefresh
                ? `Son guncelleme: ${lastRefresh.toLocaleTimeString('tr-TR')}`
                : 'Yukleniyor...'}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Date filter */}
            <div className="flex rounded-lg border border-navy-700 overflow-hidden text-xs">
              {(
                [
                  { id: 'today', label: 'Bugun' },
                  { id: 'tomorrow', label: 'Yarin' },
                  { id: 'week', label: '±30 Gun' },
                  { id: 'all', label: 'Tum' },
                ] as { id: DateFilter; label: string }[]
              ).map(f => (
                <button
                  key={f.id}
                  onClick={() => setDateFilter(f.id)}
                  className={`px-3 py-1.5 font-medium transition-colors ${
                    dateFilter === f.id
                      ? 'bg-sky-700 text-white'
                      : 'text-navy-400 hover:text-white hover:bg-navy-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-navy-600 text-navy-300 hover:bg-navy-700 hover:text-white transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </button>
          </div>
        </div>

        {/* Query errors banner */}
        {queryErrors.length > 0 && (
          <div className="mb-4 px-4 py-3 rounded-lg border bg-red-950/40 border-red-700/50 text-red-300 text-sm">
            <div className="flex items-center gap-2 font-semibold mb-1">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Sorgu hatalari — PostgREST erisim sorunu olabilir
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-xs">
              {queryErrors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}

        {/* Action message */}
        {actionMsg && (
          <div
            className={`mb-4 px-4 py-3 rounded-lg border text-sm flex items-center gap-2 ${
              actionMsg.ok
                ? 'bg-emerald-950/40 border-emerald-700/50 text-emerald-300'
                : 'bg-red-950/40 border-red-700/50 text-red-300'
            }`}
          >
            {actionMsg.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            {actionMsg.text}
            <button onClick={() => setActionMsg(null)} className="ml-auto text-xs opacity-60 hover:opacity-100">
              Kapat
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-0.5 mb-6 border-b border-navy-700 overflow-x-auto pb-px">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                  tab === t.id
                    ? 'border-sky-500 text-sky-400'
                    : 'border-transparent text-navy-400 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
                {/* Badge counts */}
                {t.id === 'blocked' && kpis.blocked > 0 && (
                  <span className="bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{kpis.blocked}</span>
                )}
                {t.id === 'confidence' && kpis.lowConfidence > 0 && (
                  <span className="bg-amber-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{kpis.lowConfidence}</span>
                )}
                {t.id === 'calibration' && kpis.calibrationWarnings > 0 && (
                  <span className="bg-amber-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{kpis.calibrationWarnings}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-3 text-navy-400">
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span className="text-sm">Veriler yukleniyor...</span>
            </div>
          </div>
        ) : (
          <>
            {tab === 'overview' && (
              <OverviewTab
                readiness={readiness}
                predictions={predictions}
                masterBrains={masterBrains}
                brainRunMap={brainRunMap}
                kpis={kpis}
                onAction={handleAction}
                actionLoading={actionLoading}
              />
            )}
            {tab === 'blocked' && <BlockedTab readiness={readiness} />}
            {tab === 'confidence' && (
              <ConfidenceTab
                predictions={predictions}
                masterBrains={masterBrains}
                brainRunMap={brainRunMap}
              />
            )}
            {tab === 'brains' && (
              <BrainsTab
                readiness={readiness}
                brainRunMap={brainRunMap}
                masterBrains={masterBrains}
              />
            )}
            {tab === 'reality' && <RealityTab evals={evals} />}
            {tab === 'calibration' && <CalibrationTab calibration={calibration} />}
          </>
        )}

        {/* Publish Safety Ratio footer */}
        {!loading && (masterBrains.length > 0) && (
          <div className="mt-8 bg-navy-800 border border-navy-700 rounded-xl p-4 flex flex-wrap gap-6 text-sm">
            <div>
              <div className="text-xs text-navy-400 uppercase tracking-wide mb-1">Yayin Guvenlik Orani</div>
              <div className="text-lg font-bold text-white">
                {((kpis.publishSafe / masterBrains.length) * 100).toFixed(0)}%
                <span className="text-xs text-navy-400 font-normal ml-1">
                  ({kpis.publishSafe} / {masterBrains.length})
                </span>
              </div>
            </div>
            <div>
              <div className="text-xs text-navy-400 uppercase tracking-wide mb-1">Inceleme Gerektiren</div>
              <div className="text-lg font-bold text-amber-400">
                {((kpis.reviewRequired / masterBrains.length) * 100).toFixed(0)}%
              </div>
            </div>
            <div>
              <div className="text-xs text-navy-400 uppercase tracking-wide mb-1">Yayinlama</div>
              <div className="text-xs text-red-400 font-semibold flex items-center gap-1.5 mt-1">
                <Ban className="w-3.5 h-3.5" />
                Otomatik yayın devre disi. Manuel onay gereklidir.
              </div>
            </div>
            {evals.length > 0 && (
              <div>
                <div className="text-xs text-navy-400 uppercase tracking-wide mb-1">Yanlis Guven (Son 50)</div>
                <div className="text-lg font-bold text-red-400">
                  {evals.filter(e => e.was_overconfident && !e.was_correct).length}
                  <span className="text-xs text-navy-400 font-normal ml-1">mac</span>
                </div>
              </div>
            )}
            <div className="ml-auto flex items-center">
              <span className="flex items-center gap-1.5 text-xs text-navy-500">
                <Info className="w-3.5 h-3.5" />
                Veri kaynagi: model_lab schema, depolanan tablolar
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}