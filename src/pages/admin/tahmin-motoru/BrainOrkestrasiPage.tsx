import { useState, useEffect, useCallback, useRef } from 'react';
import { Brain, Play, Zap, StopCircle, RefreshCw, CheckCircle2, XCircle, Clock, AlertTriangle, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import BrainStatusCard, { type BrainConfig, type BrainPerf } from '../../../components/tahmin-motoru/BrainStatusCard';
import MetaLearnerPanel from '../../../components/tahmin-motoru/MetaLearnerPanel';

interface OrchestraRun {
  id: string;
  match_id: string;
  run_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  brain_results: unknown[];
  effective_weights: Record<string, number>;
}

interface MetaLearnerModel {
  id: string;
  model_version: string;
  model_type: string;
  training_sample_count: number;
  validation_brier: number | null;
  is_active: boolean;
  created_at: string;
  notes: string | null;
  learned_weights: Record<string, number>;
}

const STATUS_STYLES: Record<string, string> = {
  completed: 'text-emerald-400 bg-emerald-900/30 border-emerald-700/40',
  running:   'text-yellow-400 bg-yellow-900/30 border-yellow-700/40',
  partial:   'text-orange-400 bg-orange-900/30 border-orange-700/40',
  failed:    'text-red-400 bg-red-900/30 border-red-700/40',
};

const STATUS_ICON: Record<string, typeof CheckCircle2> = {
  completed: CheckCircle2,
  running:   Clock,
  partial:   AlertTriangle,
  failed:    XCircle,
};

const CONFIRM_WORD = 'DURDUR';

export default function BrainOrkestrasiPage() {
  const [brainConfigs, setBrainConfigs] = useState<BrainConfig[]>([]);
  const [brainPerfs, setBrainPerfs] = useState<Record<string, BrainPerf>>({});
  const [metaModel, setMetaModel] = useState<MetaLearnerModel | null>(null);
  const [recentRuns, setRecentRuns] = useState<OrchestraRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Emergency stop modal state
  const [stopModalOpen, setStopModalOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const confirmInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    const [cfgRes, perfRes, modelRes, runsRes] = await Promise.all([
      supabase.from('brain_configs').select('*').order('default_weight', { ascending: false }),
      supabase.from('brain_performance_tracking').select('*').order('tracking_date', { ascending: false }),
      supabase.from('meta_learner_models').select('*').eq('is_active', true).maybeSingle(),
      supabase
        .from('brain_orchestra_runs')
        .select('id, match_id, run_type, status, started_at, completed_at, brain_results, effective_weights')
        .order('started_at', { ascending: false })
        .limit(20),
    ]);

    if (cfgRes.data) setBrainConfigs(cfgRes.data as BrainConfig[]);

    if (perfRes.data) {
      const map: Record<string, BrainPerf> = {};
      for (const row of perfRes.data as BrainPerf[]) {
        if (!map[row.brain_key]) map[row.brain_key] = row;
      }
      setBrainPerfs(map);
    }

    if (modelRes.data) setMetaModel(modelRes.data as MetaLearnerModel);
    if (runsRes.data) setRecentRuns(runsRes.data as OrchestraRun[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Focus confirm input when modal opens
  useEffect(() => {
    if (stopModalOpen) {
      setConfirmText('');
      setTimeout(() => confirmInputRef.current?.focus(), 50);
    }
  }, [stopModalOpen]);

  // Close modal on Escape
  useEffect(() => {
    if (!stopModalOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeStopModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stopModalOpen]);

  function openStopModal() {
    setStopModalOpen(true);
  }

  function closeStopModal() {
    if (actionLoading === 'stop') return; // prevent close while stopping
    setStopModalOpen(false);
    setConfirmText('');
  }

  async function executeEmergencyStop() {
    setActionLoading('stop');
    setActionResult(null);
    try {
      const { error } = await supabase
        .from('brain_configs')
        .update({ is_active: false })
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw error;
      setActionResult({ type: 'success', msg: 'Tüm brain\'ler durduruldu' });
      closeStopModal();
      await fetchData();
    } catch (e) {
      setActionResult({ type: 'error', msg: `Emergency stop hatası: ${String(e)}` });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleResume() {
    setActionLoading('resume');
    setActionResult(null);
    try {
      const { error } = await supabase
        .from('brain_configs')
        .update({ is_active: true })
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw error;
      setActionResult({ type: 'success', msg: 'Tüm brain\'ler aktif edildi' });
      await fetchData();
    } catch (e) {
      setActionResult({ type: 'error', msg: `Resume hatası: ${String(e)}` });
    } finally {
      setActionLoading(null);
    }
  }

  async function invokeAction(action: string, label: string) {
    setActionLoading(action);
    setActionResult(null);
    try {
      const fnName =
        action === 'prematch' ? 'prematch-scheduler' :
        action === 'live' ? 'live-5min-revision' :
        action === 'validate' ? 'match-result-validator' : '';

      if (!fnName) { setActionResult({ type: 'error', msg: 'Bilinmeyen aksiyon' }); return; }

      const { error } = await supabase.functions.invoke(fnName, { body: {} });
      if (error) {
        setActionResult({ type: 'error', msg: `${label} hatası: ${error.message}` });
      } else {
        setActionResult({ type: 'success', msg: `${label} başarıyla tetiklendi` });
        setTimeout(fetchData, 2000);
      }
    } catch (e) {
      setActionResult({ type: 'error', msg: String(e) });
    } finally {
      setActionLoading(null);
    }
  }

  const actions = [
    { key: 'prematch', label: 'FORCE PREMATCH RUN',    icon: Play,        cls: 'border-blue-700/40 bg-blue-900/20 text-blue-300 hover:bg-blue-900/40' },
    { key: 'live',     label: 'FORCE LIVE REVISION',   icon: Zap,         cls: 'border-yellow-700/40 bg-yellow-900/20 text-yellow-300 hover:bg-yellow-900/40' },
    { key: 'validate', label: 'FORCE VALIDATE RESULTS', icon: CheckCircle2, cls: 'border-emerald-700/40 bg-emerald-900/20 text-emerald-300 hover:bg-emerald-900/40' },
  ];

  const canConfirmStop = confirmText === CONFIRM_WORD && actionLoading !== 'stop';

  if (loading) {
    return (
      <div className="min-h-screen bg-navy-900 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-champagne animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy-900 p-6">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-champagne/10 border border-champagne/30 flex items-center justify-center">
              <Brain className="w-5 h-5 text-champagne" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Brain Orkestrasyonu</h1>
              <p className="text-sm text-navy-400">6 beyin + meta-learner kontrol paneli</p>
            </div>
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-navy-300 hover:text-white border border-navy-600 hover:border-navy-500 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Yenile
          </button>
        </div>

        {/* Action Buttons */}
        <div className="rounded-xl border border-navy-600 bg-navy-800/50 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Manuel Kontroller</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {actions.map(({ key, label, icon: Icon, cls }) => (
              <button
                key={key}
                onClick={() => invokeAction(key, label)}
                disabled={actionLoading !== null}
                className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold border transition-all disabled:opacity-50 ${cls}`}
              >
                {actionLoading === key
                  ? <RefreshCw className="w-4 h-4 animate-spin" />
                  : <Icon className="w-4 h-4" />
                }
                {label}
              </button>
            ))}
          </div>
          {actionResult && (
            <div className={`mt-3 flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${actionResult.type === 'success' ? 'text-emerald-400 bg-emerald-900/20 border-emerald-700/40' : 'text-red-400 bg-red-900/20 border-red-700/40'}`}>
              {actionResult.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
              {actionResult.msg}
            </div>
          )}
        </div>

        {/* Brain Cards + Meta Learner */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2">
            <h2 className="text-sm font-semibold text-white mb-4">Beyin Durumu</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {brainConfigs.map((brain) => (
                <BrainStatusCard
                  key={brain.brain_key}
                  brain={brain}
                  perf={brainPerfs[brain.brain_key]}
                />
              ))}
              {brainConfigs.length === 0 && (
                <div className="col-span-3 text-center py-8 text-navy-500 text-sm">
                  Beyin konfigürasyonu bulunamadı
                </div>
              )}
            </div>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white mb-4">Meta-Learner</h2>
            <MetaLearnerPanel model={metaModel} onRetrainComplete={fetchData} />
          </div>
        </div>

        {/* Recent Runs Table */}
        <div className="rounded-xl border border-navy-600 bg-navy-800/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-navy-600">
            <h2 className="text-sm font-semibold text-white">Son Çalıştırmalar</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-navy-600/60">
                  <th className="px-4 py-3 text-left text-navy-400 font-medium">Zaman</th>
                  <th className="px-4 py-3 text-left text-navy-400 font-medium">Tür</th>
                  <th className="px-4 py-3 text-left text-navy-400 font-medium">Durum</th>
                  <th className="px-4 py-3 text-left text-navy-400 font-medium">Maç ID</th>
                  <th className="px-4 py-3 text-left text-navy-400 font-medium">Süre</th>
                  <th className="px-4 py-3 text-left text-navy-400 font-medium">Beyin Sayısı</th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.map((run) => {
                  const StatusIcon = STATUS_ICON[run.status] ?? Clock;
                  const duration = run.completed_at
                    ? Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)
                    : null;
                  return (
                    <tr key={run.id} className="border-b border-navy-600/30 hover:bg-navy-700/30 transition-colors">
                      <td className="px-4 py-3 text-navy-300 font-mono">
                        {new Date(run.started_at).toLocaleString('tr-TR')}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-navy-200 font-medium">{run.run_type}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${STATUS_STYLES[run.status] ?? STATUS_STYLES.failed}`}>
                          <StatusIcon className="w-3 h-3" />
                          {run.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-navy-400 font-mono text-[10px]">{run.match_id.slice(0, 8)}…</td>
                      <td className="px-4 py-3 text-navy-300 font-mono">{duration != null ? `${duration}s` : '—'}</td>
                      <td className="px-4 py-3 text-navy-300">{Array.isArray(run.brain_results) ? run.brain_results.length : 0}</td>
                    </tr>
                  );
                })}
                {recentRuns.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-navy-500">Henüz çalıştırma yok</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Stop/Resume Controls */}
        <div className="flex gap-3">
          <button
            onClick={openStopModal}
            disabled={actionLoading !== null}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border border-red-700/40 bg-red-900/20 text-red-400 hover:bg-red-900/40 transition-colors disabled:opacity-50"
          >
            <StopCircle className="w-4 h-4" />
            EMERGENCY STOP
          </button>
          <button
            onClick={handleResume}
            disabled={actionLoading !== null}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border border-emerald-700/40 bg-emerald-900/20 text-emerald-400 hover:bg-emerald-900/40 transition-colors disabled:opacity-50"
          >
            {actionLoading === 'resume'
              ? <RefreshCw className="w-4 h-4 animate-spin" />
              : <Play className="w-4 h-4" />
            }
            RESUME
          </button>
        </div>

      </div>

      {/* Emergency Stop Confirmation Modal */}
      {stopModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) closeStopModal(); }}
        >
          <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border border-red-800/60 bg-navy-900">

            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 bg-red-950/80 border-b border-red-800/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-red-700/40 border border-red-600/50 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-red-300 uppercase tracking-wide">Sistemi Durduruyorsunuz</p>
                  <p className="text-[11px] text-red-500">Bu işlem geri alınabilir</p>
                </div>
              </div>
              <button
                onClick={closeStopModal}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-red-500 hover:text-red-300 hover:bg-red-900/50 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-5 py-5 space-y-5">
              <div className="rounded-xl bg-red-950/40 border border-red-800/40 px-4 py-3 text-sm text-red-300 leading-relaxed">
                Tüm aktif brain modelleri <span className="font-bold text-red-200">anında devre dışı</span> bırakılacak.
                Tahmin üretimi ve canlı revizyonlar duracak.
                RESUME butonu ile yeniden aktif edebilirsiniz.
              </div>

              <div>
                <label className="block text-xs font-semibold text-navy-300 mb-2">
                  Onaylamak için{' '}
                  <span className="text-red-400 font-mono font-black select-none">{CONFIRM_WORD}</span>
                  {' '}yazın:
                </label>
                <input
                  ref={confirmInputRef}
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                  placeholder={CONFIRM_WORD}
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full rounded-lg border border-navy-600 bg-navy-800 px-3 py-2.5 text-sm font-mono text-white placeholder-navy-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500/30 transition-colors"
                />
              </div>

              <div className="flex gap-3 justify-end pt-1">
                <button
                  onClick={closeStopModal}
                  disabled={actionLoading === 'stop'}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-navy-300 hover:text-white hover:bg-navy-700 border border-navy-600 transition-colors disabled:opacity-50"
                >
                  Vazgec
                </button>
                <button
                  onClick={executeEmergencyStop}
                  disabled={!canConfirmStop}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold bg-red-700 hover:bg-red-600 text-white border border-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {actionLoading === 'stop'
                    ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Durduruluyor…</>
                    : <><StopCircle className="w-3.5 h-3.5" /> Sistemi Durdur</>
                  }
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
