import { useState, useEffect, type FormEvent } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: 'login' | 'register';
}

export default function AuthModal({ isOpen, onClose, defaultMode = 'register' }: AuthModalProps) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>(defaultMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMode(defaultMode);
      setEmail('');
      setPassword('');
      setDisplayName('');
      setError(null);
      setLoading(false);
    }
  }, [isOpen, defaultMode]);

  useEffect(() => {
    if (!isOpen) return;
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'register') {
        const { error: err } = await signUp(email, password, displayName || email.split('@')[0]);
        if (err) {
          setError(err);
          setLoading(false);
          return;
        }
      } else {
        const { error: err } = await signIn(email, password);
        if (err) {
          setError(err);
          setLoading(false);
          return;
        }
      }
      setTimeout(() => onClose(), 500);
    } catch {
      setError('Beklenmedik bir hata olu\u015ftu. L\u00fctfen tekrar deneyin.');
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-navy-900 border border-navy-700/50 rounded-2xl shadow-2xl w-full max-w-md animate-scale-in">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-navy-400 hover:text-white hover:bg-navy-800 transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="px-8 pt-8 pb-2 text-center">
          <h2 className="font-display text-2xl font-bold text-white">
            Next59'a Ho\u015f Geldiniz
          </h2>
          <p className="mt-2 text-sm text-navy-300">
            30 g\u00fcn boyunca t\u00fcm analizlere \u00fccretsiz eri\u015fin
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-8 pb-8 pt-4 space-y-4">
          {mode === 'register' && (
            <div>
              <label htmlFor="auth-name" className="block text-xs font-medium text-navy-300 mb-1.5">
                Ad Soyad
              </label>
              <input
                id="auth-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ad\u0131n\u0131z"
                className="w-full bg-navy-800 border border-navy-600 text-white rounded-lg px-4 py-3 text-sm placeholder-navy-500 focus:outline-none focus:ring-2 focus:ring-champagne/50 focus:border-champagne transition-all"
              />
            </div>
          )}

          <div>
            <label htmlFor="auth-email" className="block text-xs font-medium text-navy-300 mb-1.5">
              E-posta
            </label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-posta adresiniz"
              required
              className="w-full bg-navy-800 border border-navy-600 text-white rounded-lg px-4 py-3 text-sm placeholder-navy-500 focus:outline-none focus:ring-2 focus:ring-champagne/50 focus:border-champagne transition-all"
            />
          </div>

          <div>
            <label htmlFor="auth-password" className="block text-xs font-medium text-navy-300 mb-1.5">
              \u015eifre
            </label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="\u015eifreniz"
              required
              minLength={6}
              className="w-full bg-navy-800 border border-navy-600 text-white rounded-lg px-4 py-3 text-sm placeholder-navy-500 focus:outline-none focus:ring-2 focus:ring-champagne/50 focus:border-champagne transition-all"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-champagne hover:bg-champagne-light text-navy-950 font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Y\u00fckleniyor...</span>
              </>
            ) : mode === 'register' ? (
              '\u00dcye Ol'
            ) : (
              'Giri\u015f Yap'
            )}
          </button>

          <div className="text-center">
            {mode === 'register' ? (
              <p className="text-sm text-navy-400">
                Zaten hesab\u0131n var m\u0131?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(null); }}
                  className="text-champagne hover:text-champagne-light font-medium transition-colors"
                >
                  Giri\u015f Yap
                </button>
              </p>
            ) : (
              <p className="text-sm text-navy-400">
                Hesab\u0131n yok mu?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('register'); setError(null); }}
                  className="text-champagne hover:text-champagne-light font-medium transition-colors"
                >
                  \u00dcye Ol
                </button>
              </p>
            )}
          </div>

          <p className="text-[11px] text-navy-500 text-center leading-relaxed">
            \u00dcye olarak{' '}
            <a href="/terms" className="underline hover:text-navy-300 transition-colors">Kullan\u0131m Ko\u015fullar\u0131</a>
            {' '}ve{' '}
            <a href="/privacy" className="underline hover:text-navy-300 transition-colors">Gizlilik Politikas\u0131</a>
            '\u0131n\u0131 kabul etmi\u015f olursunuz.
          </p>
        </form>
      </div>
    </div>
  );
}
