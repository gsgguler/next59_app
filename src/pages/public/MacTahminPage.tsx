import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Brain, RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import TahminTimeline, { type SnapshotEntry } from '../../components/tahmin-motoru/TahminTimeline';
import BrainDetailPanel from '../../components/tahmin-motoru/BrainDetailPanel';
import LiveMatchWidget from '../../components/tahmin-motoru/LiveMatchWidget';
import BrierScoreBadge from '../../components/tahmin-motoru/BrierScoreBadge';

interface MatchInfo {
  id: string;
  home_team: string;
  away_team: string;
  status: string;
  kickoff_utc: string | null;
  competition_name: string | null;
  timestamp: number | null;
}

const OUTCOME_LABELS: Record<string, { label: string; color: string }> = {
  home_win: { label: 'Ev Sahibi Kazanır', color: 'text-blue-400' },
  draw:     { label: 'Beraberlik',        color: 'text-yellow-400' },
  away_win: { label: 'Deplasman Kazanır', color: 'text-red-400' },
};

export default function MacTahminPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const [resolvedId, setResolvedId] = useState<string | null>(null);
  const [matchInfo, setMatchInfo] = useState<MatchInfo | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotEntry[]>([]);
  const [lastRun, setLastRun] = useState<{
    brain_results: Record<string, unknown>;
    effective_weights: Record<string, number>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(30);
  const [liveState, setLiveState] = useState<Record<string, unknown> | null>(null);
  const [lastLiveUpdate, setLastLiveUpdate] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    if (!matchId) return;

    // UUID format check: full UUID has dashes at positions 8,13,18,23
    const isFullUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(matchId);

    // Resolve the real full UUID if we received a short prefix
    let resolvedMatchId = matchId;
    if (!isFullUuid) {
      const { data: found } = await supabase.rpc('find_match_by_prefix', { prefix: matchId });
      if (found) resolvedMatchId = found;
    }

    const [matchRes, snapRes, runRes] = await Promise.all([
      supabase
        .from('matches')
        .select(`
          id,
          status_short,
          timestamp,
          home_team:teams!matches_home_team_id_fkey(name),
          away_team:teams!matches_away_team_id_fkey(name),
          competition_season:competition_seasons!matches_competition_season_id_fkey(
            competition:competitions!competition_seasons_competition_id_fkey(name)
          )
        `)
        .eq('id', resolvedMatchId)
        .maybeSingle(),
      supabase
        .from('ensemble_prediction_snapshots')
        .select('id, match_id, snapshot_version, snapshot_type, match_minute, home_prob, draw_prob, away_prob, predicted_outcome, ensemble_confidence, actual_outcome, brier_score, was_correct, is_locked, created_at, explanation_json')
        .eq('match_id', resolvedMatchId)
        .order('snapshot_version', { ascending: true }),
      supabase
        .from('brain_orchestra_runs')
        .select('brain_results, effective_weights')
        .eq('match_id', resolvedMatchId)
        .eq('status', 'completed')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (matchRes.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = matchRes.data as any;
      setResolvedId(raw.id);
      setMatchInfo({
        id: raw.id,
        home_team: raw.home_team?.name ?? 'Ev Sahibi',
        away_team: raw.away_team?.name ?? 'Deplasman',
        status: raw.status_short ?? '',
        kickoff_utc: raw.timestamp ? new Date(raw.timestamp * 1000).toISOString() : null,
        competition_name: raw.competition_season?.competition?.name ?? null,
        timestamp: raw.timestamp ?? null,
      });
    }
    if (snapRes.data) setSnapshots(snapRes.data as SnapshotEntry[]);
    if (runRes.data) {
      setLastRun({
        brain_results: runRes.data.brain_results as Record<string, unknown>,
        effective_weights: runRes.data.effective_weights as Record<string, number>,
      });
    }
    setLastFetch(new Date());
    setCountdown(30);
    setLoading(false);
  }, [matchId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(n => {
        if (n <= 1) { fetchAll(); return 30; }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [fetchAll]);

  useEffect(() => {
    const effectiveId = resolvedId ?? matchId;
    if (!effectiveId) return;
    const channel = supabase
      .channel(`live-match-${effectiveId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'model_lab',
          table: 'live_match_states',
          filter: `match_id=eq.${effectiveId}`,
        },
        (payload) => {
          setLiveState(payload.new as Record<string, unknown>);
          setLastLiveUpdate(new Date());
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ensemble_prediction_snapshots',
          filter: `match_id=eq.${effectiveId}`,
        },
        () => {
          fetchAll();
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [matchId, resolvedId, fetchAll]);

  const latestSnap = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  const ensembleProbs = latestSnap
    ? { home: latestSnap.home_prob, draw: latestSnap.draw_prob, away: latestSnap.away_prob }
    : null;

  const brainOutputs = lastRun?.brain_results
    ? Object.fromEntries(
        Object.entries(lastRun.brain_results).map(([k, v]) => [k, v as { status: string; latency_ms: number; output: { winner_prob: { home: number; draw: number; away: number }; confidence: number; key_factors?: string[] } | null; error: string | null }])
      )
    : {};

  // suppress unused warning — liveState used for realtime indicator only
  void liveState;

  if (loading) {
    return (
      <div className="min-h-screen bg-navy-900 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-champagne animate-spin" />
      </div>
    );
  }

  if (!matchInfo) {
    return (
      <div className="min-h-screen bg-navy-900 flex flex-col items-center justify-center gap-4">
        <p className="text-navy-400">Maç bulunamadı</p>
        <Link to="/" className="text-champagne hover:underline text-sm">Ana sayfaya dön</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy-900">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">

        <Link
          to={`/mac/${matchId}`}
          className="inline-flex items-center gap-1.5 text-sm text-navy-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Maç detayına dön
        </Link>

        <div className="rounded-2xl border border-navy-600 bg-navy-800/60 overflow-hidden">
          <div className="px-6 pt-6 pb-4">
            {matchInfo.competition_name && (
              <p className="text-[11px] font-semibold text-champagne uppercase tracking-widest mb-2">{matchInfo.competition_name}</p>
            )}
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-bold text-white">
                {matchInfo.home_team} <span className="text-navy-500">—</span> {matchInfo.away_team}
              </h1>
              <div className="flex items-center gap-2 text-xs text-navy-500">
                <RefreshCw className="w-3 h-3" />
                <span>{countdown}s</span>
              </div>
            </div>

            {ensembleProbs && (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: matchInfo.home_team, prob: ensembleProbs.home, color: 'border-blue-600/50 bg-blue-900/20', textColor: 'text-blue-400' },
                  { label: 'Beraberlik',        prob: ensembleProbs.draw, color: 'border-yellow-600/50 bg-yellow-900/20', textColor: 'text-yellow-400' },
                  { label: matchInfo.away_team,  prob: ensembleProbs.away, color: 'border-red-600/50 bg-red-900/20',  textColor: 'text-red-400' },
                ].map(({ label, prob, color, textColor }) => (
                  <div key={label} className={`rounded-xl border ${color} px-4 py-3 text-center`}>
                    <p className="text-[10px] text-navy-400 mb-1 truncate">{label}</p>
                    <p className={`text-2xl font-black ${textColor}`}>{(prob * 100).toFixed(0)}%</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {latestSnap && (
            <div className="px-6 py-3 border-t border-navy-600/40 bg-navy-700/20 flex items-center flex-wrap gap-4 text-xs text-navy-400">
              <span>
                Tahmin:&nbsp;
                <span className={`font-semibold ${OUTCOME_LABELS[latestSnap.predicted_outcome]?.color ?? 'text-white'}`}>
                  {OUTCOME_LABELS[latestSnap.predicted_outcome]?.label ?? latestSnap.predicted_outcome}
                </span>
              </span>
              <span>
                Güven: <span className="text-white font-semibold">{(latestSnap.ensemble_confidence * 100).toFixed(0)}%</span>
              </span>
              <BrierScoreBadge score={latestSnap.brier_score} size="sm" />
              {latestSnap.was_correct != null && (
                <span className={`inline-flex items-center gap-1 font-bold ${latestSnap.was_correct ? 'text-emerald-400' : 'text-red-400'}`}>
                  {latestSnap.was_correct
                    ? <><TrendingUp className="w-3.5 h-3.5" /> DOĞRU</>
                    : <><TrendingDown className="w-3.5 h-3.5" /> YANLIŞ</>
                  }
                </span>
              )}
              {latestSnap.was_correct == null && (
                <span className="inline-flex items-center gap-1 text-navy-500">
                  <Minus className="w-3.5 h-3.5" /> Sonuç bekleniyor
                </span>
              )}
              {lastLiveUpdate && (
                <span className="text-yellow-400">Realtime: {lastLiveUpdate.toLocaleTimeString('tr-TR')}</span>
              )}
              {lastFetch && (
                <span className="ml-auto">Son güncelleme: {lastFetch.toLocaleTimeString('tr-TR')}</span>
              )}
            </div>
          )}
        </div>

        <LiveMatchWidget
          matchId={matchId!}
          homeTeam={matchInfo.home_team}
          awayTeam={matchInfo.away_team}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-navy-600 bg-navy-800/40 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Brain className="w-4 h-4 text-champagne" />
              <h2 className="text-sm font-semibold text-white">Tahmin Zaman Çizelgesi</h2>
              <span className="text-[10px] text-navy-500 ml-auto">{snapshots.length} versiyon</span>
            </div>
            <TahminTimeline
              snapshots={snapshots}
              homeTeam={matchInfo.home_team}
              awayTeam={matchInfo.away_team}
            />
          </div>

          <div className="rounded-xl border border-navy-600 bg-navy-800/40 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Brain className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-semibold text-white">Beyin Detayları</h2>
            </div>
            {lastRun ? (
              <BrainDetailPanel
                brainOutputs={brainOutputs}
                effectiveWeights={lastRun.effective_weights ?? {}}
                homeTeam={matchInfo.home_team}
                awayTeam={matchInfo.away_team}
              />
            ) : (
              <p className="text-sm text-navy-500 text-center py-6">Bu maç için beyin çıktısı bulunamadı</p>
            )}
          </div>
        </div>

        <p className="text-[11px] text-navy-600 text-center leading-relaxed max-w-2xl mx-auto">
          Bu tahminler istatistiksel modeller tarafından üretilmektedir. Sonuçları garanti etmez ve bahis amaçlı kullanılamaz.
          Olasılıklar maç koşullarına göre otomatik olarak güncellenir.
        </p>

      </div>
    </div>
  );
}
