import { useEffect, useState, useCallback } from 'react';
import { Trophy, Calendar, Filter, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import MatchCard from '../components/matches/MatchCard';
import MatchFilter from '../components/matches/MatchFilter';

export interface Match {
  id: string;
  match_date: string;
  match_time: string | null;
  status_short: string;
  round: string | null;
  home_score_ft: number | null;
  away_score_ft: number | null;
  home_team: { name: string; short_name: string | null; code: string | null; logo_url: string | null } | null;
  away_team: { name: string; short_name: string | null; code: string | null; logo_url: string | null } | null;
  competition_season: {
    season_code: string;
    competition: { name: string; short_name: string | null; code: string } | null;
  } | null;
}

export interface Filters {
  status: string;
  competition: string;
  search: string;
}

const PAGE_SIZE = 12;

export default function MatchListPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [competitions, setCompetitions] = useState<{ code: string; name: string }[]>([]);
  const [filters, setFilters] = useState<Filters>({
    status: 'all',
    competition: 'all',
    search: '',
  });

  useEffect(() => {
    async function fetchCompetitions() {
      const { data } = await supabase
        .from('competitions')
        .select('code, name')
        .order('name');
      setCompetitions(data ?? []);
    }
    fetchCompetitions();
  }, []);

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('matches')
      .select(`
        id, match_date, match_time, status_short, round, home_score_ft, away_score_ft,
        home_team:teams!matches_home_team_id_fkey(name, short_name, code, logo_url),
        away_team:teams!matches_away_team_id_fkey(name, short_name, code, logo_url),
        competition_season:competition_seasons!matches_competition_season_id_fkey(season_code, competition:competitions(name, short_name, code))
      `, { count: 'exact' })
      .order('match_date', { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (filters.status !== 'all') {
      query = query.eq('status_short', filters.status);
    }

    const { data, count } = await query;
    setMatches((data as unknown as Match[]) ?? []);
    setTotal(count ?? 0);
    setLoading(false);
  }, [page, filters.status]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  const filteredMatches = matches.filter((m) => {
    if (filters.competition !== 'all') {
      if (m.competition_season?.competition?.code !== filters.competition) return false;
    }
    if (filters.search) {
      const s = filters.search.toLowerCase();
      const homeName = m.home_team?.name?.toLowerCase() ?? '';
      const awayName = m.away_team?.name?.toLowerCase() ?? '';
      if (!homeName.includes(s) && !awayName.includes(s)) return false;
    }
    return true;
  });

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Trophy className="w-6 h-6 text-gold-500" />
            Maçlar
          </h1>
          <p className="text-gray-500 mt-1">{total} maç listeleniyor</p>
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`
            inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all
            ${showFilters
              ? 'bg-navy-700 text-white'
              : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }
          `}
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

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-navy-500 animate-spin" />
        </div>
      ) : filteredMatches.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Calendar className="w-12 h-12 mb-3" />
          <p className="text-lg font-medium">Maç bulunamadı</p>
          <p className="text-sm mt-1">Filtreleri değiştirmeyi deneyin</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredMatches.map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum = i;
              if (totalPages > 7) {
                if (page < 4) pageNum = i;
                else if (page > totalPages - 5) pageNum = totalPages - 7 + i;
                else pageNum = page - 3 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-10 h-10 sm:w-9 sm:h-9 rounded-lg text-sm font-medium transition-colors
                    ${page === pageNum
                      ? 'bg-navy-700 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                    }`}
                >
                  {pageNum + 1}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}