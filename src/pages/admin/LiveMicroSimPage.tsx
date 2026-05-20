import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Activity,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  Zap,
  TrendingUp,
  TrendingDown,
  Minus,
  Play,
  BarChart3,
  Clock,
  Info,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MicroWindow {
  id: string;
  fixture_id: number;
  window_start_minute: number;
  window_end_minute: number;
  home_score: number;
  away_score: number;
  events_count: number;
  goals_home: number;
  goals_away: number;
  pressure_home: number;
  pressure_away: number;
  pressure_delta: number;
  momentum_direction: string;
  tactical_instability_score: number | null;
  fatigue_wave_score: number | null;
  chaos_score: number | null;
  comeback_pressure_score: number | null;
  draw_preservation_score: number | null;
  late_goal_risk: number | null;
  micro_state: string;
  confidence: number;
  source_quality: string;
  calculated_at: string;
  engine_version: string;
  reasoning_json: Record<string, unknown> | null;
  historical_state_reliability: number | null;
  historically_false_signal: boolean;
  pattern_sample_size: number | null;
  reliability_warning: string | null;
}

interface ReplayResult {
  processed?: number;
  windows_created?: number;
  windows_updated?: number;
  errors?: unknown[];
  remaining_candidates?: number;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATE_LABELS: Record<string, string> = {
  data_insufficient:      'Veri Yetersiz',
  balanced_open:          'Dengeli Açık',
  home_dominant:          'Ev Sahibi Baskın',
  away_dominant:          'Deplasman Baskın',
  high_pressure_home:     'Ev Sahibi Yüksek Baskı',
  high_pressure_away:     'Deplasman Yüksek Baskı',
  tactical_instability:   'Taktiksel Kararsızlık',
  fatigue_wave:           'Yorgunluk Dalgası',
  chaos_phase:            'Kaos Fazı',
  comeback_pressure:      'Geri Dönüş Baskısı',
  late_goal_risk:         'Son Dakika Gol Riski',
  draw_preservation:      'Beraberlik Koruma',
  dead_rubber:            'Anlamsız Maç',
  match_end:              'Maç Sonu',
};

const STATE_COLORS: Record<string, string> = {
  data_insufficient:      'bg-slate-700 text-slate-300',
  balanced_open:          'bg-sky-900/60 text-sky-300',
  home_dominant:          'bg-blue-900/60 text-blue-300',
  away_dominant:          'bg-orange-900/60 text-orange-300',
  high_pressure_home:     'bg-blue-800/80 text-blue-200',
  high_pressure_away:     'bg-orange-800/80 text-orange-200',
  tactical_instability:   'bg-yellow-900/60 text-yellow-300',
  fatigue_wave:           'bg-purple-900/60 text-purple-300',
  chaos_phase:            'bg-red-900/70 text-red-200',
  comeback_pressure:      'bg-amber-900/60 text-amber-300',
  late_goal_risk:         'bg-red-800/60 text-red-300',
  draw_preservation:      'bg-teal-900/60 text-teal-300',
  dead_rubber:            'bg-slate-700 text-slate-400',
  match_end:              'bg-slate-600 text-slate-300',
};

const MOMENTUM_ICONS = {
  home:    <TrendingUp className="w-3.5 h-3.5 text-blue-400" />,
  away:    <TrendingDown className="w-3.5 h-3.5 text-orange-400" />,
  neutral: <Minus className="w-3.5 h-3.5 text-slate-400" />,
};

const QUALITY_COLORS: Record<string, string> = {
  insufficient:         'text-red-400',
  event_only:           'text-yellow-400',
  event_stats:          'text-blue-400',
  event_stats_lineups:  'text-emerald-400',
};

function fmt(v: number | null, decimals = 2): string {
  if (v === null || v === undefined) return '—';
  return v.toFixed(decimals);
}

function pct(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return `${(v * 100).toFixed(0)}%`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function WindowRow({ w, expanded, onToggle }: {
  w: MicroWindow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const stateLabel = STATE_LABELS[w.micro_state] ?? w.micro_state;
  const stateClass = STATE_COLORS[w.micro_state] ?? 'bg-slate-700 text-slate-300';
  const momIcon = MOMENTUM_ICONS[w.momentum_direction as keyof typeof MOMENTUM_ICONS] ?? MOMENTUM_ICONS.neutral;
  const qualClass = QUALITY_COLORS[w.source_quality] ?? 'text-slate-400';

  return (
    <>
      <tr
        className="border-b border-slate-700/50 hover:bg-slate-700/20 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        {/* Dakika */}
        <td className="px-3 py-2.5 text-sm font-mono text-slate-300 whitespace-nowrap">
          {w.window_start_minute}'–{w.window_end_minute}'
        </td>
        {/* Skor */}
        <td className="px-3 py-2.5 text-sm font-mono text-white font-semibold text-center">
          {w.home_score}–{w.away_score}
        </td>
        {/* Durum */}
        <td className="px-3 py-2.5">
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${stateClass}`}>
            {stateLabel}
          </span>
        </td>
        {/* Momentum */}
        <td className="px-3 py-2.5 text-center">{momIcon}</td>
        {/* Baskı Δ */}
        <td className={`px-3 py-2.5 text-xs font-mono text-center ${
          w.pressure_delta > 0.05 ? 'text-blue-400' :
          w.pressure_delta < -0.05 ? 'text-orange-400' : 'text-slate-400'
        }`}>
          {w.pressure_delta >= 0 ? '+' : ''}{fmt(w.pressure_delta, 3)}
        </td>
        {/* Kaos */}
        <td className={`px-3 py-2.5 text-xs font-mono text-center ${
          (w.chaos_score ?? 0) > 0.6 ? 'text-red-400' :
          (w.chaos_score ?? 0) > 0.3 ? 'text-yellow-400' : 'text-slate-400'
        }`}>
          {fmt(w.chaos_score, 2)}
        </td>
        {/* Son dk risk */}
        <td className={`px-3 py-2.5 text-xs font-mono text-center ${
          (w.late_goal_risk ?? 0) > 0.5 ? 'text-red-400' : 'text-slate-400'
        }`}>
          {fmt(w.late_goal_risk, 2)}
        </td>
        {/* Güven */}
        <td className="px-3 py-2.5 text-xs font-mono text-center text-slate-300">
          {pct(w.confidence)}
        </td>
        {/* Kalite */}
        <td className={`px-3 py-2.5 text-xs font-mono text-center ${qualClass}`}>
          {w.source_quality.replace('event_', '').replace('_', '+')}
        </td>
        {/* Expand */}
        <td className="px-3 py-2.5 text-center text-slate-500">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </td>
      </tr>

      {expanded && (
        <tr className="bg-slate-800/60 border-b border-slate-700">
          <td colSpan={10} className="px-4 py-3">
            <ExpandedDetail w={w} />
          </td>
        </tr>
      )}
    </>
  );
}

function ExpandedDetail({ w }: { w: MicroWindow }) {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="space-y-3">
      {/* Reliability warning */}
      {w.reliability_warning && (
        <div className="flex items-start gap-2 p-2 rounded bg-amber-900/30 border border-amber-700/40">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
          <span className="text-xs text-amber-300">{w.reliability_warning}</span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        {/* Baskı metrikleri */}
        <MetricGroup label="Baskı Endeksi">
          <MetricRow k="Ev Sahibi" v={fmt(w.pressure_home, 3)} />
          <MetricRow k="Deplasman" v={fmt(w.pressure_away, 3)} />
          <MetricRow k="Delta" v={fmt(w.pressure_delta, 3)} highlight />
        </MetricGroup>

        {/* Skor metrikleri */}
        <MetricGroup label="Maç Metrikleri">
          <MetricRow k="Olaylar" v={String(w.events_count)} />
          <MetricRow k="Goller (Ev)" v={String(w.goals_home)} />
          <MetricRow k="Goller (Dep)" v={String(w.goals_away)} />
        </MetricGroup>

        {/* Durum skoru */}
        <MetricGroup label="Durum Skorları">
          <MetricRow k="Taktiksel Karg." v={fmt(w.tactical_instability_score, 3)} />
          <MetricRow k="Yorgunluk" v={fmt(w.fatigue_wave_score, 3)} />
          <MetricRow k="Geri Dönüş" v={fmt(w.comeback_pressure_score, 3)} />
          <MetricRow k="Beraberlik K." v={fmt(w.draw_preservation_score, 3)} />
        </MetricGroup>

        {/* Hafıza */}
        <MetricGroup label="Tarihsel Hafıza">
          <MetricRow k="Güvenilirlik" v={w.historical_state_reliability !== null ? pct(w.historical_state_reliability) : '—'} />
          <MetricRow k="Örnek Sayısı" v={w.pattern_sample_size !== null ? String(w.pattern_sample_size) : '—'} />
          <MetricRow k="Yanlış Sinyal" v={w.historically_false_signal ? 'Evet' : 'Hayır'} warn={w.historically_false_signal} />
        </MetricGroup>
      </div>

      {/* Reasoning JSON */}
      {w.reasoning_json && (
        <div>
          <button
            onClick={() => setShowRaw(r => !r)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <Info className="w-3 h-3" />
            Karar Gerekçesi
            {showRaw ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {showRaw && (
            <div className="mt-2 rounded bg-slate-900 border border-slate-700 p-3">
              {/* Triggered rules */}
              {Array.isArray((w.reasoning_json as any).triggered_rules) && (
                <div className="mb-2">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Tetiklenen Kurallar</p>
                  <div className="flex flex-wrap gap-1">
                    {((w.reasoning_json as any).triggered_rules as string[]).map((rule, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-400 text-[10px] font-mono">{rule}</span>
                    ))}
                  </div>
                </div>
              )}
              {/* Missing inputs */}
              {Array.isArray((w.reasoning_json as any).missing_inputs) && (w.reasoning_json as any).missing_inputs.length > 0 && (
                <div className="mb-2">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Eksik Girdi</p>
                  <div className="flex flex-wrap gap-1">
                    {((w.reasoning_json as any).missing_inputs as string[]).map((m, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-400 text-[10px] font-mono">{m}</span>
                    ))}
                  </div>
                </div>
              )}
              {/* Confidence penalties */}
              {Array.isArray((w.reasoning_json as any).confidence_penalties) && (w.reasoning_json as any).confidence_penalties.length > 0 && (
                <div className="mb-2">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Güven Cezaları</p>
                  <div className="flex flex-wrap gap-1">
                    {((w.reasoning_json as any).confidence_penalties as string[]).map((p, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded bg-red-900/40 text-red-400 text-[10px] font-mono">{p}</span>
                    ))}
                  </div>
                </div>
              )}
              {/* Full JSON */}
              <details className="mt-2">
                <summary className="text-[10px] text-slate-500 cursor-pointer hover:text-slate-300">Ham JSON</summary>
                <pre className="mt-1 text-[10px] text-slate-400 overflow-x-auto leading-relaxed">
                  {JSON.stringify(w.reasoning_json, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetricGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-800/40 rounded p-2.5 border border-slate-700/40">
      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 font-semibold">{label}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function MetricRow({ k, v, highlight, warn }: { k: string; v: string; highlight?: boolean; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-400 text-[11px] truncate">{k}</span>
      <span className={`text-[11px] font-mono font-medium ${
        warn ? 'text-red-400' : highlight ? 'text-blue-300' : 'text-slate-200'
      }`}>{v}</span>
    </div>
  );
}

// ─── Pressure timeline bar ────────────────────────────────────────────────────

function PressureTimeline({ windows }: { windows: MicroWindow[] }) {
  if (windows.length === 0) return null;
  const sorted = [...windows].sort((a, b) => a.window_start_minute - b.window_start_minute);

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-0.5 h-16">
        {sorted.map(w => {
          const homeH = Math.round(w.pressure_home * 100);
          const awayH = Math.round(w.pressure_away * 100);
          const domClass = w.pressure_delta > 0.05 ? 'bg-blue-500' :
                           w.pressure_delta < -0.05 ? 'bg-orange-500' : 'bg-slate-500';
          return (
            <div
              key={w.id}
              title={`${w.window_start_minute}' — Ev: ${fmt(w.pressure_home,3)} / Dep: ${fmt(w.pressure_away,3)}`}
              className="flex-1 flex flex-col-reverse gap-0.5"
            >
              <div
                className={`${domClass} rounded-sm opacity-80 transition-all`}
                style={{ height: `${Math.max(homeH, awayH)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-0.5">
        {sorted.map(w => (
          <div key={w.id} className="flex-1 text-center text-[9px] text-slate-500">
            {w.window_start_minute}'
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LiveMicroSimPage() {
  const [fixtureInput, setFixtureInput] = useState('1238032');
  const [windows, setWindows] = useState<MicroWindow[]>([]);
  const [loading, setLoading] = useState(false);
  const [buildLoading, setBuildLoading] = useState(false);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayResult, setReplayResult] = useState<ReplayResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [annotateLoading, setAnnotateLoading] = useState(false);

  const loadWindows = useCallback(async (fid: number) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .schema('model_lab' as any)
        .from('live_micro_windows')
        .select('*')
        .eq('fixture_id', fid)
        .eq('engine_version', 'micro_v1')
        .order('window_start_minute', { ascending: true });

      if (err) throw err;
      setWindows((data as MicroWindow[]) ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleBuild = async () => {
    const fid = parseInt(fixtureInput);
    if (!fid) return;
    setBuildLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('admin_build_micro_windows', { p_fixture_id: fid });
      if (err) throw err;
      await loadWindows(fid);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBuildLoading(false);
    }
  };

  const handleAnnotate = async () => {
    const fid = parseInt(fixtureInput);
    if (!fid) return;
    setAnnotateLoading(true);
    try {
      const { error: err } = await supabase.rpc('admin_annotate_micro_windows', { p_fixture_id: fid });
      if (err) throw err;
      await loadWindows(fid);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnnotateLoading(false);
    }
  };

  const handleReplay = async () => {
    setReplayLoading(true);
    setReplayResult(null);
    try {
      const { data, error: err } = await supabase.rpc('admin_run_micro_replay_batch', { p_limit: 50 });
      if (err) throw err;
      setReplayResult(data as ReplayResult);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReplayLoading(false);
    }
  };

  const handleLoad = () => {
    const fid = parseInt(fixtureInput);
    if (fid) loadWindows(fid);
  };

  const sortedWindows = [...windows].sort((a, b) => a.window_start_minute - b.window_start_minute);

  return (
    <div className="p-6 space-y-6 min-h-screen" style={{ background: '#0f1621' }}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            Canlı Mikro Simülasyon
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">5 dakikalık pencere bazlı durum makinesi — motor v1</p>
        </div>

        <button
          onClick={handleReplay}
          disabled={replayLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${replayLoading ? 'animate-spin' : ''}`} />
          Toplu Replay (50 Maç)
        </button>
      </div>

      {/* Replay result */}
      {replayResult && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
          <Stat label="İşlenen Maç" value={String(replayResult.processed ?? 0)} color="text-emerald-400" />
          <Stat label="Oluşturulan Pencere" value={String(replayResult.windows_created ?? 0)} color="text-blue-400" />
          <Stat label="Güncellenen" value={String(replayResult.windows_updated ?? 0)} color="text-sky-400" />
          <Stat label="Hata" value={String((replayResult.errors ?? []).length)} color={(replayResult.errors ?? []).length > 0 ? 'text-red-400' : 'text-slate-400'} />
          <Stat label="Kalan Aday" value={String(replayResult.remaining_candidates ?? '—')} color="text-slate-400" />
        </div>
      )}

      {/* Fixture controls */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 space-y-3">
        <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Fikstür Analizi</p>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="number"
            value={fixtureInput}
            onChange={e => setFixtureInput(e.target.value)}
            placeholder="Fikstür ID"
            className="w-40 px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleLoad}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 text-slate-200 text-sm font-medium transition-colors disabled:opacity-50"
          >
            <BarChart3 className={`w-4 h-4 ${loading ? 'animate-pulse' : ''}`} />
            Yükle
          </button>
          <button
            onClick={handleBuild}
            disabled={buildLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Play className={`w-4 h-4 ${buildLoading ? 'animate-spin' : ''}`} />
            İnşa Et
          </button>
          <button
            onClick={handleAnnotate}
            disabled={annotateLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-800 hover:bg-teal-700 text-teal-200 text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Zap className={`w-4 h-4 ${annotateLoading ? 'animate-pulse' : ''}`} />
            Hafıza Notla
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-900/30 border border-red-700/40">
          <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <span className="text-sm text-red-300">{error}</span>
        </div>
      )}

      {/* Timeline visualisation */}
      {sortedWindows.length > 0 && (
        <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Baskı Zaman Çizelgesi — Fikstür {fixtureInput}
            </p>
            <div className="flex items-center gap-3 text-[11px] text-slate-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500 inline-block" /> Ev Baskısı</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-orange-500 inline-block" /> Dep Baskısı</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-slate-500 inline-block" /> Dengeli</span>
            </div>
          </div>
          <PressureTimeline windows={sortedWindows} />
          <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
            <span>{sortedWindows.length} pencere</span>
            <span>Motor: {sortedWindows[0]?.engine_version}</span>
            <span>Son hesap: {sortedWindows[sortedWindows.length-1]?.calculated_at?.slice(0, 19).replace('T', ' ')}</span>
          </div>
        </div>
      )}

      {/* Windows table */}
      {sortedWindows.length > 0 && (
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-800/80 border-b border-slate-700">
                  {[
                    'Dakika', 'Skor', 'Durum', 'Momentum',
                    'Baskı Δ', 'Kaos', 'Son Dk Risk', 'Güven', 'Kalite', ''
                  ].map(h => (
                    <th key={h} className="px-3 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedWindows.map(w => (
                  <WindowRow
                    key={w.id}
                    w={w}
                    expanded={expandedId === w.id}
                    onToggle={() => setExpandedId(expandedId === w.id ? null : w.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && sortedWindows.length === 0 && !error && (
        <div className="text-center py-16 text-slate-500">
          <Activity className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Fikstür ID girin ve "Yükle" veya "İnşa Et"e tıklayın</p>
        </div>
      )}

      {loading && (
        <div className="text-center py-16 text-slate-500">
          <RefreshCw className="w-6 h-6 mx-auto animate-spin mb-2 opacity-60" />
          <p className="text-sm">Yükleniyor...</p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center">
      <p className={`text-xl font-bold font-mono ${color}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}
