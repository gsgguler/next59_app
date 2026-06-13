import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../locales/hero';
import { MapPin, Mail, ArrowRight, Check, Loader2, Radio } from 'lucide-react';
import {
  getCountdownFromTarget,
  getActiveCountdownFixture,
  getUserTimeZone,
} from '../lib/worldCupCountdown';
import { ALL_WC2026_FIXTURES } from '../data/worldCup2026Fixtures';
import { COUNTRY_BY_FIFA } from '../data/worldCup2026Countries';
import { supabase } from '../lib/supabase';

const LEAD_STORAGE_KEY = 'next59_lead_submitted';

function getStoredLeadEmail(): string {
  try { return localStorage.getItem(LEAD_STORAGE_KEY) ?? ''; } catch { return ''; }
}

function storeLeadEmail(email: string) {
  try { localStorage.setItem(LEAD_STORAGE_KEY, email); } catch { /* noop */ }
}

function TeamFlag({ fifaCode, size = 'md' }: { fifaCode: string; size?: 'sm' | 'md' }) {
  const country = COUNTRY_BY_FIFA[fifaCode];
  const iso2 = country?.iso2 ?? fifaCode.toLowerCase().slice(0, 2);
  const cls = size === 'sm' ? 'w-8 h-[22px]' : 'w-10 h-7 sm:w-12 sm:h-8';
  return (
    <span
      className={`fi fi-${iso2} ${cls} rounded overflow-hidden shadow-md border border-white/10 shrink-0 inline-block`}
      title={country?.name_en ?? fifaCode}
    />
  );
}

