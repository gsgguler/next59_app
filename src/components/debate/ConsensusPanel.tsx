import { Scale, Download, Hash } from 'lucide-react';

interface ConsensusPanelProps {
  consensusSummary: string;
  consensusReached: boolean;
  averageConfidence: number;
  sealRetrievalKey?: string | null;
}

export default function ConsensusPanel({
  consensusSummary,
  consensusReached,
  averageConfidence,
  sealRetrievalKey,
}: ConsensusPanelProps) {
  const confPct = Math.round(averageConfidence * 100);

  return (
    <div className="bg-gradient-to-br from-navy-700 to-navy-800 rounded-xl p-6 text-white">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
          <Scale className="w-5 h-5 text-gold-400" />
        </div>
        <div>
          <h3 className="text-lg font-bold">Panel Karari</h3>
          <p className="text-xs text-navy-300">
            {consensusReached ? 'Uzlasma saglandi' : 'Uzlasma saglanamadi'}
          </p>
        </div>
      </div>

      <p className="text-sm text-navy-100 leading-relaxed mb-5">{consensusSummary}</p>

      <div className="flex items-center gap-6 mb-5 py-3 border-y border-navy-600">
        <div>
          <p className="text-xs text-navy-400 mb-0.5">Genel Guven</p>
          <p className="text-xl font-bold text-gold-400">%{confPct}</p>
        </div>
        <div>
          <p className="text-xs text-navy-400 mb-0.5">Karar</p>
          <p className="text-xl font-bold">
            {consensusReached ? (
              <span className="text-emerald-400">Onaylandi</span>
            ) : (
              <span className="text-orange-400">Belirsiz</span>
            )}
          </p>
        </div>
      </div>

      {sealRetrievalKey && (
        <div className="flex items-center gap-2 text-xs text-navy-400 mb-4">
          <Hash className="w-3.5 h-3.5" />
          <span className="font-mono">{sealRetrievalKey}</span>
        </div>
      )}

      <button
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-white/10 text-white text-sm font-medium hover:bg-white/15 transition-colors cursor-not-allowed opacity-60"
        disabled
      >
        <Download className="w-4 h-4" />
        Raporu Indir (Yakin Zamanda)
      </button>
    </div>
  );
}
