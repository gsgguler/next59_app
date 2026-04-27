import { useEffect, useState } from 'react';
import { useUserTimezone } from '../hooks/useUserTimezone';
import { useTranslation } from 'react-i18next';
import { WC_2026 } from '../config/events';

interface Props {
  targetUtc?: string;
  label?: string;
  onComplete?: () => void;
  variant?: 'big' | 'inline';
  compact?: boolean;
}

function getDiff(targetUtc: string) {
  const total = Math.max(0, new Date(targetUtc).getTime() - Date.now());
  return {
    days: Math.floor(total / (1000 * 60 * 60 * 24)),
    hours: Math.floor((total / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((total / (1000 * 60)) % 60),
    seconds: Math.floor((total / 1000) % 60),
    total,
  };
}

export function Countdown({ targetUtc = WC_2026.kickoffUtc, label, onComplete, variant, compact }: Props) {
  const { t } = useTranslation();
  const userTz = useUserTimezone();
  const [diff, setDiff] = useState(() => getDiff(targetUtc));

  const resolvedVariant = variant ?? (compact ? 'inline' : 'big');

  useEffect(() => {
    const id = setInterval(() => {
      const d = getDiff(targetUtc);
      setDiff(d);
      if (d.total === 0) { clearInterval(id); onComplete?.(); }
    }, 1000);
    return () => clearInterval(id);
  }, [targetUtc, onComplete]);

  if (diff.total === 0) return <span className="text-amber-500 font-bold">{t('countdown.live')}</span>;

  if (resolvedVariant === 'inline') {
    return (
      <span className="font-mono text-sm tabular-nums">
        {diff.days > 0 && `${diff.days}${t('countdown.short.day')} `}
        {String(diff.hours).padStart(2, '0')}:
        {String(diff.minutes).padStart(2, '0')}:
        {String(diff.seconds).padStart(2, '0')}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center">
      {label && <p className="text-sm uppercase tracking-widest text-white/60 mb-4">{label}</p>}
      <div className="flex gap-4 md:gap-8">
        {[
          { v: diff.days, l: t('countdown.days') },
          { v: diff.hours, l: t('countdown.hours') },
          { v: diff.minutes, l: t('countdown.minutes') },
          { v: diff.seconds, l: t('countdown.seconds') }
        ].map((item, i) => (
          <div key={i} className="flex flex-col items-center min-w-[60px] md:min-w-[80px]">
            <span className="font-syne text-4xl md:text-6xl tabular-nums font-bold text-white">{String(item.v).padStart(2, '0')}</span>
            <span className="text-xs md:text-sm uppercase tracking-wider text-white/50 mt-2">{item.l}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-white/40 mt-4">{t('countdown.your_time_zone', { tz: userTz })}</p>
    </div>
  );
}

export default Countdown;
