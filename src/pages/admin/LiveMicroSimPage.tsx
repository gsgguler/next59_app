import { useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Activity,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Zap,
  TrendingUp,
  TrendingDown,
  Minus,
  Play,
  BarChart3,
  Clock,
  Info,
  Brain,
  Target,
  ShieldAlert,
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

interface PatternRow {
  id: string;
  micro_state: string;
  minute_bucket: string;
  score_state: string;
  pressure_bucket: string;
  source_quality_bucket: string;
  sample_size: number;
  low_sample_warning: boolean;
  goal_within_10_rate: number | null;
  late_goal_rate: number | null;
  comeback_rate: number | null;
  draw_preservation_rate: number | null;
  false_pressure_rate: number | null;
  false_chaos_rate: number | null;
  false_late_goal_rate: number | null;
  reliability_score: number | null;
  confidence_adjustment: number | null;
  updated_at: string;
}

interface OutcomeRow {
  id: string;
  fixture_id: number;
  window_start_minute: number;
  micro_state: string;
  next_goal_within_10: boolean | null;
  late_goal_after_window: boolean | null;
  comeback_occurred: boolean | null;
  draw_preserved: boolean | null;
  was_false_pressure_signal: boolean | null;
  was_false_chaos_signal: boolean | null;
  was_false_late_goal_signal: boolean | null;
  final_result: string | null;
  confidence: number | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATE_LABELS: Record<string, string> = {
  data_insufficient: 'Veri Yetersiz',
  balanced_contest: 'Dengeli',
  home_dominant: 'Ev Baskın',
  away_dominant: 'Dep Baskın',
  high_pressure_home: 'Ev Yüksek Baskı',
  high_pressure_away: 'Dep Yüksek Baskı',
  tactical_instability: 'Taktiksel Kararsızlık',
  fatigue_wave: 'Yorgunluk',
  chaos_phase: 'Kaos',
  comeback_pressure: 'Geri Dönüş Baskısı',
  late_goal_risk: 'Geç Gol Riski',
  draw_preservation: 'Beraberlik Koruma',
  dead_rubber: 'Anlamsız',
  match_end: 'Maç Sonu',
  game_killed: 'Fark Açıldı',
  comeback_push_home: 'Geri Dönüş (Ev)',
  comeback_push_away: 'Geri Dönüş (Dep)',
  late_pressure_home: 'Son Baskı (Ev)',
  late_pressure_away: 'Son Baskı (Dep)',
  draw_lock: 'Beraberlik Kilidi',
  fatigue_drop: 'Yorgunluk Düşüşü',
  home_pressure: 'Ev Baskısı',
  away_pressure: 'Dep Baskısı',
  transition_swing: 'Geçiş Salınımı',
  calm_control: 'Sakin Kontrol',
  balanced_open: 'Dengeli Açık',
};

const STATE_COLORS: Record<string, string> = {
  data_insufficient: 'bg-slate-700 text-slate-300',
  balanced_contest: 'bg-sky-900/60 text-sky-300',
  chaos_phase: 'bg-red-900/70 text-red-200',
  comeback_push_home: 'bg-blue-800/80 text-blue-200',
  comeback_push_away: 'bg-orange-800/80 text-orange-200',
  late_pressure_home: 'bg-blue-800/60 text-blue-300',
  late_pressure_away: 'bg-orange-800/60 text-orange-300',
  transition_swing: 'bg-yellow-900/60 text-yellow-300',
  draw_lock: 'bg-teal-900/60 text-teal-300',
  home_pressure: 'bg-blue-900/50 text-blue-400',
  away_pressure: 'bg-orange-900/50 text-orange-400',
  calm_control: 'bg-slate-600/60 text-slate-300',
  game_killed: 'bg-slate-700 text-slate-400',
  fatigue_drop: 'bg-purple-900/50 text-purple-300',
};

const MOMENTUM_ICONS = {
  home: <TrendingUp className="w-3.5 h-3.5 text-blue-400" />,
  away: <TrendingDown className="w-3.5 h-3.5 text-orange-400" />,
  neutral: <Minus className="w-3.5 h-3.5 text-slate-400" />,
};

const QUALITY_COLORS: Record<string, string> = {
  insufficient: 'text-red-400',
  event_only: 'text-yellow-400',
  event_stats: 'text-blue-400',
  event_stats_lineups: 'text-emerald-400',
};

function fmt(v: number | null, d = 2): string {
  return v === null || v === undefined ? '—' : v.toFixed(d);
}
function pct(v: number | null): string {
  return v === null || v === undefined ? '—' : `${(v * 100).toFixed(0)}%`;
}
function bool(v: boolean | null): string {
  if (v === null) return '—';
  return v ? 'Evet' : 'Hayır';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PressureTimeline({ windows }: { windows: MicroWindow[] }) {
  if (!windows.length) return null;
  const sorted = [...windows].sort((a, b) => a.window_start_minute - b.window_start_minute);
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-0.5 h-16">
        {sorted.map(w => {
          const cls = w.pressure_delta > 0.05 ? 'bg-blue-500' :
                      w.pressure_delta < -0.05 ? 'bg-orange-500' : 'bg-slate-500';
          const h = Math.max(8, Math.round(Math.max(w.pressure_home, w.pressure_away) * 100));
          return (
            <div key={w.id} className="flex-1 flex items-end" title={`${w.window_start_minute}'`}>
              <div className={`w-full rounded-sm opacity-80 ${cls}`} style={{ height: `${h}%` }} />
            </div>
          );
        })}
      </div>
      <div className="flex gap-0.5">
        {sorted.map(w => (
          <div key={w.id} className="flex-1 text-center text-[9px] text-slate-500">{w.window_start_minute}'</div>
        ))}
      </div>
    </div>
  );
}

function WindowRow({ w, expanded, onToggle }: { w: MicroWindow; expanded: boolean; onToggle: () => void }) {
  const stateClass = STATE_COLORS[w.micro_state] ?? 'bg-slate-700 text-slate-300';
  const stateLabel = STATE_LABELS[w.micro_state] ?? w.micro_state;
  const momIcon = MOMENTUM_ICONS[w.momentum_direction as keyof typeof MOMENTUM_ICONS] ?? MOMENTUM_ICONS.neutral;
  const qualClass = QUALITY_COLORS[w.source_quality] ?? 'text-slate-400';
  return (
    <>
      <tr className="border-b border-slate-700/50 hover:bg-slate-700/20 cursor-pointer" onClick={onToggle}>
        <td className="px-3 py-2.5 text-sm font-mono text-slate-300">{w.window_start_minute}'–{w.window_end_minute}'</td>
        <td className="px-3 py-2.5 text-sm font-mono text-white font-semibold text-center">{w.home_score}–{w.away_score}</td>
        <td className="px-3 py-2.5">
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${stateClass}`}>{stateLabel}</span>
        </td>
        <td className="px-3 py-2.5 text-center">{momIcon}</td>
        <td className={`px-3 py-2.5 text-xs font-mono text-center ${w.pressure_delta > 0.05 ? 'text-blue-400' : w.pressure_delta < -0.05 ? 'text-orange-400' : 'text-slate-400'}`}>
          {w.pressure_delta >= 0 ? '+' : ''}{fmt(w.pressure_delta, 3)}
        </td>
        <td className={`px-3 py-2.5 text-xs font-mono text-center ${(w.chaos_score ?? 0) > 0.6 ? 'text-red-400' : (w.chaos_score ?? 0) > 0.3 ? 'text-yellow-400' : 'text-slate-400'}`}>{fmt(w.chaos_score)}</td>
        <td className={`px-3 py-2.5 text-xs font-mono text-center ${(w.late_goal_risk ?? 0) > 0.5 ? 'text-red-400' : 'text-slate-400'}`}>{fmt(w.late_goal_risk)}</td>
        <td className="px-3 py-2.5 text-xs font-mono text-center text-slate-300">{pct(w.confidence)}</td>
        <td className={`px-3 py-2.5 text-xs font-mono text-center ${qualClass}`}>{w.source_quality.replace('event_', '').replace('_', '+')}</td>
        <td className="px-3 py-2.5 text-center text-slate-500">{expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}</td>
      </tr>
      {expanded && (
        <tr className="bg-slate-800/60 border-b border-slate-700">
          <td colSpan={10} className="px-4 py-3">
            <WindowDetail w={w} />
          </td>
        </tr>
      )}
    </>
  );
}

function WindowDetail({ w }: { w: MicroWindow }) {
  const [showRaw, setShowRaw] = useState(false);
  return (
    <div className="space-y-3">
      {w.reliability_warning && (
        <div className="flex items-start gap-2 p-2 rounded bg-amber-900/30 border border-amber-700/40">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
          <span className="text-xs text-amber-300">{w.reliability_warning}</span>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <MetricGroup label="Baskı Endeksi">
          <MR k="Ev" v={fmt(w.pressure_home, 3)} />
          <MR k="Dep" v={fmt(w.pressure_away, 3)} />
          <MR k="Delta" v={fmt(w.pressure_delta, 3)} highlight />
        </MetricGroup>
        <MetricGroup label="Durum Skorları">
          <MR k="Taktiksel Karg." v={fmt(w.tactical_instability_score, 3)} />
          <MR k="Yorgunluk" v={fmt(w.fatigue_wave_score, 3)} />
          <MR k="Geri Dönüş" v={fmt(w.comeback_pressure_score, 3)} />
          <MR k="Beraberlik K." v={fmt(w.draw_preservation_score, 3)} />
        </MetricGroup>
        <MetricGroup label="Tarihsel Hafıza">
          <MR k="Güvenilirlik" v={w.historical_state_reliability !== null ? pct(w.historical_state_reliability) : '—'} />
          <MR k="Örnek Sayısı" v={w.pattern_sample_size !== null ? String(w.pattern_sample_size) : '—'} />
          <MR k="Yanlış Sinyal" v={bool(w.historically_false_signal)} warn={w.historically_false_signal} />
        </MetricGroup>
        <MetricGroup label="Maç Özeti">
          <MR k="Olaylar" v={String(w.events_count)} />
          <MR k="Güven" v={pct(w.confidence)} />
          <MR k="Kaynak" v={w.source_quality} />
        </MetricGroup>
      </div>
      {w.reasoning_json && (
        <div>
          <button onClick={() => setShowRaw(r => !r)} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200">
            <Info className="w-3 h-3" />
            Karar Gerekçesi
            {showRaw ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {showRaw && (
            <div className="mt-2 rounded bg-slate-900 border border-slate-700 p-3 space-y-2">
              {Array.isArray((w.reasoning_json as any).triggered_rules) && (
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Tetiklenen Kurallar</p>
                  <div className="flex flex-wrap gap-1">
                    {((w.reasoning_json as any).triggered_rules as string[]).map((r, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-400 text-[10px] font-mono">{r}</span>
                    ))}
                  </div>
                </div>
              )}
              {Array.isArray((w.reasoning_json as any).missing_inputs) && (w.reasoning_json as any).missing_inputs.length > 0 && (
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Eksik Girdi</p>
                  <div className="flex flex-wrap gap-1">
                    {((w.reasoning_json as any).missing_inputs as string[]).map((m, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-400 text-[10px] font-mono">{m}</span>
                    ))}
                  </div>
                </div>
              )}
              <details>
                <summary className="text-[10px] text-slate-500 cursor-pointer hover:text-slate-300">Ham JSON</summary>
                <pre className="mt-1 text-[10px] text-slate-400 overflow-x-auto">{JSON.stringify(w.reasoning_json, null, 2)}</pre>
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

function MR({ k, v, highlight, warn }: { k: string; v: string; highlight?: boolean; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-400 text-[11px]">{k}</span>
      <span className={`text-[11px] font-mono ${warn ? 'text-red-400' : highlight ? 'text-blue-300' : 'text-slate-200'}`}>{v}</span>
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

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'windows' | 'outcomes' | 'patterns' | 'false_signals';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'windows',      label: 'Pencere Analizi',     icon: <Activity className="w-3.5 h-3.5" /> },
  { id: 'outcomes',     label: 'State Öğrenimi',      icon: <Brain className="w-3.5 h-3.5" /> },
  { id: 'patterns',     label: 'Pattern Memory',      icon: <Target className="w-3.5 h-3.5" /> },
  { id: 'false_signals',label: 'Yanlış Sinyal Analizi', icon: <ShieldAlert className="w-3.5 h-3.5" /> },
];

// ─── Tab: Outcomes ────────────────────────────────────────────────────────────

function OutcomesTab({ fixtureId }: { fixtureId: string }) {
  const [outcomes, setOutcomes] = useState<OutcomeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [evalLoading, setEvalLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const fid = parseInt(fixtureId);
    if (!fid) return;
    setLoading(true);
    try {
      const { data, error: err } = await supabase
        .schema('model_lab' as any)
        .from('live_micro_window_outcomes')
        .select('*')
        .eq('fixture_id', fid)
        .order('window_start_minute');
      if (err) throw err;
      setOutcomes((data as OutcomeRow[]) ?? []);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [fixtureId]);

  const evalOutcomes = async () => {
    const fid = parseInt(fixtureId);
    if (!fid) return;
    setEvalLoading(true); setError(null);
    try {
      const { data, error: err } = await supabase.rpc('admin_evaluate_micro_outcomes', { p_fixture_id: fid });
      if (err) throw err;
      setResult(data as Record<string, unknown>);
      await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setEvalLoading(false); }
  };

  const runBatch = async () => {
    setBatchLoading(true); setError(null);
    try {
      const { data, error: err } = await supabase.rpc('admin_run_micro_outcome_learning_batch', { p_limit: 10 });
      if (err) throw err;
      setResult(data as Record<string, unknown>);
      await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBatchLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={load} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-600 hover:bg-slate-500 text-slate-200 text-xs font-medium transition-colors disabled:opacity-50">
          <BarChart3 className="w-3.5 h-3.5" /> Yükle
        </button>
        <button onClick={evalOutcomes} disabled={evalLoading} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-700 hover:bg-blue-600 text-white text-xs font-medium transition-colors disabled:opacity-50">
          <Play className={`w-3.5 h-3.5 ${evalLoading ? 'animate-spin' : ''}`} />
          Outcome Değerlendir
        </button>
        <button onClick={runBatch} disabled={batchLoading} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-800 hover:bg-emerald-700 text-emerald-200 text-xs font-medium transition-colors disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${batchLoading ? 'animate-spin' : ''}`} />
          Outcome Öğrenimini Çalıştır
        </button>
      </div>

      {error && <div className="p-3 rounded bg-red-900/30 border border-red-700/40 text-red-300 text-xs">{error}</div>}

      {result && (
        <div className="rounded bg-slate-800/50 border border-slate-700 p-3 grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(result).map(([k, v]) => (
            <Stat key={k} label={k} value={String(v)} color="text-emerald-400" />
          ))}
        </div>
      )}

      {outcomes.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-800/80 border-b border-slate-700">
                {['Dakika','Durum','Gol 10dk','Geç Gol','Geri Dönüş','Beraberlik','Yanlış Baskı','Yanlış Kaos','Yanlış Geç Gol','Sonuç'].map(h => (
                  <th key={h} className="px-3 py-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {outcomes.map(o => (
                <tr key={o.id} className="border-b border-slate-700/40 hover:bg-slate-700/10">
                  <td className="px-3 py-2 font-mono text-slate-300">{o.window_start_minute}'</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATE_COLORS[o.micro_state] ?? 'bg-slate-700 text-slate-300'}`}>
                      {STATE_LABELS[o.micro_state] ?? o.micro_state}
                    </span>
                  </td>
                  {[o.next_goal_within_10, o.late_goal_after_window, o.comeback_occurred, o.draw_preserved].map((v, i) => (
                    <td key={i} className={`px-3 py-2 text-center ${v === true ? 'text-emerald-400' : v === false ? 'text-slate-500' : 'text-slate-600'}`}>
                      {bool(v ?? null)}
                    </td>
                  ))}
                  {[o.was_false_pressure_signal, o.was_false_chaos_signal, o.was_false_late_goal_signal].map((v, i) => (
                    <td key={i} className={`px-3 py-2 text-center ${v === true ? 'text-red-400' : 'text-slate-500'}`}>
                      {bool(v ?? null)}
                    </td>
                  ))}
                  <td className={`px-3 py-2 text-center text-[11px] font-medium ${
                    o.final_result === 'home_win' ? 'text-blue-400' :
                    o.final_result === 'away_win' ? 'text-orange-400' :
                    o.final_result === 'draw' ? 'text-teal-400' : 'text-slate-500'
                  }`}>{o.final_result ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && outcomes.length === 0 && (
        <div className="text-center py-8 text-slate-500 text-sm">Henüz outcome verisi yok — "Outcome Değerlendir" veya "Outcome Öğrenimini Çalıştır" butonuna basın.</div>
      )}
    </div>
  );
}

// ─── Tab: Pattern Memory ──────────────────────────────────────────────────────

function PatternMemoryTab() {
  const [patterns, setPatterns] = useState<PatternRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [refreshResult, setRefreshResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterState, setFilterState] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      let q = supabase.schema('model_lab' as any).from('live_micro_pattern_memory').select('*').order('sample_size', { ascending: false });
      const { data, error: err } = await q;
      if (err) throw err;
      setPatterns((data as PatternRow[]) ?? []);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);

  const refresh = async () => {
    setRefreshLoading(true); setError(null);
    try {
      const { data, error: err } = await supabase.rpc('admin_refresh_micro_pattern_memory');
      if (err) throw err;
      setRefreshResult(data as Record<string, unknown>);
      await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setRefreshLoading(false); }
  };

  const filtered = filterState ? patterns.filter(p => p.micro_state === filterState) : patterns;
  const states = [...new Set(patterns.map(p => p.micro_state))].sort();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={load} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-600 hover:bg-slate-500 text-slate-200 text-xs font-medium disabled:opacity-50">
          <BarChart3 className="w-3.5 h-3.5" /> Yükle
        </button>
        <button onClick={refresh} disabled={refreshLoading} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-teal-800 hover:bg-teal-700 text-teal-200 text-xs font-medium disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${refreshLoading ? 'animate-spin' : ''}`} />
          Pattern Memory Yenile
        </button>
        {states.length > 0 && (
          <select value={filterState} onChange={e => setFilterState(e.target.value)}
            className="px-2 py-1.5 rounded bg-slate-700 border border-slate-600 text-slate-200 text-xs focus:outline-none">
            <option value="">Tüm Durumlar</option>
            {states.map(s => <option key={s} value={s}>{STATE_LABELS[s] ?? s}</option>)}
          </select>
        )}
      </div>

      {error && <div className="p-3 rounded bg-red-900/30 border border-red-700/40 text-red-300 text-xs">{error}</div>}
      {refreshResult && (
        <div className="p-3 rounded bg-teal-900/30 border border-teal-700/40 text-teal-300 text-xs">
          {Object.entries(refreshResult).map(([k, v]) => `${k}: ${v}`).join(' · ')}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-800/80 border-b border-slate-700">
                {['Durum','Dakika Dilimi','Skor','Baskı','Örnek','Güvenilirlik','Gelecek Gol','Geç Gol','Geri Dönüş','Ber.Koruma','Güven Ayarı','Düşük Örnek'].map(h => (
                  <th key={h} className="px-2 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="border-b border-slate-700/40 hover:bg-slate-700/10">
                  <td className="px-2 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATE_COLORS[p.micro_state] ?? 'bg-slate-700 text-slate-300'}`}>
                      {STATE_LABELS[p.micro_state] ?? p.micro_state}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-slate-300 font-mono">{p.minute_bucket}</td>
                  <td className="px-2 py-2 text-slate-400">{p.score_state}</td>
                  <td className="px-2 py-2 text-slate-400">{p.pressure_bucket}</td>
                  <td className={`px-2 py-2 text-center font-mono ${p.low_sample_warning ? 'text-amber-400' : 'text-slate-300'}`}>{p.sample_size}</td>
                  <td className={`px-2 py-2 text-center font-mono ${(p.reliability_score ?? 0) > 0.7 ? 'text-emerald-400' : (p.reliability_score ?? 0) > 0.4 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {pct(p.reliability_score)}
                  </td>
                  <td className="px-2 py-2 text-center font-mono text-sky-300">{pct(p.goal_within_10_rate)}</td>
                  <td className="px-2 py-2 text-center font-mono text-orange-300">{pct(p.late_goal_rate)}</td>
                  <td className="px-2 py-2 text-center font-mono text-blue-300">{pct(p.comeback_rate)}</td>
                  <td className="px-2 py-2 text-center font-mono text-teal-300">{pct(p.draw_preservation_rate)}</td>
                  <td className={`px-2 py-2 text-center font-mono ${(p.confidence_adjustment ?? 0) > 0 ? 'text-emerald-400' : (p.confidence_adjustment ?? 0) < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                    {p.confidence_adjustment !== null ? (p.confidence_adjustment >= 0 ? '+' : '') + fmt(p.confidence_adjustment, 3) : '—'}
                  </td>
                  <td className={`px-2 py-2 text-center ${p.low_sample_warning ? 'text-amber-400' : 'text-slate-500'}`}>
                    {p.low_sample_warning ? 'Evet' : 'Hayır'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-8 text-slate-500 text-sm">
          Pattern memory boş — önce outcome değerlendirip "Pattern Memory Yenile"ye basın.
        </div>
      )}
    </div>
  );
}

