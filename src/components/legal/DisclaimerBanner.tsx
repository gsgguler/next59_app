import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export default function DisclaimerBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="bg-amber-900/30 border-b border-amber-700/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-200/90 truncate">
            <span className="font-semibold">Yasal Uyarı:</span>{' '}
            Bu platform yatırım tavsiyesi vermez. İçerikler yalnızca bilgilendirme amaçlıdır.
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-amber-400/70 hover:text-amber-300 transition-colors shrink-0"
          aria-label="Uyarıyı kapat"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
