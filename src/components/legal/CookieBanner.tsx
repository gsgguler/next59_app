import { useState, useEffect } from 'react';
import { Cookie, X } from 'lucide-react';

const COOKIE_CONSENT_KEY = 'next59_cookie_consent';

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!consent) {
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  function accept() {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted');
    setVisible(false);
  }

  function decline() {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'declined');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 p-4 sm:p-6 pointer-events-none">
      <div
        className="max-w-lg mx-auto sm:mx-0 sm:ml-auto bg-navy-800 border border-navy-700 rounded-xl shadow-2xl p-5 pointer-events-auto animate-slide-up"
      >
        <div className="flex items-start gap-3">
          <Cookie className="w-5 h-5 text-gold-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-white mb-1">Cerez Kullanimi</h3>
            <p className="text-xs text-navy-300 leading-relaxed">
              Deneyiminizi iyilestirmek icin cerezler kullaniyoruz.
              Devam ederek cerez politikamizi kabul etmis olursunuz.
            </p>
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={accept}
                className="px-4 py-1.5 bg-gold-500 hover:bg-gold-400 text-navy-950 text-xs font-semibold rounded-lg transition-colors"
              >
                Kabul Et
              </button>
              <button
                onClick={decline}
                className="px-4 py-1.5 border border-navy-600 text-navy-300 hover:text-white hover:border-navy-500 text-xs font-medium rounded-lg transition-colors"
              >
                Reddet
              </button>
            </div>
          </div>
          <button
            onClick={decline}
            className="text-navy-500 hover:text-navy-300 transition-colors shrink-0"
            aria-label="Cerezi kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
