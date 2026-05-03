import { useState, useEffect } from 'react';
import { useTranslation } from '../locales/hero';
import { MapPin } from 'lucide-react';
import {
  getWorldCupCountdown,
  getUserTimeZone,
  formatOpeningKickoffForUser,
} from '../lib/worldCupCountdown';

function MexicoFlag() {
  return (
    <div className="flex w-10 h-7 sm:w-12 sm:h-8 rounded overflow-hidden shadow-md border border-white/10 shrink-0">
      <div className="flex-1 bg-[#006847]" />
      <div className="flex-1 bg-white flex items-center justify-center">
        {/* simplified eagle silhouette dot */}
        <div className="w-2 h-2 rounded-full bg-[#8B4513]/30" />
      </div>
      <div className="flex-1 bg-[#CE1126]" />
    </div>
  );
}

function SouthAfricaFlag() {
  return (
    <div
      className="w-10 h-7 sm:w-12 sm:h-8 rounded overflow-hidden shadow-md border border-white/10 shrink-0 relative"
      style={{ background: '#007A4D' }}
    >
      {/* Black triangle on left */}
      <div
        className="absolute left-0 top-0 h-full"
        style={{
          width: 0,
          borderTop: '14px solid transparent',
          borderBottom: '14px solid transparent',
          borderLeft: '14px solid #000',
        }}
      />
      {/* Horizontal stripe layout: red / white / green / white / blue from top */}
      <div className="absolute inset-0 flex flex-col">
        <div className="flex-1 bg-[#DE3831]" />
        <div className="h-px bg-white/70" />
        <div className="flex-1 bg-[#007A4D]" />
        <div className="h-px bg-white/70" />
        <div className="flex-1 bg-[#002395]" />
      </div>
      {/* Yellow chevron / triangle overlay */}
      <div
        className="absolute left-0 top-0 h-full"
        style={{
          width: 0,
          borderTop: '14px solid transparent',
          borderBottom: '14px solid transparent',
          borderLeft: '10px solid #FFB612',
          opacity: 0.9,
        }}
      />
    </div>
  );
}

