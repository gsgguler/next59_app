import { Radio, Clock } from 'lucide-react';
import type { MatchData } from '../../data/mockMatches';

const INTERVALS = [
  '0-5', '5-10', '10-15', '15-20', '20-25', '25-30',
  '30-35', '35-40', '40-45', '45-50', '50-55', '55-60',
  '60-65', '65-70', '70-75', '75-80', '80-85', '85-90',
];

export default function LivePulse({ match }: { match: MatchData }) {
  if (match.status !== 'live') {
    return (
      <div>
        <div className="flex items-center gap-2 mb-6">
          <Radio className="w-4 h-4 text-navy-600" />
          <p className="text-sm text-navy-400">
            Maç başladığında canlı AI analizleri burada görünecektir.
          </p>
        </div>

        {/* Skeleton timeline */}
        <div className="space-y-2">
          {INTERVALS.map((interval, i) => {
            const isHalfTime = i === 9;
            return (
              <div key={interval}>
                {isHalfTime && (
                  <div className="flex items-center gap-3 py-3">
                    <span className="h-px flex-1 bg-navy-800" />
                    <span className="text-[10px] font-semibold text-navy-600 uppercase tracking-wider">
                      Devre Arasi
                    </span>
                    <span className="h-px flex-1 bg-navy-800" />
                  </div>
                )}
                <div className="flex items-start gap-3">
                  {/* Time marker */}
                  <div className="shrink-0 w-14 text-right">
                    <span className="text-[11px] font-mono text-navy-600 tabular-nums">
                      {interval}'
                    </span>
                  </div>

                  {/* Connector */}
                  <div className="relative flex flex-col items-center shrink-0">
                    <div className="w-2.5 h-2.5 rounded-full bg-navy-800 border border-navy-700" />
                    {i < INTERVALS.length - 1 && (
                      <div className="w-px h-6 bg-navy-800" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 pb-2">
                    <div className="bg-navy-900/40 border border-navy-800/60 rounded-lg px-3 py-2.5">
                      <div className="flex items-center gap-1.5 text-[10px] text-navy-600">
                        <Clock className="w-3 h-3" />
                        Bekleniyor
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Live state -- currently showing placeholder since live data requires real-time API
  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
        </span>
        <p className="text-sm font-semibold text-emerald-400">
          CANLI — Maç Devam Ediyor
        </p>
      </div>

      <div className="space-y-2">
        {INTERVALS.map((interval, i) => {
          const isHalfTime = i === 9;
          return (
            <div key={interval}>
              {isHalfTime && (
                <div className="flex items-center gap-3 py-3">
                  <span className="h-px flex-1 bg-navy-800" />
                  <span className="text-[10px] font-semibold text-navy-600 uppercase tracking-wider">
                    Devre Arasi
                  </span>
                  <span className="h-px flex-1 bg-navy-800" />
                </div>
              )}
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-14 text-right">
                  <span className="text-[11px] font-mono text-navy-600 tabular-nums">
                    {interval}'
                  </span>
                </div>

                <div className="relative flex flex-col items-center shrink-0">
                  <div className="w-2.5 h-2.5 rounded-full bg-navy-800 border border-navy-700" />
                  {i < INTERVALS.length - 1 && (
                    <div className="w-px h-6 bg-navy-800" />
                  )}
                </div>

                <div className="flex-1 pb-2">
                  <div className="bg-navy-900/40 border border-navy-800/60 rounded-lg px-3 py-2.5">
                    <div className="flex items-center gap-1.5 text-[10px] text-navy-600">
                      <Clock className="w-3 h-3" />
                      Canlı veri bekleniyor...
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
