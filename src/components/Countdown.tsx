import { useState, useEffect } from 'react';

interface CountdownProps {
  compact?: boolean;
}

const WC_KICKOFF = new Date('2026-06-11T00:00:00-04:00').getTime();

function calcRemaining() {
  const diff = Math.max(0, WC_KICKOFF - Date.now());
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

export default function Countdown({ compact = false }: CountdownProps) {
  const [time, setTime] = useState(calcRemaining);

  useEffect(() => {
    const id = setInterval(() => setTime(calcRemaining()), 1000);
    return () => clearInterval(id);
  }, []);

  const blocks = [
    { value: time.days, label: 'GUN' },
    { value: time.hours, label: 'SAAT' },
    { value: time.minutes, label: 'DAK' },
    { value: time.seconds, label: 'SAN' },
  ];

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        {blocks.map((b, i) => (
          <span key={b.label} className="flex items-center gap-1.5">
            <span className="font-mono text-sm font-bold text-champagne tabular-nums">
              {String(b.value).padStart(2, '0')}
            </span>
            {i < blocks.length - 1 && (
              <span className="text-champagne/40 text-xs">:</span>
            )}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-3 sm:gap-5">
      {blocks.map((b, i) => (
        <div key={b.label} className="flex items-center gap-3 sm:gap-5">
          <div className="flex flex-col items-center">
            <span className="font-mono text-4xl sm:text-6xl lg:text-7xl font-bold text-champagne tabular-nums leading-none tracking-tight">
              {String(b.value).padStart(2, '0')}
            </span>
            <span className="mt-2 text-[10px] sm:text-xs font-semibold tracking-[0.2em] text-navy-400 uppercase">
              {b.label}
            </span>
          </div>
          {i < blocks.length - 1 && (
            <span className="text-champagne/30 text-3xl sm:text-5xl lg:text-6xl font-light -mt-4">
              :
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
