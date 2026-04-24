import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, Loader2, Trophy, Filter, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
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
            Tum Tahminler
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
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Erisim Seviyesi</label>
              <select
                value={accessFilter}
                onChange={(e) => setAccessFilter(e.target.value as AccessFilter)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:ring-2 focus:ring-navy-500 focus:border-navy-500 transition-colors"
              >
                <option value="all">Tumu</option>
                <option value="free">Ucretsiz</option>
                <option value="pro">Pro</option>
                <option value="elite">Elite</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Guven Seviyesi</label>
              <select
                value={confidenceFilter}
                onChange={(e) => setConfidenceFilter(e.target.value as ConfidenceFilter)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:ring-2 focus:ring-navy-500 focus:border-navy-500 transition-colors"
              >
                <option value="all">Tumu</option>
                <option value="low">Dusuk</option>
                <option value="medium">Orta</option>
                <option value="high">Yuksek</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Siralama</label>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:ring-2 focus:ring-navy-500 focus:border-navy-500 transition-colors"
              >
                <option value="date">Tarih (En Yeni)</option>
                <option value="probability">Olasilik (En Yuksek)</option>
                <option value="confidence">Guven (En Yuksek)</option>
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
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <TrendingUp className="w-12 h-12 mb-3" />
          <p className="text-lg font-medium text-gray-600">Henuz tahmin bulunmuyor</p>
          <p className="text-sm mt-1 mb-4">Mac tahminlerini kesfetmek icin maclara goz atin</p>
          <Link
            to="/matches"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-navy-700 text-white text-sm font-medium hover:bg-navy-600 transition-colors"
          >
            <Trophy className="w-4 h-4" />
            Maclari Kesfet
          </Link>
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
