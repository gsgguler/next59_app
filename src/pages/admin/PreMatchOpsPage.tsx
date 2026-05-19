import { useState, useEffect, useCallback } from 'react';
import {
  Zap, Shield, RefreshCw, AlertCircle, CheckCircle2, Clock,
  Play, Eye, ThumbsUp, ThumbsDown, AlertTriangle, Filter,
  ChevronDown, ChevronUp, BarChart2, FileText, Cpu, XCircle,
  TrendingUp, Activity, Brain, Target, Waves, Timer,
  Sliders, Database, Star, ChevronRight, Ban,
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
  standings_readiness: boolean;
  injuries_readiness: boolean;
  team_statistics_readiness: boolean;
  venue_readiness: boolean;
  enrichment_score: number | null;
  injury_warning_level: string | null;
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
  p_ht_home: number | null;
  p_ht_draw: number | null;
  p_ht_away: number | null;
  expected_goals_home: number | null;
  expected_goals_away: number | null;
  predicted_score: string | null;
  confidence_score: number;
  confidence_tier: string;
  feature_quality_tier: string;
  prediction_formula: string;
  status: string;
  warnings: string[];
  generated_at: string;
  has_calibration_warning: boolean;
  has_data_warning: boolean;
}

interface StoryDraftLink {
  match_id: string;
  status: string;
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

interface BrainOutput {
  output: Record<string, unknown>;
  confidence_score: number;
  warning_level: 'none' | 'low' | 'medium' | 'high';
}

interface BrainPackage {
  brain_run_id: string;
  status: string;
  generated_at: string;
  master_brain: {
    final_readiness: string;
    final_confidence: string;
    scenario_tone: string;
    publish_recommendation: string;
    master_summary: string;
    warnings: Array<{ brain: string; level: string; msg: string }>;
  };
  sub_brains: Record<string, BrainOutput>;
}

type TabId = 'queue' | 'predictions' | 'brains' | 'jobs';
type StatusFilter = 'all' | 'ready' | 'partial' | 'blocked';

const COMPETITION_OPTIONS = [
  'Tümü', 'Premier League', 'Bundesliga', 'La Liga', 'Ligue 1', 'Serie A', 'Süper Lig',
];

const BRAIN_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; description: string }> = {
  probability:   { label: 'Olasılık Beyni',         icon: BarChart2,     description: 'p_ev / p_beraberlik / p_deplasman + ELO farkı + güven' },
  draw_risk:     { label: 'Beraberlik Riski Beyni',  icon: Target,        description: 'Beraberlik seviyesi + baskı + lig prior + kalibrasyon farkı' },
  upset_risk:    { label: 'Sürpriz Riski Beyni',     icon: AlertTriangle, description: 'Favori kırılganlığı + sürpriz olasılığı + aşırı güven' },
  tempo:         { label: 'Tempo Beyni',             icon: Waves,         description: 'Gol/form/istatistik kaynaklı beklenen tempo — olay tahmini değil' },
  late_pressure: { label: 'Geç Baskı Beyni',         icon: Timer,         description: 'Yakınlık + beraberlik riski + atak endeksinden geç gol baskısı' },
  calibration:   { label: 'Kalibrasyon Beyni',       icon: Sliders,       description: 'Lig Brier skoru + ev düzeltmesi + üretim adayı' },
  data_quality:  { label: 'Veri Kalitesi Beyni',     icon: Database,      description: 'Öznitelik tipi + ELO/kadro/kalibrasyon hazırlığı + şiddet' },
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PreMatchOpsPage() {
  const [tab, setTab] = useState<TabId>('queue');

  return (
    <div className="min-h-screen bg-navy-950 p-6">
      <div className="max-w-7xl mx-auto">

        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-5 py-3 mb-8 flex items-start gap-3">
          <Shield className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-300">
            <strong>Pre-Match Operations — Yalnızca Admin.</strong>{' '}
            Yaklaşan maçlar için Sub-Brain → Master Brain orkestrasyon sistemi. Hiçbir içerik otomatik yayınlanmaz.
          </p>
        </div>

        <div className="flex items-start gap-4 mb-8">
          <div className="w-12 h-12 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
            <Zap className="w-6 h-6 text-champagne" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white font-display">Pre-Match Operations</h1>
            <p className="text-sm text-readable-muted mt-1">
              Hazırlık durumu · tahmin üretimi · beyin paketi · senaryo · inceleme kuyruğu
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 mb-6 border-b border-navy-800">
          {([
            { id: 'queue' as TabId,       label: 'Hazırlık Kuyruğu', icon: Activity },
            { id: 'predictions' as TabId, label: 'Tahmin Taslakları', icon: BarChart2 },
            { id: 'brains' as TabId,      label: 'Beyin Denetçisi',   icon: Brain },
            { id: 'jobs' as TabId,        label: 'İşlem Geçmişi',     icon: Cpu },
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

        {tab === 'queue'       && <ReadinessQueueTab />}
        {tab === 'predictions' && <PredictionDraftsTab />}
        {tab === 'brains'      && <BrainInspectorTab />}
        {tab === 'jobs'        && <JobsTab />}
      </div>
    </div>
  );
}

// ─── Readiness Queue Tab ──────────────────────────────────────────────────────

function ReadinessQueueTab() {
  const [rows, setRows] = useState<ReadinessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [compFilter, setCompFilter] = useState('Tümü');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [assessing, setAssessing] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [brainGen, setBrainGen] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const setActionError = (id: string, msg: string) => {
    setActionErrors(prev => ({ ...prev, [id]: msg }));
    setTimeout(() => setActionErrors(prev => { const n = { ...prev }; delete n[id]; return n; }), 6000);
  };

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
    const { error: err } = await supabase.rpc('ml_assess_upcoming_match_readiness', { p_match_id: matchId });
    if (err) setActionError(matchId, err.message);
    else await load();
    setAssessing(null);
  };

  const generatePackage = async (matchId: string) => {
    setGenerating(matchId);
    const { error: err } = await supabase.rpc('ml_generate_full_prematch_package', { p_match_id: matchId });
    if (err) setActionError(matchId, 'Üretim hatası: ' + err.message);
    else await load();
    setGenerating(null);
  };

  const generateBrain = async (matchId: string) => {
    setBrainGen(matchId);
    const { error: err } = await supabase.rpc('ml_generate_prematch_brain_package', {
      p_match_id: matchId,
      p_triggered_by: 'admin_ui',
    });
    if (err) setActionError(matchId, 'Beyin hatası: ' + err.message);
    else await load();
    setBrainGen(null);
  };

  const summary = {
    total:          rows.length,
    ready:          rows.filter(r => r.overall_status === 'ready').length,
    partial:        rows.filter(r => r.overall_status === 'partial').length,
    blocked:        rows.filter(r => r.overall_status === 'blocked').length,
    withPrediction: rows.filter(r => r.prediction_readiness).length,
    withScenario:   rows.filter(r => r.scenario_readiness).length,
  };

  return (
    <div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
        <SmallStat label="Toplam"        value={summary.total} />
        <SmallStat label="Hazır"         value={summary.ready}          accent="green" />
        <SmallStat label="Kısmi"         value={summary.partial}        accent="amber" />
        <SmallStat label="Bloke"         value={summary.blocked}        accent="red" />
        <SmallStat label="Tahmin Hazır"  value={summary.withPrediction} accent="blue" />
        <SmallStat label="Senaryo Hazır" value={summary.withScenario}   accent="blue" />
      </div>

      <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-3.5 h-3.5 text-navy-400" />
          <span className="text-xs font-semibold text-navy-400 uppercase tracking-wider">Filtreler</span>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-1">
            {(['all', 'ready', 'partial', 'blocked'] as StatusFilter[]).map(f => (
              <button key={f} onClick={() => setStatusFilter(f)}
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
            <select value={compFilter} onChange={e => setCompFilter(e.target.value)}
              className="appearance-none bg-navy-800 border border-navy-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none">
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

      <div className="bg-navy-900/50 border border-navy-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-navy-800 flex items-center justify-between">
          <span className="text-xs font-semibold text-readable-muted uppercase tracking-wider">
            Hazırlık Kuyruğu ({rows.length})
          </span>
          <span className="text-[11px] text-navy-600">
            Satıra tıkla → ayrıntı · Blokaj + Uyarı nedenleri
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
                  <th className="text-center px-2 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">ELO</th>
                  <th className="text-center px-2 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Öznitelik</th>
                  <th className="text-center px-2 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Kal.</th>
                  <th className="text-center px-2 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Tahmin</th>
                  <th className="text-center px-2 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Senaryo</th>
                  <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Durum</th>
                  <th className="text-right px-5 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <>
                    <tr
                      key={row.match_id}
                      className={`border-b border-navy-800/40 transition-colors cursor-pointer ${
                        row.overall_status === 'blocked'
                          ? 'hover:bg-red-900/10'
                          : row.overall_status === 'partial'
                          ? 'hover:bg-amber-900/10'
                          : 'hover:bg-navy-800/20'
                      }`}
                      onClick={() => setExpandedRow(expandedRow === row.match_id ? null : row.match_id)}
                    >
                      <td className="px-5 py-3">
                        <div className="text-white font-medium leading-tight">
                          {row.home_team_name} <span className="text-navy-500">vs</span> {row.away_team_name}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {row.feature_quality_tier && (
                            <FeatureTierBadge tier={row.feature_quality_tier} />
                          )}
                          {row.enrichment_score != null && (
                            <span className={`text-[10px] font-mono ${
                              row.enrichment_score >= 4 ? 'text-emerald-500' :
                              row.enrichment_score >= 2 ? 'text-amber-500' : 'text-navy-600'
                            }`}>
                              zenginleştirme {row.enrichment_score}/6
                            </span>
                          )}
                          {(row.warnings?.length > 0) && (
                            <span className="text-[10px] text-amber-500 flex items-center gap-0.5">
                              <AlertTriangle className="w-2.5 h-2.5" />{row.warnings.length} uyarı
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 hidden md:table-cell">
                        <div className="text-navy-400">{row.competition_name}</div>
                        <div className="text-navy-600 tabular-nums text-[11px]">{row.match_date}</div>
                      </td>
                      <td className="px-2 py-3 text-center"><ReadinessDot ok={row.elo_readiness} /></td>
                      <td className="px-2 py-3 text-center"><ReadinessDot ok={row.feature_readiness} /></td>
                      <td className="px-2 py-3 text-center"><ReadinessDot ok={row.calibration_readiness} /></td>
                      <td className="px-2 py-3 text-center">
                        {row.prediction_readiness
                          ? <PredStatusBadge status={row.prediction_status} small />
                          : <XCircle className="w-3.5 h-3.5 text-navy-700 mx-auto" />
                        }
                      </td>
                      <td className="px-2 py-3 text-center">
                        {row.scenario_readiness
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mx-auto" />
                          : <XCircle className="w-3.5 h-3.5 text-navy-700 mx-auto" />
                        }
                      </td>
                      <td className="px-3 py-3 text-center">
                        <OverallStatusBadge status={row.overall_status} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center gap-1.5 justify-end flex-wrap">
                          {/* Tekrar Değerlendir — always available */}
                          <ActionButton
                            label="Tekrar Değerlendir"
                            icon={<Eye className="w-3 h-3" />}
                            loading={assessing === row.match_id}
                            onClick={e => { e.stopPropagation(); assessMatch(row.match_id); }}
                            variant="ghost"
                          />
                          {/* Beyin Üret — always available */}
                          <ActionButton
                            label="Beyin"
                            icon={<Brain className="w-3 h-3" />}
                            loading={brainGen === row.match_id}
                            onClick={e => { e.stopPropagation(); generateBrain(row.match_id); }}
                            variant="ghost"
                          />
                          {/* Üret — only when prediction doesn't exist yet AND not blocked */}
                          {!row.prediction_readiness && row.overall_status !== 'blocked' && (
                            <ActionButton
                              label="Üret"
                              icon={<Play className="w-3 h-3" />}
                              loading={generating === row.match_id}
                              onClick={e => { e.stopPropagation(); generatePackage(row.match_id); }}
                              variant="primary"
                            />
                          )}
                          {/* Yayına Hazır Değil — explicit label for blocked rows */}
                          {row.overall_status === 'blocked' && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1">
                              <Ban className="w-3 h-3" />
                              Yayına Hazır Değil
                            </span>
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
                        {/* Inline action error */}
                        {actionErrors[row.match_id] && (
                          <div className="mt-1 text-[10px] text-red-400 text-right max-w-[200px] ml-auto">
                            {actionErrors[row.match_id]}
                          </div>
                        )}
                      </td>
                    </tr>
                    {expandedRow === row.match_id && (
                      <tr key={`${row.match_id}-expanded`} className="border-b border-navy-800/40 bg-navy-900/30">
                        <td colSpan={9} className="px-5 py-4">
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
  const [storyLinks, setStoryLinks] = useState<Record<string, StoryDraftLink>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState('all');
  const [actioning, setActioning] = useState<string | null>(null);
  const [expandedDraft, setExpandedDraft] = useState<string | null>(null);

  const setActionError = (id: string, msg: string) => {
    setActionErrors(prev => ({ ...prev, [id]: msg }));
    setTimeout(() => setActionErrors(prev => { const n = { ...prev }; delete n[id]; return n; }), 6000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    let q = supabase
      .schema('model_lab')
      .from('prematch_prediction_drafts')
      .select('id, match_id, home_team_name, away_team_name, competition_name, match_date, p_home, p_draw, p_away, p_ht_home, p_ht_draw, p_ht_away, expected_goals_home, expected_goals_away, predicted_score, confidence_score, confidence_tier, feature_quality_tier, prediction_formula, status, warnings, generated_at, has_calibration_warning, has_data_warning')
      .order('generated_at', { ascending: false })
      .limit(200);
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    const { data, error: err } = await q;
    if (err) { setError(err.message); setLoading(false); return; }
    const draftList = (data as PredictionDraft[]) ?? [];
    setDrafts(draftList);

    // Load story draft links for these matches
    if (draftList.length > 0) {
      const matchIds = [...new Set(draftList.map(d => d.match_id))];
      const { data: stories } = await supabase
        .schema('model_lab')
        .from('match_story_drafts')
        .select('match_id, status, generated_at')
        .in('match_id', matchIds)
        .order('generated_at', { ascending: false });
      const linkMap: Record<string, StoryDraftLink> = {};
      (stories ?? []).forEach((s: StoryDraftLink) => {
        if (!linkMap[s.match_id]) linkMap[s.match_id] = s;
      });
      setStoryLinks(linkMap);
    }
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
    if (err) setActionError(id, 'Güncelleme hatası: ' + err.message);
    else await load();
    setActioning(null);
  };

  const STATUS_LABELS: Record<string, string> = {
    all:               'Tümü',
    pending_review:    'İnceleme Bekliyor',
    approved_internal: 'İç Onay Verildi',
    rejected:          'Reddedildi',
    published:         'Yayınlandı',
  };

  const STATUS_OPTIONS = ['all', 'pending_review', 'approved_internal', 'rejected', 'published'];

  const publishSafe = (d: PredictionDraft): boolean => {
    return d.status === 'approved_internal' && !d.has_calibration_warning && !d.has_data_warning;
  };

  const publishBlockedReason = (d: PredictionDraft): string | null => {
    if (d.status === 'published') return null;
    if (d.status === 'rejected') return 'Reddedildi';
    if (d.status === 'pending_review') return 'Henüz incelenmedi';
    if (d.has_calibration_warning) return 'Kalibrasyon uyarısı mevcut';
    if (d.has_data_warning) return 'Veri kalitesi uyarısı mevcut';
    return null;
  };

  return (
    <div>
      <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_OPTIONS.map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                statusFilter === s
                  ? 'bg-champagne/15 text-champagne border border-champagne/30'
                  : 'bg-navy-800 text-navy-400 border border-navy-700 hover:text-white'
              }`}
            >
              {STATUS_LABELS[s] ?? s}
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
        <div className="px-5 py-3 border-b border-navy-800 flex items-center justify-between">
          <span className="text-xs font-semibold text-readable-muted uppercase tracking-wider">
            Tahmin Taslakları ({drafts.length})
          </span>
          <span className="text-[11px] text-navy-600">Satıra tıkla → detay + uyarılar + senaryo bağlantısı</span>
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
                  <th className="text-center px-2 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Tahmin Hazır</th>
                  <th className="text-center px-2 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Senaryo Hazır</th>
                  <th className="text-center px-2 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Yayın Güvenli</th>
                  <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Durum</th>
                  <th className="text-right px-5 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Aksiyon</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map(d => {
                  const story = storyLinks[d.match_id];
                  const safe = publishSafe(d);
                  const blocked = publishBlockedReason(d);
                  const hasWarnings = (d.warnings?.length > 0) || d.has_calibration_warning || d.has_data_warning;
                  return (
                    <>
                      <tr
                        key={d.id}
                        className="border-b border-navy-800/40 hover:bg-navy-800/20 transition-colors cursor-pointer"
                        onClick={() => setExpandedDraft(expandedDraft === d.id ? null : d.id)}
                      >
                        <td className="px-5 py-3">
                          <div className="text-white font-medium">{d.home_team_name} vs {d.away_team_name}</div>
                          <div className="text-navy-500 text-[11px]">{d.competition_name} · {d.match_date}</div>
                          <div className="text-navy-600 text-[10px] font-mono mt-0.5">
                            Son üretim: {new Date(d.generated_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </div>
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
                          <div className="text-[10px] text-navy-600">{d.confidence_tier === 'high' ? 'yüksek' : d.confidence_tier === 'medium' ? 'orta' : 'düşük'}</div>
                        </td>
                        {/* Tahmin Hazır */}
                        <td className="px-2 py-3 text-center">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mx-auto" />
                        </td>
                        {/* Senaryo Hazır */}
                        <td className="px-2 py-3 text-center">
                          {story ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              <span className={`text-[9px] ${
                                story.status === 'published' ? 'text-emerald-400' :
                                story.status === 'approved_internal' ? 'text-blue-400' :
                                story.status === 'pending_review' ? 'text-amber-400' : 'text-navy-500'
                              }`}>{storyStatusLabel(story.status)}</span>
                            </div>
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-navy-700 mx-auto" />
                          )}
                        </td>
                        {/* Yayın Güvenli */}
                        <td className="px-2 py-3 text-center">
                          {safe ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mx-auto" />
                          ) : (
                            <div className="flex flex-col items-center gap-0.5">
                              <Ban className="w-3.5 h-3.5 text-red-400 mx-auto" />
                              {blocked && <span className="text-[9px] text-red-400 max-w-[70px] text-center leading-tight">{blocked}</span>}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <PredStatusBadge status={d.status} />
                            {hasWarnings && (
                              <span className="text-[9px] text-amber-400 flex items-center gap-0.5">
                                <AlertTriangle className="w-2.5 h-2.5" />uyarı
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center gap-1.5 justify-end">
                            {d.status === 'pending_review' && (
                              <>
                                <ActionButton label="Onayla" icon={<ThumbsUp className="w-3 h-3" />}
                                  loading={actioning === d.id}
                                  onClick={e => { e.stopPropagation(); updateStatus(d.id, 'approved_internal'); }}
                                  variant="success" />
                                <ActionButton label="Reddet" icon={<ThumbsDown className="w-3 h-3" />}
                                  loading={actioning === d.id}
                                  onClick={e => { e.stopPropagation(); updateStatus(d.id, 'rejected'); }}
                                  variant="danger" />
                              </>
                            )}
                            {d.status === 'approved_internal' && safe && (
                              <ActionButton label="Yayınla" icon={<TrendingUp className="w-3 h-3" />}
                                loading={actioning === d.id}
                                onClick={e => { e.stopPropagation(); updateStatus(d.id, 'published'); }}
                                variant="primary" />
                            )}
                            {d.status === 'approved_internal' && !safe && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1">
                                <Ban className="w-3 h-3" />Yayına Hazır Değil
                              </span>
                            )}
                            <button
                              onClick={e => { e.stopPropagation(); setExpandedDraft(expandedDraft === d.id ? null : d.id); }}
                              className="p-1 text-navy-500 hover:text-white transition-colors"
                            >
                              {expandedDraft === d.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                          {actionErrors[d.id] && (
                            <div className="mt-1 text-[10px] text-red-400 text-right max-w-[200px] ml-auto">
                              {actionErrors[d.id]}
                            </div>
                          )}
                        </td>
                      </tr>
                      {expandedDraft === d.id && (
                        <tr key={`${d.id}-exp`} className="border-b border-navy-800/40 bg-navy-900/30">
                          <td colSpan={8} className="px-5 py-4">
                            <PredictionDraftDetail draft={d} story={story ?? null} />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function PredictionDraftDetail({ draft: d, story }: { draft: PredictionDraft; story: StoryDraftLink | null }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* Probabilities */}
      <div className="bg-navy-800/40 rounded-lg p-3">
        <div className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider mb-2">Olasılıklar</div>
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-navy-500">MS: Ev / Ber / Dep</span>
            <span className="font-mono text-white tabular-nums">
              {(d.p_home*100).toFixed(1)}% / {(d.p_draw*100).toFixed(1)}% / {(d.p_away*100).toFixed(1)}%
            </span>
          </div>
          {d.p_ht_home != null && (
            <div className="flex justify-between">
              <span className="text-navy-500">İY: Ev / Ber / Dep</span>
              <span className="font-mono text-navy-300 tabular-nums">
                {(d.p_ht_home*100).toFixed(1)}% / {(d.p_ht_draw!=null?(d.p_ht_draw*100).toFixed(1):'-')}% / {(d.p_ht_away!=null?(d.p_ht_away*100).toFixed(1):'-')}%
              </span>
            </div>
          )}
          {(d.expected_goals_home != null || d.expected_goals_away != null) && (
            <div className="flex justify-between">
              <span className="text-navy-500">Bek. Gol (Ev / Dep)</span>
              <span className="font-mono text-navy-300 tabular-nums">
                {d.expected_goals_home?.toFixed(2) ?? '–'} / {d.expected_goals_away?.toFixed(2) ?? '–'}
              </span>
            </div>
          )}
          {d.predicted_score && (
            <div className="flex justify-between">
              <span className="text-navy-500">Tahmin Skor</span>
              <span className="font-mono text-champagne font-bold">{d.predicted_score}</span>
            </div>
          )}
        </div>
      </div>

      {/* Model info */}
      <div className="bg-navy-800/40 rounded-lg p-3">
        <div className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider mb-2">Model Bilgisi</div>
        <div className="space-y-1.5 text-xs">
          <DetailRow label="Formül"    value={d.prediction_formula ?? '–'} />
          <DetailRow label="Tier"      value={d.feature_quality_tier ?? '–'} />
          <DetailRow label="Güven"     value={`${(d.confidence_score*100).toFixed(0)}% (${d.confidence_tier})`} />
          <DetailRow label="Son Üretim" value={new Date(d.generated_at).toLocaleString('tr-TR')} />
        </div>
      </div>

      {/* Warnings + Story link */}
      <div className="bg-navy-800/40 rounded-lg p-3">
        <div className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider mb-2">Uyarılar &amp; Senaryo</div>

        {/* Senaryo bağlantısı */}
        <div className="mb-3">
          <div className="text-[11px] text-navy-500 mb-1">Senaryo Taslağı</div>
          {story ? (
            <div className="flex items-center gap-2 text-xs">
              <FileText className="w-3 h-3 text-emerald-400 shrink-0" />
              <span className={`font-medium ${
                story.status === 'published' ? 'text-emerald-400' :
                story.status === 'approved_internal' ? 'text-blue-400' :
                story.status === 'pending_review' ? 'text-amber-400' : 'text-navy-400'
              }`}>{storyStatusLabel(story.status)}</span>
              <span className="text-navy-600 text-[10px]">
                {new Date(story.generated_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ) : (
            <span className="text-[11px] text-navy-600 flex items-center gap-1">
              <XCircle className="w-3 h-3" />Senaryo üretilmemiş
            </span>
          )}
        </div>

        {/* Cal + data warnings */}
        <div className="space-y-1">
          {d.has_calibration_warning && (
            <div className="flex items-start gap-1.5 text-amber-300 text-[11px]">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />Kalibrasyon uyarısı
            </div>
          )}
          {d.has_data_warning && (
            <div className="flex items-start gap-1.5 text-amber-300 text-[11px]">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />Veri kalitesi uyarısı
            </div>
          )}
          {d.warnings?.map((w, i) => (
            <div key={i} className="flex items-start gap-1.5 text-amber-300 text-[11px]">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />{w}
            </div>
          ))}
          {!d.has_calibration_warning && !d.has_data_warning && (d.warnings?.length ?? 0) === 0 && (
            <span className="text-navy-600 text-[11px]">Uyarı yok</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Brain Inspector Tab ──────────────────────────────────────────────────────

function BrainInspectorTab() {
  const [matchId, setMatchId] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [brainPkg, setBrainPkg] = useState<BrainPackage | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeBrain, setActiveBrain] = useState<string | null>(null);

  const [recentRuns, setRecentRuns] = useState<Array<{ match_id: string; generated_at: string; home: string; away: string; competition: string; tone: string; confidence: string }>>([]);
  const [runsLoading, setRunsLoading] = useState(true);

  useEffect(() => {
    const loadRecent = async () => {
      setRunsLoading(true);
      const { data } = await supabase
        .schema('model_lab')
        .from('prematch_brain_runs')
        .select('match_id, generated_at')
        .eq('status', 'completed')
        .order('generated_at', { ascending: false })
        .limit(20);

      if (!data) { setRunsLoading(false); return; }

      const enriched = await Promise.all(data.map(async (run) => {
        const { data: pkg } = await supabase.rpc('ml_get_latest_brain_package', { p_match_id: run.match_id });
        const master = pkg?.master_brain ?? {};
        const { data: rd } = await supabase.schema('model_lab').from('upcoming_match_readiness')
          .select('home_team_name, away_team_name, competition_name')
          .eq('match_id', run.match_id).maybeSingle();
        return {
          match_id: run.match_id,
          generated_at: run.generated_at,
          home: rd?.home_team_name ?? '?',
          away: rd?.away_team_name ?? '?',
          competition: rd?.competition_name ?? '?',
          tone: master.scenario_tone ?? '?',
          confidence: master.final_confidence ?? '?',
        };
      }));

      setRecentRuns(enriched);
      setRunsLoading(false);
    };
    loadRecent();
  }, []);

  const fetchBrainPackage = async (id: string) => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('ml_get_latest_brain_package', { p_match_id: id });
    if (err) { setError(err.message); setBrainPkg(null); }
    else if (!data) { setError('Bu maç için beyin paketi bulunamadı. Önce "Beyin Üret" çalıştırın.'); setBrainPkg(null); }
    else { setBrainPkg(data as BrainPackage); setActiveBrain(null); }
    setLoading(false);
  };

  const generateBrainPackage = async () => {
    if (!matchId) return;
    setGenerating(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('ml_generate_prematch_brain_package', {
      p_match_id: matchId,
      p_triggered_by: 'brain_inspector_ui',
    });
    if (err) { setError(err.message); }
    else { setBrainPkg(data as BrainPackage); setActiveBrain(null); }
    setGenerating(false);
  };

  const selectMatch = (id: string) => {
    setMatchId(id);
    setInputValue(id);
    fetchBrainPackage(id);
  };

  const handleSearch = () => {
    setMatchId(inputValue);
    fetchBrainPackage(inputValue);
  };

  const BRAIN_ORDER = ['probability', 'draw_risk', 'upset_risk', 'tempo', 'late_pressure', 'calibration', 'data_quality'];

  return (
    <div>
      <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-4 mb-6">
        <div className="text-xs font-semibold text-navy-400 uppercase tracking-wider mb-3">Maç Seç (Match ID)</div>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="Match UUID girin..."
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="flex-1 bg-navy-800 border border-navy-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-champagne/50 placeholder-navy-600"
          />
          <button onClick={handleSearch} disabled={loading || !inputValue}
            className="flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg bg-navy-800 border border-navy-700 text-navy-400 hover:text-white transition-all disabled:opacity-40">
            <Eye className="w-3 h-3" />
            Yükle
          </button>
          <button onClick={generateBrainPackage} disabled={generating || !matchId}
            className="flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg bg-champagne/15 border border-champagne/30 text-champagne hover:bg-champagne/25 transition-all disabled:opacity-40">
            {generating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />}
            Beyin Üret
          </button>
        </div>

        {!runsLoading && recentRuns.length > 0 && (
          <div>
            <div className="text-[11px] text-navy-500 mb-2">Son beyin paketleri:</div>
            <div className="flex flex-wrap gap-1.5">
              {recentRuns.map(r => (
                <button key={r.match_id} onClick={() => selectMatch(r.match_id)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all ${
                    matchId === r.match_id
                      ? 'bg-champagne/15 border-champagne/30 text-champagne'
                      : 'bg-navy-800 border-navy-700 text-navy-400 hover:text-white'
                  }`}>
                  {r.home} vs {r.away}
                  <span className={`ml-1.5 font-mono ${
                    r.confidence === 'high' ? 'text-emerald-400' :
                    r.confidence === 'medium' ? 'text-amber-400' : 'text-red-400'
                  }`}>{r.confidence}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && <ErrorBanner message={error} />}
      {loading && <LoadingSkeleton rows={4} />}

      {brainPkg && !loading && (
        <div className="space-y-4">
          <MasterBrainCard master={brainPkg.master_brain} generatedAt={brainPkg.generated_at} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {BRAIN_ORDER.map(brainName => {
              const brain = brainPkg.sub_brains?.[brainName];
              if (!brain) return null;
              const meta = BRAIN_META[brainName];
              const isActive = activeBrain === brainName;
              return (
                <SubBrainCard
                  key={brainName}
                  brainName={brainName}
                  brain={brain}
                  meta={meta}
                  isActive={isActive}
                  onToggle={() => setActiveBrain(isActive ? null : brainName)}
                />
              );
            })}
          </div>
        </div>
      )}

      {!brainPkg && !loading && !error && (
        <EmptyState message="Bir maç UUID'si girin veya yukarıdaki listeden seçin." />
      )}
    </div>
  );
}

function MasterBrainCard({ master, generatedAt }: {
  master: BrainPackage['master_brain'];
  generatedAt: string;
}) {
  const toneColors: Record<string, string> = {
    favorite_control: 'text-blue-400',
    draw_pressure:    'text-amber-400',
    upset_watch:      'text-red-400',
    balanced_tension: 'text-emerald-400',
    low_data_caution: 'text-navy-400',
  };
  const pubColors: Record<string, string> = {
    publish_safe:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    review_required: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
    do_not_publish:  'bg-red-500/15 text-red-400 border-red-500/25',
  };
  const pubLabels: Record<string, string> = {
    publish_safe:    'Yayın Güvenli',
    review_required: 'İnceleme Gerekli',
    do_not_publish:  'Yayınlama',
  };
  const confColors: Record<string, string> = {
    high:         'text-emerald-400',
    medium:       'text-amber-400',
    low:          'text-red-400',
    insufficient: 'text-navy-500',
  };

  return (
    <div className="bg-navy-900/80 border border-champagne/20 rounded-xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-champagne/10 border border-champagne/20 flex items-center justify-center">
            <Star className="w-4 h-4 text-champagne" />
          </div>
          <div>
            <div className="text-sm font-bold text-white">Master Brain</div>
            <div className="text-[11px] text-navy-500">{new Date(generatedAt).toLocaleString('tr-TR')}</div>
          </div>
        </div>
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border ${pubColors[master.publish_recommendation] ?? 'bg-navy-800 text-navy-400 border-navy-700'}`}>
          {pubLabels[master.publish_recommendation] ?? master.publish_recommendation?.replace(/_/g, ' ')}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-navy-800/60 rounded-lg p-3">
          <div className="text-[11px] text-navy-500 mb-1">Hazırlık Durumu</div>
          <OverallStatusBadge status={master.final_readiness} />
        </div>
        <div className="bg-navy-800/60 rounded-lg p-3">
          <div className="text-[11px] text-navy-500 mb-1">Güven</div>
          <span className={`text-sm font-bold ${confColors[master.final_confidence] ?? 'text-white'}`}>
            {master.final_confidence === 'high' ? 'Yüksek' : master.final_confidence === 'medium' ? 'Orta' : master.final_confidence === 'low' ? 'Düşük' : master.final_confidence}
          </span>
        </div>
        <div className="bg-navy-800/60 rounded-lg p-3 col-span-2">
          <div className="text-[11px] text-navy-500 mb-1">Senaryo Tonu</div>
          <span className={`text-sm font-semibold ${toneColors[master.scenario_tone] ?? 'text-white'}`}>
            {master.scenario_tone?.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      <p className="text-xs text-navy-300 font-mono leading-relaxed bg-navy-800/40 rounded-lg p-3 mb-3">
        {master.master_summary}
      </p>

      {master.warnings?.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider mb-1">Aktif Uyarılar</div>
          {master.warnings.map((w, i) => (
            <div key={i} className={`flex items-start gap-2 text-[11px] rounded-lg px-3 py-2 ${
              w.level === 'high' ? 'bg-red-500/10 text-red-300' :
              w.level === 'medium' ? 'bg-amber-500/10 text-amber-300' :
              'bg-navy-800/40 text-navy-400'
            }`}>
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
              <span><strong className="capitalize">{w.brain?.replace(/_/g, ' ')}</strong> — {w.msg}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SubBrainCard({ brainName, brain, meta, isActive, onToggle }: {
  brainName: string;
  brain: BrainOutput;
  meta: (typeof BRAIN_META)[string];
  isActive: boolean;
  onToggle: () => void;
}) {
  const Icon = meta.icon;
  const warnColor = {
    none:   'text-emerald-400',
    low:    'text-blue-400',
    medium: 'text-amber-400',
    high:   'text-red-400',
  }[brain.warning_level] ?? 'text-navy-400';
  const warnBg = {
    none:   '',
    low:    'border-blue-500/20',
    medium: 'border-amber-500/20',
    high:   'border-red-500/20',
  }[brain.warning_level] ?? '';

  return (
    <div className={`bg-navy-900/50 border rounded-xl overflow-hidden transition-all ${warnBg || 'border-navy-800'}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-navy-800/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-navy-800 flex items-center justify-center shrink-0">
            <Icon className="w-3.5 h-3.5 text-navy-400" />
          </div>
          <div className="text-left">
            <div className="text-xs font-semibold text-white">{meta.label}</div>
            <div className="text-[11px] text-navy-500">{meta.description}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          <div className="text-right">
            <div className={`text-[11px] font-bold ${warnColor}`}>
              {brain.warning_level === 'none' ? 'Tamam' : brain.warning_level === 'low' ? 'Düşük' : brain.warning_level === 'medium' ? 'Orta' : 'Yüksek'}
            </div>
            <div className="text-[11px] text-navy-500 font-mono">
              {brain.confidence_score != null ? (brain.confidence_score * 100).toFixed(0) + '%' : '–'}
            </div>
          </div>
          <ChevronRight className={`w-3.5 h-3.5 text-navy-500 transition-transform ${isActive ? 'rotate-90' : ''}`} />
        </div>
      </button>

      {isActive && (
        <div className="px-4 pb-4 border-t border-navy-800/50">
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
            {Object.entries(brain.output ?? {}).map(([k, v]) => {
              if (k === 'note') return null;
              return (
                <div key={k} className="flex items-start justify-between text-[11px] col-span-2 sm:col-span-1">
                  <span className="text-navy-500 shrink-0 mr-2">{k.replace(/_/g, ' ')}</span>
                  <span className="text-navy-200 font-mono text-right break-all">
                    {typeof v === 'boolean' ? (v ? 'evet' : 'hayır') :
                     typeof v === 'number' ? v.toString() :
                     typeof v === 'string' ? v :
                     Array.isArray(v) ? (v.length === 0 ? 'yok' : v.join(', ')) :
                     JSON.stringify(v)}
                  </span>
                </div>
              );
            })}
          </div>
          {brain.output?.note && (
            <div className="mt-3 pt-2.5 border-t border-navy-800/50 text-[11px] text-navy-500 italic">
              {String(brain.output.note)}
            </div>
          )}
        </div>
      )}
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
    queued:    jobs.filter(j => j.status === 'queued').length,
    completed: jobs.filter(j => j.status === 'completed').length,
    failed:    jobs.filter(j => j.status === 'failed').length,
  };

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-6">
        <SmallStat label="Bekleyen"   value={statusCounts.queued}    accent={statusCounts.queued > 0 ? 'amber' : undefined} />
        <SmallStat label="Tamamlandı" value={statusCounts.completed} accent="green" />
        <SmallStat label="Başarısız"  value={statusCounts.failed}    accent={statusCounts.failed > 0 ? 'red' : undefined} />
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
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Hata</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(j => (
                  <tr key={j.id} className="border-b border-navy-800/40 hover:bg-navy-800/20 transition-colors">
                    <td className="px-5 py-3"><span className="font-mono text-navy-300">{j.job_type}</span></td>
                    <td className="px-3 py-3 text-navy-400 hidden md:table-cell">{j.competition}</td>
                    <td className="px-3 py-3 text-center"><JobStatusBadge status={j.status} /></td>
                    <td className="px-3 py-3 text-navy-500 tabular-nums hidden sm:table-cell">
                      {j.started_at ? new Date(j.started_at).toLocaleString('tr-TR') : '–'}
                    </td>
                    <td className="px-3 py-3">
                      {j.error_message
                        ? (
                          <div className="flex items-start gap-1.5">
                            <AlertCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                            <span className="text-red-400 font-mono text-[11px] leading-tight">{j.error_message.slice(0, 120)}</span>
                          </div>
                        )
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

// ─── ReadinessDetail ─────────────────────────────────────────────────────────

function ReadinessDetail({ row }: { row: ReadinessRow }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* Core readiness */}
      <div className="bg-navy-800/40 rounded-lg p-3">
        <div className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider mb-2">Hazırlık Boyutları</div>
        <div className="space-y-1.5">
          {[
            { label: 'ELO Puanları',           ok: row.elo_readiness },
            { label: 'Öznitelik Matrisi',      ok: row.feature_readiness },
            { label: 'Kalibrasyon',             ok: row.calibration_readiness },
            { label: 'Kadro Verisi',            ok: row.lineup_availability },
            { label: 'İstatistik Verisi',       ok: row.stats_availability },
            { label: 'Puan Durumu',             ok: row.standings_readiness },
            { label: 'Sakatlık/Ceza Verisi',    ok: row.injuries_readiness },
            { label: 'Takım İstatistikleri',    ok: row.team_statistics_readiness },
            { label: 'Stat Bilgisi',            ok: row.venue_readiness },
          ].map(({ label, ok }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-navy-400">{label}</span>
              <ReadinessDot ok={ok} withLabel />
            </div>
          ))}
          <div className="flex items-center justify-between pt-1 border-t border-navy-700/50">
            <span className="text-navy-400">Tahmin Taslağı</span>
            <ReadinessDot ok={row.prediction_readiness} withLabel />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-navy-400">Senaryo Taslağı</span>
            <ReadinessDot ok={row.scenario_readiness} withLabel />
          </div>
        </div>
      </div>

      {/* Signal quality */}
      <div className="bg-navy-800/40 rounded-lg p-3">
        <div className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider mb-2">Sinyal Kalitesi</div>
        <div className="space-y-1.5">
          <DetailRow label="ELO Ev"          value={row.elo_home != null ? row.elo_home.toFixed(0) : '–'} />
          <DetailRow label="ELO Deplasman"   value={row.elo_away != null ? row.elo_away.toFixed(0) : '–'} />
          <DetailRow label="ELO Farkı"       value={row.elo_home != null && row.elo_away != null ? (row.elo_home - row.elo_away).toFixed(0) : '–'} />
          <DetailRow label="Ev L5 Maç"       value={row.home_l5_available.toString()} />
          <DetailRow label="Dep L5 Maç"      value={row.away_l5_available.toString()} />
          <DetailRow label="Brier L50"       value={row.calibration_brier_l50 != null ? row.calibration_brier_l50.toFixed(4) : '–'} />
          <DetailRow label="Zenginleştirme"  value={row.enrichment_score != null ? `${row.enrichment_score} / 6` : '–'} />
          <DetailRow label="Sakatlık Seviye" value={row.injury_warning_level ?? '–'} />
          <DetailRow label="Tahmin Durum"    value={row.prediction_status ?? '–'} />
        </div>
      </div>

      {/* Blocking + warnings + publish safety */}
      <div className="bg-navy-800/40 rounded-lg p-3">
        <div className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider mb-2">
          Blokaj · Uyarılar · Yayın Güvenliği
        </div>

        {/* Publish safety */}
        <div className="mb-3 pb-2.5 border-b border-navy-700/50">
          <div className="text-[11px] text-navy-500 mb-1">Yayın Güvenli</div>
          {row.overall_status === 'ready' && row.prediction_readiness ? (
            <div className="flex items-center gap-1.5 text-emerald-400 text-xs">
              <CheckCircle2 className="w-3.5 h-3.5" />Yayına Hazır
            </div>
          ) : row.overall_status === 'blocked' ? (
            <div className="flex items-center gap-1.5 text-red-400 text-xs">
              <Ban className="w-3.5 h-3.5" />Yayına Hazır Değil — Blokaj Var
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-amber-400 text-xs">
              <AlertTriangle className="w-3.5 h-3.5" />Kısmi — İnceleme Gerekli
            </div>
          )}
        </div>

        {row.blocking_reasons?.length > 0 && (
          <div className="mb-2">
            <div className="text-[11px] text-red-400 font-semibold mb-1">Blokaj Nedenleri</div>
            {row.blocking_reasons.map((r, i) => (
              <div key={i} className="flex items-start gap-1.5 text-red-300 text-[11px] mb-1">
                <XCircle className="w-3 h-3 shrink-0 mt-0.5" />{r}
              </div>
            ))}
          </div>
        )}

        <div className="text-[11px] text-navy-500 font-semibold mb-1 mt-1">Uyarılar</div>
        {row.warnings?.length > 0 ? row.warnings.map((w, i) => (
          <div key={i} className="flex items-start gap-1.5 text-amber-300 text-[11px] mb-1">
            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />{w}
          </div>
        )) : <span className="text-navy-600 text-[11px]">Uyarı yok</span>}

        <div className="mt-3 pt-2 border-t border-navy-700/50">
          <span className="text-[11px] text-navy-500">
            Son değerlendirme: {new Date(row.assessed_at).toLocaleString('tr-TR')}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Shared UI Components ─────────────────────────────────────────────────────

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
    ready:   { label: 'Hazır',       color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
    partial: { label: 'Kısmi',       color: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
    blocked: { label: 'Bloke',       color: 'bg-red-500/15 text-red-400 border-red-500/25' },
  };
  const cfg = map[status] ?? { label: status, color: 'bg-navy-800 text-navy-400 border-navy-700' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function PredStatusBadge({ status, small }: { status: string | null; small?: boolean }) {
  if (!status) return <span className="text-navy-600">–</span>;
  const labels: Record<string, string> = {
    pending_review:    'İnceleme Bekliyor',
    approved_internal: 'İç Onay',
    rejected:          'Reddedildi',
    published:         'Yayınlandı',
  };
  const colors: Record<string, string> = {
    pending_review:    'text-amber-400',
    approved_internal: 'text-blue-400',
    rejected:          'text-red-400',
    published:         'text-emerald-400',
  };
  const label = labels[status] ?? status.replace(/_/g, ' ');
  if (small) {
    return <span className={`text-[10px] font-medium ${colors[status] ?? 'text-navy-400'} leading-tight`}>{label}</span>;
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${
      status === 'pending_review'    ? 'bg-amber-500/15 text-amber-400 border-amber-500/25' :
      status === 'approved_internal' ? 'bg-blue-500/15 text-blue-400 border-blue-500/25' :
      status === 'rejected'          ? 'bg-red-500/15 text-red-400 border-red-500/25' :
      status === 'published'         ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' :
      'bg-navy-800 text-navy-400 border-navy-700'
    }`}>
      {label}
    </span>
  );
}

function storyStatusLabel(s: string): string {
  const m: Record<string, string> = {
    pending_review: 'İnceleme Bekliyor', approved_internal: 'İç Onay', rejected: 'Reddedildi', published: 'Yayınlandı',
  };
  return m[s] ?? s.replace(/_/g, ' ');
}

function JobStatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = { queued: 'Bekliyor', completed: 'Tamamlandı', failed: 'Başarısız' };
  const map: Record<string, string> = {
    queued:    'bg-navy-700 text-navy-300',
    completed: 'bg-emerald-500/15 text-emerald-400',
    failed:    'bg-red-500/15 text-red-400',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${map[status] ?? 'bg-navy-800 text-navy-400'}`}>
      {labels[status] ?? status}
    </span>
  );
}

function FeatureTierBadge({ tier }: { tier: string }) {
  const labels: Record<string, string> = { elo_only: 'elo-only', elo_form: 'elo+form', elo_form_stats: 'elo+form+istat' };
  const colors: Record<string, string> = { elo_only: 'text-navy-500', elo_form: 'text-blue-400', elo_form_stats: 'text-emerald-400' };
  return <span className={`text-[10px] font-mono ${colors[tier] ?? 'text-navy-400'}`}>{labels[tier] ?? tier ?? '–'}</span>;
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

function ActionButton({ label, icon, loading, onClick, variant }: {
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
    <button onClick={onClick} disabled={loading}
      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all disabled:opacity-40 ${variantClass}`}>
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
