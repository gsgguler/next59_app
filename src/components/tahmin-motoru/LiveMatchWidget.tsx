import { useEffect, useState } from 'react';
import { Wifi, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface LiveState {
  id: string;
  match_id: string;
  elapsed: number | null;
  home_score: number;
  away_score: number;
  status: string;
  momentum_score: number | null;
  pressure_index: number | null;
}

interface LiveMatchWidgetProps {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  onLiveUpdate?: (state: LiveState) => void;
}

export default function LiveMatchWidget({ matchId, homeTeam, awayTeam, onLiveUpdate }: LiveMatchWidgetProps) {
  const [liveState, setLiveState] = useState<LiveState | null>(null);
  const [nextRefreshIn, setNextRefreshIn] = useState(30);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function fetchLiveState() {
    const { data } = await supabase
      .from('matches')
      .select('id, elapsed, home_score, away_score, status')
      .eq('id', matchId)
      .maybeSingle();

    if (data) {
      const state: LiveState = {
        id: data.id,
        match_id: data.id,
        elapsed: data.elapsed,
        home_score: data.home_score ?? 0,
        away_score: data.away_score ?? 0,
        status: data.status,
        momentum_score: null,
        pressure_index: null,
      };
      setLiveState(state);
      setLastUpdated(new Date());
      onLiveUpdate?.(state);
    }
  }

  useEffect(() => {
    fetchLiveState();

    const interval = setInterval(() => {
      setNextRefreshIn((n) => {
        if (n <= 1) {
          fetchLiveState();
          return 30;
        }
        return n - 1;
      });
    }, 1000);

    // Realtime subscription
    const channel = supabase
      .channel(`live-match-widget-${matchId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
        (payload) => {
          const d = payload.new as Record<string, unknown>;
          const state: LiveState = {
            id: d.id as string,
            match_id: d.id as string,
            elapsed: d.elapsed as number | null,
            home_score: (d.home_score as number) ?? 0,
            away_score: (d.away_score as number) ?? 0,
            status: d.status as string,
            momentum_score: null,
            pressure_index: null,
          };
          setLiveState(state);
          setLastUpdated(new Date());
          onLiveUpdate?.(state);
          setNextRefreshIn(30);
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      channel.unsubscribe().finally(() => {
        supabase.removeChannel(channel);
      });
    };
  }, [matchId]);

  const liveStatuses = ['1H', 'HT', '2H', 'ET', 'BT'];
  const isLive = liveState && liveStatuses.includes(liveState.status);

  if (!liveState || !isLive) return null;

  return (
    <div className="rounded-xl border border-yellow-600/50 bg-yellow-900/10 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-400" />
          </span>
          <span className="text-xs font-bold text-yellow-400">CANLI</span>
          {liveState.elapsed != null && (
            <span className="text-sm font-bold text-white">{liveState.elapsed}'</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-navy-400">
          <Clock className="w-3 h-3" />
          <span>{nextRefreshIn}s</span>
          <Wifi className="w-3 h-3" />
        </div>
      </div>

      <div className="flex items-center justify-center gap-6 py-2">
        <div className="text-right">
          <p className="text-xs text-navy-300 mb-1">{homeTeam}</p>
          <p className="text-3xl font-black text-white tabular-nums">{liveState.home_score}</p>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-navy-400">–</div>
          <p className="text-[10px] text-navy-500 mt-1">{liveState.status}</p>
        </div>
        <div className="text-left">
          <p className="text-xs text-navy-300 mb-1">{awayTeam}</p>
          <p className="text-3xl font-black text-white tabular-nums">{liveState.away_score}</p>
        </div>
      </div>

      {lastUpdated && (
        <p className="text-[10px] text-navy-500 text-center mt-3">
          Son güncelleme: {lastUpdated.toLocaleTimeString('tr-TR')}
        </p>
      )}
    </div>
  );
}