export function Hero() {
  const { t } = useTranslation();
  const [time, setTime] = useState(() => getWorldCupCountdown());

  useEffect(() => {
    const id = setInterval(() => setTime(getWorldCupCountdown()), 1000);
    return () => clearInterval(id);
  }, []);

  const userTz      = getUserTimeZone();
  const localKickoff = formatOpeningKickoffForUser('tr-TR');

  const blocks = [
    { value: time.days,    label: 'GÜN' },
    { value: time.hours,   label: 'SAAT' },
    { value: time.minutes, label: 'DAKİKA' },
    { value: time.seconds, label: 'SANİYE' },
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

      <div className="relative z-10 container mx-auto px-6 text-center py-16 sm:py-20">

        {/* 1 ── Headline */}
        <h1
          className="font-syne lowercase tracking-tight text-white"
          style={{ fontSize: 'clamp(2.5rem, 8vw, 7rem)', letterSpacing: '-0.04em', lineHeight: 1.1 }}
        >
          {t('hero.tagline')}
        </h1>

        {/* 2 ── Subtitle */}
        <p className="mt-5 text-base md:text-lg text-white/60 max-w-xl mx-auto font-outfit">
          {t('hero.subtagline')}
        </p>

        {/* 3 ── Stats grid */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-4">
          {[
            { value: '65.000+', label: 'analiz edilmiş maç',  detail: '21 lig, 10+ sezon' },
            { value: '21',      label: 'lig kapsanıyor',       detail: 'İngiltere\'den Türkiye\'ye' },
            { value: '4',       label: 'yapay zeka persona',   detail: '3 turda tartışıp uzlaşıya varıyor' },
          ].map((s, i, arr) => (
            <div key={s.label} className="flex items-center gap-2">
              <div className="flex flex-col items-center px-5">
                <span className="text-xl sm:text-2xl font-bold text-white font-mono tabular-nums leading-none">
                  {s.value}
                </span>
                <span className="text-[11px] font-medium text-readable-muted mt-1">{s.label}</span>
                <span className="text-[10px] text-readable-muted/70 mt-0.5">{s.detail}</span>
              </div>
              {i < arr.length - 1 && (
                <div className="w-px h-10 bg-navy-800 shrink-0" />
              )}
            </div>
          ))}
        </div>

        {/* 4 ── Opening Match proof card */}
        <div className="mt-8 flex justify-center">
          <div className="w-full max-w-md rounded-2xl bg-navy-900/70 border border-navy-700/50 backdrop-blur-sm shadow-2xl shadow-navy-950/60 overflow-hidden">

            {/* Card header */}
            <div className="px-4 pt-4 pb-3 border-b border-navy-800/60 flex items-center justify-between gap-3">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gold-500/10 border border-gold-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-gold-400 shrink-0" />
                <span className="text-[10px] font-bold text-gold-400 uppercase tracking-widest">
                  FIFA World Cup 2026
                </span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 shrink-0">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </span>
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
                  Açılış Maçı
                </span>
              </div>
            </div>

            {/* Teams matchup */}
            <div className="px-4 py-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col items-center gap-2 flex-1">
                  <MexicoFlag />
                  <span className="text-sm font-semibold text-white leading-tight">Mexico</span>
                  <span className="text-[10px] text-readable-muted leading-tight -mt-1">Meksika</span>
                </div>
                <div className="flex flex-col items-center gap-1 shrink-0 px-2">
                  <div className="w-px h-3 bg-navy-700" />
                  <span className="text-[11px] font-bold text-readable-muted tracking-widest uppercase">vs</span>
                  <div className="w-px h-3 bg-navy-700" />
                </div>
                <div className="flex flex-col items-center gap-2 flex-1">
                  <SouthAfricaFlag />
                  <span className="text-sm font-semibold text-white leading-tight">South Africa</span>
                  <span className="text-[10px] text-readable-muted leading-tight -mt-1">Güney Afrika</span>
                </div>
              </div>

              {/* Match metadata */}
              <div className="mt-3 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-readable-muted text-xs">
                <span>Per, 11 Haziran 2026</span>
                <span className="text-navy-500">·</span>
                <span className="text-readable-subtle font-medium">22:00 TSİ</span>
                <span className="text-navy-500">·</span>
                <MapPin className="w-3 h-3 shrink-0" />
                <span>Estadio Azteca, Mexico City</span>
              </div>
              {userTz !== 'Europe/Istanbul' && (
                <p className="mt-1 text-[11px] text-readable-muted/70 text-center">
                  Yerel saatiniz: <span className="text-readable-muted">{localKickoff}</span>
                  <span className="ml-1 text-readable-muted/50">({userTz})</span>
                </p>
              )}
            </div>

            {/* Countdown */}
            <div className="px-4 pb-4 border-t border-navy-800/50 pt-4">
              <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                {blocks.map((b, i) => (
                  <div key={b.label} className="flex items-center gap-1.5 sm:gap-2">
                    <div className="flex flex-col items-center">
                      <div className="w-13 h-14 sm:w-14 sm:h-[60px] rounded-lg bg-navy-800/80 border border-navy-700/60 flex items-center justify-center relative overflow-hidden">
                        <div className="absolute inset-x-0 top-0 h-1/2 bg-white/[0.025]" />
                        <span className="font-mono text-xl sm:text-2xl font-bold text-white tabular-nums relative z-10">
                          {String(b.value).padStart(2, '0')}
                        </span>
                      </div>
                      <span className="mt-1 text-[8px] font-semibold tracking-[0.1em] text-readable-muted uppercase">
                        {b.label}
                      </span>
                    </div>
                    {i < blocks.length - 1 && (
                      <span className="text-gold-500/50 text-lg sm:text-xl font-light -mt-4 select-none">:</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* 5 ── CTAs */}
        <div className="mt-8 flex gap-4 justify-center flex-wrap">
          <a
            href="/maclar"
            className="px-8 py-3.5 bg-gold-500 text-navy-950 font-semibold rounded-lg hover:bg-gold-400 transition-all hover:shadow-lg hover:shadow-gold-500/20"
          >
            Bekleme listesine katıl
          </a>
          <a
            href="/maclar"
            className="px-8 py-3.5 border border-white/15 text-white/80 font-medium rounded-lg hover:bg-white/5 hover:border-white/25 transition-all"
          >
            Maçları Keşfet
          </a>
        </div>

      </div>
    </section>
  );
}
