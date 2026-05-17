import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, RefreshCw, TrendingUp, TrendingDown,
  Minus, Shield, AlertCircle, ChevronDown,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface KuyruKSatir {
  id: string;
  competition_name: string;
  season_label: string;
  durum: 'bekliyor' | 'calisıyor' | 'tamamlandı' | 'hata';
  islenen_mac: number | null;
  mac_sayisi: number | null;
  ortalama_brier: number | null;
  ortalama_logloss: number | null;
  isabet_orani: number | null;
  ev_sahibi_sapması: number | null;
  beraberlik_sapması: number | null;
  hata_mesaji: string | null;
  baslangic_zamani: string | null;
  bitis_zamani: string | null;
}

interface ReplayRun {
  id: string;
  competition_name: string;
  season_label: string;
  status: string;
  total_matches: number;
  processed_matches: number;
  brier_score: number | null;
  log_loss: number | null;
  accuracy: number | null;
  home_bias: number | null;
  draw_bias: number | null;
  away_bias: number | null;
  started_at: string;
  completed_at: string | null;
  elo_version: string;
  feature_version: string;
}

const LIG_TURKISH: Record<string, string> = {
  'Premier League': 'İngiltere Premier Lig',
  'Championship': 'İngiltere Championship',
  'Bundesliga': 'Almanya Bundesliga',
  'La Liga': 'İspanya La Liga',
  'Serie A': 'İtalya Serie A',
  'Ligue 1': 'Fransa Ligue 1',
  'Süper Lig': 'Türkiye Süper Lig',
};

