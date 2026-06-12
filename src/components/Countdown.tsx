import { useState, useEffect } from 'react';
import {
  getWorldCupCountdown,
  getCountdownFromTarget,
  getActiveCountdownFixture,
} from '../lib/worldCupCountdown';
import { ALL_WC2026_FIXTURES } from '../data/worldCup2026Fixtures';

interface CountdownProps {
  compact?: boolean;
  /**
   * Optional override: countdown to this UTC timestamp (ms).
   * When omitted, uses getActiveCountdownFixture() to pick the next/live match.
   */
  targetMs?: number;
}

export default function Countdown({ compact = false, targetMs }: CountdownProps) {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Resolve target: explicit prop > dynamic selection > legacy opening match
  const activeTargetMs = getActiveCountdownFixture(ALL_WC2026_FIXTURES, new Map(), now).targetMs;
  const resolvedTargetMs = targetMs ?? (activeTargetMs || (getWorldCupCountdown(now).totalMs + now));

  const time = getCountdownFromTarget(resolvedTargetMs, now);

  const blocks = [
    { value: time.days,    label: 'GUN' },
    { value: time.hours,   label: 'SAAT' },
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
