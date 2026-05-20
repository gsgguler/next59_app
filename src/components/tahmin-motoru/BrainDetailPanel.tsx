import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface BrainOutput {
  status: string;
  latency_ms: number;
  output: {
    winner_prob: { home: number; draw: number; away: number };
    confidence: number;
    key_factors?: string[];
    [key: string]: unknown;
  } | null;
  error: string | null;
}

interface BrainDetailPanelProps {
  brainOutputs: Record<string, BrainOutput>;
  effectiveWeights: Record<string, number>;
  homeTeam: string;
  awayTeam: string;
}

const BRAIN_LABELS: Record<string, { label: string; color: string }> = {
  tactical:      { label: 'Taktik Analist',    color: '#FF6B6B' },
  statistical:   { label: 'İstatistik Uzmanı', color: '#4ECDC4' },
  psychological: { label: 'Psikoloji Uzmanı',  color: '#9B59B6' },
  live:          { label: 'Canlı Gözlemci',    color: '#F39C12' },
  conditions:    { label: 'Koşullar Analisti', color: '#3498DB' },
  news:          { label: 'Haber Analisti',    color: '#2ECC71' },
};

export default function BrainDetailPanel({ brainOutputs, effectiveWeights, homeTeam, awayTeam }: BrainDetailPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const keys = Object.keys(BRAIN_LABELS);

  return (
    <div className="space-y-2">
      {keys.map((bk) => {
        const meta = BRAIN_LABELS[bk];
        const bo = brainOutputs[bk];
        const weight = effectiveWeights[bk] ?? 0;
        const isOpen = expanded === bk;

        return (
          <div key={bk} className="rounded-xl border border-navy-600 overflow-hidden">
            <button
              onClick={() => setExpanded(isOpen ? null : bk)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-navy-600/30 transition-colors"
            >
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
              <span className="text-sm font-semibold text-white flex-1 text-left">{meta.label}</span>
              <span className="text-xs text-navy-400 font-mono">{(weight * 100).toFixed(0)}%</span>
              {bo?.status === 'success' && bo.output && (
                <div className="flex gap-1.5 text-[11px]">
                  <span className="text-blue-300">{(bo.output.winner_prob.home * 100).toFixed(0)}%</span>
                  <span className="text-navy-400">/</span>
                  <span className="text-yellow-300">{(bo.output.winner_prob.draw * 100).toFixed(0)}%</span>
                  <span className="text-navy-400">/</span>
                  <span className="text-red-300">{(bo.output.winner_prob.away * 100).toFixed(0)}%</span>
                </div>
              )}
              {bo?.status === 'failed' && <span className="text-[10px] text-red-400 font-semibold">HATA</span>}
              {bo?.status === 'skipped' && <span className="text-[10px] text-navy-500 font-semibold">ATLA</span>}
              {!bo && <span className="text-[10px] text-navy-500">—</span>}
              {isOpen ? <ChevronUp className="w-4 h-4 text-navy-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-navy-400 shrink-0" />}
            </button>

            {isOpen && (
              <div className="px-4 pb-4 border-t border-navy-600/50">
                {bo?.status === 'success' && bo.output ? (
                  <div className="pt-3 space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg bg-navy-600/40 px-3 py-2 text-center">
                        <p className="text-[10px] text-navy-400 mb-1">{homeTeam}</p>
                        <p className="text-base font-bold" style={{ color: meta.color }}>{(bo.output.winner_prob.home * 100).toFixed(1)}%</p>
                      </div>
                      <div className="rounded-lg bg-navy-600/40 px-3 py-2 text-center">
                        <p className="text-[10px] text-navy-400 mb-1">Beraberlik</p>
                        <p className="text-base font-bold text-yellow-300">{(bo.output.winner_prob.draw * 100).toFixed(1)}%</p>
                      </div>
                      <div className="rounded-lg bg-navy-600/40 px-3 py-2 text-center">
                        <p className="text-[10px] text-navy-400 mb-1">{awayTeam}</p>
                        <p className="text-base font-bold text-red-300">{(bo.output.winner_prob.away * 100).toFixed(1)}%</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-navy-300">
                      <span>Güven: <strong className="text-white">{(bo.output.confidence * 100).toFixed(0)}%</strong></span>
                      <span>Süre: <strong className="text-white font-mono">{bo.latency_ms}ms</strong></span>
                    </div>
                    {Array.isArray(bo.output.key_factors) && bo.output.key_factors.length > 0 && (
                      <div>
                        <p className="text-[10px] text-navy-400 mb-1.5">Anahtar Faktörler</p>
                        <ul className="space-y-1">
                          {(bo.output.key_factors as string[]).map((f, i) => (
                            <li key={i} className="text-[11px] text-navy-200 flex items-start gap-1.5">
                              <span style={{ color: meta.color }} className="shrink-0 mt-0.5">›</span>
                              {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : bo?.status === 'failed' ? (
                  <div className="pt-3">
                    <p className="text-xs text-red-400 bg-red-900/20 rounded px-3 py-2 border border-red-700/30">
                      {bo.error ?? 'Brain çalışmadı'}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-navy-500 pt-3">Bu run için veri yok</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
