import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Globe, ChevronRight, Zap, Trophy, BarChart2 } from 'lucide-react';
import { WC2026_COUNTRIES } from '../../data/worldCup2026Countries';
import { supabase } from '../../lib/supabase';

interface CalibrationSample {
  home_team_name: string;
  away_team_name: string;
  home_win_probability: number;
  draw_probability: number;
  away_win_probability: number;
  predicted_score_home: number;
  predicted_score_away: number;
  calibration_confidence: string | null;
  calibrated_at: string;
}

const WC2026_START = new Date('2026-06-11T20:00:00-06:00'); // Mexico City opener

// Derive groups directly from the canonical data source
const GROUP_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const;
const TEAMS_PER_GROUP = 4;

const GROUPS: { label: string; teams: string[] }[] = GROUP_LABELS.map((label, i) => ({
  label,
  teams: WC2026_COUNTRIES.slice(i * TEAMS_PER_GROUP, (i + 1) * TEAMS_PER_GROUP).map((c) => c.name_tr),
}));

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function useCountdown(target: Date): TimeLeft {
  const calc = (): TimeLeft => {
    const diff = Math.max(0, target.getTime() - Date.now());
    return {
      days: Math.floor(diff / 86400000),
      hours: Math.floor((diff % 86400000) / 3600000),
      minutes: Math.floor((diff % 3600000) / 60000),
      seconds: Math.floor((diff % 60000) / 1000),
    };
  };

  const [timeLeft, setTimeLeft] = useState<TimeLeft>(calc);

  useEffect(() => {
    const id = setInterval(() => setTimeLeft(calc()), 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return timeLeft;
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-navy-800/80 border border-navy-600/60 flex items-center justify-center">
        <span className="text-2xl sm:text-3xl font-bold text-white tabular-nums leading-none">
          {String(value).padStart(2, '0')}
        </span>
      </div>
      <span className="text-[10px] sm:text-xs text-navy-400 font-medium uppercase tracking-wider">{label}</span>
    </div>
  );
}

export default function Wc2026Widget() {
  const { days, hours, minutes, seconds } = useCountdown(WC2026_START);
  const [sample, setSample] = useState<CalibrationSample | null | undefined>(undefined);

  useEffect(() => {
    supabase
      .from('wc2026_match_scenario_calibration')
      .select('home_team_name, away_team_name, home_win_probability, draw_probability, away_win_probability, predicted_score_home, predicted_score_away, calibration_confidence, calibrated_at')
      .order('calibrated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setSample(data ?? null));
  }, []);

  return (
    <section className="py-20 sm:py-28 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-navy-900/30 to-transparent pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-gold-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-gold-500/10 border border-gold-500/25 rounded-full px-4 py-1.5 mb-5">
            <Trophy className="w-3.5 h-3.5 text-gold-400" />
            <span className="text-xs font-semibold text-gold-400 tracking-wide">FIFA Dünya Kupası 2026</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-white">
            Başlamak İçin{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-400 to-gold-600">
              Sayıyoruz
            </span>
          </h2>
          <p className="mt-4 text-navy-300 max-w-xl mx-auto text-sm sm:text-base leading-relaxed">
            48 takım, 16 şehir, 104 maç — Next59 AI analiz motoru Haziran 2026 öncesinde tüm turnuva için hazır olacak.
          </p>
        </div>

        {/* Countdown */}
        <div className="flex items-center justify-center gap-3 sm:gap-5 mb-14">
          <CountdownUnit value={days} label="Gün" />
          <span className="text-2xl font-bold text-navy-500 pb-6">:</span>
          <CountdownUnit value={hours} label="Saat" />
          <span className="text-2xl font-bold text-navy-500 pb-6">:</span>
          <CountdownUnit value={minutes} label="Dak" />
          <span className="text-2xl font-bold text-navy-500 pb-6">:</span>
          <CountdownUnit value={seconds} label="Sn" />
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-4 gap-px bg-navy-700/40 rounded-2xl overflow-hidden mb-14 border border-navy-700/40">
          {[
            { value: '48', label: 'Takım' },
            { value: '104', label: 'Maç' },
            { value: '12', label: 'Grup' },
            { value: '3', label: 'Ev Sahibi' },
          ].map((s) => (
            <div key={s.label} className="bg-navy-800/50 py-5 text-center">
              <div className="text-2xl font-bold text-gold-400">{s.value}</div>
              <div className="text-xs text-navy-400 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Groups grid */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-navy-300 uppercase tracking-wider">Grup Aşaması</h3>
            <span className="text-xs text-navy-500 flex items-center gap-1">
              <Zap className="w-3 h-3 text-gold-500" />
              AI analizleri yakında
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {GROUPS.map((g) => (
              <div
                key={g.label}
                className="bg-navy-800/40 border border-navy-700/40 rounded-xl p-4 hover:bg-navy-800/60 hover:border-navy-600/60 transition-all group"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-md bg-gold-500/15 flex items-center justify-center">
                    <span className="text-[11px] font-bold text-gold-400">{g.label}</span>
                  </div>
                  <span className="text-xs font-semibold text-navy-300">Grup {g.label}</span>
                </div>
                <ul className="space-y-1.5">
                  {g.teams.map((t) => (
                    <li key={t} className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-navy-600 group-hover:bg-gold-500/50 transition-colors flex-shrink-0" />
                      <span className="text-xs text-navy-300 truncate">{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-navy-600 mt-4 text-center">
            Grup bilgileri resmi kura sonucuna göre gösterilir; play-off kontenjanları sonuçlandıkça güncellenir.
          </p>
        </div>

        {/* Proof card */}
        <div className="mt-12">
          <div className="flex items-center gap-2 mb-5">
            <BarChart2 className="w-4 h-4 text-gold-400" />
            <h3 className="text-sm font-semibold text-navy-300 uppercase tracking-wider">Modelden Örnek Okuma</h3>
          </div>

          {sample === undefined ? null : sample === null ? (
            <div className="bg-navy-800/30 border border-navy-700/40 rounded-xl p-6 text-center">
              <p className="text-sm text-navy-500">İlk kalibrasyon örnekleri yakında burada görünecek.</p>
            </div>
          ) : (
            <div className="bg-navy-800/40 border border-navy-700/50 rounded-xl p-6 sm:p-7">
              {/* Teams + score */}
              <div className="flex items-center justify-between gap-4 mb-6">
                <div className="flex-1 text-center">
                  <p className="text-sm font-semibold text-white truncate">{sample.home_team_name}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="w-10 h-10 rounded-lg bg-navy-700/60 border border-navy-600/50 flex items-center justify-center text-lg font-bold text-white">
                    {sample.predicted_score_home}
                  </span>
                  <span className="text-navy-500 font-bold text-sm">—</span>
                  <span className="w-10 h-10 rounded-lg bg-navy-700/60 border border-navy-600/50 flex items-center justify-center text-lg font-bold text-white">
                    {sample.predicted_score_away}
                  </span>
                </div>
                <div className="flex-1 text-center">
                  <p className="text-sm font-semibold text-white truncate">{sample.away_team_name}</p>
                </div>
              </div>

              {/* 1X2 bars */}
              <div className="space-y-2.5 mb-5">
                {[
                  { label: '1 — ' + sample.home_team_name, pct: Math.round(sample.home_win_probability * 100), color: 'bg-gold-500' },
                  { label: 'X — Beraberlik', pct: Math.round(sample.draw_probability * 100), color: 'bg-navy-500' },
                  { label: '2 — ' + sample.away_team_name, pct: Math.round(sample.away_win_probability * 100), color: 'bg-sky-500' },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-3">
                    <span className="text-xs text-navy-400 w-36 sm:w-44 truncate flex-shrink-0">{row.label}</span>
                    <div className="flex-1 h-2 rounded-full bg-navy-700/60 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${row.color} transition-all duration-700`}
                        style={{ width: `${row.pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-white w-9 text-right flex-shrink-0">%{row.pct}</span>
                  </div>
                ))}
              </div>

              {/* Confidence + date row */}
              <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
                {sample.calibration_confidence && (
                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                    sample.calibration_confidence === 'HIGH'
                      ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                      : sample.calibration_confidence === 'MEDIUM'
                      ? 'bg-gold-500/10 border-gold-500/25 text-gold-400'
                      : 'bg-navy-600/40 border-navy-600/60 text-navy-400'
                  }`}>
                    {sample.calibration_confidence === 'HIGH' ? 'Yüksek Güven' : sample.calibration_confidence === 'MEDIUM' ? 'Orta Güven' : 'Düşük Güven'}
                  </span>
                )}
                <span className="text-[11px] text-navy-500 ml-auto">
                  {new Date(sample.calibrated_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })} kalibrasyonu
                </span>
              </div>

              <p className="text-xs text-navy-400 leading-relaxed mb-5">
                Next59 bu maçta olasılık, skor beklentisi ve senaryo baskısını birlikte okur.
              </p>

              <Link
                to="/world-cup-2026"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-gold-400 hover:text-gold-300 transition-colors"
              >
                Tüm WC2026 senaryolarını gör
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>

        {/* AI readiness banner */}
        <div className="mt-12 bg-gradient-to-r from-navy-800/60 via-navy-800/80 to-navy-800/60 border border-navy-700/50 rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-5">
          <div className="w-12 h-12 rounded-xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center flex-shrink-0">
            <Globe className="w-6 h-6 text-gold-400" />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <h4 className="font-semibold text-white mb-1">AI Analiz Motoru Hazırlanıyor</h4>
            <p className="text-sm text-navy-300 leading-relaxed">
              Her maç için form analizi, tarihsel kafa kafaya, taktiksel senaryo ve güven skoru. Turnuva başlamadan önce yayında.
            </p>
          </div>
          <Link
            to="/world-cup-2026"
            className="flex-shrink-0 inline-flex items-center gap-2 bg-gold-500 hover:bg-gold-400 text-navy-950 font-semibold px-5 py-2.5 rounded-xl transition-all text-sm hover:shadow-lg hover:shadow-gold-500/20 whitespace-nowrap"
          >
            Keşfet
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}


export default Wc2026Widget