export function Hero() {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now);
  const [email, setEmail] = useState('');
  const [leadStatus, setLeadStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(() =>
    getStoredLeadEmail() ? 'success' : 'idle'
  );
  const [leadError, setLeadError] = useState('');
  const [liveDbStatuses, setLiveDbStatuses] = useState<Map<string, string>>(new Map());
  const inputRef = useRef<HTMLInputElement>(null);

  // Tick every second
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Fetch live match states once on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: fixRows } = await supabase
        .from('wc2026_fixtures')
        .select('id, public_fixture_key, home_team_name, away_team_name');
      if (!fixRows || cancelled) return;
      const DB_TO_STATIC: Record<string, string> = {
        'Czech Republic': 'Czechia',
        'Bosnia & Herzegovina': 'Bosnia and Herzegovina',
        'Cape Verde Islands': 'Cape Verde',
      };
      const normTeam = (n: string) => DB_TO_STATIC[n] ?? n;
      const teamPairToStaticId = new Map<string, string>();
      for (const f of ALL_WC2026_FIXTURES) {
        teamPairToStaticId.set(`${f.home_team}||${f.away_team}`, f.id);
      }
      const uuidToKey = new Map<string, string>();
      for (const r of fixRows) {
        const key = r.public_fixture_key
          ?? teamPairToStaticId.get(`${normTeam(r.home_team_name)}||${normTeam(r.away_team_name)}`);
        if (key) uuidToKey.set(r.id, key);
      }
      const { data } = await supabase
        .from('wc2026_live_match_state_public')
        .select('fixture_id, status_short');
      if (!data || cancelled) return;
      const map = new Map<string, string>();
      for (const row of data) {
        const key = uuidToKey.get(row.fixture_id);
        if (key) map.set(key, row.status_short);
      }
      if (!cancelled) setLiveDbStatuses(map);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  async function handleLeadSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setLeadStatus('loading');
    setLeadError('');
    const { error } = await supabase
      .from('early_access_leads')
      .insert({ email: trimmed, source: 'hero' });
    if (error && error.code !== '23505') {
      setLeadStatus('error');
      setLeadError('Bir hata oluştu, lütfen tekrar deneyin.');
      return;
    }
    storeLeadEmail(trimmed);
    setLeadStatus('success');
  }

  const active = getActiveCountdownFixture(ALL_WC2026_FIXTURES, liveDbStatuses, now);
  const time = getCountdownFromTarget(active.targetMs, now);

  const blocks = [
    { value: time.days,    label: 'GÜN' },
    { value: time.hours,   label: 'SAAT' },
    { value: time.minutes, label: 'DAKİKA' },
    { value: time.seconds, label: 'SANİYE' },
  ];

  const userTz = getUserTimeZone();

  // Format local kickoff time for the active fixture
  const localKickoff = active.fixture
    ? new Intl.DateTimeFormat('tr-TR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: userTz,
      }).format(new Date(active.fixture.kickoff_utc))
    : '';

  const homeCountry = active.fixture ? COUNTRY_BY_FIFA[active.fixture.home_team_code] : null;
  const awayCountry = active.fixture ? COUNTRY_BY_FIFA[active.fixture.away_team_code] : null;

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
          className="font-sans font-bold lowercase tracking-tight text-white"
          style={{ fontSize: 'clamp(2.5rem, 8vw, 7rem)', letterSpacing: '-0.04em', lineHeight: 1.1 }}
        >
          {t('hero.tagline')}
        </h1>

        {/* 2 ── Subtitle */}
        <p className="mt-5 text-base md:text-lg text-white/60 max-w-xl mx-auto font-sans">
          {t('hero.subtagline')}
        </p>

        {/* 3 ── Stats grid */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-4">
          {[
            { value: '65.000+', label: 'analiz edilmiş maç',  detail: '21 lig, 10+ sezon' },
            { value: '21',      label: 'lig kapsanıyor',       detail: 'İngiltere\'den Türkiye\'ye' },
            { value: '4',       label: 'yapay zeka persona',   detail: '3 turda tartışıp senaryo üretiyor' },
          ].map((s, i, arr) => (
            <div key={s.label} className="flex items-center gap-2">
              <div className="flex flex-col items-center px-5">
                <span className="text-xl sm:text-2xl font-bold text-white font-mono tabular-nums leading-none">
                  {s.value}
                </span>
                <span className="text-xs font-medium text-slate-400 mt-1">{s.label}</span>
                <span className="text-xs text-slate-500 mt-0.5">{s.detail}</span>
              </div>
              {i < arr.length - 1 && (
                <div className="w-px h-10 bg-navy-800 shrink-0" />
              )}
            </div>
          ))}
        </div>

        {/* 4 ── Dynamic match proof card */}
        <div className="mt-8 flex justify-center">
          {active.mode === 'over' ? (
            <div className="w-full max-w-md rounded-2xl bg-navy-900/70 border border-navy-700/50 backdrop-blur-sm shadow-2xl shadow-navy-950/60 px-6 py-8 text-center">
              <div className="text-champagne text-sm font-semibold mb-1">FIFA World Cup 2026</div>
              <div className="text-white text-lg font-bold">Turnuva tamamlandı</div>
            </div>
          ) : active.fixture && (
            <Link
              to={`/world-cup-2026/mac/${active.fixture.id}`}
              className="w-full max-w-md rounded-2xl bg-navy-900/70 border border-navy-700/50 backdrop-blur-sm shadow-2xl shadow-navy-950/60 overflow-hidden block hover:border-champagne/30 transition-colors duration-200"
            >

              {/* Card header */}
              <div className="px-4 pt-4 pb-3 border-b border-navy-800/60 flex items-center justify-between gap-3">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gold-500/10 border border-gold-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-gold-400 shrink-0" />
                  <span className="text-[10px] font-bold text-gold-400 uppercase tracking-widest">
                    FIFA World Cup 2026
                  </span>
                </div>
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full shrink-0 ${
                  active.mode === 'live'
                    ? 'bg-red-500/10 border border-red-500/20'
                    : 'bg-emerald-500/10 border border-emerald-500/20'
                }`}>
                  {active.mode === 'live' ? (
                    <>
                      <Radio className="w-3 h-3 text-red-400" />
                      <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest">
                        {active.badgeLabel}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                      </span>
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
                        {active.badgeLabel}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Teams matchup */}
              <div className="px-4 py-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col items-center gap-2 flex-1">
                    <TeamFlag fifaCode={active.fixture.home_team_code} />
                    <span className="text-sm font-semibold text-white leading-tight">
                      {active.fixture.home_team}
                    </span>
                    {homeCountry && homeCountry.name_tr !== active.fixture.home_team && (
                      <span className="text-xs text-slate-400 leading-tight -mt-1">{homeCountry.name_tr}</span>
                    )}
                  </div>
                  <div className="flex flex-col items-center gap-1 shrink-0 px-2">
                    <div className="w-px h-3 bg-navy-700" />
                    <span className="text-[11px] font-bold text-readable-muted tracking-widest uppercase">vs</span>
                    <div className="w-px h-3 bg-navy-700" />
                  </div>
                  <div className="flex flex-col items-center gap-2 flex-1">
                    <TeamFlag fifaCode={active.fixture.away_team_code} />
                    <span className="text-sm font-semibold text-white leading-tight">
                      {active.fixture.away_team}
                    </span>
                    {awayCountry && awayCountry.name_tr !== active.fixture.away_team && (
                      <span className="text-xs text-slate-400 leading-tight -mt-1">{awayCountry.name_tr}</span>
                    )}
                  </div>
                </div>

                {/* Match metadata */}
                <div className="mt-3 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-readable-muted text-xs">
                  <span>{active.fixture.kickoff_tr_label} TRT</span>
                  <span className="text-navy-500">·</span>
                  <MapPin className="w-3 h-3 shrink-0" />
                  <span>{active.fixture.venue}, {active.fixture.city}</span>
                </div>
                {userTz !== 'Europe/Istanbul' && (
                  <p className="mt-1 text-xs text-slate-400 text-center">
                    Yerel saatiniz: <span className="text-slate-300">{localKickoff}</span>
                    <span className="ml-1 text-slate-500">({userTz})</span>
                  </p>
                )}
              </div>

              {/* Countdown */}
              <div className="px-4 pb-4 border-t border-navy-800/50 pt-4">
                {active.mode === 'live' ? (
                  <p className="text-center text-xs text-red-400 font-semibold tracking-wide uppercase mb-3">
                    Maç bitimine kalan
                  </p>
                ) : (
                  <p className="text-center text-xs text-navy-400 font-medium tracking-wide uppercase mb-3">
                    Maç başlangıcına kalan
                  </p>
                )}
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
                        <span className="mt-1 text-[11px] font-semibold tracking-[0.08em] text-slate-400 uppercase">
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

            </Link>
          )}
        </div>

        {/* 5 ── Lead capture + CTA */}
        <div className="mt-10 flex flex-col items-center gap-4">

          {/* Early-access email block */}
          <div className="w-full max-w-lg rounded-2xl bg-navy-900/60 border border-navy-700/50 backdrop-blur-sm px-5 py-5 text-left">
            <p className="text-sm font-semibold text-white mb-0.5">
              Dünya Kupası analizlerimiz hazır olduğunda haberdar olun
            </p>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              2026 Dünya Kupası maç incelemelerimiz ve 90 dakika analizlerimiz yayına girdiğinde
              sizi bilgilendireceğiz. Ücretsiz üye olursanız zaten otomatik olarak alırsınız —
              ya da sadece e-posta bırakın yeterli.
            </p>

            {leadStatus === 'success' ? (
              <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                <div className="w-6 h-6 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <Check className="w-3.5 h-3.5" />
                </div>
                Kaydedildi! Analizler hazır olduğunda bildireceğiz.
              </div>
            ) : (
              <form onSubmit={handleLeadSubmit} className="flex gap-2">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-400 pointer-events-none" />
                  <input
                    ref={inputRef}
                    type="email"
                    required
                    placeholder="e-posta adresiniz"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-navy-800 border border-navy-700 text-white text-sm rounded-lg pl-9 pr-3 py-2.5 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-gold-500/40 focus:border-gold-500/40 transition-all"
                  />
                </div>
                <button
                  type="submit"
                  disabled={leadStatus === 'loading'}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-gold-500 hover:bg-gold-400 disabled:opacity-60 text-navy-950 font-semibold text-sm rounded-lg transition-all hover:shadow-lg hover:shadow-gold-500/20 shrink-0"
                >
                  {leadStatus === 'loading' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Bildir
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </form>
            )}

            {leadError && (
              <p className="mt-2 text-xs text-red-400">{leadError}</p>
            )}
          </div>

          {/* Secondary CTA */}
          <Link
            to="/world-cup-2026"
            className="inline-flex items-center gap-2 px-7 py-3 border border-white/15 text-white/80 font-medium rounded-lg hover:bg-white/5 hover:border-white/25 transition-all text-sm"
          >
            Fikstürü İncele
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

      </div>
    </section>
  );
}
