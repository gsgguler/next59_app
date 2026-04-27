import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, X, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ManifestoBody } from './ManifestoBody';

const DISMISS_KEY = 'next59:disclaimer:v1:dismissed_at';
type State = 'loading' | 'hidden' | 'collapsed' | 'expanded';

export function DisclaimerBanner() {
  const { t } = useTranslation('legal');
  const [state, setState] = useState<State>('loading');
  const expandedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const dismissed = window.localStorage.getItem(DISMISS_KEY);
      setState(dismissed ? 'hidden' : 'collapsed');
    } catch {
      setState('collapsed');
    }
  }, []);

  useEffect(() => {
    if (state !== 'expanded') return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setState('collapsed');
    document.addEventListener('keydown', onKey);
    expandedRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [state]);

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    } catch { /* noop */ }
    setState('hidden');
  };

  if (state === 'loading' || state === 'hidden') return null;

  return (
    <aside
      role="region"
      aria-label={t('disclaimer.title')}
      data-testid="disclaimer-banner"
      className="bg-amber-500/10 border-b border-amber-500/30 sticky top-0 z-40 backdrop-blur-sm"
    >
      <AnimatePresence mode="wait" initial={false}>
        {state === 'collapsed' && (
          <motion.div
            key="collapsed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-3"
          >
            <button
              onClick={() => setState('expanded')}
              className="flex items-center gap-2 min-w-0 text-left flex-1 group"
              aria-expanded={false}
              aria-controls="disclaimer-expanded-panel"
            >
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-xs text-amber-200/90 truncate">
                <span className="font-semibold">{t('disclaimer.title')}:</span>{' '}
                {t('disclaimer.lead_short')}{' '}
                <span className="underline underline-offset-2 group-hover:text-amber-100 ml-1">
                  {t('disclaimer.expand_cta')} &rsaquo;
                </span>
              </p>
            </button>
            <button
              onClick={dismiss}
              aria-label={t('disclaimer.dismiss_cta')}
              className="text-amber-400/70 hover:text-amber-300 transition-colors shrink-0 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        {state === 'expanded' && (
          <motion.div
            key="expanded"
            id="disclaimer-expanded-panel"
            ref={expandedRef}
            tabIndex={-1}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="overflow-hidden outline-none"
          >
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <div className="flex items-start gap-3 mb-5">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <h2 className="text-amber-200 font-semibold text-base flex-1">
                  {t('disclaimer.title')}
                </h2>
                <button
                  onClick={() => setState('collapsed')}
                  aria-label={t('disclaimer.collapse_cta')}
                  className="text-amber-400/70 hover:text-amber-300 transition-colors p-1"
                >
                  <ChevronUp className="w-5 h-5" />
                </button>
              </div>

              <ManifestoBody textTone="amber" />

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setState('collapsed')}
                  className="px-4 py-2 text-sm text-amber-200/70 hover:text-amber-100 transition-colors"
                >
                  {t('disclaimer.collapse_cta')}
                </button>
                <button
                  onClick={dismiss}
                  className="px-4 py-2 bg-amber-500 text-black rounded text-sm font-medium hover:bg-amber-400 transition-colors"
                >
                  {t('disclaimer.dismiss_cta')}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}

export default DisclaimerBanner;