// ─── Tab: False Signals ───────────────────────────────────────────────────────

function FalseSignalsTab() {
  const [patterns, setPatterns] = useState<PatternRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error: err } = await supabase
        .schema('model_lab' as any)
        .from('live_micro_pattern_memory')
        .select('*')
        .gte('sample_size', 1)
        .order('false_pressure_rate', { ascending: false });
      if (err) throw err;
      setPatterns((data as PatternRow[]) ?? []);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);

  const sorted = [...patterns].sort((a, b) =>
    Math.max(b.false_pressure_rate ?? 0, b.false_chaos_rate ?? 0, b.false_late_goal_rate ?? 0) -
    Math.max(a.false_pressure_rate ?? 0, a.false_chaos_rate ?? 0, a.false_late_goal_rate ?? 0)
  );

  return (
    <div className="space-y-4">
      <button onClick={load} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-600 hover:bg-slate-500 text-slate-200 text-xs font-medium disabled:opacity-50">
        <BarChart3 className="w-3.5 h-3.5" /> Yükle
      </button>

      {error && <div className="p-3 rounded bg-red-900/30 border border-red-700/40 text-red-300 text-xs">{error}</div>}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-400">
        <span><span className="text-red-400 font-medium">Yanlış Baskı Sinyali</span> — baskı yönünün tersine gol geldi</span>
        <span><span className="text-orange-400 font-medium">Yanlış Kaos Sinyali</span> — yüksek kaos ama sonuç yok</span>
        <span><span className="text-yellow-400 font-medium">Yanlış Geç Gol Sinyali</span> — yüksek risk ama 75+ gol yok</span>
      </div>

      {sorted.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-800/80 border-b border-slate-700">
                {['Durum','Dakika','Skor','Örnek','Yanlış Baskı Sinyali','Yanlış Kaos Sinyali','Yanlış Geç Gol Sinyali','Güvenilirlik','Güven Ayarı'].map(h => (
                  <th key={h} className="px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(p => {
                const maxFalse = Math.max(p.false_pressure_rate ?? 0, p.false_chaos_rate ?? 0, p.false_late_goal_rate ?? 0);
                if (maxFalse === 0) return null;
                return (
                  <tr key={p.id} className="border-b border-slate-700/40 hover:bg-slate-700/10">
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${STATE_COLORS[p.micro_state] ?? 'bg-slate-700 text-slate-300'}`}>
                        {STATE_LABELS[p.micro_state] ?? p.micro_state}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-300">{p.minute_bucket}</td>
                    <td className="px-3 py-2 text-slate-400">{p.score_state}</td>
                    <td className={`px-3 py-2 text-center font-mono ${p.low_sample_warning ? 'text-amber-400' : 'text-slate-300'}`}>{p.sample_size}</td>
                    <td className={`px-3 py-2 text-center font-mono ${(p.false_pressure_rate ?? 0) > 0.5 ? 'text-red-400 font-bold' : 'text-slate-400'}`}>{pct(p.false_pressure_rate)}</td>
                    <td className={`px-3 py-2 text-center font-mono ${(p.false_chaos_rate ?? 0) > 0.5 ? 'text-orange-400 font-bold' : 'text-slate-400'}`}>{pct(p.false_chaos_rate)}</td>
                    <td className={`px-3 py-2 text-center font-mono ${(p.false_late_goal_rate ?? 0) > 0.5 ? 'text-yellow-400 font-bold' : 'text-slate-400'}`}>{pct(p.false_late_goal_rate)}</td>
                    <td className={`px-3 py-2 text-center font-mono ${(p.reliability_score ?? 0) < 0.5 ? 'text-red-400' : 'text-slate-300'}`}>{pct(p.reliability_score)}</td>
                    <td className={`px-3 py-2 text-center font-mono ${(p.confidence_adjustment ?? 0) < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                      {p.confidence_adjustment !== null ? (p.confidence_adjustment >= 0 ? '+' : '') + fmt(p.confidence_adjustment, 3) : '—'}
                    </td>
                  </tr>
                );
              }).filter(Boolean)}
            </tbody>
          </table>
        </div>
      )}

      {!loading && sorted.filter(p => Math.max(p.false_pressure_rate ?? 0, p.false_chaos_rate ?? 0, p.false_late_goal_rate ?? 0) > 0).length === 0 && (
        <div className="text-center py-8 text-slate-500 text-sm">Henüz yanlış sinyal verisi yok.</div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LiveMicroSimPage() {
  const [tab, setTab] = useState<Tab>('windows');
  const [fixtureInput, setFixtureInput] = useState('1238032');
  const [windows, setWindows] = useState<MicroWindow[]>([]);
  const [loading, setLoading] = useState(false);
  const [buildLoading, setBuildLoading] = useState(false);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayResult, setReplayResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [annotateLoading, setAnnotateLoading] = useState(false);

  const loadWindows = useCallback(async (fid: number) => {
    setLoading(true); setError(null);
    try {
      const { data, error: err } = await supabase
        .schema('model_lab' as any)
        .from('live_micro_windows')
        .select('*')
        .eq('fixture_id', fid)
        .eq('engine_version', 'micro_v1')
        .order('window_start_minute');
      if (err) throw err;
      setWindows((data as MicroWindow[]) ?? []);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);

  const handleBuild = async () => {
    const fid = parseInt(fixtureInput);
    if (!fid) return;
    setBuildLoading(true); setError(null);
    try {
      const { error: err } = await supabase.rpc('admin_build_micro_windows', { p_fixture_id: fid });
      if (err) throw err;
      await loadWindows(fid);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBuildLoading(false); }
  };

  const handleAnnotate = async () => {
    const fid = parseInt(fixtureInput);
    if (!fid) return;
    setAnnotateLoading(true);
    try {
      const { error: err } = await supabase.rpc('admin_annotate_micro_windows', { p_fixture_id: fid });
      if (err) throw err;
      await loadWindows(fid);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setAnnotateLoading(false); }
  };

  const handleReplay = async () => {
    setReplayLoading(true); setReplayResult(null);
    try {
      const { data, error: err } = await supabase.rpc('admin_run_micro_replay_batch', { p_limit: 50 });
      if (err) throw err;
      setReplayResult(data as Record<string, unknown>);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setReplayLoading(false); }
  };

  const sortedWindows = [...windows].sort((a, b) => a.window_start_minute - b.window_start_minute);

  return (
    <div className="p-6 space-y-5 min-h-screen" style={{ background: '#0f1621' }}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            Canlı Mikro Simülasyon
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">5 dakikalık pencere bazlı durum makinesi + sonuç öğrenimi</p>
        </div>
        <button onClick={handleReplay} disabled={replayLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${replayLoading ? 'animate-spin' : ''}`} />
          Toplu Replay (50)
        </button>
      </div>

      {replayResult && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 grid grid-cols-2 md:grid-cols-5 gap-4">
          <Stat label="İşlenen" value={String(replayResult.processed ?? 0)} color="text-emerald-400" />
          <Stat label="Oluşturulan" value={String(replayResult.windows_created ?? 0)} color="text-blue-400" />
          <Stat label="Güncellenen" value={String(replayResult.windows_updated ?? 0)} color="text-sky-400" />
          <Stat label="Hata" value={String((replayResult.errors as unknown[])?.length ?? 0)} color={(replayResult.errors as unknown[])?.length > 0 ? 'text-red-400' : 'text-slate-400'} />
          <Stat label="Kalan" value={String(replayResult.remaining_candidates ?? '—')} color="text-slate-400" />
        </div>
      )}

      {/* Fixture controls */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 space-y-3">
        <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Fikstür Analizi</p>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="number" value={fixtureInput} onChange={e => setFixtureInput(e.target.value)}
            placeholder="Fikstür ID"
            className="w-40 px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500" />
          <button onClick={() => loadWindows(parseInt(fixtureInput))} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 text-slate-200 text-sm font-medium disabled:opacity-50">
            <BarChart3 className="w-4 h-4" /> Yükle
          </button>
          <button onClick={handleBuild} disabled={buildLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-white text-sm font-medium disabled:opacity-50">
            <Play className={`w-4 h-4 ${buildLoading ? 'animate-spin' : ''}`} /> İnşa Et
          </button>
          <button onClick={handleAnnotate} disabled={annotateLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-800 hover:bg-teal-700 text-teal-200 text-sm font-medium disabled:opacity-50">
            <Zap className={`w-4 h-4 ${annotateLoading ? 'animate-pulse' : ''}`} /> Hafıza Notla
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-900/30 border border-red-700/40">
          <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <span className="text-sm text-red-300">{error}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-700">
        <div className="flex gap-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === t.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {tab === 'windows' && (
        <div className="space-y-4">
          {sortedWindows.length > 0 && (
            <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Baskı Zaman Çizelgesi — Fikstür {fixtureInput}
                </p>
                <div className="flex gap-3 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500 inline-block" /> Ev</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-orange-500 inline-block" /> Dep</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-slate-500 inline-block" /> Dengeli</span>
                </div>
              </div>
              <PressureTimeline windows={sortedWindows} />
              <div className="flex gap-4 text-xs text-slate-500">
                <span>{sortedWindows.length} pencere</span>
                <span>Motor: {sortedWindows[0]?.engine_version}</span>
              </div>
            </div>
          )}

          {sortedWindows.length > 0 && (
            <div className="rounded-xl border border-slate-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-800/80 border-b border-slate-700">
                      {['Dakika','Skor','Durum','Momentum','Baskı Δ','Kaos','Son Dk Risk','Güven','Kalite',''].map(h => (
                        <th key={h} className="px-3 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedWindows.map(w => (
                      <WindowRow key={w.id} w={w} expanded={expandedId === w.id}
                        onToggle={() => setExpandedId(expandedId === w.id ? null : w.id)} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!loading && sortedWindows.length === 0 && (
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
      )}

      {tab === 'outcomes' && <OutcomesTab fixtureId={fixtureInput} />}
      {tab === 'patterns' && <PatternMemoryTab />}
      {tab === 'false_signals' && <FalseSignalsTab />}
    </div>
  );
}
