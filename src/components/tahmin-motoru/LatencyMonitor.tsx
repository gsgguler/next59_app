interface BrainLatency {
  brain_key: string;
  label: string;
  color: string;
  latency_ms: number | null;
  status: 'success' | 'failed' | 'skipped' | 'pending';
}

interface LatencyMonitorProps {
  results: BrainLatency[];
}

const MAX_MS = 5000;

export default function LatencyMonitor({ results }: LatencyMonitorProps) {
  if (!results.length) {
    return <p className="text-xs text-navy-500 text-center py-4">Henüz sonuç yok</p>;
  }

  return (
    <div className="space-y-2.5">
      {results.map(r => {
        const pct = r.latency_ms != null ? Math.min(100, (r.latency_ms / MAX_MS) * 100) : 0;
        const barColor =
          r.status === 'failed'  ? '#EF4444' :
          r.status === 'skipped' ? '#6B7280' :
          r.latency_ms == null   ? '#374151' :
          r.latency_ms < 1000    ? '#10B981' :
          r.latency_ms < 2500    ? '#F59E0B' : '#EF4444';

        return (
          <div key={r.brain_key}>
            <div className="flex items-center justify-between text-[11px] mb-1">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                <span className="text-navy-300 font-medium">{r.label}</span>
              </div>
              <div className="flex items-center gap-2">
                {r.status === 'pending' && <span className="text-navy-500 animate-pulse">Çalışıyor…</span>}
                {r.status === 'failed' && <span className="text-red-400 font-semibold">HATA</span>}
                {r.status === 'skipped' && <span className="text-navy-500">ATLANDI</span>}
                {r.status === 'success' && r.latency_ms != null && (
                  <span className="font-mono text-white">{r.latency_ms.toLocaleString()}ms</span>
                )}
              </div>
            </div>
            <div className="h-2 rounded-full bg-navy-600/50 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, backgroundColor: barColor }}
              />
            </div>
          </div>
        );
      })}
      <div className="flex justify-between text-[9px] text-navy-600 pt-1">
        <span>0ms</span>
        <span>2.5s</span>
        <span>5s+</span>
      </div>
    </div>
  );
}
