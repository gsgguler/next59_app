import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, Loader2, Sparkles, ChevronLeft, ChevronRight, BarChart3 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const PAGE_SIZE = 20;

interface PublicPrediction {
  id: string;
  match_id: string;
  prediction_type: string;
  predicted_outcome: string | null;
  confidence: number | null;
  odds_fair: number | null;
  published_at: string | null;
  created_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  match_result: 'Maç Sonucu',
  over_under: 'Gol Üstü/Altı',
  btts: 'KG Var/Yok',
};

const OUTCOME_LABELS: Record<string, string> = {
  home_win: 'Ev Sahibi Kazanır',
  draw: 'Beraberlik',
  away_win: 'Deplasman Kazanır',
  over: 'Üst',
  under: 'Alt',
  yes: 'Var',
  no: 'Yok',
};

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-gold-500' : 'bg-gray-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-700 tabular-nums">%{pct}</span>
    </div>
  );
}

function PredictionArchiveCard({ prediction }: { prediction: PublicPrediction }) {
  const typeLabel = TYPE_LABELS[prediction.prediction_type] ?? prediction.prediction_type;
  const outcomeLabel =
    prediction.predicted_outcome
      ? OUTCOME_LABELS[prediction.predicted_outcome] ?? prediction.predicted_outcome
      : null;

  return (
    <Link
      to={`/tahminler/${prediction.id}`}
      className="block bg-white rounded-xl border border-gray-200 hover:border-navy-300 hover:shadow-md transition-all duration-200 overflow-hidden group"
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <span className="inline-flex items-center text-xs font-medium text-gold-700 bg-gold-50 border border-gold-200 px-2.5 py-1 rounded-lg">
            {typeLabel}
          </span>
          <span className="text-xs text-gray-400 shrink-0">
            {formatDate(prediction.published_at ?? prediction.created_at)}
          </span>
        </div>

        {outcomeLabel && (
          <p className="text-base font-semibold text-gray-900 mb-3 leading-snug">
            {outcomeLabel}
          </p>
        )}

        {prediction.confidence != null && (
          <ConfidenceBar value={prediction.confidence} />
        )}

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
          {prediction.odds_fair != null ? (
            <span className="text-xs text-gray-500">
              Adil Oran: <span className="font-semibold text-gray-700">{prediction.odds_fair.toFixed(2)}</span>
            </span>
          ) : (
            <span />
          )}
          <span className="text-xs font-medium text-navy-600 group-hover:text-navy-700 transition-colors">
            Detayı Gör →
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function PublicPredictionsPage() {
  const [predictions, setPredictions] = useState<PublicPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    document.title = 'Yayınlanmış Tahminler — Next59';
  }, []);

  const fetchPage = useCallback(async (p: number) => {
    setLoading(true);
    const from = p * PAGE_SIZE;
    const to = from + PAGE_SIZE;

    const { data } = await supabase
      .from('predictions')
      .select(
        'id, match_id, prediction_type, predicted_outcome, confidence, odds_fair, published_at, created_at',
      )
      .eq('is_published', true)
      .eq('is_elite_only', false)
      .is('superseded_by', null)
      .order('published_at', { ascending: false })
      .range(from, to);

    const rows = (data ?? []) as PublicPrediction[];
    setPredictions(rows.slice(0, PAGE_SIZE));
    setHasMore(rows.length > PAGE_SIZE);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPage(page);
  }, [fetchPage, page]);

  function handlePageChange(next: number) {
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-gold-500" />
          <h1 className="text-2xl font-bold text-gray-900">Yayınlanmış Tahminler</h1>
        </div>
        <p className="text-gray-500 text-sm">
          Next59'un tamamlanmış ve yayınlanmış futbol analizleri.
        </p>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 text-navy-500 animate-spin" />
        </div>
      ) : predictions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-navy-50 border border-navy-100 flex items-center justify-center mb-5">
            <BarChart3 className="w-7 h-7 text-navy-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Henüz Yayınlanmış Analiz Yok</h2>
          <p className="text-sm text-gray-500 max-w-xs leading-relaxed mb-6">
            İlk yayınlanmış analizler yakında burada görünecek.
          </p>
          <div className="flex items-center gap-3">
            <Link
              to="/world-cup-2026"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-navy-700 text-white text-sm font-medium hover:bg-navy-600 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              WC 2026 Fikstür
            </Link>
            <Link
              to="/mac-arsivi"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Maç Arşivi
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {predictions.map((p) => (
              <PredictionArchiveCard key={p.id} prediction={p} />
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              Önceki
            </button>

            <span className="text-sm text-gray-400">Sayfa {page + 1}</span>

            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={!hasMore}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Sonraki
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
