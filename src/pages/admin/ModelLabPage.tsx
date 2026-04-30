import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FlaskConical, Database, Shield, ChevronRight, Activity } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ModelVersion {
  id: string;
  version_key: string;
  model_name: string;
  model_family: string;
  training_start_date: string;
  training_end_date: string;
  validation_start_date: string;
  validation_end_date: string;
  is_active: boolean;
  created_at: string;
}

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
}

export default function ModelLabPage() {
  const [archiveCount, setArchiveCount] = useState<number | null>(null);
  const [activeModel, setActiveModel] = useState<ModelVersion | null>(null);
  const [latestRuns, setLatestRuns] = useState<BacktestRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = 'Model Lab | Admin | Next59';
    async function load() {
      const [countRes, modelRes, runsRes] = await Promise.all([
        supabase
          .from('v_historical_match_archive')
          .select('*', { count: 'exact', head: true }),
        supabase
          .schema('model_lab' as never)
          .from('model_versions')
          .select('*')
          .eq('is_active', true)
          .maybeSingle(),
        supabase
          .schema('model_lab' as never)
          .from('backtest_runs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      setArchiveCount(countRes.count ?? null);
      setActiveModel((modelRes.data as ModelVersion | null));
      setLatestRuns(((runsRes.data as BacktestRun[]) ?? []));
      setLoading(false);
    }
    load();
  }, []);

  const quickLinks = [
    { label: 'Backtest', to: '/admin/model-lab/backtest', icon: Activity, desc: 'Backtest çalıştır ve geçmiş sonuçları incele' },
    { label: 'Maç İnceleme', to: '/admin/model-lab/mac-inceleme', icon: Database, desc: 'Maç bazında model kararlarını ve gerçek sonuçları karşılaştır' },
    { label: 'Kalibrasyon', to: '/admin/model-lab/kalibrasyon', icon: FlaskConical, desc: 'Toplu kalibrasyon özeti ve Brier/log-loss metrikleri' },
    { label: 'Hata Analizi', to: '/admin/model-lab/hata-analizi', icon: Shield, desc: 'Yanlış tahminlerin ve yüksek güven hatalarının analizi' },
  ];

  return (
    <div className="min-h-screen bg-navy-950 p-6">
      {/* Admin warning banner */}
      <div className="max-w-5xl mx-auto">
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-5 py-3 mb-8 flex items-start gap-3">
          <Shield className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-300">
            <strong>Model Lab — Admin Only.</strong> Bu alan yalnızca model araştırma ve kalibrasyon içindir. Public kullanıcıya gösterilmez. Model çıktıları public sayfalara yansıtılmaz.
          </p>
        </div>

        <div className="flex items-start gap-4 mb-8">
          <div className="w-12 h-12 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
            <FlaskConical className="w-6 h-6 text-champagne" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white font-display">Model Lab</h1>
            <p className="text-sm text-navy-400 mt-1">
              B3 Historical Backbone — Deterministik futbol modeli araştırma merkezi
            </p>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 bg-navy-900/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <StatCard label="Arşiv Kaydı" value={archiveCount?.toLocaleString('tr-TR') ?? '–'} />
            <StatCard label="Aktif Model" value={activeModel?.version_key?.split('_v')[0]?.replace(/_/g, ' ') ?? '–'} small />
            <StatCard label="Toplam Backtest" value={String(latestRuns.length > 0 ? '≥1 çalışma' : 'Henüz yok')} small />
            <StatCard
              label="Veri Kaynağı"
              value="v_historical_match_archive"
              small
            />
          </div>
        )}

        {/* Active model version */}
        {activeModel && (
          <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-5 mb-6">
            <h2 className="text-xs font-semibold text-navy-500 uppercase tracking-wider mb-3">
              Aktif Model Versiyonu
            </h2>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <Field label="Version Key" value={activeModel.version_key} mono />
              <Field label="Model Ailesi" value={activeModel.model_family} />
              <Field label="Eğitim Dönemi" value={`${activeModel.training_start_date} → ${activeModel.training_end_date}`} />
              <Field label="Validasyon" value={`${activeModel.validation_start_date} → ${activeModel.validation_end_date}`} />
            </div>
          </div>
        )}

        {/* Quick links */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
          {quickLinks.map((q) => (
            <Link
              key={q.to}
              to={q.to}
              className="flex items-start gap-4 bg-navy-900/50 hover:bg-navy-900 border border-navy-800/60 hover:border-navy-700 rounded-xl p-4 transition-all group"
            >
              <div className="w-9 h-9 rounded-lg bg-navy-800 flex items-center justify-center shrink-0 group-hover:bg-champagne/10 transition-all">
                <q.icon className="w-4 h-4 text-navy-400 group-hover:text-champagne transition-colors" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white group-hover:text-champagne transition-colors">
                  {q.label}
                </p>
                <p className="text-xs text-navy-500 mt-0.5">{q.desc}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-navy-700 group-hover:text-navy-400 shrink-0 mt-0.5" />
            </Link>
          ))}
        </div>

        {/* Latest runs */}
        <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-5">
          <h2 className="text-xs font-semibold text-navy-500 uppercase tracking-wider mb-4">
            Son Backtest Çalışmaları
          </h2>
          {latestRuns.length === 0 ? (
            <p className="text-sm text-navy-600">Henüz backtest çalışması oluşturulmadı.</p>
          ) : (
            <div className="space-y-2">
              {latestRuns.map((run) => (
                <div key={run.id} className="flex items-center gap-3 text-xs">
                  <StatusBadge status={run.run_status} />
                  <span className="text-navy-400 font-mono truncate flex-1">{run.run_scope}</span>
                  <span className="text-navy-600 shrink-0">
                    {run.processed_matches}/{run.total_matches} maç
                  </span>
                  {run.average_brier_1x2 !== null && (
                    <span className="text-navy-600 shrink-0">
                      Brier: {Number(run.average_brier_1x2).toFixed(4)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="bg-navy-900/50 border border-navy-800 rounded-xl px-4 py-3">
      <div className={`font-bold text-white tabular-nums ${small ? 'text-sm' : 'text-xl'}`}>{value}</div>
      <div className="text-[11px] text-navy-500 mt-0.5">{label}</div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span className="text-xs text-navy-500">{label}: </span>
      <span className={`text-sm text-white ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'completed'
      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
      : status === 'running'
        ? 'bg-amber-500/15 text-amber-400 border-amber-500/20'
        : status === 'failed'
          ? 'bg-red-500/15 text-red-400 border-red-500/20'
          : 'bg-navy-800 text-navy-400 border-navy-700';
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cls} shrink-0`}>
      {status}
    </span>
  );
}
