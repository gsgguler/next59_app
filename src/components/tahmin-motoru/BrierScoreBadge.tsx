interface BrierScoreBadgeProps {
  score: number | null | undefined;
  size?: 'sm' | 'md';
}

export default function BrierScoreBadge({ score, size = 'md' }: BrierScoreBadgeProps) {
  if (score == null) {
    return (
      <span className={`inline-flex items-center rounded font-mono font-semibold text-navy-400 bg-navy-600/40 ${size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'}`}>
        —
      </span>
    );
  }

  const color =
    score <= 0.10 ? 'text-emerald-400 bg-emerald-900/30 border border-emerald-700/50' :
    score <= 0.20 ? 'text-green-400 bg-green-900/30 border border-green-700/50' :
    score <= 0.30 ? 'text-yellow-400 bg-yellow-900/30 border border-yellow-700/50' :
    'text-red-400 bg-red-900/30 border border-red-700/50';

  return (
    <span className={`inline-flex items-center rounded font-mono font-semibold ${color} ${size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'}`}>
      B:{score.toFixed(3)}
    </span>
  );
}
