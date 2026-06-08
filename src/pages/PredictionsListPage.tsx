import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp, Loader2, Trophy, Filter, X, Lock, ArrowUpRight,
  Sparkles, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import PredictionListCard from '../components/predictions/PredictionListCard';

const PAGE_SIZE = 50;

interface PredictionItem {
  id: string;
  prediction_type: string;
  predicted_outcome: string;
  confidence: number;
  odds_fair: number | null;
  is_elite_only: boolean;
  created_at: string;
  match: {
    home_team: { name: string; short_name: string | null; code: string | null } | null;
    away_team: { name: string; short_name: string | null; code: string | null } | null;
  } | null;
}

type AccessFilter = 'all' | 'free' | 'elite';
type SortKey = 'date' | 'confidence';

export default function PredictionsListPage() {
  const { user } = useAuth();
  const [predictions, setPredictions] = useState<PredictionItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [accessFilter, setAccessFilter] = useState<AccessFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [showFilters, setShowFilters] = useState(false);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const fetchPredictions = useCallback(async (currentPage: number) => {
    setLoading(true);

    const from = currentPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from('predictions')
      .select(
        `id, prediction_type, predicted_outcome, confidence, odds_fair,
         is_elite_only, created_at,
         match:matches!predictions_match_id_fkey(
           home_team:teams!matches_home_team_id_fkey(name, short_name, code),
           away_team:teams!matches_away_team_id_fkey(name, short_name, code)
         )`,
        { count: 'exact' },
      )
      .is('superseded_by', null);

    if (accessFilter === 'elite') {
      query = query.eq('is_elite_only', true);
    } else if (accessFilter === 'free') {
      query = query.eq('is_elite_only', false);
    }

    if (sortKey === 'confidence') {
      query = query.order('confidence', { ascending: false }).order('created_at', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const { data, count } = await query.range(from, to);

    setPredictions((data as unknown as PredictionItem[]) ?? []);
    setTotalCount(count ?? 0);
    setLoading(false);
  }, [accessFilter, sortKey]);

  useEffect(() => {
    setPage(0);
  }, [accessFilter, sortKey]);

  useEffect(() => {
    fetchPredictions(page);
  }, [fetchPredictions, page]);

  function handlePageChange(next: number) {
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const activeFilterCount = [accessFilter !== 'all'].filter(Boolean).length;

  function resetFilters() {
    setAccessFilter('all');
    setSortKey('date');
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-gold-500" />
            Tüm Analizler
            {activeFilterCount > 0 && (
              <span className="text-xs font-medium bg-navy-100 text-navy-700 px-2 py-0.5 rounded-full">
                {activeFilterCount} filtre
              </span>
            )}
          </h1>
          {!loading && (
            <p className="text-gray-500 mt-1">
              {totalCount > 0
                ? `${totalCount} analizden ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, totalCount)} gösteriliyor`
                : '0 analiz'}
            </p>
          )}
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
            showFilters
              ? 'bg-navy-700 text-white'
              : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
          }`}
        >
          <Filter className="w-4 h-4" />
          Filtreler
        </button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Erişim Seviyesi</label>
              <select
                value={accessFilter}
                onChange={(e) => setAccessFilter(e.target.value as AccessFilter)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:ring-2 focus:ring-navy-500 focus:border-navy-500 transition-colors"
              >
                <option value="all">Tümü</option>
                <option value="free">Ücretsiz</option>
                <option value="elite">Elite</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Sıralama</label>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:ring-2 focus:ring-navy-500 focus:border-navy-500 transition-colors"
              >
                <option value="date">Tarih (En Yeni)</option>
                <option value="confidence">Güven (En Yüksek)</option>
              </select>
            </div>
          </div>

          {activeFilterCount > 0 && (
            <button
              onClick={resetFilters}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Filtreleri Temizle
            </button>
          )}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-navy-500 animate-spin" />
        </div>
      ) : predictions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          {user && accessFilter === 'elite' ? (
            <div className="max-w-md text-center">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-gold-50 border border-gold-200 flex items-center justify-center mb-5">
                <Lock className="w-7 h-7 text-gold-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Elite Analizler Kilitli</h3>
              <p className="text-sm text-gray-500 leading-relaxed mb-6">
                Elite seviye analizler, derin istatistiksel incelemeler ve özel maç senaryoları içerir.
                Bu içeriklere erişim için Elite planına yükseltme yapabilirsiniz.
              </p>
              <Link
                to="/settings"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-gold-500 to-gold-600 text-navy-900 font-semibold text-sm hover:from-gold-400 hover:to-gold-500 transition-all shadow-sm"
              >
                <ArrowUpRight className="w-4 h-4" />
                Planını Yükselt
              </Link>
            </div>
          ) : (
            <div className="max-w-lg text-center">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-navy-50 border border-navy-200 flex items-center justify-center mb-5">
                <Sparkles className="w-7 h-7 text-navy-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Analizler Henüz Hazır Değil</h3>
              <p className="text-sm text-gray-500 leading-relaxed mb-2">
                Model kalibrasyon süreci devam ediyor. 2026 Dünya Kupası analizleri turnuva başlamadan önce yayınlanacak.
              </p>
              <p className="text-xs text-gray-400 mb-6">
                Şimdilik dünya kupası fikstürlerini ve tarihsel maç arşivini inceleyebilirsiniz.
              </p>
              <div className="flex items-center justify-center gap-3">
                <Link
                  to="/matches"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-navy-700 text-white text-sm font-medium hover:bg-navy-600 transition-colors"
                >
                  <Trophy className="w-4 h-4" />
                  Maçları Keşfet
                </Link>
                <Link
                  to="/settings"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white border border-gold-300 text-gold-700 text-sm font-medium hover:bg-gold-50 transition-colors"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  Planları Gör
                </Link>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {predictions.map((p) => (
              <PredictionListCard key={p.id} prediction={p} userTier="free" />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
                Önceki
              </button>

              <span className="text-sm text-gray-500">
                Sayfa {page + 1} / {totalPages}
              </span>

              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages - 1}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Sonraki
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
