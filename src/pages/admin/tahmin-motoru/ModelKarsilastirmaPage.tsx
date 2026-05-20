import { useState, useEffect, useCallback } from 'react';
import { Layers, RefreshCw, Zap, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import ModelComparisonChart from '../../../components/tahmin-motoru/ModelComparisonChart';
import BrierScoreBadge from '../../../components/tahmin-motoru/BrierScoreBadge';

interface MetaModel {
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

export default function ModelKarsilastirmaPage() {
  const [models, setModels] = useState<MetaModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState<string | null>(null);
  const [training, setTraining] = useState(false);
  const [trainMsg, setTrainMsg] = useState<string | null>(null);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('meta_learner_models')
      .select('*')
      .order('created_at', { ascending: true });
    if (data) setModels(data as MetaModel[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  async function activateModel(id: string) {
    setActivating(id);
    await supabase
      .from('meta_learner_models')
      .update({ is_active: false })
      .neq('id', id);
    await supabase
      .from('meta_learner_models')
      .update({ is_active: true })
      .eq('id', id);
    await fetchModels();
    setActivating(null);
  }

  async function handleTrain() {
    setTraining(true);
    setTrainMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke('meta-learner-trainer', {
        body: { mode: 'full_retrain' },
      });
      if (error) {
        setTrainMsg(`Hata: ${error.message}`);
      } else {
        setTrainMsg(`Tamamlandı. Yeni model: ${data?.new_model_version ?? 'yok'} | ${data?.samples ?? 0} örnek`);
        fetchModels();
      }
    } catch (e) {
      setTrainMsg(`Hata: ${String(e)}`);
    } finally {
      setTraining(false);
    }
  }

  const chartData = models.map(m => ({
    version: m.model_version,
    brier: m.validation_brier,
    accuracy: null as number | null,
  }));

  const BRAIN_KEYS = ['tactical', 'statistical', 'psychological', 'live', 'conditions', 'news'];
  const BRAIN_LABELS: Record<string, string> = {
    tactical: 'Taktik', statistical: 'İstat.', psychological: 'Psiko.',
    live: 'Canlı', conditions: 'Koşul', news: 'Haber',
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-navy-900 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-champagne animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy-900 p-6">
      <div className="max-w-6xl mx-auto space-y-8">

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
              <Layers className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Model Karşılaştırma</h1>
              <p className="text-sm text-navy-400">Meta-learner versiyonları ve Brier skoru trendi</p>
            </div>
          </div>
          <button
            onClick={handleTrain}
            disabled={training}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border border-champagne/40 bg-champagne/10 hover:bg-champagne/20 text-champagne transition-colors disabled:opacity-50"
          >
            {training ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            {training ? 'Eğitiliyor…' : 'Yeni Model Eğit'}
          </button>
        </div>

        {trainMsg && (
          <div className="text-xs px-4 py-2.5 rounded-lg border border-navy-600 bg-navy-800/40 text-navy-300">
            {trainMsg}
          </div>
        )}

        {/* Brier trend chart */}
        <div className="rounded-xl border border-navy-600 bg-navy-800/50 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Brier Skoru Trendi</h2>
          <ModelComparisonChart data={chartData} />
          <p className="text-[10px] text-navy-600 mt-2">Kırmızı kesikli çizgi: 0.25 eşiği (otomatik yeniden eğitim tetikler)</p>
        </div>

        {/* Models table */}
        <div className="rounded-xl border border-navy-600 bg-navy-800/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-navy-600">
            <h2 className="text-sm font-semibold text-white">Model Listesi</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-navy-600/60">
                  <th className="px-4 py-3 text-left text-navy-400 font-medium">Versiyon</th>
                  <th className="px-4 py-3 text-left text-navy-400 font-medium">Tip</th>
                  <th className="px-4 py-3 text-left text-navy-400 font-medium">Brier</th>
                  <th className="px-4 py-3 text-left text-navy-400 font-medium">Örnekler</th>
                  <th className="px-4 py-3 text-left text-navy-400 font-medium">Tarih</th>
                  <th className="px-4 py-3 text-left text-navy-400 font-medium">Durum</th>
                  <th className="px-4 py-3 text-left text-navy-400 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {models.map(m => (
                  <tr key={m.id} className={`border-b border-navy-600/30 transition-colors ${m.is_active ? 'bg-emerald-900/10' : 'hover:bg-navy-700/30'}`}>
                    <td className="px-4 py-3 font-mono text-champagne font-bold">{m.model_version}</td>
                    <td className="px-4 py-3 text-navy-300">{m.model_type}</td>
                    <td className="px-4 py-3"><BrierScoreBadge score={m.validation_brier} size="sm" /></td>
                    <td className="px-4 py-3 text-navy-300 font-mono">{m.training_sample_count}</td>
                    <td className="px-4 py-3 text-navy-400">{new Date(m.created_at).toLocaleDateString('tr-TR')}</td>
                    <td className="px-4 py-3">
                      {m.is_active
                        ? <span className="inline-flex items-center gap-1 text-emerald-400 font-bold"><CheckCircle2 className="w-3 h-3" /> AKTİF</span>
                        : <span className="text-navy-500">Pasif</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      {!m.is_active && (
                        <button
                          onClick={() => activateModel(m.id)}
                          disabled={activating === m.id}
                          className="px-3 py-1 rounded-lg text-[10px] font-semibold border border-blue-700/40 bg-blue-900/20 text-blue-300 hover:bg-blue-900/40 transition-colors disabled:opacity-50"
                        >
                          {activating === m.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Aktive Et'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {models.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-navy-500">Model bulunamadı</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Learned weights for active model */}
        {models.filter(m => m.is_active).map(m => (
          <div key={m.id} className="rounded-xl border border-navy-600 bg-navy-800/50 p-5">
            <h2 className="text-sm font-semibold text-white mb-4">
              Aktif Model Ağırlıkları — <span className="text-champagne font-mono">{m.model_version}</span>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {BRAIN_KEYS.map(bk => {
                const w = m.learned_weights?.[bk] ?? 0;
                return (
                  <div key={bk} className="rounded-lg bg-navy-700/40 px-4 py-3">
                    <p className="text-[10px] text-navy-400 mb-1">{BRAIN_LABELS[bk]}</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-navy-600/50 overflow-hidden">
                        <div className="h-full rounded-full bg-champagne" style={{ width: `${w * 100}%` }} />
                      </div>
                      <span className="text-xs font-mono text-white w-10 text-right">{(w * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

      </div>
    </div>
  );
}
