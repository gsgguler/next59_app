import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, Loader2, Trophy, Filter, X, Lock, ArrowUpRight, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import PredictionListCard from '../components/predictions/PredictionListCard';

interface PredictionItem {
  id: string;
  statement: string;
  probability: number;
  confidence_label: string;
  access_level: string;
  cassandra_code: string;
  generated_at: string;
  match: {
    home_team: { short_name: string; tla: string } | null;
    away_team: { short_name: string; tla: string } | null;
  } | null;
}

type AccessFilter = 'all' | 'free' | 'pro' | 'elite';
type ConfidenceFilter = 'all' | 'low' | 'medium' | 'high';
type SortKey = 'date' | 'probability' | 'confidence';

export default function PredictionsListPage() {
  const { user } = useAuth();
  const [predictions, setPredictions] = useState<PredictionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessFilter, setAccessFilter] = useState<AccessFilter>('all');
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [showFilters, setShowFilters] = useState(false);

  const fetchPredictions = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('predictions')
      .select(`
        id, statement, probability, confidence_label, access_level,
        cassandra_code, generated_at,
        match:matches(
          home_team:teams!matches_home_team_id_fkey(short_name, tla),
          away_team:teams!matches_away_team_id_fkey(short_name, tla)
        )
      `)
      .eq('is_current', true);

    if (accessFilter !== 'all') {
      query = query.eq('access_level', accessFilter);
    }
    if (confidenceFilter !== 'all') {
      query = query.eq('confidence_label', confidenceFilter);
    }

    if (sortKey === 'probability') {
      query = query.order('probability', { ascending: false });
    } else {
      query = query.order('generated_at', { ascending: false });
    }

    const { data } = await query;
    const items = [...((data as unknown as PredictionItem[]) ?? [])];

    if (sortKey === 'confidence') {
      const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
      items.sort((a, b) => (order[a.confidence_label] ?? 3) - (order[b.confidence_label] ?? 3));
    }

    setPredictions(items);
    setLoading(false);
  }, [accessFilter, confidenceFilter, sortKey]);

  useEffect(() => {
    fetchPredictions();
  }, [fetchPredictions]);

  const activeFilterCount = [
    accessFilter !== 'all',
    confidenceFilter !== 'all',
  ].filter(Boolean).length;

  function resetFilters() {
    setAccessFilter('all');
    setConfidenceFilter('all');
    setSortKey('date');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-gold-500" />
            Tüm Tahminler
            {activeFilterCount > 0 && (
              <span className="text-xs font-medium bg-navy-100 text-navy-700 px-2 py-0.5 rounded-full">
                {activeFilterCount} filtre
              </span>
            )}
          </h1>
          <p className="text-gray-500 mt-1">{predictions.length} tahmin listeleniyor</p>
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

      {showFilters && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Erişim Seviyesi</label>
              <select
                value={accessFilter}
                onChange={(e) => setAccessFilter(e.target.value as AccessFilter)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:ring-2 focus:ring-navy-500 focus:border-navy-500 transition-colors"
              >
                <option value="all">Tümü</option>
                <option value="free">Ücretsiz</option>
                <option value="pro">Pro</option>
                <option value="elite">Elite</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Güven Seviyesi</label>
              <select
                value={confidenceFilter}
                onChange={(e) => setConfidenceFilter(e.target.value as ConfidenceFilter)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:ring-2 focus:ring-navy-500 focus:border-navy-500 transition-colors"
              >
                <option value="all">Tümü</option>
                <option value="low">Düşük</option>
                <option value="medium">Orta</option>
                <option value="high">Yüksek</option>
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
                <option value="probability">Olasılık (En Yüksek)</option>
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

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-navy-500 animate-spin" />
        </div>
      ) : predictions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          {user && (accessFilter === 'pro' || accessFilter === 'elite') ? (
            <div className="max-w-md text-center">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-gold-50 border border-gold-200 flex items-center justify-center mb-5">
                <Lock className="w-7 h-7 text-gold-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {accessFilter === 'elite' ? 'Elite' : 'Pro'} Tahminler Kilitli
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed mb-6">
                {accessFilter === 'elite'
                  ? 'Elite seviye tahminler, en yüksek doğruluk oranına sahip özel analizleri içerir. Bu içeriklere erişim için Elite planına yükseltme yapabilirsiniz.'
                  : 'Pro seviye tahminler, detaylı istatistiksel analizler ve model çıktıları içerir. Erişim için Pro planına geçiş yapabilirsiniz.'}
              </p>
              <Link
                to="/settings"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-gold-500 to-gold-600 text-navy-900 font-semibold text-sm hover:from-gold-400 hover:to-gold-500 transition-all shadow-sm"
              >
                <ArrowUpRight className="w-4 h-4" />
                Planını Yükselt
              </Link>
            </div>
          ) : user && accessFilter === 'all' ? (
            <div className="max-w-lg text-center">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-navy-50 border border-navy-200 flex items-center justify-center mb-5">
                <Sparkles className="w-7 h-7 text-navy-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Tahminler Bekleniyor
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed mb-2">
                Henüz görüntüleyeceğiniz tahmin bulunmuyor. Bu durum, tahminlerin henüz oluşturulmamış olmasından veya mevcut erişim seviyenizin dışında kalmasından kaynaklanabilir.
              </p>
              <p className="text-xs text-gray-400 mb-6">
                Pro ve Elite planlarda daha fazla tahmine erişebilirsiniz.
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
          ) : (
            <div className="text-center text-gray-400">
              <TrendingUp className="w-12 h-12 mb-3 mx-auto" />
              <p className="text-lg font-medium text-gray-600">Henüz tahmin bulunmuyor</p>
              <p className="text-sm mt-1 mb-4">Maç tahminlerini keşfetmek için maçlara göz atın</p>
              <Link
                to="/matches"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-navy-700 text-white text-sm font-medium hover:bg-navy-600 transition-colors"
              >
                <Trophy className="w-4 h-4" />
                Maçları Keşfet
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {predictions.map((p) => (
            <PredictionListCard key={p.id} prediction={p} userTier="free" />
          ))}
        </div>
      )}
    </div>
  );
}
