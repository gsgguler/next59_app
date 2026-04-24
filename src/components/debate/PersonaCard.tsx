import { useState } from 'react';
import { Bot, ChevronDown, ChevronUp } from 'lucide-react';

const personaConfig: Record<string, { name: string; color: string; bg: string; ring: string }> = {
  bas_hakem: {
    name: 'Bas Hakem',
    color: 'text-navy-700',
    bg: 'bg-navy-50',
    ring: 'ring-navy-200',
  },
  veri_analisti: {
    name: 'Veri Analisti',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    ring: 'ring-blue-200',
  },
  stratejist: {
    name: 'Stratejist',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    ring: 'ring-emerald-200',
  },
  matematikci: {
    name: 'Matematikci',
    color: 'text-orange-700',
    bg: 'bg-orange-50',
    ring: 'ring-orange-200',
  },
};

const voteConfig: Record<string, { label: string; color: string; bg: string }> = {
  onay: { label: 'ONAY', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  red: { label: 'RED', color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
  cekimser: { label: 'CEKIMSER', color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200' },
};

interface PersonaCardProps {
  persona: string;
  analysisText: string;
  vote: string | null;
  confidence: number | null;
  tokensInput: number | null;
  tokensOutput: number | null;
  estimatedCostUsd: number | null;
}

export default function PersonaCard({
  persona,
  analysisText,
  vote,
  confidence,
  tokensInput,
  tokensOutput,
  estimatedCostUsd,
}: PersonaCardProps) {
  const [expanded, setExpanded] = useState(false);
  const cfg = personaConfig[persona] ?? personaConfig.veri_analisti;
  const voteCfg = vote ? (voteConfig[vote] ?? voteConfig.cekimser) : null;

  const previewLength = 180;
  const needsTruncation = analysisText.length > previewLength;
  const displayText = expanded || !needsTruncation
    ? analysisText
    : analysisText.slice(0, previewLength) + '...';

  const totalTokens = (tokensInput ?? 0) + (tokensOutput ?? 0);

  return (
    <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-sm transition-shadow`}>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
        <div className={`w-9 h-9 rounded-full ${cfg.bg} flex items-center justify-center ring-2 ${cfg.ring}`}>
          <Bot className={`w-4.5 h-4.5 ${cfg.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${cfg.color}`}>{cfg.name}</p>
          {confidence !== null && (
            <p className="text-xs text-gray-400">Guven: %{Math.round(confidence * 100)}</p>
          )}
        </div>
        {voteCfg && (
          <span className={`text-xs font-bold px-2.5 py-1 rounded border ${voteCfg.bg} ${voteCfg.color}`}>
            {voteCfg.label}
          </span>
        )}
      </div>

      <div className="px-4 py-3">
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{displayText}</p>
        {needsTruncation && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-navy-600 hover:text-navy-700 transition-colors"
          >
            {expanded ? (
              <>Kapat <ChevronUp className="w-3.5 h-3.5" /></>
            ) : (
              <>Devamini Oku <ChevronDown className="w-3.5 h-3.5" /></>
            )}
          </button>
        )}
      </div>

      {totalTokens > 0 && (
        <div className="px-4 py-2 border-t border-gray-50 flex items-center gap-3 text-[11px] text-gray-400">
          <span>{totalTokens.toLocaleString('tr-TR')} token</span>
          {estimatedCostUsd !== null && estimatedCostUsd > 0 && (
            <>
              <span className="w-px h-3 bg-gray-200" />
              <span>${estimatedCostUsd.toFixed(3)}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
