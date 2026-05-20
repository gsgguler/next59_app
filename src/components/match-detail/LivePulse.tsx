import { Radio, Clock } from 'lucide-react';
import type { UIMatch } from '../../types/ui-models';

const INTERVALS = [
  '0-5', '5-10', '10-15', '15-20', '20-25', '25-30',
  '30-35', '35-40', '40-45', '45-50', '50-55', '55-60',
  '60-65', '65-70', '70-75', '75-80', '80-85', '85-90',
];

export default function LivePulse({ match }: { match: UIMatch }) {
  const isLive     = match.status === 'live';
  const isFinished = match.status === 'finished';

  if (!isLive) {
    return (
      <div>
        {/* Contextual banner */}
        <div className={`flex items-center gap-2.5 mb-6 rounded-xl px-4 py-3 border ${
          isFinished
            ? 'bg-navy-800/40 border-navy-700/40'
            : 'bg-navy-900/40 border-navy-800/60'
        }`}>
          <Radio className="w-4 h-4 text-navy-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-navy-300">
              {isFinished ? 'Maç Tamamlandı' : 'Tahmin Bekliyor'}
            </p>
            <p className="text-xs text-navy-500 mt-0.5">
              {isFinished
                ? 'Canlı nabız verisi maç sona erdiğinde kilitlendi.'
                : 'Maç başladığında canlı nabız burada aktifleşecektir.'}
            </p>
          </div>
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
                    <span className="text-[10px] font-semibold text-readable-muted uppercase tracking-wider">
                      Devre Arasi
                    </span>
                    <span className="h-px flex-1 bg-navy-800" />
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-14 text-right">
                    <span className="text-[11px] font-mono text-readable-muted tabular-nums">
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
                      <div className="flex items-center gap-1.5 text-[10px] text-readable-muted">
                        <Clock className="w-3 h-3" />
                        {isFinished ? 'Veri yok' : 'Bekleniyor'}
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

  // Live state — real-time data not yet integrated; show honest waiting state
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-5 bg-emerald-500/8 border border-emerald-500/20 rounded-xl px-4 py-3">
        <span className="relative flex h-3 w-3 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
        </span>
        <div>
          <p className="text-sm font-semibold text-emerald-400">CANLI — Maç Devam Ediyor</p>
          <p className="text-xs text-emerald-600 mt-0.5">Canlı Veri Bekleniyor</p>
        </div>
      </div>

      <div className="space-y-2">
        {INTERVALS.map((interval, i) => {
          const isHalfTime = i === 9;
          return (
            <div key={interval}>
              {isHalfTime && (
                <div className="flex items-center gap-3 py-3">
                  <span className="h-px flex-1 bg-navy-800" />
                  <span className="text-[10px] font-semibold text-readable-muted uppercase tracking-wider">
                    Devre Arasi
                  </span>
                  <span className="h-px flex-1 bg-navy-800" />
                </div>
              )}
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-14 text-right">
                  <span className="text-[11px] font-mono text-readable-muted tabular-nums">
                    {interval}'
                  </span>
                </div>
                <div className="relative flex flex-col items-center shrink-0">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-900/60 border border-emerald-700/40" />
                  {i < INTERVALS.length - 1 && (
                    <div className="w-px h-6 bg-navy-800" />
                  )}
                </div>
                <div className="flex-1 pb-2">
                  <div className="bg-navy-900/40 border border-emerald-800/20 rounded-lg px-3 py-2.5">
                    <div className="flex items-center gap-1.5 text-[10px] text-emerald-700">
                      <Clock className="w-3 h-3" />
                      Canlı Veri Bekleniyor
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
