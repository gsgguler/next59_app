import { RefreshCw, Zap, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';

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

interface MetaLearnerPanelProps {
  model: MetaLearnerModel | null;
  onRetrainComplete?: () => void;
}

export default function MetaLearnerPanel({ model, onRetrainComplete }: MetaLearnerPanelProps) {
  const [retraining, setRetraining] = useState(false);
  const [retrainResult, setRetrainResult] = useState<string | null>(null);

  async function handleForceRetrain() {
    setRetraining(true);
    setRetrainResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('meta-learner-trainer', {
        body: { mode: 'full_retrain' },
      });
      if (error) {
        setRetrainResult(`Hata: ${error.message}`);
      } else {
        setRetrainResult(`Tamamlandı. Yeni model: ${data?.new_model_version ?? 'yok'} | Sample: ${data?.samples ?? 0}`);
        onRetrainComplete?.();
      }
    } catch (e) {
      setRetrainResult(`Hata: ${String(e)}`);
    } finally {
      setRetraining(false);
    }
  }

  const samplePct = model ? Math.min(100, Math.round((model.training_sample_count / 100) * 100)) : 0;

  return (
    <div className="rounded-xl border border-navy-600 bg-navy-700/50 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-champagne" />
          <h3 className="text-sm font-semibold text-white">Meta-Learner</h3>
        </div>
        {model?.is_active && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400 border border-emerald-700/40">AKTİF</span>
        )}
      </div>

      {model ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-navy-600/40 px-3 py-2">
              <p className="text-[10px] text-navy-400 mb-0.5">Aktif Model</p>
              <p className="text-sm font-mono font-bold text-champagne">{model.model_version}</p>
            </div>
            <div className="rounded-lg bg-navy-600/40 px-3 py-2">
              <p className="text-[10px] text-navy-400 mb-0.5">Ortalama Brier</p>
              <p className={`text-sm font-mono font-bold ${model.validation_brier != null && model.validation_brier > 0.25 ? 'text-red-400' : 'text-emerald-400'}`}>
                {model.validation_brier != null ? model.validation_brier.toFixed(3) : '—'}
              </p>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-[10px] text-navy-400 mb-1.5">
              <span>Eğitim Örnekleri</span>
              <span className="text-white font-semibold">{model.training_sample_count} / 100</span>
            </div>
            <div className="h-2 rounded-full bg-navy-600/60 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${samplePct}%`, background: samplePct >= 100 ? '#2ECC71' : '#F39C12' }}
              />
            </div>
            {model.training_sample_count < 100 && (
              <p className="text-[10px] text-yellow-400 mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {100 - model.training_sample_count} örnek daha gerekli
              </p>
            )}
          </div>

          <p className="text-[10px] text-navy-400">
            Tip: <span className="text-navy-300">{model.model_type}</span> &nbsp;·&nbsp;
            {new Date(model.created_at).toLocaleDateString('tr-TR')}
          </p>
        </div>
      ) : (
        <p className="text-sm text-navy-400 py-2">Model bulunamadı</p>
      )}

      <div className="flex gap-2 mt-4">
        <button
          onClick={handleForceRetrain}
          disabled={retraining}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold bg-champagne/10 hover:bg-champagne/20 text-champagne border border-champagne/30 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${retraining ? 'animate-spin' : ''}`} />
          {retraining ? 'Eğitiliyor…' : 'FORCE RETRAIN'}
        </button>
      </div>

      {retrainResult && (
        <p className="text-[11px] mt-2 text-navy-300 bg-navy-600/40 rounded px-3 py-1.5">{retrainResult}</p>
      )}
    </div>
  );
}
