import { useState, useCallback, useRef, useEffect } from 'react';
import useSWR from 'swr';
import { supabase } from '../lib/supabase';

const DEFAULT_PAGE_SIZE = 20;

export interface HomeMatch {
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

type FetchKey = [tag: string, page: number, limit: number, status: string];

async function fetchMatchPage([, page, limit, statusFilter]: FetchKey): Promise<{ rows: HomeMatch[]; total: number }> {
  const from = page * limit;
  const to   = from + limit - 1;

  let query = supabase
    .from('matches')
    .select(
      `id, match_date, match_time, status_short, round, home_score_ft, away_score_ft,
       home_team:teams!matches_home_team_id_fkey(name, short_name, code, logo_url),
       away_team:teams!matches_away_team_id_fkey(name, short_name, code, logo_url),
       competition_season:competition_seasons!matches_competition_season_id_fkey(
         season_code, competition:competitions(name, short_name, code)
       )`,
      { count: 'exact' },
    )
    .order('match_date', { ascending: true })
    .range(from, to);

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status_short', statusFilter);
  }

  const { data, count, error } = await query;
  if (error) throw error;

  return { rows: (data as unknown as HomeMatch[]) ?? [], total: count ?? 0 };
}

// ── Single-page hook (used for offset/page-number style pagination) ──────────

export interface UseHomeMatchesResult {
  matches: HomeMatch[];
  total: number;
  loading: boolean;
  error: Error | undefined;
  empty: boolean;
  hasMore: boolean;
  mutate: () => void;
}

export function useHomeMatches(
  page       = 0,
  limit      = DEFAULT_PAGE_SIZE,
  statusFilter = 'all',
): UseHomeMatchesResult {
  const { data, error, isLoading, mutate } = useSWR<{ rows: HomeMatch[]; total: number }>(
    ['homeMatches', page, limit, statusFilter] as FetchKey,
    fetchMatchPage,
    {
      revalidateOnFocus: false,
      errorRetryCount: 3,
      errorRetryInterval: 2000,
      keepPreviousData: true,
    },
  );

  const matches = data?.rows ?? [];
  const total   = data?.total ?? 0;

  return {
    matches,
    total,
    loading: isLoading,
    error,
    empty:   !isLoading && !error && matches.length === 0,
    hasMore: (page + 1) * limit < total,
    mutate,
  };
}

// ── Load-more hook (accumulates pages; each page is independently cached) ────

export interface UseHomeMatchesLoadMoreResult {
  matches:     HomeMatch[];
  total:       number;
  loading:     boolean;
  loadingMore: boolean;
  error:       Error | undefined;
  empty:       boolean;
  hasMore:     boolean;
  loadMore:    () => void;
}

export function useHomeMatchesLoadMore(
  limit        = DEFAULT_PAGE_SIZE,
  statusFilter = 'all',
): UseHomeMatchesLoadMoreResult {
  const [currentPage, setCurrentPage] = useState(0);
  const [accumulated, setAccumulated] = useState<HomeMatch[]>([]);
  const [total, setTotal]             = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const seenIds = useRef<Set<string>>(new Set());

  // Reset when filter changes
  useEffect(() => {
    setCurrentPage(0);
    setAccumulated([]);
    setTotal(0);
    setLoadingMore(false);
    seenIds.current = new Set();
  }, [statusFilter, limit]);

  const { data, error, isLoading } = useSWR<{ rows: HomeMatch[]; total: number }>(
    ['homeMatches', currentPage, limit, statusFilter] as FetchKey,
    fetchMatchPage,
    {
      revalidateOnFocus: false,
      errorRetryCount: 3,
      errorRetryInterval: 2000,
    },
  );

  // Merge new page into accumulated list (dedup by id)
  useEffect(() => {
    if (!data || isLoading) return;
    const fresh = data.rows.filter((r) => !seenIds.current.has(r.id));
    if (fresh.length === 0) { setLoadingMore(false); return; }
    fresh.forEach((r) => seenIds.current.add(r.id));
    setAccumulated((prev) => [...prev, ...fresh]);
    setTotal(data.total);
    setLoadingMore(false);
  }, [data, isLoading]);

  const loadMore = useCallback(() => {
    setLoadingMore(true);
    setCurrentPage((p) => p + 1);
  }, []);

  const allMatches = accumulated;

  return {
    matches:     allMatches,
    total,
    loading:     isLoading && accumulated.length === 0,
    loadingMore,
    error,
    empty:       !isLoading && !error && allMatches.length === 0,
    hasMore:     allMatches.length < total,
    loadMore,
  };
}
