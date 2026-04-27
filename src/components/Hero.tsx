import { useTranslation } from '../locales/hero';

export function Hero() {
  const { t } = useTranslation();

  return (
    <section className="hero relative min-h-[90vh] flex items-center justify-center bg-slate-950">
      <div className="container mx-auto px-6 text-center">
        {/* Tagline with stagger animation */}
        <h1
          className="font-syne lowercase tracking-tight text-white animate-fade-in-stagger"
          style={{ fontSize: 'clamp(3rem, 10vw, 9rem)', letterSpacing: '-0.04em' }}
        >
          {t('hero.tagline')}
        </h1>

        {/* Subtagline */}
        <p className="mt-6 text-lg md:text-xl text-white/70 max-w-2xl mx-auto font-outfit">
          {t('hero.subtagline')}
        </p>

        {/* CTAs */}
        <div className="mt-10 flex gap-4 justify-center flex-wrap">
          <a
            href="/maclar"
            className="px-8 py-3 bg-amber-500 text-slate-950 font-medium rounded-lg hover:bg-amber-400 transition-colors"
          >
            {t('hero.cta_primary')}
          </a>
          <button
            onClick={() => alert('Manifesto yakında')}
            className="px-8 py-3 border border-white/20 text-white/80 font-medium rounded-lg hover:bg-white/10 transition-colors"
          >
            {t('hero.cta_secondary')}
          </button>
        </div>
      </div>
    </section>
  );
}
