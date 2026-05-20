import { useState, useEffect } from 'react';
import { Trophy, Calendar, Filter, Loader2, RefreshCw, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import MatchCard from '../components/matches/MatchCard';
import MatchFilter from '../components/matches/MatchFilter';
import { MatchCardSkeletonGrid } from '../components/ui/MatchCardSkeleton';
import { useHomeMatchesLoadMore, type HomeMatch } from '../hooks/useHomeMatches';

// Re-export for MatchCard compatibility
export type { HomeMatch as Match };
export type Match = HomeMatch;

export interface Filters {
  status: string;
  competition: string;
  search: string;
}

export default function MatchListPage() {
  const [showFilters, setShowFilters] = useState(false);
  const [competitions, setCompetitions] = useState<{ code: string; name: string }[]>([]);
  const [filters, setFilters] = useState<Filters>({
    status: 'all',
    competition: 'all',
    search: '',
  });

  const {
    matches,
    total,
    loading,
    loadingMore,
    error,
    empty,
    hasMore,
    loadMore,
  } = useHomeMatchesLoadMore(20, filters.status);

  useEffect(() => {
    supabase
      .from('competitions')
      .select('code, name')
      .order('name')
      .then(({ data }) => setCompetitions(data ?? []));
  }, []);

  // Client-side competition + search filter (no extra DB round-trip)
  const visible = matches.filter((m) => {
    if (filters.competition !== 'all') {
      if (m.competition_season?.competition?.code !== filters.competition) return false;
    }
    if (filters.search) {
      const s = filters.search.toLowerCase();
      const home = m.home_team?.name?.toLowerCase() ?? '';
      const away = m.away_team?.name?.toLowerCase() ?? '';
      if (!home.includes(s) && !away.includes(s)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Trophy className="w-6 h-6 text-gold-500" />
            Maçlar
          </h1>
          <p className="text-gray-500 mt-1">
            {loading ? 'Yükleniyor…' : `${total} maç listeleniyor`}
          </p>
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all
            ${showFilters
              ? 'bg-navy-700 text-white'
              : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
        >
          <Filter className="w-4 h-4" />
          Filtreler
        </button>
      </div>

      {showFilters && (
        <MatchFilter
          filters={filters}
          onChange={setFilters}
          competitions={competitions}
        />
      )}

      {/* Error state */}
      {error && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-red-400">
          <p className="text-sm">Maçlar yüklenemedi. Lütfen tekrar deneyin.</p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Yenile
          </button>
        </div>
      )}

      {/* Initial loading skeleton */}
      {loading && !error && (
        <MatchCardSkeletonGrid count={6} />
      )}

      {/* Empty state */}
      {!loading && !error && empty && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Calendar className="w-12 h-12 mb-3" />
          <p className="text-lg font-medium">Maç bulunamadı</p>
          <p className="text-sm mt-1">Filtreleri değiştirmeyi deneyin</p>
        </div>
      )}

      {/* Match grid */}
      {!loading && !error && visible.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visible.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>

          {/* Load more */}
          {hasMore && (
            <div className="flex flex-col items-center gap-2 pt-4">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 bg-white border border-gray-200 hover:border-navy-400 text-gray-700 hover:text-navy-700 text-sm font-medium px-6 py-2.5 rounded-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loadingMore
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Yükleniyor…</>
                  : <><ChevronDown className="w-4 h-4" /> Daha Fazla Yükle</>
                }
              </button>
              <p className="text-xs text-gray-400">
                {matches.length} / {total} maç gösteriliyor
              </p>
            </div>
          )}

          {/* Loading-more skeleton rows */}
          {loadingMore && (
            <MatchCardSkeletonGrid count={3} />
          )}
        </>
      )}

    </div>
  );
}
