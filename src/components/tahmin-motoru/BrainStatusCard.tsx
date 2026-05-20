import { Activity, TrendingUp, Brain, Eye, Cloud, Newspaper } from 'lucide-react';

export interface BrainConfig {
  brain_key: string;
  display_name: string;
  role_description: string;
  default_weight: number;
  is_active: boolean;
  is_live_only: boolean;
}

export interface BrainPerf {
  brain_key: string;
  brier_score_7d: number | null;
  accuracy_7d: number | null;
  sample_count_7d: number;
}

interface BrainStatusCardProps {
  brain: BrainConfig;
  perf?: BrainPerf;
  lastOutput?: {
    winner_prob?: { home: number; draw: number; away: number };
    confidence?: number;
  } | null;
}

const BRAIN_META: Record<string, { color: string; bg: string; border: string; icon: typeof Brain }> = {
  tactical:      { color: '#FF6B6B', bg: 'bg-red-900/20',    border: 'border-red-700/40',    icon: Activity },
  statistical:   { color: '#4ECDC4', bg: 'bg-teal-900/20',   border: 'border-teal-700/40',   icon: TrendingUp },
  psychological: { color: '#9B59B6', bg: 'bg-purple-900/20', border: 'border-purple-700/40', icon: Brain },
  live:          { color: '#F39C12', bg: 'bg-yellow-900/20', border: 'border-yellow-700/40', icon: Eye },
  conditions:    { color: '#3498DB', bg: 'bg-blue-900/20',   border: 'border-blue-700/40',   icon: Cloud },
  news:          { color: '#2ECC71', bg: 'bg-emerald-900/20',border: 'border-emerald-700/40',icon: Newspaper },
};

export default function BrainStatusCard({ brain, perf, lastOutput }: BrainStatusCardProps) {
  const meta = BRAIN_META[brain.brain_key] ?? BRAIN_META.tactical;
  const Icon = meta.icon;
  const weightPct = Math.round(brain.default_weight * 100);

  return (
    <div className={`rounded-xl border ${meta.border} ${meta.bg} p-4 flex flex-col gap-3`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: meta.color + '22', border: `1px solid ${meta.color}44` }}>
            <Icon className="w-4 h-4" style={{ color: meta.color }} />
          </div>
          <div>
            <p className="text-xs font-semibold text-white leading-none">{brain.display_name.toUpperCase()}</p>
            <p className="text-[10px] text-navy-400 mt-0.5 leading-tight">{brain.role_description.slice(0, 40)}</p>
          </div>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${brain.is_active ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/40' : 'bg-red-900/40 text-red-400 border border-red-700/40'}`}>
          {brain.is_active ? 'AKTİF' : 'PASİF'}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="flex justify-between text-[10px] text-navy-400 mb-1">
            <span>Ağırlık</span>
            <span style={{ color: meta.color }} className="font-bold">{weightPct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-navy-600/60 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${weightPct}%`, backgroundColor: meta.color }} />
          </div>
        </div>
        {brain.is_live_only && (
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-yellow-900/40 text-yellow-400 border border-yellow-700/40 shrink-0">CANLI</span>
        )}
      </div>

      {(perf || lastOutput) && (
        <div className="grid grid-cols-3 gap-1 pt-1 border-t border-navy-600/40">
          <div className="text-center">
            <p className="text-[10px] text-navy-400">Brier 7g</p>
            <p className="text-xs font-mono font-bold text-white">{perf?.brier_score_7d != null ? perf.brier_score_7d.toFixed(3) : '—'}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-navy-400">Kes. 7g</p>
            <p className="text-xs font-mono font-bold text-white">{perf?.accuracy_7d != null ? `${(perf.accuracy_7d * 100).toFixed(0)}%` : '—'}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-navy-400">Güven</p>
            <p className="text-xs font-mono font-bold text-white">{lastOutput?.confidence != null ? `${(lastOutput.confidence * 100).toFixed(0)}%` : '—'}</p>
          </div>
        </div>
      )}
    </div>
  );
}
