import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';

const SESSION_KEY = 'next59_legal_notice_dismissed';

export default function DisclaimerBanner() {
  const [visible, setVisible] = useState(() => sessionStorage.getItem(SESSION_KEY) !== 'true');
  const [expanded, setExpanded] = useState(false);

  if (!visible) return null;

  function handleOk() {
    sessionStorage.setItem(SESSION_KEY, 'true');
    setVisible(false);
  }

  return (
    <div className="bg-amber-900/30 border-b border-amber-700/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <button
          onClick={() => setExpanded(prev => !prev)}
          className="w-full py-2.5 flex items-center justify-between gap-3 text-left"
          aria-expanded={expanded}
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-xs font-semibold text-amber-200/90">Yasal Sorumluluk Reddi</span>
          </div>
          {expanded
            ? <ChevronUp className="w-4 h-4 text-amber-400/70 shrink-0" />
            : <ChevronDown className="w-4 h-4 text-amber-400/70 shrink-0" />
          }
        </button>

        {expanded && (
          <div className="pb-4 space-y-3">
            <p className="text-xs text-amber-200/80 leading-relaxed">
              Next59, veriye dayalı futbol analitiği ve senaryo üretimi yapan bir bilgi platformudur.
            </p>
            <p className="text-xs text-amber-200/80 leading-relaxed">
              Platformda yer alan hiçbir içerik kesinlik iddiası taşımaz ve bahis tavsiyesi değildir. Next59 üzerinde herhangi bir şekilde bahis oynatılmaz.
            </p>
            <p className="text-xs text-amber-200/80 leading-relaxed">
              Sunulan tüm veriler ve senaryolar, futbol karşılaşmalarını daha bilinçli ve heyecanlı takip edebilmeniz amacıyla hazırlanır.
            </p>
            <p className="text-xs text-amber-200/80 leading-relaxed">
              Platform üzerindeki içeriklerin kullanımından doğabilecek doğrudan veya dolaylı hiçbir maddi ya da manevi zarardan Next59 sorumlu tutulamaz.
            </p>
            <button
              onClick={handleOk}
              className="mt-1 px-4 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white rounded transition-colors"
            >
              Tamam
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
