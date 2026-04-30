import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, ChevronRight, Shield, Play, RefreshCw, CheckCircle,
  AlertCircle, Clock, Layers, ChevronDown, ChevronUp, Zap,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const FN_BASE = `${SUPABASE_URL}/functions/v1/model-lab-run-backtest`;

interface BacktestRun {
  id: string;
  run_key: string;
  run_status: string;
  run_scope: string;
  total_matches: number;
  processed_matches: number;
  failed_matches: number;
  average_brier_1x2: number | null;
  average_log_loss_1x2: number | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
}

interface Chunk {
  id: string;
  chunk_index: number;
  offset_start: number;
  offset_end: number;
  limit_size: number;
  status: string;
  processed_matches: number;
  failed_matches: number;
  average_brier_1x2: number | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
}

async function callFn(params: Record<string, string | number>): Promise<unknown> {
  const url = new URL(FN_BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
  });
  return res.json();
}

function statusColor(s: string) {
  if (s === 'completed') return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25';
  if (s === 'running')   return 'bg-amber-500/15 text-amber-400 border-amber-500/25';
  if (s === 'failed')    return 'bg-red-500/15 text-red-400 border-red-500/25';
  return 'bg-navy-800 text-navy-400 border-navy-700';
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColor(status)}`}>
      {status}
    </span>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-navy-800/50 rounded-lg px-3 py-2">
      <div className="text-[10px] text-navy-500 mb-0.5">{label}</div>
      <div className="text-sm font-semibold text-white tabular-nums">{value}</div>
    </div>
  );
}

function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div className="w-full h-1.5 bg-navy-800 rounded-full overflow-hidden">
      <div
        className="h-full bg-champagne rounded-full transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ChunkGrid({ chunks }: { chunks: Chunk[] }) {
  return (
    <div className="flex flex-wrap gap-1 mt-3">
      {chunks.map((c) => (
        <div
          key={c.chunk_index}
          title={`Chunk ${c.chunk_index}: ${c.status} | ${c.processed_matches}/${c.limit_size} | offset ${c.offset_start}–${c.offset_end}`}
          className={`w-5 h-5 rounded text-[9px] flex items-center justify-center font-mono cursor-default transition-colors ${
            c.status === 'completed' ? 'bg-emerald-500/30 text-emerald-400' :
            c.status === 'running'   ? 'bg-amber-500/30 text-amber-400 animate-pulse' :
            c.status === 'failed'    ? 'bg-red-500/30 text-red-400' :
            'bg-navy-800 text-navy-600'
          }`}
        >
          {c.chunk_index}
        </div>
      ))}
    </div>
  );
}

function RunCard({
  run, onAction, actionLoading,
}: {
  run: BacktestRun;
  onAction: (action: string, runId: string) => void;
  actionLoading: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);

  const loadChunks = useCallback(async () => {
    setChunksLoading(true);
    const { data } = await supabase
      .schema('model_lab' as never)
      .from('backtest_run_chunks')
      .select('*')
      .eq('backtest_run_id', run.id)
      .order('chunk_index');
    setChunks((data as Chunk[]) ?? []);
    setChunksLoading(false);
  }, [run.id]);

  useEffect(() => {
    if (expanded) loadChunks();
  }, [expanded, loadChunks]);

  const totalChunks = chunks.length;
  const completedChunks = chunks.filter((c) => c.status === 'completed').length;
  const failedChunks    = chunks.filter((c) => c.status === 'failed').length;
  const runningChunks   = chunks.filter((c) => c.status === 'running').length;
  const pendingChunks   = chunks.filter((c) => c.status === 'pending').length;
  const isChunked = totalChunks > 0;
  const allDone = isChunked && completedChunks === totalChunks;
  const hasFailed = failedChunks > 0;
  const nextPending = chunks.find((c) => c.status === 'pending');
  const busy = actionLoading === run.id;

  const pct = run.total_matches > 0
    ? Math.round((run.processed_matches / run.total_matches) * 100)
    : 0;

  return (
    <div className="bg-navy-900/50 border border-navy-800 rounded-xl overflow-hidden">
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <StatusBadge status={run.run_status} />
          <span className="text-sm font-medium text-white">{run.run_scope}</span>
          <span className="text-xs text-navy-600 font-mono">{run.run_key.slice(-16)}</span>
          {isChunked && (
            <span className="text-xs text-navy-500 flex items-center gap-1">
              <Layers className="w-3 h-3" />
              {completedChunks}/{totalChunks} chunks
              {failedChunks > 0 && <span className="text-red-400 ml-1">· {failedChunks} failed</span>}
            </span>
          )}
          <span className="ml-auto text-xs text-navy-500 tabular-nums">{pct}%</span>
        </div>

        {run.total_matches > 0 && (
          <ProgressBar value={run.processed_matches} total={run.total_matches} />
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs">
          <MetricCell label="Toplam Maç" value={String(run.total_matches)} />
          <MetricCell label="İşlendi" value={String(run.processed_matches)} />
          <MetricCell label="Başarısız" value={String(run.failed_matches)} />
          <MetricCell
            label="Brier"
            value={run.average_brier_1x2 !== null ? Number(run.average_brier_1x2).toFixed(4) : '–'}
          />
          <MetricCell
            label="Log Loss"
            value={run.average_log_loss_1x2 !== null ? Number(run.average_log_loss_1x2).toFixed(4) : '–'}
          />
          <MetricCell
            label="Tamamlandı"
            value={run.completed_at ? new Date(run.completed_at).toLocaleTimeString('tr-TR') : '–'}
          />
        </div>

        {run.error_message && (
          <div className="mt-3 text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2 font-mono break-all">
            {run.error_message}
          </div>
        )}

        {/* Action buttons for chunked runs */}
        {isChunked && (
          <div className="flex flex-wrap gap-2 mt-3">
            {nextPending && (
              <button
                onClick={() => onAction('run_chunk', run.id)}
                disabled={busy}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-champagne/10 border border-champagne/25 text-champagne hover:bg-champagne/15 transition-all disabled:opacity-40"
              >
                {busy ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                Chunk {nextPending.chunk_index} Çalıştır
              </button>
            )}
            {hasFailed && (
              <button
                onClick={() => onAction('retry_failed', run.id)}
                disabled={busy}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/25 text-red-400 hover:bg-red-500/15 transition-all disabled:opacity-40"
              >
                <RefreshCw className="w-3 h-3" />
                Başarısızları Yeniden Dene ({failedChunks})
              </button>
            )}
            {allDone && run.run_status !== 'completed' && (
              <button
                onClick={() => onAction('finalize', run.id)}
                disabled={busy}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/15 transition-all disabled:opacity-40"
              >
                {busy ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                Çalışmayı Tamamla
              </button>
            )}
            <button
              onClick={() => { setExpanded((v) => !v); }}
              className="flex items-center gap-1 text-xs text-navy-500 hover:text-navy-300 transition-colors ml-auto"
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              Chunk Detayı
            </button>
          </div>
        )}
      </div>

      {/* Chunk detail panel */}
      {expanded && isChunked && (
        <div className="border-t border-navy-800 px-4 pb-4 pt-3">
          <div className="flex flex-wrap gap-3 text-xs text-navy-400 mb-3">
            <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-400" />{completedChunks} tamamlandı</span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-navy-500" />{pendingChunks} bekliyor</span>
            {runningChunks > 0 && <span className="flex items-center gap-1"><RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />{runningChunks} çalışıyor</span>}
            {failedChunks > 0 && <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3 text-red-400" />{failedChunks} başarısız</span>}
          </div>
          {chunksLoading ? (
            <div className="h-8 bg-navy-800/40 rounded animate-pulse" />
          ) : (
            <ChunkGrid chunks={chunks} />
          )}
          {/* Failed chunk errors */}
          {chunks.filter((c) => c.status === 'failed' && c.error_message).map((c) => (
            <div key={c.chunk_index} className="mt-2 text-xs text-red-400 bg-red-500/10 rounded px-3 py-1.5 font-mono">
              Chunk {c.chunk_index}: {c.error_message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ModelLabBacktestPage() {
  const [runs, setRuns] = useState<BacktestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [log, setLog] = useState('');

  useEffect(() => {
    document.title = 'Backtest | Model Lab | Admin | Next59';
  }, []);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .schema('model_lab' as never)
      .from('backtest_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    setRuns((data as BacktestRun[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  async function createChunkedRun() {
    if (busy) return;
    setBusy(true);
    setLog('Chunked run oluşturuluyor (chunk_size=100, limit=300)...');
    const result = await callFn({ mode: 'create_run', chunk_size: 100, limit: 300 }) as Record<string, unknown>;
    setBusy(false);
    if (result.success) {
      setLog(`Run oluşturuldu: ${result.run_id} | ${result.chunk_count} chunk | ${result.total_matches} maç`);
    } else {
      setLog(`Hata: ${result.error}`);
    }
    await loadRuns();
  }

  async function handleAction(action: string, runId: string) {
    setActionLoading(runId);
    let result: Record<string, unknown>;
    try {
      if (action === 'run_chunk') {
        // Find next pending chunk index
        const { data: pending } = await supabase
          .schema('model_lab' as never)
          .from('backtest_run_chunks')
          .select('chunk_index')
          .eq('backtest_run_id', runId)
          .eq('status', 'pending')
          .order('chunk_index')
          .limit(1)
          .maybeSingle();
        if (!pending) { setLog('Bekleyen chunk bulunamadı.'); setActionLoading(null); return; }
        const idx = (pending as Record<string, number>).chunk_index;
        setLog(`Chunk ${idx} çalıştırılıyor...`);
        result = await callFn({ mode: 'run_chunk', run_id: runId, chunk_index: idx }) as Record<string, unknown>;
        setLog(`Chunk ${idx} tamamlandı: ${result.processed_matches} işlendi, ${result.failed_matches} başarısız, Brier: ${Number(result.average_brier_1x2).toFixed(4)}`);
      } else if (action === 'retry_failed') {
        setLog('Başarısız chunklar sıfırlanıyor...');
        result = await callFn({ mode: 'retry_failed_chunks', run_id: runId }) as Record<string, unknown>;
        setLog(`${result.retried} chunk tekrar pending'e alındı.`);
      } else if (action === 'finalize') {
        setLog('Çalışma sonuçlandırılıyor (kalibrasyon + düzeltme adayları)...');
        result = await callFn({ mode: 'finalize_run', run_id: runId }) as Record<string, unknown>;
        if (result.error) {
          setLog(`Hata: ${result.error}`);
        } else {
          setLog(`Tamamlandı: ${result.processed_matches} maç | Brier: ${Number(result.average_brier_1x2).toFixed(4)} | Kalibrasyon: ${result.calibration_summary_rows} satır | Düzeltme: ${result.candidate_adjustments}`);
        }
      }
    } catch (e) {
      setLog(`İşlem hatası: ${e}`);
    }
    setActionLoading(null);
    await loadRuns();
  }

  return (
    <div className="min-h-screen bg-navy-950 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-2 text-xs text-navy-500 mb-6">
          <Link to="/admin/model-lab" className="hover:text-champagne transition-colors">Model Lab</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-navy-400">Backtest</span>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-5 py-3 mb-8 flex items-start gap-3">
          <Shield className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-300">
            Bu alan yalnızca model araştırma ve kalibrasyon içindir. Public kullanıcıya gösterilmez.
          </p>
        </div>

        <div className="flex items-start justify-between gap-4 mb-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
              <Activity className="w-6 h-6 text-champagne" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white font-display">Backtest</h1>
              <p className="text-sm text-navy-400 mt-1">
                Validasyon: 2018-2019 | Eğitim: 2000–2018 | Chunk destekli, devam ettirilebilir
              </p>
            </div>
          </div>

          <div className="flex gap-2 shrink-0">
            <button
              onClick={loadRuns}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-navy-800 border border-navy-700 text-navy-400 hover:text-white transition-all disabled:opacity-40"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </button>
            <button
              onClick={createChunkedRun}
              disabled={busy}
              className="flex items-center gap-2 bg-champagne hover:bg-champagne-light text-navy-950 text-sm font-semibold px-4 py-2 rounded-lg transition-all disabled:opacity-50"
            >
              {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Chunked Run Oluştur
            </button>
          </div>
        </div>

        {log && (
          <div className="bg-navy-900/60 border border-navy-700 rounded-xl px-4 py-3 mb-6 text-xs text-navy-300 font-mono">
            {log}
          </div>
        )}

        {/* Info */}
        <div className="bg-navy-900/40 border border-navy-800/50 rounded-xl p-4 mb-6 text-xs text-navy-500 space-y-1">
          <p><strong className="text-navy-400">Chunk modu:</strong> create_run → run_chunk (tekrar tekrar) → finalize_run</p>
          <p><strong className="text-navy-400">Retry:</strong> Başarısız chunklar tekrar pending'e alınır, tamamlananlar korunur</p>
          <p><strong className="text-navy-400">Finalize:</strong> Tüm chunklar tamamlandığında kalibrasyon ve düzeltme adayları hesaplanır</p>
          <p><strong className="text-navy-400">Güvenlik:</strong> feature_cutoff_date = trained_until_date (asla match_date değil). Sızıntı koruması aktif.</p>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 bg-navy-900/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <AlertCircle className="w-8 h-8 text-navy-700" />
            <p className="text-sm text-navy-500">Henüz backtest çalışması yok.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {runs.map((run) => (
              <RunCard
                key={run.id}
                run={run}
                onAction={handleAction}
                actionLoading={actionLoading}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
