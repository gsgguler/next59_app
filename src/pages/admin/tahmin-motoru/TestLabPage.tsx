import { useState, useCallback } from 'react';
import { FlaskConical, Play, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import LatencyMonitor from '../../../components/tahmin-motoru/LatencyMonitor';

const BRAIN_META: Array<{ key: string; label: string; color: string }> = [
  { key: 'tactical',      label: 'Taktik Analist',    color: '#FF6B6B' },
  { key: 'statistical',   label: 'İstatistik Uzmanı', color: '#4ECDC4' },
  { key: 'psychological', label: 'Psikoloji Uzmanı',  color: '#9B59B6' },
  { key: 'live',          label: 'Canlı Gözlemci',    color: '#F39C12' },
  { key: 'conditions',    label: 'Koşullar Analisti', color: '#3498DB' },
  { key: 'news',          label: 'Haber Analisti',    color: '#2ECC71' },
];

interface RecentMatch {
  id: string;
  label: string;
}

interface RunResult {
  status: 'success' | 'error';
  snapshot_id?: string;
  run_id?: string;
  raw?: unknown;
  error?: string;
}

interface BrainResultItem {
  brain_key: string;
  status: string;
  latency_ms: number | null;
  output: { winner_prob: { home: number; draw: number; away: number }; confidence: number } | null;
  error: string | null;
}

export default function TestLabPage() {
  const [matches, setMatches] = useState<RecentMatch[]>([]);
  const [matchId, setMatchId] = useState('');
  const [customMatchId, setCustomMatchId] = useState('');
  const [selectedBrains, setSelectedBrains] = useState<Set<string>>(new Set(BRAIN_META.map(b => b.key)));
  const [runType, setRunType] = useState<'prematch' | 'live_revision'>('prematch');
  const [force, setForce] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [matchesLoaded, setMatchesLoaded] = useState(false);

  const loadMatches = useCallback(async () => {
    if (matchesLoaded) return;
    const { data } = await supabase
      .from('matches')
      .select(`
        id,
        timestamp,
        status_short,
        home_team:teams!matches_home_team_id_fkey(name),
        away_team:teams!matches_away_team_id_fkey(name)
      `)
      .order('timestamp', { ascending: false })
      .limit(50);
    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped = (data as any[]).map(m => {
        const home = m.home_team?.name ?? m.id.slice(0, 8);
        const away = m.away_team?.name ?? '?';
        const date = m.timestamp ? new Date(m.timestamp * 1000).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) : '';
        return { id: m.id, label: `${home} vs ${away}${date ? ` (${date})` : ''}` };
      });
      setMatches(mapped);
      if (mapped.length > 0) setMatchId(mapped[0].id);
    }
    setMatchesLoaded(true);
  }, [matchesLoaded]);

  const effectiveMatchId = customMatchId.trim() || matchId;

  function toggleBrain(key: string) {
    setSelectedBrains(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function handleRun() {
    if (!effectiveMatchId) return;
    setRunning(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('brain-orchestrator', {
        body: {
          match_id: effectiveMatchId,
          run_type: runType,
          force,
          brain_filter: selectedBrains.size < 6 ? Array.from(selectedBrains) : undefined,
        },
      });
      if (error) {
        setResult({ status: 'error', error: error.message, raw: data });
      } else {
        setResult({ status: 'success', snapshot_id: data?.snapshot_id, run_id: data?.run_id, raw: data });
      }
    } catch (e) {
      setResult({ status: 'error', error: String(e) });
    } finally {
      setRunning(false);
    }
  }

  const latencyRows = BRAIN_META.map(b => {
    const raw = result?.raw as Record<string, unknown> | undefined;
    const brainResults = raw?.brain_results as Record<string, BrainResultItem> | undefined;
    const br = brainResults?.[b.key];
    return {
      brain_key: b.key,
      label: b.label,
      color: b.color,
      latency_ms: br?.latency_ms ?? null,
      status: (br?.status ?? (running ? 'pending' : 'pending')) as 'success' | 'failed' | 'skipped' | 'pending',
    };
  }).filter(r => selectedBrains.has(r.brain_key));

  return (
    <div className="min-h-screen bg-navy-900 p-6">
      <div className="max-w-4xl mx-auto space-y-6">

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-champagne/10 border border-champagne/30 flex items-center justify-center">
            <FlaskConical className="w-5 h-5 text-champagne" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Test Lab</h1>
            <p className="text-sm text-navy-400">Brain-orchestrator manuel test arayüzü</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Config Panel */}
          <div className="rounded-xl border border-navy-600 bg-navy-800/50 p-5 space-y-5">
            <h2 className="text-sm font-semibold text-white">Yapılandırma</h2>

            {/* Match selector */}
            <div>
              <label className="text-xs text-navy-400 block mb-1.5">Maç Seç (veya ID gir)</label>
              <select
                className="w-full bg-navy-700 border border-navy-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-champagne/50 mb-2"
                value={matchId}
                onChange={e => setMatchId(e.target.value)}
                onFocus={loadMatches}
              >
                <option value="">— Listeden seç —</option>
                {matches.map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="veya UUID gir..."
                value={customMatchId}
                onChange={e => setCustomMatchId(e.target.value)}
                className="w-full bg-navy-700 border border-navy-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-champagne/50 font-mono"
              />
              {effectiveMatchId && (
                <p className="text-[10px] text-navy-500 mt-1 font-mono truncate">ID: {effectiveMatchId}</p>
              )}
            </div>

            {/* Run type */}
            <div>
              <label className="text-xs text-navy-400 block mb-1.5">Çalıştırma Türü</label>
              <div className="flex gap-2">
                {(['prematch', 'live_revision'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setRunType(t)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${runType === t ? 'bg-champagne/20 text-champagne border-champagne/40' : 'bg-navy-700 text-navy-400 border-navy-600 hover:text-white'}`}
                  >
                    {t === 'prematch' ? 'Pre-Match' : 'Live Revision'}
                  </button>
                ))}
              </div>
            </div>

            {/* Force toggle */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-navy-300">Force (mevcut varsa yeniden çalıştır)</span>
              <button
                onClick={() => setForce(f => !f)}
                className={`w-10 h-5 rounded-full transition-colors relative ${force ? 'bg-emerald-500' : 'bg-navy-600'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${force ? 'left-5' : 'left-0.5'}`} />
              </button>
            </div>

            {/* Brain selector */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-navy-400">Beyin Seçimi</label>
                <button
                  onClick={() => setSelectedBrains(new Set(BRAIN_META.map(b => b.key)))}
                  className="text-[10px] text-champagne hover:underline"
                >
                  Tümünü seç
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {BRAIN_META.map(b => {
                  const checked = selectedBrains.has(b.key);
                  return (
                    <button
                      key={b.key}
                      onClick={() => toggleBrain(b.key)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border transition-all ${checked ? 'bg-navy-700 border-navy-500' : 'bg-navy-800 border-navy-600 opacity-50'}`}
                    >
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                      <span className="text-navy-200 truncate">{b.label}</span>
                      {checked && <span className="ml-auto text-emerald-400 text-[10px]">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={handleRun}
              disabled={running || !effectiveMatchId}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold border border-champagne/40 bg-champagne/10 hover:bg-champagne/20 text-champagne transition-colors disabled:opacity-40"
            >
              {running ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {running ? 'Çalışıyor…' : 'FORCE RUN'}
            </button>
          </div>

          {/* Results Panel */}
          <div className="rounded-xl border border-navy-600 bg-navy-800/50 p-5 space-y-5">
            <h2 className="text-sm font-semibold text-white">Sonuçlar</h2>

            {/* Status */}
            {result && (
              <div className={`flex items-center gap-2 text-xs px-3 py-2.5 rounded-lg border ${result.status === 'success' ? 'text-emerald-400 bg-emerald-900/20 border-emerald-700/40' : 'text-red-400 bg-red-900/20 border-red-700/40'}`}>
                {result.status === 'success'
                  ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                  : <XCircle className="w-4 h-4 shrink-0" />
                }
                {result.status === 'success'
                  ? `Başarılı — Snapshot: ${result.snapshot_id?.slice(0, 8) ?? '?'}…`
                  : result.error
                }
              </div>
            )}

            {/* Latency Monitor */}
            <div>
              <p className="text-xs text-navy-400 mb-3">Gecikme Monitörü</p>
              <LatencyMonitor results={latencyRows} />
            </div>

            {/* Raw JSON preview */}
            {result?.raw && (
              <div>
                <p className="text-xs text-navy-400 mb-2">Ham Çıktı (JSON)</p>
                <pre className="text-[10px] text-navy-300 bg-navy-900/60 rounded-lg p-3 overflow-auto max-h-64 border border-navy-700 font-mono leading-relaxed">
                  {JSON.stringify(result.raw, null, 2)}
                </pre>
              </div>
            )}

            {!result && !running && (
              <div className="flex flex-col items-center justify-center py-8 text-navy-600 gap-2">
                <FlaskConical className="w-8 h-8" />
                <p className="text-sm">Çalıştırma bekleniyor</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
