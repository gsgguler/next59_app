import { ShieldCheck, ShieldAlert, Shield } from 'lucide-react';

const config = {
  high: {
    label: 'Yüksek Güven',
    icon: ShieldCheck,
    text: 'text-emerald-700',
    bg: 'bg-emerald-50 border-emerald-200',
  },
  medium: {
    label: 'Orta Güven',
    icon: Shield,
    text: 'text-yellow-700',
    bg: 'bg-yellow-50 border-yellow-200',
  },
  low: {
    label: 'Düşük Güven',
    icon: ShieldAlert,
    text: 'text-gray-600',
    bg: 'bg-gray-50 border-gray-200',
  },
} as const;

interface ConfidenceBadgeProps {
  level: 'low' | 'medium' | 'high';
  size?: 'sm' | 'md';
}

export default function ConfidenceBadge({ level, size = 'md' }: ConfidenceBadgeProps) {
  const c = config[level] ?? config.medium;
  const Icon = c.icon;
  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';

  return (
    <span className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${padding} ${c.bg} ${c.text}`}>
      <Icon className={iconSize} />
      {c.label}
    </span>
  );
}