function formatDuration(start: string, end: string | null): string {
  if (!end) return '–';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}d ${rem}s`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('tr-TR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function KalibrasyonDurumuPage() {
  const [kuyruk, setKuyruk] = useState<KuyruKSatir[]>([]);
  const [runs, setRuns] = useState<ReplayRun[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [seciliLig, setSeciliLig] = useState<string>('Tümü');
  const [acikGruplar, setAcikGruplar] = useState<Record<string, boolean>>({});

  const yukle = useCallback(async () => {
    const [kRes, rRes] = await Promise.all([
      supabase.from('kalibrasyon_kuyrugu' as 'profiles').select('*').order('competition_name').order('season_label'),
      supabase.from('replay_prediction_runs' as 'profiles').select('*').order('started_at', { ascending: false }),
    ]);

    if (kRes.error) { setHata(kRes.error.message); }
    else if (kRes.data) setKuyruk(kRes.data as unknown as KuyruKSatir[]);

    if (!rRes.error && rRes.data) setRuns(rRes.data as unknown as ReplayRun[]);

    setYukleniyor(false);
  }, []);

  useEffect(() => {
    document.title = 'Kalibrasyon Durumu | Admin | Next59';
    yukle();
  }, [yukle]);

  const tamamlananlar = kuyruk.filter(k => k.durum === 'tamamlandı');
  const ligAdlari = ['Tümü', ...Array.from(new Set(kuyruk.map(k => k.competition_name)))];

  const filtrelenmis = seciliLig === 'Tümü'
    ? tamamlananlar
    : tamamlananlar.filter(k => k.competition_name === seciliLig);

  // Group tamamlananlar by competition
  const gruplar: Record<string, KuyruKSatir[]> = {};
  filtrelenmis.forEach(s => {
    if (!gruplar[s.competition_name]) gruplar[s.competition_name] = [];
    gruplar[s.competition_name].push(s);
  });

  function toggleGrup(lig: string) {
    setAcikGruplar(prev => ({ ...prev, [lig]: !(prev[lig] ?? true) }));
  }

  // Global stats
  const ortBrier = tamamlananlar.length
    ? tamamlananlar.reduce((s, k) => s + (k.ortalama_brier ?? 0), 0) / tamamlananlar.length
    : null;
  const ortIsabet = tamamlananlar.length
    ? tamamlananlar.reduce((s, k) => s + (k.isabet_orani ?? 0), 0) / tamamlananlar.length
    : null;
  const ortEvSap = tamamlananlar.length
    ? tamamlananlar.reduce((s, k) => s + (k.ev_sahibi_sapması ?? 0), 0) / tamamlananlar.length
    : null;
  const ortBerSap = tamamlananlar.length
    ? tamamlananlar.reduce((s, k) => s + (k.beraberlik_sapması ?? 0), 0) / tamamlananlar.length
    : null;

  // Recent runs (for audit log)
  const sonRuns = runs.slice(0, 10);

  return (
    <div className="min-h-screen bg-navy-950 p-6">
      <div className="max-w-6xl mx-auto">

        {/* Uyarı */}
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-5 py-3 mb-6 flex items-start gap-3">
          <Shield className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-300">
            <strong>Kalibrasyon Durumu — Yalnızca Yönetici.</strong> Tamamlanan kalibrasyonların detaylı metrik görünümü.
          </p>
        </div>

        {/* Başlık */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
              <BarChart3 className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white font-display">Kalibrasyon Durumu</h1>
              <p className="text-sm text-readable-muted mt-1">
                Tamamlanan kalibrasyonların performans metrikleri, sapma analizi ve kalibrasyon geçmişi
              </p>
            </div>
          </div>
          <button
            onClick={yukle}
            disabled={yukleniyor}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-navy-800 border border-navy-700 text-navy-400 hover:text-white transition-all disabled:opacity-40 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${yukleniyor ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>

        {hata && (
          <div className="bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3 mb-5 flex items-center gap-2 text-xs text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {hata}
          </div>
        )}

        {/* Global özet */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <MetrikKart
            label="Tamamlanan Sezon"
            deger={tamamlananlar.length}
            alt={`${kuyruk.length} toplam`}
          />
          <MetrikKart
            label="Ort. Brier Skoru"
            deger={ortBrier != null ? ortBrier.toFixed(4) : '–'}
            alt="< 0.28 iyi"
            renk={ortBrier != null ? (ortBrier < 0.28 ? 'green' : ortBrier < 0.33 ? 'amber' : 'red') : undefined}
          />
          <MetrikKart
            label="Ort. İsabet Oranı"
            deger={ortIsabet != null ? `${(ortIsabet * 100).toFixed(1)}%` : '–'}
            alt="FT sonucu"
            renk={ortIsabet != null ? (ortIsabet > 0.52 ? 'green' : ortIsabet > 0.47 ? 'amber' : 'red') : undefined}
          />
          <MetrikKart
            label="Ort. Ber. Sapması"
            deger={ortBerSap != null ? `${ortBerSap > 0 ? '+' : ''}${(ortBerSap * 100).toFixed(1)}pp` : '–'}
            alt="0 ideal"
            renk={ortBerSap != null ? (Math.abs(ortBerSap) < 0.04 ? 'green' : Math.abs(ortBerSap) < 0.08 ? 'amber' : 'red') : undefined}
          />
        </div>

        {/* Sapma özeti açıklaması */}
        {(ortEvSap != null || ortBerSap != null) && (
          <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-4 mb-6">
            <h2 className="text-xs font-semibold text-navy-400 uppercase tracking-wider mb-3">Genel Sapma Analizi</h2>
            <div className="flex flex-wrap gap-6">
              <SapmaGostergesi label="Ev Sahibi Tahmini" deger={ortEvSap} />
              <SapmaGostergesi label="Beraberlik Tahmini" deger={ortBerSap} />
            </div>
            <p className="text-xs text-navy-500 mt-3">
              Pozitif sapma = sistem gerçekten fazla tahmin ediyor. Negatif = az tahmin ediyor.
              Beraberlik sapması {ortBerSap != null && Math.abs(ortBerSap) > 0.06
                ? <span className="text-amber-400 font-medium"> yüksek — BASE_DRAW_RATE ayarı önerilebilir.</span>
                : <span className="text-emerald-400 font-medium"> kabul edilebilir aralıkta.</span>
              }
            </p>
          </div>
        )}

        {/* Lig filtre tabları */}
        <div className="flex items-center gap-1.5 flex-wrap mb-4">
          {ligAdlari.map(lig => (
            <button
              key={lig}
              onClick={() => setSeciliLig(lig)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                seciliLig === lig
                  ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                  : 'bg-navy-800 text-navy-400 border border-navy-700 hover:text-white'
              }`}
            >
              {lig === 'Tümü' ? 'Tüm Ligler' : LIG_TURKISH[lig] ?? lig}
            </button>
          ))}
        </div>

        {/* Lig grupları */}
        {yukleniyor ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-48 bg-navy-900/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filtrelenmis.length === 0 ? (
          <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-10 text-center">
            <BarChart3 className="w-10 h-10 text-navy-600 mx-auto mb-3" />
            <p className="text-navy-400 text-sm">Henüz tamamlanan kalibrasyon yok.</p>
            <p className="text-navy-600 text-xs mt-1">Kalibrasyon Merkezi'nden kalibrasyonları başlatın.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(gruplar).map(([lig, sezonlar]) => {
              const acik = acikGruplar[lig] ?? true;
              const ligRuns = runs.filter(r => r.competition_name === lig && r.status === 'done');
              const enIyiBrier = sezonlar.reduce((mn, s) =>
                s.ortalama_brier != null && s.ortalama_brier < mn ? s.ortalama_brier : mn, Infinity);
              const enKotuBrier = sezonlar.reduce((mx, s) =>
                s.ortalama_brier != null && s.ortalama_brier > mx ? s.ortalama_brier : mx, 0);

              return (
                <div key={lig} className="bg-navy-900/50 border border-navy-800 rounded-xl overflow-hidden">
                  {/* Lig başlığı */}
                  <button
                    onClick={() => toggleGrup(lig)}
                    className="w-full flex items-center gap-3 px-5 py-4 hover:bg-navy-800/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-white">
                          {LIG_TURKISH[lig] ?? lig}
                        </span>
                        <span className="text-xs text-navy-500">{sezonlar.length} sezon</span>
                      </div>
                      <div className="flex items-center gap-4 mt-1">
                        {enIyiBrier !== Infinity && (
                          <span className="text-[11px] text-navy-400">
                            En iyi Brier: <span className="text-emerald-400 font-mono">{enIyiBrier.toFixed(4)}</span>
                          </span>
                        )}
                        {enKotuBrier > 0 && (
                          <span className="text-[11px] text-navy-400">
                            En kötü: <span className="text-red-400 font-mono">{enKotuBrier.toFixed(4)}</span>
                          </span>
                        )}
                        <span className="text-[11px] text-navy-400">
                          {ligRuns.length} run kaydı
                        </span>
                      </div>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-navy-500 transition-transform shrink-0 ${acik ? 'rotate-180' : ''}`} />
                  </button>

                  {acik && (
                    <>
                      {/* Sezon detay tablosu */}
                      <div className="border-t border-navy-800/50 overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-navy-800/50">
                              <th className="text-left px-5 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider">Sezon</th>
                              <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider">Maç</th>
                              <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider">Brier</th>
                              <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider">Log Loss</th>
                              <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider">İsabet</th>
                              <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider">Ev Sap.</th>
                              <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider">Ber. Sap.</th>
                              <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider hidden lg:table-cell">Süre</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sezonlar.sort((a, b) => a.season_label.localeCompare(b.season_label)).map(satir => {
                              const run = ligRuns.find(r => r.season_label === satir.season_label);
                              return (
                                <tr key={satir.id} className="border-b border-navy-800/30 last:border-0 hover:bg-navy-800/20 transition-colors">
                                  <td className="px-5 py-2.5 font-medium text-white">{satir.season_label}</td>
                                  <td className="px-3 py-2.5 text-right text-navy-300 tabular-nums">{satir.islenen_mac ?? satir.mac_sayisi ?? '–'}</td>
                                  <td className="px-3 py-2.5 text-right tabular-nums">
                                    {satir.ortalama_brier != null
                                      ? <BrierRenk deger={satir.ortalama_brier} />
                                      : <span className="text-navy-600">–</span>}
                                  </td>
                                  <td className="px-3 py-2.5 text-right tabular-nums text-navy-300">
                                    {satir.ortalama_logloss != null ? satir.ortalama_logloss.toFixed(4) : '–'}
                                  </td>
                                  <td className="px-3 py-2.5 text-right tabular-nums">
                                    {satir.isabet_orani != null
                                      ? <IsabetRenk deger={satir.isabet_orani} />
                                      : <span className="text-navy-600">–</span>}
                                  </td>
                                  <td className="px-3 py-2.5 text-right tabular-nums">
                                    {satir.ev_sahibi_sapması != null
                                      ? <SapmaRenk deger={satir.ev_sahibi_sapması} />
                                      : <span className="text-navy-600">–</span>}
                                  </td>
                                  <td className="px-3 py-2.5 text-right tabular-nums">
                                    {satir.beraberlik_sapması != null
                                      ? <SapmaRenk deger={satir.beraberlik_sapması} />
                                      : <span className="text-navy-600">–</span>}
                                  </td>
                                  <td className="px-3 py-2.5 text-right text-navy-500 hidden lg:table-cell">
                                    {run ? formatDuration(run.started_at, run.completed_at) : '–'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Sezon üzeri sapma grafiği (metin tabanlı) */}
                      {sezonlar.length > 1 && (
                        <div className="border-t border-navy-800/50 px-5 py-4">
                          <p className="text-[11px] font-semibold text-navy-500 uppercase tracking-wider mb-3">Sezon Üzeri Beraberlik Sapması Trendi</p>
                          <div className="flex items-end gap-2 h-16">
                            {sezonlar
                              .sort((a, b) => a.season_label.localeCompare(b.season_label))
                              .map(s => {
                                const sap = s.beraberlik_sapması ?? 0;
                                const yukseklik = Math.min(Math.abs(sap) * 400, 100);
                                const renk = Math.abs(sap) < 0.04 ? 'bg-emerald-500' :
                                  Math.abs(sap) < 0.08 ? 'bg-amber-500' : 'bg-red-500';
                                return (
                                  <div key={s.season_label} className="flex flex-col items-center gap-1 flex-1">
                                    <span className="text-[9px] text-navy-500 tabular-nums">
                                      {sap > 0 ? '+' : ''}{(sap * 100).toFixed(1)}
                                    </span>
                                    <div
                                      className={`w-full rounded-sm ${renk} opacity-70 min-h-[2px]`}
                                      style={{ height: `${Math.max(yukseklik, 4)}%` }}
                                    />
                                    <span className="text-[9px] text-navy-600 truncate w-full text-center">
                                      {s.season_label.slice(0, 7)}
                                    </span>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Son çalıştırma geçmişi */}
        {sonRuns.length > 0 && (
          <div className="mt-6 bg-navy-900/50 border border-navy-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-navy-800/50">
              <h2 className="text-sm font-semibold text-white">Son Kalibrasyon Çalıştırmaları</h2>
              <p className="text-xs text-navy-500 mt-0.5">Replay motoru çalıştırma geçmişi</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-navy-800/50">
                    <th className="text-left px-5 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider">Lig / Sezon</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider">Durum</th>
                    <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider">Maç</th>
                    <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider hidden sm:table-cell">Brier</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider hidden md:table-cell">ELO Versiyonu</th>
                    <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider hidden lg:table-cell">Başlangıç</th>
                    <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider hidden lg:table-cell">Süre</th>
                  </tr>
                </thead>
                <tbody>
                  {sonRuns.map(run => (
                    <tr key={run.id} className="border-b border-navy-800/30 last:border-0 hover:bg-navy-800/20 transition-colors">
                      <td className="px-5 py-2.5">
                        <div className="font-medium text-white">{LIG_TURKISH[run.competition_name] ?? run.competition_name}</div>
                        <div className="text-navy-500">{run.season_label}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <RunDurumRozeti status={run.status} />
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-navy-300">
                        {run.processed_matches}/{run.total_matches}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums hidden sm:table-cell">
                        {run.brier_score != null
                          ? <BrierRenk deger={run.brier_score} />
                          : <span className="text-navy-600">–</span>}
                      </td>
                      <td className="px-3 py-2.5 text-navy-400 font-mono text-[10px] hidden md:table-cell">
                        {run.elo_version}
                      </td>
                      <td className="px-3 py-2.5 text-right text-navy-500 hidden lg:table-cell">
                        {formatDate(run.started_at)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-navy-400 hidden lg:table-cell">
                        {formatDuration(run.started_at, run.completed_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RunDurumRozeti({ status }: { status: string }) {
  const cfg: Record<string, { cls: string; label: string }> = {
    done:    { cls: 'bg-emerald-500/15 text-emerald-400', label: 'Tamamlandı' },
    failed:  { cls: 'bg-red-500/15 text-red-400', label: 'Hata' },
    running: { cls: 'bg-amber-500/20 text-amber-400', label: 'Çalışıyor' },
    pending: { cls: 'bg-navy-700 text-navy-400', label: 'Bekliyor' },
  };
  const c = cfg[status] ?? cfg.pending;
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${c.cls}`}>
      {c.label}
    </span>
  );
}

