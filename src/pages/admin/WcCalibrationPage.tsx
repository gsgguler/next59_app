import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, AlertTriangle, CheckCircle2, Shield, Globe,
  ChevronDown, ChevronUp, AlertCircle, Play,
  BarChart2, Target, Activity, Database,
  Zap, Users, Link2, TrendingUp,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalibRow {
  api_football_team_id:             number;
  team_name:                        string;
  fifa_code:                        string | null;
  confederation:                    string | null;
  historical_wc_matches:            number;
  last_wc_year:                     number | null;
  wc2026_team_strength_index:       number | null;
  wc2026_lineup_strength_index:     number | null;
  wc2026_bench_impact_index:        number | null;
  wc2026_tournament_pressure_index: number | null;
  wc2026_scenario_confidence:       number | null;
  wc2026_late_goal_risk:            number | null;
  wc2026_chaos_probability:         number | null;
  wc2026_fatigue_risk:              number | null;
  calibration_confidence:           string;
  player_pool_count:                number;
  players_injured:                  number;
  probable_xi_available:            boolean;
  squad_age_profile:                string | null;
  defensive_fragility_score:        number | null;
  comeback_risk_score:              number | null;
  data_coverage_flags:              Record<string, boolean | number>;
  missing_data_warnings:            string[];
  calibration_notes:                string | null;
  calibrated_at:                    string | null;
}

interface CalibRun {
  id:              string;
  run_type:        string;
  triggered_by:    string;
  run_status:      string;
  teams_processed: number;
  teams_updated:   number;
  teams_skipped:   number;
  started_at:      string;
  completed_at:    string | null;
  error_summary:   string | null;
}

interface ScenarioRow {
  api_football_fixture_id:          number;
  home_team_name:                   string;
  away_team_name:                   string;
  stage_code:                       string | null;
  group_label:                      string | null;
  home_win_probability:             number | null;
  draw_probability:                 number | null;
  away_win_probability:             number | null;
  predicted_score_home:             number | null;
  predicted_score_away:             number | null;
  wc2026_late_goal_risk:            number | null;
  wc2026_chaos_probability:         number | null;
  wc2026_fatigue_risk:              number | null;
  wc2026_scenario_confidence:       number | null;
  calibration_confidence:           string;
  first_15_tempo:                   string | null;
  late_goal_probability:            number | null;
  comeback_probability:             number | null;
  set_piece_threat:                 string | null;
  calibrated_at:                    string;
}

interface PoolSummary {
  total: number;
  missing_mapping: number;
  has_warning: number;
  by_conf: Record<string, number>;
}

type TabId = 'teams' | 'scenarios' | 'runs';
type ConfFilter = 'tumu' | 'high' | 'medium' | 'low' | 'none';

// ─── Shared helpers ───────────────────────────────────────────────────────────

const CONF_COLORS: Record<string, string> = {
  high:   'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25',
  medium: 'bg-amber-500/15 text-amber-400 border border-amber-500/25',
  low:    'bg-blue-500/15 text-blue-400 border border-blue-500/25',
  none:   'bg-navy-700 text-navy-400',
};
const CONF_TR: Record<string, string> = {
  high: 'Yüksek', medium: 'Orta', low: 'Düşük', none: 'Yok',
};

