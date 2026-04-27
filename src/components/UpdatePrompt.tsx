import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';

export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000);
      }
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-2rem)] max-w-md">
      <div className="bg-navy-900 border border-champagne/20 rounded-xl shadow-2xl shadow-black/40 p-4 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">
            Yeni surum mevcut
          </p>
          <p className="text-xs text-navy-400 mt-0.5">
            En son ozelliklere erismek icin guncelleme yapin.
          </p>
        </div>
        <button
          onClick={() => updateServiceWorker(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-champagne text-navy-950 text-xs font-semibold hover:bg-champagne-light transition-colors shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Guncelle
        </button>
        <button
          onClick={() => setNeedRefresh(false)}
          className="p-1.5 rounded-lg text-navy-500 hover:text-white hover:bg-navy-800 transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