function SapmaGostergesi({ label, deger }: { label: string; deger: number | null }) {
  if (deger == null) return null;
  const abs = Math.abs(deger);
  const renk = abs < 0.04 ? 'text-emerald-400' : abs < 0.08 ? 'text-amber-400' : 'text-red-400';
  const Icon = deger > 0.01 ? TrendingUp : deger < -0.01 ? TrendingDown : Minus;
  const ikonRenk = deger > 0.01 ? 'text-amber-400' : deger < -0.01 ? 'text-blue-400' : 'text-emerald-400';
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-navy-500">{label}</span>
      <div className="flex items-center gap-1.5">
        <Icon className={`w-3.5 h-3.5 ${ikonRenk}`} />
        <span className={`text-base font-bold font-mono ${renk}`}>
          {deger > 0 ? '+' : ''}{(deger * 100).toFixed(1)}pp
        </span>
      </div>
    </div>
  );
}

function BrierRenk({ deger }: { deger: number }) {
  const renk = deger < 0.28 ? 'text-emerald-400' : deger < 0.33 ? 'text-amber-400' : 'text-red-400';
  return <span className={`font-mono ${renk}`}>{deger.toFixed(4)}</span>;
}

function IsabetRenk({ deger }: { deger: number }) {
  const renk = deger > 0.52 ? 'text-emerald-400' : deger > 0.47 ? 'text-amber-400' : 'text-red-400';
  return <span className={`font-mono ${renk}`}>{(deger * 100).toFixed(1)}%</span>;
}

function SapmaRenk({ deger }: { deger: number }) {
  const abs = Math.abs(deger);
  const renk = abs < 0.04 ? 'text-emerald-400' : abs < 0.08 ? 'text-amber-400' : 'text-red-400';
  const isaret = deger > 0 ? '+' : '';
  return <span className={`font-mono ${renk}`}>{isaret}{(deger * 100).toFixed(1)}pp</span>;
}

function MetrikKart({
  label, deger, alt, renk,
}: {
  label: string;
  deger: number | string;
  alt?: string;
  renk?: 'green' | 'amber' | 'red' | 'blue';
}) {
  const degerRenk = renk === 'green' ? 'text-emerald-400' :
    renk === 'amber' ? 'text-amber-400' :
    renk === 'red' ? 'text-red-400' :
    renk === 'blue' ? 'text-blue-400' : 'text-white';
  return (
    <div className="bg-navy-900/50 border border-navy-800 rounded-xl px-4 py-3">
      <div className={`text-xl font-bold tabular-nums ${degerRenk}`}>{deger}</div>
      <div className="text-[11px] text-readable-muted mt-0.5">{label}</div>
      {alt && <div className="text-[10px] text-navy-600 mt-0.5">{alt}</div>}
    </div>
  );
}
