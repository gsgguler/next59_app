import { useState, useEffect } from 'react';
import { Bell, X, Loader2 } from 'lucide-react';
import { getNotificationPermission, subscribeToPush } from '../lib/push';

export default function NotificationOptIn() {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const [dismissed, setDismissed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    setPermission(getNotificationPermission());
  }, []);

  if (permission !== 'default' || dismissed) return null;

  async function handleEnable() {
    setSubscribing(true);
    const result = await subscribeToPush();
    setSubscribing(false);
    if (result.ok) {
      setPermission('granted');
    } else {
      setPermission(getNotificationPermission());
    }
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9998] w-[calc(100%-2rem)] max-w-md animate-fade-in">
      <div className="bg-navy-900 border border-navy-700 rounded-xl shadow-2xl shadow-black/40 p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0 mt-0.5">
          <Bell className="w-5 h-5 text-champagne" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">
            Bildirim almak ister misiniz?
          </p>
          <p className="text-xs text-navy-400 mt-0.5 leading-relaxed">
            Mac baslamadan once kehanet bildirimleri gonderelim.
          </p>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={handleEnable}
              disabled={subscribing}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-champagne text-navy-950 text-xs font-semibold hover:bg-champagne-light disabled:opacity-60 transition-colors"
            >
              {subscribing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Bell className="w-3.5 h-3.5" />
              )}
              Bildirimleri Ac
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="px-3 py-2 rounded-lg text-xs text-navy-500 hover:text-navy-300 hover:bg-navy-800 transition-colors"
            >
              Simdi Degil
            </button>
          </div>
        </div>

        <button
          onClick={() => setDismissed(true)}
          className="p-1 rounded text-navy-600 hover:text-navy-400 transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