function ConfBadge({ level }: { level: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${CONF_COLORS[level] ?? CONF_COLORS.none}`}>
      {CONF_TR[level] ?? level}
    </span>
  );
}

function IndexBar({ value, max = 100, color = 'blue' }: { value: number | null; max?: number; color?: string }) {
  if (value == null) return <span className="text-navy-600 text-[11px]">–</span>;
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const barColor = color === 'green' ? 'bg-emerald-500' : color === 'red' ? 'bg-red-500' :
    color === 'amber' ? 'bg-amber-500' : 'bg-blue-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-navy-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] font-mono text-navy-300 w-8 text-right">{Math.round(value)}</span>
    </div>
  );
}

function ProbBar({ home, draw, away }: { home: number | null; draw: number | null; away: number | null }) {
  if (home == null) return <span className="text-navy-600 text-[11px]">–</span>;
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-mono">
      <span className="text-blue-400 w-7 text-right">{((home ?? 0) * 100).toFixed(0)}%</span>
      <span className="text-navy-500 w-7 text-center">{((draw ?? 0) * 100).toFixed(0)}%</span>
      <span className="text-amber-400 w-7 text-left">{((away ?? 0) * 100).toFixed(0)}%</span>
    </div>
  );
}

function fmt(ts: string | null): string {
  if (!ts) return '–';
  return new Date(ts).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function CoverageFlag({ flags }: { flags: Record<string, boolean | number> }) {
  const items = [
    { key: 'has_history',     label: 'Tarih' },
    { key: 'has_recent_form', label: 'Form' },
    { key: 'has_player_pool', label: 'Kadro' },
    { key: 'has_probable_xi', label: 'İlk 11' },
    { key: 'has_bench',       label: 'Yedek' },
  ];
  return (
    <div className="flex gap-1 flex-wrap">
      {items.map(({ key, label }) => (
        <span
          key={key}
          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
            flags[key]
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'bg-navy-800 text-navy-600'
          }`}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

// ─── Coverage Header ─────────────────────────────────────────────────────────

function CoverageHeader() {
  const [pool, setPool] = useState<PoolSummary | null>(null);
  const [engineRunning, setEngineRunning] = useState(false);
  const [engineResult, setEngineResult] = useState<string | null>(null);
  const [lastEngineRun, setLastEngineRun] = useState<string | null>(null);

  useEffect(() => {
    async function loadPool() {
      const { data } = await supabase
        .from('wc2026_team_pool')
        .select('confederation, overall_status, missing_warning');
      if (!data) return;
      const summary: PoolSummary = { total: data.length, missing_mapping: 0, has_warning: 0, by_conf: {} };
      for (const r of data) {
        if (r.overall_status === 'missing_mapping') summary.missing_mapping++;
        if (r.missing_warning) summary.has_warning++;
        const c = r.confederation ?? 'Diğer';
        summary.by_conf[c] = (summary.by_conf[c] ?? 0) + 1;
      }
      setPool(summary);
    }

    async function loadLastRun() {
      const { data } = await supabase
        .from('wc2026_provider_fetch_logs')
        .select('fetched_at')
        .eq('data_type', 'recent_form')
        .order('fetched_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setLastEngineRun(data.fetched_at);
    }

    loadPool();
    loadLastRun();
  }, []);

  const runStrengthEngine = async () => {
    setEngineRunning(true);
    setEngineResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('wc2026-strength-engine', {
        body: { mode: 'full' },
      });
      if (error) {
        setEngineResult('Hata: ' + error.message);
      } else {
        const r = data as { status?: string; teams_processed?: number; predictions_created?: number } | null;
        setEngineResult(
          r?.teams_processed != null
            ? `Tamamlandı: ${r.teams_processed} takım işlendi, ${r.predictions_created ?? 0} tahmin oluşturuldu`
            : 'Güç motoru çalıştı'
        );
        setLastEngineRun(new Date().toISOString());
      }
    } catch (e) {
      setEngineResult('Hata: ' + (e instanceof Error ? e.message : String(e)));
    }
    setEngineRunning(false);
  };

  const mapped = pool ? pool.total - pool.missing_mapping : null;

  return (
    <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-white">Takım Havuzu Durumu</h2>
        <button
          onClick={runStrengthEngine}
          disabled={engineRunning}
          className="flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/25 text-blue-400 hover:bg-blue-500/20 transition-all disabled:opacity-40 font-medium"
        >
          {engineRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
          Güç Motorunu Çalıştır
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <CoverageCard
          icon={<Users className="w-4 h-4 text-white" />}
          label="Takım Havuzu"
          value={pool ? `${pool.total} / 48` : '–'}
          ok={pool?.total === 48}
          okText="Tam"
          warnText="Eksik"
        />
        <CoverageCard
          icon={<Link2 className="w-4 h-4 text-white" />}
          label="API Eşleşmesi"
          value={mapped != null ? `${mapped} / ${pool?.total ?? 48}` : '–'}
          ok={pool != null && pool.missing_mapping === 0}
          okText="Tümü Eşleşti"
          warnText={pool ? `${pool.missing_mapping} Eksik Eşleşme` : '–'}
        />
        <CoverageCard
          icon={<AlertTriangle className="w-4 h-4 text-white" />}
          label="Veri Uyarısı"
          value={pool ? pool.has_warning.toString() : '–'}
          ok={pool != null && pool.has_warning === 0}
          okText="Uyarı Yok"
          warnText={pool ? `${pool.has_warning} Takım` : '–'}
        />
        <CoverageCard
          icon={<TrendingUp className="w-4 h-4 text-white" />}
          label="Son Güç Çalıştırma"
          value={lastEngineRun ? fmt(lastEngineRun) : 'Hiç çalışmadı'}
          ok={lastEngineRun != null}
          okText="Hazır"
          warnText="Bekliyor"
        />
      </div>

      {pool && (
        <div className="flex flex-wrap gap-2 mb-3">
          {Object.entries(pool.by_conf).sort().map(([conf, count]) => (
            <span key={conf} className="text-[10px] px-2 py-0.5 rounded-full bg-navy-800 text-navy-400 font-medium">
              {conf} · {count}
            </span>
          ))}
        </div>
      )}

      {engineResult && (
        <div className={`text-xs rounded-lg px-3 py-2 font-mono ${
          engineResult.startsWith('Hata')
            ? 'bg-red-500/10 text-red-400'
            : 'bg-blue-500/10 text-blue-400'
        }`}>
          {engineResult}
        </div>
      )}
    </div>
  );
}

function CoverageCard({
  icon, label, value, ok, okText, warnText,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  ok: boolean;
  okText: string;
  warnText: string;
}) {
  return (
    <div className="bg-navy-800/50 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${ok ? 'bg-emerald-500/15' : 'bg-amber-500/15'}`}>
          {icon}
        </div>
        <span className="text-[11px] text-navy-500 font-medium">{label}</span>
      </div>
      <div className="text-sm font-bold text-white tabular-nums mb-0.5">{value}</div>
      <div className={`text-[10px] font-medium ${ok ? 'text-emerald-400' : 'text-amber-400'}`}>
        {ok ? okText : warnText}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WcCalibrationPage() {
  const [tab, setTab] = useState<TabId>('teams');

  return (
    <div className="min-h-screen bg-navy-950 p-6">
      <div className="max-w-7xl mx-auto">

        <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-5 py-3 mb-8 flex items-start gap-3">
          <Shield className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-sm text-emerald-300">
            <strong>DK 2026 Kalibrasyon Motoru — İzole Katman.</strong>{' '}
            Bu motor mevcut model_lab kalibrasyonunu değiştirmez. Turnuva-özgü güç ve senaryo indeksleri üretir.
          </p>
        </div>

        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <BarChart2 className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white font-display">DK 2026 Kalibrasyon Motoru</h1>
            <p className="text-sm text-readable-muted mt-1">
              Takım Güç İndeksi · Kadro Kalitesi · Yedek Etkisi · Turnuva Baskısı · Senaryo Kalibrasyonu
            </p>
          </div>
        </div>

        <CoverageHeader />

        <div className="flex items-center gap-1 mb-6 border-b border-navy-800">
          {([
            { id: 'teams'     as TabId, label: 'Takım Kalibrasyonları', icon: Globe },
            { id: 'scenarios' as TabId, label: 'Maç Senaryoları',       icon: Target },
            { id: 'runs'      as TabId, label: 'Kalibrasyon Geçmişi',   icon: Activity },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${
                tab === id
                  ? 'border-emerald-400 text-emerald-400'
                  : 'border-transparent text-navy-400 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {tab === 'teams'     && <TeamsTab />}
        {tab === 'scenarios' && <ScenariosTab />}
        {tab === 'runs'      && <RunsTab />}
      </div>
    </div>
  );
}

// ─── Teams Tab ────────────────────────────────────────────────────────────────

function TeamsTab() {
  const [rows, setRows]       = useState<CalibRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [confFilter, setConfFilter] = useState<ConfFilter>('tumu');
  const [search, setSearch]   = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [runResult, setRunResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('wc2026_get_calibration_dashboard');
    if (err) { setError(err.message); setLoading(false); return; }
    setRows((data as CalibRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const runCalibration = async () => {
    setRunning(true);
    setRunResult(null);
    const { data, error: err } = await supabase.rpc('wc2026_run_full_calibration', {
      p_triggered_by: 'admin_ui',
    });
    if (err) {
      setRunResult('Hata: ' + err.message);
    } else {
      const r = data as { teams_processed: number; teams_updated: number; teams_skipped: number; status: string };
      setRunResult(`Tamamlandı: ${r.teams_updated} takım güncellendi, ${r.teams_skipped} atlandı (${r.status})`);
      await load();
    }
    setRunning(false);
  };

  const filtered = rows.filter(r => {
    if (confFilter !== 'tumu' && r.calibration_confidence !== confFilter) return false;
    if (search && !r.team_name.toLowerCase().includes(search.toLowerCase())
               && !(r.fifa_code ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const summary = {
    total:  rows.length,
    high:   rows.filter(r => r.calibration_confidence === 'high').length,
    medium: rows.filter(r => r.calibration_confidence === 'medium').length,
    low:    rows.filter(r => r.calibration_confidence === 'low').length,
    none:   rows.filter(r => r.calibration_confidence === 'none').length,
  };

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <SmallStat label="Toplam"         value={summary.total} />
        <SmallStat label="Yüksek Güven"   value={summary.high}   accent="green" />
        <SmallStat label="Orta Güven"     value={summary.medium} accent="amber" />
        <SmallStat label="Düşük Güven"    value={summary.low}    accent="blue" />
        <SmallStat label="Veri Yok"       value={summary.none} />
      </div>

      {/* Controls */}
      <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="Takım veya FIFA kodu ara..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[160px] bg-navy-800 border border-navy-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50 placeholder-navy-600"
          />
          <div className="flex gap-1">
            {(['tumu','high','medium','low','none'] as ConfFilter[]).map(c => (
              <button key={c} onClick={() => setConfFilter(c)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                  confFilter === c
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'bg-navy-800 text-navy-400 border border-navy-700 hover:text-white'
                }`}>
                {c === 'tumu' ? 'Tümü' : CONF_TR[c] ?? c}
              </button>
            ))}
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-navy-800 border border-navy-700 text-navy-400 hover:text-white transition-all disabled:opacity-40">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
          <button onClick={runCalibration} disabled={running}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 transition-all disabled:opacity-40">
            {running ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            Kalibrasyonu Çalıştır
          </button>
        </div>
        {runResult && (
          <div className={`mt-3 text-xs rounded-lg px-3 py-2 font-mono ${
            runResult.startsWith('Hata')
              ? 'bg-red-500/10 text-red-400'
              : 'bg-emerald-500/10 text-emerald-400'
          }`}>
            {runResult}
          </div>
        )}
      </div>

      {error && <ErrorBanner message={error} />}

      {!loading && rows.length === 0 && (
        <EmptyCalibState
          title="Henüz kalibrasyon kaydı yok"
          desc='Takımları wc2026_team_pool tablosuna ekledikten sonra "Kalibrasyonu Çalıştır" butonunu kullanın.'
        />
      )}

      {(loading || filtered.length > 0) && (
        <div className="bg-navy-900/50 border border-navy-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-navy-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-readable-muted uppercase tracking-wider">
              Takım Kalibrasyonları ({filtered.length})
            </span>
            <span className="text-[11px] text-navy-500">
              Formül: wc2026_v1 · DK tarihi + oyuncu havuzu + muhtemel XI
            </span>
          </div>

          {loading ? <LoadingSkeleton rows={8} /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-navy-800">
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Takım</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Güven</th>
                    <th className="text-left px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden lg:table-cell w-28">Güç İndeksi</th>
                    <th className="text-left px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden lg:table-cell w-28">Turnuva Baskısı</th>
                    <th className="text-left px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden xl:table-cell w-24">Geç Gol Riski</th>
                    <th className="text-left px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden xl:table-cell w-24">Kaos İhtimali</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden md:table-cell">DK Maç</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden md:table-cell">Veri Katmanı</th>
                    <th className="text-right px-5 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(row => (
                    <>
                      <tr
                        key={row.api_football_team_id}
                        className="border-b border-navy-800/40 hover:bg-navy-800/20 transition-colors cursor-pointer"
                        onClick={() => setExpanded(expanded === row.api_football_team_id ? null : row.api_football_team_id)}
                      >
                        <td className="px-5 py-3">
                          <div className="text-white font-medium">{row.team_name}</div>
                          <div className="text-navy-500 text-[10px]">{row.fifa_code ?? '–'} · {row.confederation ?? '–'}</div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <ConfBadge level={row.calibration_confidence} />
                        </td>
                        <td className="px-3 py-3 hidden lg:table-cell w-28">
                          <IndexBar value={row.wc2026_team_strength_index} color="blue" />
                        </td>
                        <td className="px-3 py-3 hidden lg:table-cell w-28">
                          <IndexBar value={row.wc2026_tournament_pressure_index} color="amber" />
                        </td>
                        <td className="px-3 py-3 hidden xl:table-cell w-24">
                          <IndexBar value={row.wc2026_late_goal_risk != null ? row.wc2026_late_goal_risk * 100 : null} color="red" />
                        </td>
                        <td className="px-3 py-3 hidden xl:table-cell w-24">
                          <IndexBar value={row.wc2026_chaos_probability != null ? row.wc2026_chaos_probability * 100 : null} color="amber" />
                        </td>
                        <td className="px-3 py-3 text-center hidden md:table-cell">
                          <span className="text-navy-300 font-mono">{row.historical_wc_matches}</span>
                          {row.last_wc_year && (
                            <span className="text-navy-600 text-[10px] block">{row.last_wc_year}</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center hidden md:table-cell">
                          <CoverageFlag flags={row.data_coverage_flags} />
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={e => { e.stopPropagation(); setExpanded(expanded === row.api_football_team_id ? null : row.api_football_team_id); }}
                            className="p-1 text-navy-500 hover:text-white transition-colors"
                          >
                            {expanded === row.api_football_team_id
                              ? <ChevronUp className="w-3.5 h-3.5" />
                              : <ChevronDown className="w-3.5 h-3.5" />
                            }
                          </button>
                        </td>
                      </tr>
                      {expanded === row.api_football_team_id && (
                        <tr key={`${row.api_football_team_id}-detail`} className="border-b border-navy-800/40 bg-navy-900/30">
                          <td colSpan={9} className="px-5 py-4">
                            <TeamCalibDetail row={row} />
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
      )}
    </div>
  );
}

function TeamCalibDetail({ row }: { row: CalibRow }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Named indices */}
      <div className="bg-navy-800/40 rounded-lg p-3">
        <div className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider mb-3">Kalibrasyon İndeksleri</div>
        <div className="space-y-2">
          <IndexDetailRow label="Takım Güç İndeksi"        value={row.wc2026_team_strength_index}        max={100} color="blue" />
          <IndexDetailRow label="Kadro Güç İndeksi"        value={row.wc2026_lineup_strength_index != null ? row.wc2026_lineup_strength_index : null} max={100} color="emerald" />
          <IndexDetailRow label="Yedek Etkisi"             value={row.wc2026_bench_impact_index != null ? (row.wc2026_bench_impact_index + 1) * 50 : null} max={100} color="amber" />
          <IndexDetailRow label="Turnuva Baskısı"          value={row.wc2026_tournament_pressure_index}  max={100} color="amber" />
          <IndexDetailRow label="Senaryo Güveni"           value={row.wc2026_scenario_confidence != null ? row.wc2026_scenario_confidence * 100 : null} max={100} color="blue" />
          <IndexDetailRow label="Geç Gol Riski"            value={row.wc2026_late_goal_risk != null ? row.wc2026_late_goal_risk * 100 : null} max={100} color="red" />
          <IndexDetailRow label="Kaos İhtimali"            value={row.wc2026_chaos_probability != null ? row.wc2026_chaos_probability * 100 : null} max={100} color="orange" />
          <IndexDetailRow label="Yorgunluk Riski"          value={row.wc2026_fatigue_risk != null ? row.wc2026_fatigue_risk * 100 : null} max={100} color="red" />
        </div>
      </div>

      {/* Tournament factors */}
      <div className="bg-navy-800/40 rounded-lg p-3">
        <div className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider mb-3">Turnuva Faktörleri</div>
        <DetailRow label="DK Görünme"            value={(row.historical_wc_matches ?? 0).toString()} />
        <DetailRow label="Son DK Yılı"           value={(row.last_wc_year ?? '–').toString()} />
        <DetailRow label="Kadro Yaş Profili"     value={AGE_TR[row.squad_age_profile ?? ''] ?? (row.squad_age_profile ?? '–')} />
        <DetailRow label="Savunma Kırılganlığı"  value={row.defensive_fragility_score != null ? row.defensive_fragility_score.toFixed(1) : '–'} />
        <DetailRow label="Geri Dönüş Riski"      value={row.comeback_risk_score != null ? row.comeback_risk_score.toFixed(1) : '–'} />
        <DetailRow label="Muhtemel XI Mevcut"    value={row.probable_xi_available ? 'Evet' : 'Hayır'} />
        <DetailRow label="Sakatlar"              value={(row.players_injured ?? 0).toString()} />
      </div>

      {/* Data coverage */}
      <div className="bg-navy-800/40 rounded-lg p-3">
        <div className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider mb-3">Veri Kapsamı</div>
        <div className="space-y-1.5 mb-3">
          {[
            { key: 'has_history',     label: 'Tarihsel DK Verisi' },
            { key: 'has_recent_form', label: 'Son Form (2018/22)' },
            { key: 'has_player_pool', label: 'Oyuncu Havuzu' },
            { key: 'has_probable_xi', label: 'Muhtemel İlk 11' },
            { key: 'has_bench',       label: 'Yedek Oyuncular' },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between text-[11px]">
              <span className="text-navy-400">{label}</span>
              {row.data_coverage_flags[key]
                ? <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                : <AlertCircle className="w-3 h-3 text-navy-600" />
              }
            </div>
          ))}
        </div>
        <DetailRow label="Veri Katmanı"  value={String(row.data_coverage_flags.data_layers ?? 0) + ' / 5'} />
        <DetailRow label="Oyuncu Sayısı" value={row.player_pool_count.toString()} />
      </div>

      {/* Warnings + notes */}
      <div className="bg-navy-800/40 rounded-lg p-3">
        <div className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider mb-3">Açıklamalar</div>
        {row.missing_data_warnings?.length > 0 ? (
          <div className="space-y-1.5 mb-3">
            {row.missing_data_warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-1.5 text-amber-300 text-[11px]">
                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                {w}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-navy-500 mb-3">Uyarı yok</p>
        )}
        {row.calibration_notes && (
          <p className="text-[11px] text-navy-400 font-mono bg-navy-900/50 rounded p-2 leading-relaxed">
            {row.calibration_notes}
          </p>
        )}
        <div className="mt-2 pt-2 border-t border-navy-700">
          <span className="text-[10px] text-navy-600">Son kalibrasyon: {fmt(row.calibrated_at)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Scenarios Tab ────────────────────────────────────────────────────────────

function ScenariosTab() {
  const [rows, setRows]       = useState<ScenarioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [search, setSearch]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('wc2026_match_scenario_calibration')
      .select('api_football_fixture_id, home_team_name, away_team_name, stage_code, group_label, home_win_probability, draw_probability, away_win_probability, predicted_score_home, predicted_score_away, wc2026_late_goal_risk, wc2026_chaos_probability, wc2026_fatigue_risk, wc2026_scenario_confidence, calibration_confidence, first_15_tempo, late_goal_probability, comeback_probability, set_piece_threat, calibrated_at')
      .order('calibrated_at', { ascending: false })
      .limit(300);
    if (err) { setError(err.message); setLoading(false); return; }

    // Deduplicate — keep latest per fixture
    const seen = new Set<number>();
    const deduped: ScenarioRow[] = [];
    for (const r of (data as ScenarioRow[]) ?? []) {
      if (!seen.has(r.api_football_fixture_id)) {
        seen.add(r.api_football_fixture_id);
        deduped.push(r);
      }
    }
    setRows(deduped);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = search
    ? rows.filter(r =>
        r.home_team_name.toLowerCase().includes(search.toLowerCase()) ||
        r.away_team_name.toLowerCase().includes(search.toLowerCase())
      )
    : rows;

  return (
    <div>
      <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-4 mb-4">
        <div className="flex gap-3 items-center">
          <input
            type="text"
            placeholder="Takım ara..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-navy-800 border border-navy-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50 placeholder-navy-600"
          />
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-navy-800 border border-navy-700 text-navy-400 hover:text-white transition-all disabled:opacity-40">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {!loading && rows.length === 0 && (
        <EmptyCalibState
          title="Henüz maç senaryosu yok"
          desc="Takım kalibrasyonları tamamlandıktan sonra maçlar için wc2026_compute_match_scenario() çağrısı yapılabilir."
        />
      )}

      {(loading || filtered.length > 0) && (
        <div className="bg-navy-900/50 border border-navy-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-navy-800">
            <span className="text-xs font-semibold text-readable-muted uppercase tracking-wider">
              Maç Senaryoları ({filtered.length})
            </span>
          </div>
          {loading ? <LoadingSkeleton rows={6} /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-navy-800">
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Maç</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden sm:table-cell">Olasılıklar</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden sm:table-cell">Tahmin Skor</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden md:table-cell">Geç Gol</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden md:table-cell">Kaos</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden lg:table-cell">15dk Tempo</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Güven</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.api_football_fixture_id} className="border-b border-navy-800/40 hover:bg-navy-800/20 transition-colors">
                      <td className="px-5 py-3">
                        <div className="text-white font-medium">{r.home_team_name} <span className="text-navy-500">vs</span> {r.away_team_name}</div>
                        <div className="text-navy-500 text-[10px]">{r.stage_code ?? '–'} {r.group_label ? `· ${r.group_label}` : ''}</div>
                      </td>
                      <td className="px-3 py-3 text-center hidden sm:table-cell">
                        <ProbBar home={r.home_win_probability} draw={r.draw_probability} away={r.away_win_probability} />
                      </td>
                      <td className="px-3 py-3 text-center hidden sm:table-cell">
                        {r.predicted_score_home != null
                          ? <span className="font-mono text-white">{r.predicted_score_home}–{r.predicted_score_away}</span>
                          : <span className="text-navy-600">–</span>
                        }
                      </td>
                      <td className="px-3 py-3 text-center hidden md:table-cell">
                        <span className={`font-mono text-[11px] ${
                          (r.wc2026_late_goal_risk ?? 0) > 0.5 ? 'text-red-400' :
                          (r.wc2026_late_goal_risk ?? 0) > 0.3 ? 'text-amber-400' : 'text-emerald-400'
                        }`}>
                          {r.wc2026_late_goal_risk != null ? (r.wc2026_late_goal_risk * 100).toFixed(0) + '%' : '–'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center hidden md:table-cell">
                        <span className={`font-mono text-[11px] ${
                          (r.wc2026_chaos_probability ?? 0) > 0.5 ? 'text-orange-400' :
                          (r.wc2026_chaos_probability ?? 0) > 0.3 ? 'text-amber-400' : 'text-navy-400'
                        }`}>
                          {r.wc2026_chaos_probability != null ? (r.wc2026_chaos_probability * 100).toFixed(0) + '%' : '–'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center hidden lg:table-cell">
                        <span className={`text-[11px] ${
                          r.first_15_tempo === 'high' ? 'text-red-400' :
                          r.first_15_tempo === 'balanced' ? 'text-amber-400' : 'text-navy-400'
                        }`}>
                          {TEMPO_TR[r.first_15_tempo ?? ''] ?? (r.first_15_tempo ?? '–')}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <ConfBadge level={r.calibration_confidence} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Runs Tab ─────────────────────────────────────────────────────────────────

function RunsTab() {
  const [runs, setRuns]       = useState<CalibRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('wc2026_calibration_runs')
      .select('id, run_type, triggered_by, run_status, teams_processed, teams_updated, teams_skipped, started_at, completed_at, error_summary')
      .order('started_at', { ascending: false })
      .limit(100);
    if (err) { setError(err.message); setLoading(false); return; }
    setRuns((data as CalibRun[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const RUN_STATUS_COLORS: Record<string, string> = {
    running:   'bg-blue-500/15 text-blue-400',
    completed: 'bg-emerald-500/15 text-emerald-400',
    partial:   'bg-amber-500/15 text-amber-400',
    failed:    'bg-red-500/15 text-red-400',
  };
  const RUN_STATUS_TR: Record<string, string> = {
    running: 'Çalışıyor', completed: 'Tamamlandı', partial: 'Kısmi', failed: 'Başarısız',
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-navy-800 border border-navy-700 text-navy-400 hover:text-white transition-all disabled:opacity-40">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </button>
      </div>

      {error && <ErrorBanner message={error} />}

      {!loading && runs.length === 0 && (
        <EmptyCalibState title="Henüz kalibrasyon çalışması yok" desc='Takımlar sekmesindeki "Kalibrasyonu Çalıştır" butonu ile başlatılabilir.' />
      )}

      {(loading || runs.length > 0) && (
        <div className="bg-navy-900/50 border border-navy-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-navy-800">
            <span className="text-xs font-semibold text-readable-muted uppercase tracking-wider">
              Kalibrasyon Geçmişi ({runs.length})
            </span>
          </div>
          {loading ? <LoadingSkeleton rows={5} /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-navy-800">
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Çalışma Tipi</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Durum</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden sm:table-cell">İşlenen / Güncellenen</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden md:table-cell">Tetikleyen</th>
                    <th className="text-right px-5 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Başlangıç</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map(r => (
                    <tr key={r.id} className="border-b border-navy-800/40 hover:bg-navy-800/20 transition-colors">
                      <td className="px-5 py-3">
                        <span className="font-mono text-navy-300">{r.run_type.replace(/_/g, ' ')}</span>
                        {r.error_summary && (
                          <div className="text-red-400 text-[10px] mt-0.5 font-mono">{r.error_summary.slice(0, 80)}</div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${RUN_STATUS_COLORS[r.run_status] ?? 'bg-navy-800 text-navy-400'}`}>
                          {RUN_STATUS_TR[r.run_status] ?? r.run_status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center hidden sm:table-cell">
                        <span className="text-navy-300 font-mono">{r.teams_processed}</span>
                        <span className="text-navy-600"> / </span>
                        <span className="text-emerald-400 font-mono">{r.teams_updated}</span>
                      </td>
                      <td className="px-3 py-3 text-center text-navy-500 hidden md:table-cell">
                        {r.triggered_by}
                      </td>
                      <td className="px-5 py-3 text-right text-navy-500 tabular-nums">
                        {fmt(r.started_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Shared UI Components ─────────────────────────────────────────────────────

const AGE_TR: Record<string, string> = {
  young: 'Genç (<25)', balanced: 'Dengeli (25-28)', experienced: 'Deneyimli (>28)', unknown: 'Bilinmiyor',
};
const TEMPO_TR: Record<string, string> = {
  low: 'Yavaş', balanced: 'Dengeli', high: 'Yoğun',
};

function IndexDetailRow({ label, value, max, color }: { label: string; value: number | null; max: number; color: string }) {
  return (
    <div className="mb-1.5">
      <div className="text-[10px] text-navy-500 mb-0.5">{label}</div>
      <IndexBar value={value} max={max} color={color} />
    </div>
  );
}

function SmallStat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  const color = accent === 'green' ? 'text-emerald-400' : accent === 'amber' ? 'text-amber-400' :
    accent === 'blue' ? 'text-blue-400' : accent === 'red' ? 'text-red-400' : 'text-white';
  return (
    <div className="bg-navy-900/50 border border-navy-800 rounded-xl px-4 py-3">
      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-[11px] text-readable-muted mt-0.5">{label}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between text-[11px] mb-1.5">
      <span className="text-navy-500 shrink-0 mr-2">{label}</span>
      <span className="text-navy-300 font-mono text-right">{value}</span>
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

function EmptyCalibState({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-10 text-center">
      <Database className="w-10 h-10 text-navy-700 mx-auto mb-3" />
      <p className="text-sm text-readable-muted mb-2">{title}</p>
      <p className="text-xs text-navy-600 max-w-md mx-auto">{desc}</p>
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
