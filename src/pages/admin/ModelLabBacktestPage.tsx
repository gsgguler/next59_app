import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ChevronRight, Play, AlertCircle, Shield } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { runHistoricalBackboneBacktest, FOCUS_COMPETITIONS } from '../../lib/modelLab/backtestRunner';

interface BacktestRun {
  id: string;
  run_key: string;
  run_status: string;
  run_scope: string;
  train_start_date: string;
  train_end_date: string;
  validation_start_date: string | null;
  validation_end_date: string | null;
  competition_scope: string[];
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

export default function ModelLabBacktestPage() {
  const [runs, setRuns] = useState<BacktestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState('');

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

  async function startTestRun() {
    if (running) return;
    setRunning(true);
    setRunMessage('Test backtest başlatılıyor (50 maç limiti)...');
    const result = await runHistoricalBackboneBacktest({
      modelVersionKey: 'b3_historical_backbone_v0_1',
      competitionNames: FOCUS_COMPETITIONS,
      limit: 50,
      runScope: 'test_50',
    });
    setRunning(false);
    if (result.success) {
      setRunMessage(`Backtest tamamlandı. Run ID: ${result.runId}`);
    } else {
      setRunMessage(`Hata: ${result.error}`);
    }
    loadRuns();
  }

  return (
    <div className="min-h-screen bg-navy-950 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Breadcrumb */}
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
                Validasyon sezonu: 2018-2019 | Eğitim: 2000–2018 | Ligler: {FOCUS_COMPETITIONS.length}
              </p>
            </div>
          </div>

          <div className="flex gap-2 shrink-0">
            <button
              onClick={startTestRun}
              disabled={running}
              className="flex items-center gap-2 bg-champagne hover:bg-champagne-light text-navy-950 text-sm font-semibold px-4 py-2 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4" />
              Test (50 maç)
            </button>
          </div>
        </div>

        {/* Run message */}
        {runMessage && (
          <div className="bg-navy-900/60 border border-navy-700 rounded-xl px-4 py-3 mb-6 text-sm text-navy-300 font-mono">
            {runMessage}
          </div>
        )}

        {/* Info box */}
        <div className="bg-navy-900/40 border border-navy-800/50 rounded-xl p-4 mb-6 text-xs text-navy-500 space-y-1">
          <p><strong className="text-navy-400">Veri kaynağı:</strong> public.v_historical_match_archive</p>
          <p><strong className="text-navy-400">Eğitim:</strong> 2000-07-28 → 2018-06-30 (2017-2018 sezon sonu)</p>
          <p><strong className="text-navy-400">Validasyon:</strong> 2018-2019 sezonu</p>
          <p><strong className="text-navy-400">Ligler:</strong> {FOCUS_COMPETITIONS.join(', ')}</p>
          <p><strong className="text-navy-400">Not:</strong> Her tahmin yalnızca target maç tarihinden önceki veri kullanır. LLM çağrısı yok. Harici API çağrısı yok.</p>
        </div>

        {/* Run list */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 bg-navy-900/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <AlertCircle className="w-8 h-8 text-navy-700" />
            <p className="text-sm text-navy-500">Henüz backtest çalışması oluşturulmadı.</p>
            <p className="text-xs text-navy-600">"Test (50 maç)" butonuna tıklayarak ilk çalışmayı başlatın.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {runs.map((run) => (
              <RunCard key={run.id} run={run} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RunCard({ run }: { run: BacktestRun }) {
  const statusCls =
    run.run_status === 'completed'
      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
      : run.run_status === 'running'
        ? 'bg-amber-500/15 text-amber-400 border-amber-500/20'
        : run.run_status === 'failed'
          ? 'bg-red-500/15 text-red-400 border-red-500/20'
          : 'bg-navy-800 text-navy-400 border-navy-700';

  return (
    <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-4">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusCls}`}>
          {run.run_status}
        </span>
        <span className="text-sm font-medium text-white">{run.run_scope}</span>
        <span className="text-xs text-navy-600 font-mono">{run.run_key.slice(-12)}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <MetricCell label="Toplam Maç" value={String(run.total_matches)} />
        <MetricCell label="İşlendi" value={String(run.processed_matches)} />
        <MetricCell label="Başarısız" value={String(run.failed_matches)} />
        <MetricCell
          label="Brier Score"
          value={run.average_brier_1x2 !== null ? Number(run.average_brier_1x2).toFixed(4) : '–'}
        />
        <MetricCell
          label="Log Loss"
          value={run.average_log_loss_1x2 !== null ? Number(run.average_log_loss_1x2).toFixed(4) : '–'}
        />
        <MetricCell label="Eğitim Bitiş" value={run.train_end_date} />
        <MetricCell label="Validasyon" value={run.validation_start_date ? `${run.validation_start_date?.slice(0, 4)}–${run.validation_end_date?.slice(0, 4)}` : '–'} />
        <MetricCell label="Tamamlandı" value={run.completed_at ? new Date(run.completed_at).toLocaleString('tr-TR') : '–'} />
      </div>
      {run.error_message && (
        <div className="mt-3 text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2 font-mono">
          {run.error_message}
        </div>
      )}
    </div>
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
