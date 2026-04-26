import { Check, X, Clock } from 'lucide-react';

const config = {
  correct: {
    icon: Check,
    label: 'Doğru',
    cls: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  },
  incorrect: {
    icon: X,
    label: 'Yanlış',
    cls: 'text-red-400 bg-red-400/10 border-red-400/20',
  },
  pending: {
    icon: Clock,
    label: 'Bekleniyor',
    cls: 'text-navy-400 bg-navy-800 border-navy-700',
  },
} as const;

export default function PredictionBadge({ status }: { status: 'correct' | 'incorrect' | 'pending' }) {
  const { icon: Icon, label, cls } = config[status];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium rounded-full px-2 py-0.5 border ${cls}`}>
      <Icon className="w-2.5 h-2.5" />
      {label}
    </span>
  );
}
