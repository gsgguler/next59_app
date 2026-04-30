import { useState, useEffect } from 'react';
import { useTranslation } from '../locales/hero';
import { Trophy, Clock } from 'lucide-react';

const WC_KICKOFF = new Date('2026-06-11T21:00:00-04:00').getTime();

const FIRST_MATCH = {
  teamA: 'Meksika',
  teamB: 'TBD',
  venue: 'Estadio Azteca, Mexico City',
  date: '11 Haziran 2026',
};

function calcRemaining() {
  const diff = Math.max(0, WC_KICKOFF - Date.now());
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

export function Hero() {
  const { t } = useTranslation();
  const [time, setTime] = useState(calcRemaining);

  useEffect(() => {
    const id = setInterval(() => setTime(calcRemaining()), 1000);
    return () => clearInterval(id);
  }, []);

  const blocks = [
    { value: time.days, label: 'GUN' },
    { value: time.hours, label: 'SAAT' },
    { value: time.minutes, label: 'DAKiKA' },
    { value: time.seconds, label: 'SANiYE' },
  ];

  return (
    <section className="hero relative min-h-[92vh] flex items-center justify-center bg-navy-950 overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gold-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-navy-700/30 rounded-full blur-[100px]" />
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-gold-500/3 rounded-full blur-[80px]" />
      </div>

      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      <div className="relative z-10 container mx-auto px-6 text-center">
        {/* Tagline */}
        <h1
          className="font-syne lowercase tracking-tight text-white"
          style={{ fontSize: 'clamp(2.5rem, 8vw, 7rem)', letterSpacing: '-0.04em', lineHeight: 1.1 }}
        >
          {t('hero.tagline')}
        </h1>

        {/* Subtagline */}
        <p className="mt-4 text-base md:text-lg text-white/60 max-w-xl mx-auto font-outfit">
          {t('hero.subtagline')}
        </p>

        {/* Countdown Section */}
        <div className="mt-12 sm:mt-16">
          {/* Event badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gold-500/10 border border-gold-500/20 mb-8">
            <Trophy className="w-3.5 h-3.5 text-gold-400" />
            <span className="text-lg font-semibold text-gold-400 uppercase tracking-wider">
              FIFA DÜNYA KUPASI 2026
            </span>
          </div>

          {/* Countdown blocks */}
          <div className="flex items-center justify-center gap-3 sm:gap-4 md:gap-6">
            {blocks.map((b, i) => (
              <div key={b.label} className="flex items-center gap-3 sm:gap-4 md:gap-6">
                <div className="flex flex-col items-center">
                  <div className="relative">
                    <div className="w-16 h-20 sm:w-20 sm:h-24 md:w-24 md:h-28 rounded-xl bg-navy-900/80 border border-navy-700/50 backdrop-blur-sm flex items-center justify-center shadow-lg shadow-navy-950/50">
                      <span className="font-mono text-3xl sm:text-4xl md:text-5xl font-bold text-white tabular-nums">
                        {String(b.value).padStart(2, '0')}
                      </span>
                    </div>
                    <div className="absolute inset-x-0 top-1/2 h-px bg-navy-700/40" />
                  </div>
                  <span className="mt-2.5 text-[9px] sm:text-[10px] md:text-xs font-semibold tracking-[0.15em] text-navy-400 uppercase">
                    {b.label}
                  </span>
                </div>
                {i < blocks.length - 1 && (
                  <span className="text-gold-500/60 text-2xl sm:text-3xl md:text-4xl font-light -mt-6 select-none">
                    :
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* First match info */}
          <div className="mt-8 flex items-center justify-center gap-2 text-navy-400">
            <Clock className="w-3.5 h-3.5" />
            <span className="text-xs sm:text-sm font-medium">
              Ilk mac: <span className="text-white/80">{FIRST_MATCH.teamA}</span> — {FIRST_MATCH.venue}
            </span>
          </div>
        </div>

        {/* CTAs */}
        <div className="mt-12 flex gap-4 justify-center flex-wrap">
          <a
            href="/maclar"
            className="group px-8 py-3.5 bg-gold-500 text-navy-950 font-semibold rounded-lg hover:bg-gold-400 transition-all hover:shadow-lg hover:shadow-gold-500/20"
          >
            {t('hero.cta_primary')}
          </a>
          <a
            href="/tahminler"
            className="px-8 py-3.5 border border-white/15 text-white/80 font-medium rounded-lg hover:bg-white/5 hover:border-white/25 transition-all"
          >
            Tahminleri Gor
          </a>
        </div>
      </div>
    </section>
  );
}
