import { Lock, Clock } from 'lucide-react';
import BrierScoreBadge from './BrierScoreBadge';

export interface SnapshotEntry {
  id: string;
  snapshot_version: number;
  snapshot_type: 'prematch' | 'live' | 'final';
  match_minute: number | null;
  home_prob: number;
  draw_prob: number;
  away_prob: number;
  predicted_outcome: string;
  ensemble_confidence: number;
  actual_outcome: string | null;
  brier_score: number | null;
  was_correct: boolean | null;
  is_locked: boolean;
  created_at: string;
  explanation_json: Record<string, unknown>;
}

interface TahminTimelineProps {
  snapshots: SnapshotEntry[];
  homeTeam: string;
  awayTeam: string;
}

const TYPE_LABEL: Record<string, string> = {
  prematch: 'T-12h Tahmin',
  live: 'Canlı Revizyon',
  final: 'Final Tahmin',
};

const TYPE_COLOR: Record<string, string> = {
  prematch: 'border-blue-600 bg-blue-900/20',
  live: 'border-yellow-600 bg-yellow-900/20',
  final: 'border-emerald-600 bg-emerald-900/20',
};

function OutcomeLabel({ outcome, homeTeam, awayTeam }: { outcome: string; homeTeam: string; awayTeam: string }) {
  if (outcome === 'home_win') return <span className="text-blue-300 font-semibold">{homeTeam} Kazanır</span>;
  if (outcome === 'away_win') return <span className="text-red-300 font-semibold">{awayTeam} Kazanır</span>;
  return <span className="text-yellow-300 font-semibold">Beraberlik</span>;
}

export default function TahminTimeline({ snapshots, homeTeam, awayTeam }: TahminTimelineProps) {
  if (!snapshots.length) {
    return <p className="text-sm text-navy-400 py-4 text-center">Henüz tahmin yok</p>;
  }

  return (
    <div className="relative">
      <div className="absolute left-4 top-0 bottom-0 w-px bg-navy-600" />
      <div className="space-y-4">
        {snapshots.map((snap) => (
          <div key={snap.id} className="relative pl-10">
            <div className={`absolute left-2 top-3 w-4 h-4 rounded-full border-2 flex items-center justify-center ${snap.is_locked ? 'border-champagne bg-navy-700' : 'border-navy-500 bg-navy-700'}`}>
              {snap.is_locked
                ? <Lock className="w-2 h-2 text-champagne" />
                : <Clock className="w-2 h-2 text-navy-400" />
              }
            </div>

            <div className={`rounded-xl border ${TYPE_COLOR[snap.snapshot_type] ?? 'border-navy-600 bg-navy-700/40'} p-4`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">
                    v{snap.snapshot_version} · {TYPE_LABEL[snap.snapshot_type]}
                  </span>
                  {snap.match_minute != null && (
                    <span className="text-[10px] text-yellow-400 font-semibold">{snap.match_minute}'</span>
                  )}
                  {snap.is_locked && <Lock className="w-3 h-3 text-champagne" />}
                </div>
                <div className="flex items-center gap-2">
                  <BrierScoreBadge score={snap.brier_score} size="sm" />
                  {snap.was_correct != null && (
                    <span className={`text-xs font-bold ${snap.was_correct ? 'text-emerald-400' : 'text-red-400'}`}>
                      {snap.was_correct ? '✓ DOĞRU' : '✗ YANLIŞ'}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="text-center rounded-lg bg-navy-600/40 py-2">
                  <p className="text-[10px] text-navy-400 mb-0.5">{homeTeam}</p>
                  <p className="text-sm font-bold text-white">{(snap.home_prob * 100).toFixed(0)}%</p>
                </div>
                <div className="text-center rounded-lg bg-navy-600/40 py-2">
                  <p className="text-[10px] text-navy-400 mb-0.5">Beraberlik</p>
                  <p className="text-sm font-bold text-white">{(snap.draw_prob * 100).toFixed(0)}%</p>
                </div>
                <div className="text-center rounded-lg bg-navy-600/40 py-2">
                  <p className="text-[10px] text-navy-400 mb-0.5">{awayTeam}</p>
                  <p className="text-sm font-bold text-white">{(snap.away_prob * 100).toFixed(0)}%</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5 text-navy-300">
                  <span>Tahmin:</span>
                  <OutcomeLabel outcome={snap.predicted_outcome} homeTeam={homeTeam} awayTeam={awayTeam} />
                </div>
                <div className="text-navy-400">
                  Güven: <span className="text-white font-semibold">{(snap.ensemble_confidence * 100).toFixed(0)}%</span>
                </div>
              </div>

              {snap.actual_outcome && (
                <div className="mt-2 pt-2 border-t border-navy-600/40 flex items-center gap-1.5 text-[11px] text-navy-300">
                  <span>Gerçek Sonuç:</span>
                  <OutcomeLabel outcome={snap.actual_outcome} homeTeam={homeTeam} awayTeam={awayTeam} />
                </div>
              )}

              <p className="text-[10px] text-navy-500 mt-2">
                {new Date(snap.created_at).toLocaleString('tr-TR')}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
