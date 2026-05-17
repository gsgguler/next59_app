import { useState, useEffect, useCallback } from 'react';
import {
  Zap, Shield, RefreshCw, AlertCircle, CheckCircle2, Clock,
  Play, Eye, ThumbsUp, ThumbsDown, AlertTriangle, Filter,
  ChevronDown, ChevronUp, BarChart2, FileText, Cpu, XCircle,
  TrendingUp, Activity,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReadinessRow {
  match_id: string;
  competition_name: string;
  season_label: string | null;
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
  home_l5_available: number;
  away_l5_available: number;
  calibration_brier_l50: number | null;
  prediction_status: string | null;
  warnings: string[];
  overall_status: 'ready' | 'partial' | 'blocked';
  blocking_reasons: string[];
  assessed_at: string;
}

interface PredictionDraft {
  id: string;
  match_id: string;
  home_team_name: string;
  away_team_name: string;
  competition_name: string;
  match_date: string;
  p_home: number;
  p_draw: number;
  p_away: number;
  confidence_score: number;
  confidence_tier: string;
  feature_quality_tier: string;
  prediction_formula: string;
  status: string;
  warnings: string[];
  generated_at: string;
}

interface GenJob {
  id: string;
  match_id: string;
  job_type: string;
  competition: string;
  status: string;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

type TabId = 'queue' | 'predictions' | 'jobs';
type StatusFilter = 'all' | 'ready' | 'partial' | 'blocked';

const COMPETITION_OPTIONS = [
  'Tümü',
  'Premier League',
  'Bundesliga',
  'La Liga',
  'Ligue 1',
  'Serie A',
  'Süper Lig',
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PreMatchOpsPage() {
  const [tab, setTab] = useState<TabId>('queue');

  return (
    <div className="min-h-screen bg-navy-950 p-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-5 py-3 mb-8 flex items-start gap-3">
          <Shield className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-300">
            <strong>Pre-Match Operations — Admin Only.</strong>{' '}
            Yaklaşan maçlar için tahmin üretim ve inceleme iş akışı. Hiçbir içerik otomatik yayınlanmaz.
          </p>
        </div>

        <div className="flex items-start gap-4 mb-8">
          <div className="w-12 h-12 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
            <Zap className="w-6 h-6 text-champagne" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white font-display">Pre-Match Operations</h1>
            <p className="text-sm text-readable-muted mt-1">
              Maç hazırlık durumu · tahmin üretimi · inceleme kuyruğu
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6 border-b border-navy-800">
          {([
            { id: 'queue' as TabId, label: 'Hazırlık Kuyruğu', icon: Activity },
            { id: 'predictions' as TabId, label: 'Tahmin Taslakları', icon: BarChart2 },
            { id: 'jobs' as TabId, label: 'İşlem Geçmişi', icon: Cpu },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${
                tab === id
                  ? 'border-champagne text-champagne'
                  : 'border-transparent text-navy-400 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {tab === 'queue' && <ReadinessQueueTab />}
        {tab === 'predictions' && <PredictionDraftsTab />}
        {tab === 'jobs' && <JobsTab />}
      </div>
    </div>
  );
}

// ─── Readiness Queue Tab ──────────────────────────────────────────────────────

function ReadinessQueueTab() {
  const [rows, setRows] = useState<ReadinessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [compFilter, setCompFilter] = useState('Tümü');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [assessing, setAssessing] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    let q = supabase
      .schema('model_lab')
      .from('upcoming_match_readiness')
      .select('*')
      .order('match_date', { ascending: true })
      .limit(300);

    if (statusFilter !== 'all') q = q.eq('overall_status', statusFilter);
    if (compFilter !== 'Tümü') q = q.eq('competition_name', compFilter);
    if (dateFrom) q = q.gte('match_date', dateFrom);
    if (dateTo) q = q.lte('match_date', dateTo);

    const { data, error: err } = await q;
    if (err) setError(err.message);
    else setRows((data as ReadinessRow[]) ?? []);
    setLoading(false);
  }, [statusFilter, compFilter, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const assessMatch = async (matchId: string) => {
    setAssessing(matchId);
    const { error: err } = await supabase.rpc('assess_upcoming_match_readiness', {
      p_match_id: matchId,
    });
    if (err) alert('Hata: ' + err.message);
    await load();
    setAssessing(null);
  };

  const generatePackage = async (matchId: string) => {
    setGenerating(matchId);
    const { error: err } = await supabase.schema('model_lab').rpc('generate_full_prematch_package', {
      p_match_id: matchId,
    });
    if (err) alert('Üretim hatası: ' + err.message);
    await load();
    setGenerating(null);
  };

  const summary = {
    total: rows.length,
    ready: rows.filter(r => r.overall_status === 'ready').length,
    partial: rows.filter(r => r.overall_status === 'partial').length,
    blocked: rows.filter(r => r.overall_status === 'blocked').length,
    withPrediction: rows.filter(r => r.prediction_readiness).length,
  };

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <SmallStat label="Toplam" value={summary.total} />
        <SmallStat label="Hazır" value={summary.ready} accent="green" />
        <SmallStat label="Kısmi" value={summary.partial} accent="amber" />
        <SmallStat label="Bloke" value={summary.blocked} accent="red" />
        <SmallStat label="Tahmin Var" value={summary.withPrediction} accent="blue" />
      </div>

      {/* Filters */}
      <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-3.5 h-3.5 text-navy-400" />
          <span className="text-xs font-semibold text-navy-400 uppercase tracking-wider">Filtreler</span>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-1">
            {(['all', 'ready', 'partial', 'blocked'] as StatusFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  statusFilter === f
                    ? 'bg-champagne/15 text-champagne border border-champagne/30'
                    : 'bg-navy-800 text-navy-400 border border-navy-700 hover:text-white'
                }`}
              >
                {f === 'all' ? 'Tümü' : f === 'ready' ? 'Hazır' : f === 'partial' ? 'Kısmi' : 'Bloke'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <select
              value={compFilter}
              onChange={e => setCompFilter(e.target.value)}
              className="appearance-none bg-navy-800 border border-navy-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
            >
              {COMPETITION_OPTIONS.map(c => <option key={c}>{c}</option>)}
            </select>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="bg-navy-800 border border-navy-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none" />
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="bg-navy-800 border border-navy-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none" />
            <button onClick={load} disabled={loading}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-navy-800 border border-navy-700 text-navy-400 hover:text-white transition-all disabled:opacity-40">
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </button>
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {/* Table */}
      <div className="bg-navy-900/50 border border-navy-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-navy-800 flex items-center justify-between">
          <span className="text-xs font-semibold text-readable-muted uppercase tracking-wider">
            Maç Kuyruğu ({rows.length})
          </span>
        </div>

        {loading ? (
          <LoadingSkeleton rows={8} />
        ) : rows.length === 0 ? (
          <EmptyState message="Bu filtreyle kayıt bulunamadı. Önce readiness değerlendirmesi çalıştırın." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-navy-800">
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Maç</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden md:table-cell">Lig / Tarih</th>
                  <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">ELO</th>
                  <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Öznitelik</th>
                  <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Kalibrasyon</th>
                  <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Tahmin</th>
                  <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Durum</th>
                  <th className="text-right px-5 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <>
                    <tr
                      key={row.match_id}
                      className="border-b border-navy-800/40 hover:bg-navy-800/20 transition-colors cursor-pointer"
                      onClick={() => setExpandedRow(expandedRow === row.match_id ? null : row.match_id)}
                    >
                      <td className="px-5 py-3">
                        <div className="text-white font-medium leading-tight">
                          {row.home_team_name} <span className="text-navy-500">vs</span> {row.away_team_name}
                        </div>
                        {row.feature_quality_tier && (
                          <span className="text-[10px] text-navy-500 mt-0.5 block">{row.feature_quality_tier}</span>
                        )}
                      </td>
                      <td className="px-3 py-3 hidden md:table-cell">
                        <div className="text-navy-400">{row.competition_name}</div>
                        <div className="text-navy-600 tabular-nums">{row.match_date}</div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <ReadinessDot ok={row.elo_readiness} />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <ReadinessDot ok={row.feature_readiness} />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <ReadinessDot ok={row.calibration_readiness} />
                      </td>
                      <td className="px-3 py-3 text-center">
                        {row.prediction_readiness
                          ? <PredStatusBadge status={row.prediction_status} />
                          : <span className="text-navy-600">–</span>
                        }
                      </td>
                      <td className="px-3 py-3 text-center">
                        <OverallStatusBadge status={row.overall_status} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <ActionButton
                            label="Değerlendir"
                            icon={<Eye className="w-3 h-3" />}
                            loading={assessing === row.match_id}
                            onClick={e => { e.stopPropagation(); assessMatch(row.match_id); }}
                            variant="ghost"
                          />
                          {(row.overall_status === 'ready' || row.overall_status === 'partial') && !row.prediction_readiness && (
                            <ActionButton
                              label="Üret"
                              icon={<Play className="w-3 h-3" />}
                              loading={generating === row.match_id}
                              onClick={e => { e.stopPropagation(); generatePackage(row.match_id); }}
                              variant="primary"
                            />
                          )}
                          <button
                            onClick={e => { e.stopPropagation(); setExpandedRow(expandedRow === row.match_id ? null : row.match_id); }}
                            className="p-1 text-navy-500 hover:text-white transition-colors"
                          >
                            {expandedRow === row.match_id
                              ? <ChevronUp className="w-3.5 h-3.5" />
                              : <ChevronDown className="w-3.5 h-3.5" />
                            }
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedRow === row.match_id && (
                      <tr key={`${row.match_id}-expanded`} className="border-b border-navy-800/40 bg-navy-900/30">
                        <td colSpan={8} className="px-5 py-4">
                          <ReadinessDetail row={row} />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Prediction Drafts Tab ────────────────────────────────────────────────────

function PredictionDraftsTab() {
  const [drafts, setDrafts] = useState<PredictionDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [actioning, setActioning] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    let q = supabase
      .schema('model_lab')
      .from('prematch_prediction_drafts')
      .select('id, match_id, home_team_name, away_team_name, competition_name, match_date, p_home, p_draw, p_away, confidence_score, confidence_tier, feature_quality_tier, prediction_formula, status, warnings, generated_at')
      .order('generated_at', { ascending: false })
      .limit(200);
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    const { data, error: err } = await q;
    if (err) setError(err.message);
    else setDrafts((data as PredictionDraft[]) ?? []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: string, newStatus: string) => {
    setActioning(id);
    const { error: err } = await supabase
      .schema('model_lab')
      .from('prematch_prediction_drafts')
      .update({ status: newStatus })
      .eq('id', id);
    if (err) alert('Güncelleme hatası: ' + err.message);
    await load();
    setActioning(null);
  };

  const STATUS_OPTIONS = ['all', 'pending_review', 'approved_internal', 'rejected', 'published'];

  return (
    <div>
      <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                statusFilter === s
                  ? 'bg-champagne/15 text-champagne border border-champagne/30'
                  : 'bg-navy-800 text-navy-400 border border-navy-700 hover:text-white'
              }`}
            >
              {s === 'all' ? 'Tümü' : s.replace(/_/g, ' ')}
            </button>
          ))}
          <button onClick={load} disabled={loading}
            className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-navy-800 border border-navy-700 text-navy-400 hover:text-white transition-all disabled:opacity-40">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="bg-navy-900/50 border border-navy-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-navy-800">
          <span className="text-xs font-semibold text-readable-muted uppercase tracking-wider">
            Tahmin Taslakları ({drafts.length})
          </span>
        </div>
        {loading ? <LoadingSkeleton rows={6} /> : drafts.length === 0 ? (
          <EmptyState message="Bu durumda tahmin taslağı yok." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-navy-800">
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Maç</th>
                  <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden sm:table-cell">Olasılıklar</th>
                  <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden md:table-cell">Güven</th>
                  <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden lg:table-cell">Tier</th>
                  <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Durum</th>
                  <th className="text-right px-5 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Aksiyon</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map(d => (
                  <tr key={d.id} className="border-b border-navy-800/40 hover:bg-navy-800/20 transition-colors">
                    <td className="px-5 py-3">
                      <div className="text-white font-medium">{d.home_team_name} vs {d.away_team_name}</div>
                      <div className="text-navy-500 text-[11px]">{d.competition_name} · {d.match_date}</div>
                    </td>
                    <td className="px-3 py-3 text-center hidden sm:table-cell">
                      <ProbBar home={d.p_home} draw={d.p_draw} away={d.p_away} />
                    </td>
                    <td className="px-3 py-3 text-center hidden md:table-cell">
                      <span className={`font-mono font-bold ${
                        d.confidence_tier === 'high' ? 'text-emerald-400' :
                        d.confidence_tier === 'medium' ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {(d.confidence_score * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center hidden lg:table-cell">
                      <FeatureTierBadge tier={d.feature_quality_tier} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <PredStatusBadge status={d.status} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center gap-1.5 justify-end">
                        {d.status === 'pending_review' && (
                          <>
                            <ActionButton
                              label="Onayla"
                              icon={<ThumbsUp className="w-3 h-3" />}
                              loading={actioning === d.id}
                              onClick={() => updateStatus(d.id, 'approved_internal')}
                              variant="success"
                            />
                            <ActionButton
                              label="Reddet"
                              icon={<ThumbsDown className="w-3 h-3" />}
                              loading={actioning === d.id}
                              onClick={() => updateStatus(d.id, 'rejected')}
                              variant="danger"
                            />
                          </>
                        )}
                        {d.status === 'approved_internal' && (
                          <ActionButton
                            label="Yayınla"
                            icon={<TrendingUp className="w-3 h-3" />}
                            loading={actioning === d.id}
                            onClick={() => updateStatus(d.id, 'published')}
                            variant="primary"
                          />
                        )}
                        {d.warnings?.length > 0 && (
                          <span title={d.warnings.join('\n')} className="text-amber-400">
                            <AlertTriangle className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Jobs Tab ─────────────────────────────────────────────────────────────────

function JobsTab() {
  const [jobs, setJobs] = useState<GenJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .schema('model_lab')
      .from('admin_generation_jobs')
      .select('id, match_id, job_type, competition, status, error_message, started_at, completed_at')
      .order('started_at', { ascending: false })
      .limit(150);
    if (err) setError(err.message);
    else setJobs((data as GenJob[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const statusCounts = {
    queued: jobs.filter(j => j.status === 'queued').length,
    completed: jobs.filter(j => j.status === 'completed').length,
    failed: jobs.filter(j => j.status === 'failed').length,
  };

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-6">
        <SmallStat label="Bekleyen" value={statusCounts.queued} accent={statusCounts.queued > 0 ? 'amber' : undefined} />
        <SmallStat label="Tamamlandı" value={statusCounts.completed} accent="green" />
        <SmallStat label="Başarısız" value={statusCounts.failed} accent={statusCounts.failed > 0 ? 'red' : undefined} />
      </div>

      <div className="flex justify-end mb-4">
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-navy-800 border border-navy-700 text-navy-400 hover:text-white transition-all disabled:opacity-40">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </button>
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="bg-navy-900/50 border border-navy-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-navy-800">
          <span className="text-xs font-semibold text-readable-muted uppercase tracking-wider">
            İşlem Geçmişi ({jobs.length})
          </span>
        </div>
        {loading ? <LoadingSkeleton rows={6} /> : jobs.length === 0 ? (
          <EmptyState message="Henüz işlem kaydı yok." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-navy-800">
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">İş Tipi</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden md:table-cell">Lig</th>
                  <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Durum</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden sm:table-cell">Başladı</th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden lg:table-cell">Hata</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(j => (
                  <tr key={j.id} className="border-b border-navy-800/40 hover:bg-navy-800/20 transition-colors">
                    <td className="px-5 py-3">
                      <span className="font-mono text-navy-300">{j.job_type}</span>
                    </td>
                    <td className="px-3 py-3 text-navy-400 hidden md:table-cell">{j.competition}</td>
                    <td className="px-3 py-3 text-center">
                      <JobStatusBadge status={j.status} />
                    </td>
                    <td className="px-3 py-3 text-navy-500 tabular-nums hidden sm:table-cell">
                      {j.started_at ? new Date(j.started_at).toLocaleString('tr-TR') : '–'}
                    </td>
                    <td className="px-3 py-3 hidden lg:table-cell">
                      {j.error_message
                        ? <span className="text-red-400 font-mono text-[11px]">{j.error_message.slice(0, 80)}</span>
                        : <span className="text-navy-600">–</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ReadinessDetail (expanded row) ──────────────────────────────────────────

function ReadinessDetail({ row }: { row: ReadinessRow }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* Readiness dimensions */}
      <div className="bg-navy-800/40 rounded-lg p-3">
        <div className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider mb-2">Hazırlık Boyutları</div>
        <div className="space-y-1.5">
          {[
            { label: 'ELO Puanları', ok: row.elo_readiness },
            { label: 'Öznitelik Matrisi', ok: row.feature_readiness },
            { label: 'Kalibrasyon Durumu', ok: row.calibration_readiness },
            { label: 'Kadro Verisi', ok: row.lineup_availability },
            { label: 'İstatistik Verisi', ok: row.stats_availability },
            { label: 'Tahmin Taslağı', ok: row.prediction_readiness },
            { label: 'Senaryo Taslağı', ok: row.scenario_readiness },
          ].map(({ label, ok }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-navy-400">{label}</span>
              <ReadinessDot ok={ok} withLabel />
            </div>
          ))}
        </div>
      </div>

      {/* Signals */}
      <div className="bg-navy-800/40 rounded-lg p-3">
        <div className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider mb-2">Sinyal Kalitesi</div>
        <div className="space-y-1.5">
          <DetailRow label="ELO Ev" value={row.elo_home != null ? row.elo_home.toFixed(0) : '–'} />
          <DetailRow label="ELO Deplasman" value={row.elo_away != null ? row.elo_away.toFixed(0) : '–'} />
          <DetailRow label="ELO Farkı" value={row.elo_home != null && row.elo_away != null ? (row.elo_home - row.elo_away).toFixed(0) : '–'} />
          <DetailRow label="Ev L5 Maç" value={row.home_l5_available.toString()} />
          <DetailRow label="Dep L5 Maç" value={row.away_l5_available.toString()} />
          <DetailRow label="Kalibrasyon Brier" value={row.calibration_brier_l50 != null ? row.calibration_brier_l50.toFixed(4) : '–'} />
          <DetailRow label="Tahmin Durumu" value={row.prediction_status ?? '–'} />
        </div>
      </div>

      {/* Warnings / Blockers */}
      <div className="bg-navy-800/40 rounded-lg p-3">
        <div className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider mb-2">Uyarılar</div>
        {row.blocking_reasons.length > 0 && (
          <div className="mb-2">
            <div className="text-[11px] text-red-400 font-semibold mb-1">Bloke Nedenleri</div>
            {row.blocking_reasons.map((r, i) => (
              <div key={i} className="flex items-start gap-1.5 text-red-300 text-[11px] mb-1">
                <XCircle className="w-3 h-3 shrink-0 mt-0.5" />
                {r}
              </div>
            ))}
          </div>
        )}
        {row.warnings.length > 0 ? (
          row.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-1.5 text-amber-300 text-[11px] mb-1">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
              {w}
            </div>
          ))
        ) : (
          <span className="text-navy-500 text-[11px]">Uyarı yok</span>
        )}
        <div className="mt-3 pt-2 border-t border-navy-700">
          <span className="text-[11px] text-navy-500">
            Değerlendirme: {new Date(row.assessed_at).toLocaleString('tr-TR')}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Shared Components ────────────────────────────────────────────────────────

function ReadinessDot({ ok, withLabel }: { ok: boolean; withLabel?: boolean }) {
  if (withLabel) {
    return ok
      ? <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px]"><CheckCircle2 className="w-3 h-3" />Hazır</span>
      : <span className="inline-flex items-center gap-1 text-navy-600 text-[11px]"><XCircle className="w-3 h-3" />Yok</span>;
  }
  return ok
    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mx-auto" />
    : <XCircle className="w-3.5 h-3.5 text-navy-700 mx-auto" />;
}

function OverallStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    ready:   { label: 'Hazır',  color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
    partial: { label: 'Kısmi',  color: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
    blocked: { label: 'Bloke',  color: 'bg-red-500/15 text-red-400 border-red-500/25' },
  };
  const cfg = map[status] ?? { label: status, color: 'bg-navy-800 text-navy-400 border-navy-700' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function PredStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-navy-600">–</span>;
  const map: Record<string, string> = {
    pending_review:    'text-amber-400',
    approved_internal: 'text-blue-400',
    rejected:          'text-red-400',
    published:         'text-emerald-400',
  };
  return (
    <span className={`text-[11px] font-medium ${map[status] ?? 'text-navy-400'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function JobStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    queued:    'bg-navy-700 text-navy-300',
    completed: 'bg-emerald-500/15 text-emerald-400',
    failed:    'bg-red-500/15 text-red-400',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${map[status] ?? 'bg-navy-800 text-navy-400'}`}>
      {status}
    </span>
  );
}

function FeatureTierBadge({ tier }: { tier: string }) {
  const map: Record<string, string> = {
    elo_only:       'text-navy-400',
    elo_form:       'text-blue-400',
    elo_form_stats: 'text-emerald-400',
  };
  return <span className={`text-[11px] font-mono ${map[tier] ?? 'text-navy-400'}`}>{tier ?? '–'}</span>;
}

function ProbBar({ home, draw, away }: { home: number; draw: number; away: number }) {
  return (
    <div className="flex items-center gap-2 justify-center">
      <span className="text-blue-400 font-mono tabular-nums w-8 text-right">{(home * 100).toFixed(0)}%</span>
      <span className="text-navy-400 font-mono tabular-nums w-8 text-center">{(draw * 100).toFixed(0)}%</span>
      <span className="text-amber-400 font-mono tabular-nums w-8 text-left">{(away * 100).toFixed(0)}%</span>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-navy-500">{label}</span>
      <span className="text-navy-300 font-mono">{value}</span>
    </div>
  );
}

function ActionButton({
  label, icon, loading, onClick, variant,
}: {
  label: string;
  icon: React.ReactNode;
  loading: boolean;
  onClick: (e: React.MouseEvent) => void;
  variant: 'primary' | 'ghost' | 'success' | 'danger';
}) {
  const variantClass = {
    primary: 'bg-champagne/15 text-champagne border-champagne/30 hover:bg-champagne/25',
    ghost:   'bg-navy-800 text-navy-400 border-navy-700 hover:text-white',
    success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/25',
    danger:  'bg-red-500/15 text-red-400 border-red-500/25 hover:bg-red-500/25',
  }[variant];

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all disabled:opacity-40 ${variantClass}`}
    >
      {loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : icon}
      {label}
    </button>
  );
}

function SmallStat({ label, value, accent }: {
  label: string; value: number; accent?: 'green' | 'amber' | 'blue' | 'red';
}) {
  const color = accent === 'green' ? 'text-emerald-400' : accent === 'amber' ? 'text-amber-400' :
    accent === 'blue' ? 'text-blue-400' : accent === 'red' ? 'text-red-400' : 'text-white';
  return (
    <div className="bg-navy-900/50 border border-navy-800 rounded-xl px-4 py-3">
      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-[11px] text-readable-muted mt-0.5">{label}</div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3 mb-4 text-xs text-red-400 font-mono flex items-center gap-2">
      <AlertCircle className="w-4 h-4 shrink-0" />
      {message}
    </div>
  );
}

function LoadingSkeleton({ rows }: { rows: number }) {
  return (
    <div className="p-5 space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 bg-navy-800/40 rounded animate-pulse" />
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="p-8 text-center">
      <Clock className="w-8 h-8 text-navy-700 mx-auto mb-3" />
      <p className="text-sm text-readable-muted">{message}</p>
    </div>
  );
}
