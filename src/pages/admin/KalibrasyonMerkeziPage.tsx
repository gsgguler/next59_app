import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Sliders, Play, RefreshCw, CheckCircle, AlertCircle,
  Clock, ChevronDown, Shield, Info, Zap,
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
  run_key: string | null;
}

interface BestRunIndex {
  competition_name: string;
  season_label: string;
  run_key: string;
  prediction_formula: string;
  is_production_candidate: boolean;
  brier: number;
  hit_rate: number;
  draw_gap: number;
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

const DURUM_RENK: Record<string, string> = {
  bekliyor:    'bg-navy-700 text-navy-300',
  calisıyor:   'bg-amber-500/20 text-amber-400',
  tamamlandı:  'bg-emerald-500/15 text-emerald-400',
  hata:        'bg-red-500/15 text-red-400',
};

const DURUM_TR: Record<string, string> = {
  bekliyor:   'Bekliyor',
  calisıyor:  'Çalışıyor...',
  tamamlandı: 'Tamamlandı',
  hata:       'Hata',
};

export default function KalibrasyonMerkeziPage() {
  const [kuyruk, setKuyruk] = useState<KuyruKSatir[]>([]);
  const [bestRunIndex, setBestRunIndex] = useState<Record<string, BestRunIndex>>({});
  const [yukleniyor, setYukleniyor] = useState(true);
  const [calisanSatir, setCalisanSatir] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [seciliLig, setSeciliLig] = useState<string>('Tümü');
  const [bilgiPanel, setBilgiPanel] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const yukle = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const [kRes, bRes] = await Promise.all([
      sb.from('kalibrasyon_kuyrugu').select('*').order('competition_name').order('season_label'),
      sb.from('v_best_replay_run_per_season').select('competition_name,season_label,run_key,prediction_formula,is_production_candidate,brier,hit_rate,draw_gap'),
    ]);

    if (!kRes.error && kRes.data) setKuyruk(kRes.data as KuyruKSatir[]);
    if (kRes.error) setHata(kRes.error.message);

    if (!bRes.error && bRes.data) {
      const idx: Record<string, BestRunIndex> = {};
      (bRes.data as BestRunIndex[]).forEach(r => {
        idx[`${r.competition_name}|${r.season_label}`] = r;
      });
      setBestRunIndex(idx);
    }

    setYukleniyor(false);
  }, []);

  useEffect(() => {
    document.title = 'Kalibrasyon Merkezi | Admin | Next59';
    yukle();
  }, [yukle]);

  // Çalışan varken polling
  useEffect(() => {
    if (calisanSatir) {
      pollingRef.current = setInterval(yukle, 3000);
    } else {
      if (pollingRef.current) clearInterval(pollingRef.current);
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [calisanSatir, yukle]);

  async function kalibrasyonBaslat(satir: KuyruKSatir) {
    setCalisanSatir(satir.id);
    setHata(null);

    // Optimistik güncelleme
    setKuyruk(prev => prev.map(k =>
      k.id === satir.id ? { ...k, durum: 'calisıyor' } : k
    ));

    const { error } = await supabase.rpc('kalibrasyon_baslat', {
      p_competition_name: satir.competition_name,
      p_season_label: satir.season_label,
    });

    if (error) {
      setHata(`${satir.competition_name} ${satir.season_label}: ${error.message}`);
      setKuyruk(prev => prev.map(k =>
        k.id === satir.id ? { ...k, durum: 'hata', hata_mesaji: error.message } : k
      ));
    }

    setCalisanSatir(null);
    await yukle();
  }

  async function siraliCalistir(ligAdi: string) {
    const siradakiler = kuyruk.filter(k =>
      k.durum === 'bekliyor' &&
      (ligAdi === 'Tümü' || k.competition_name === ligAdi)
    );

    for (const satir of siradakiler) {
      await kalibrasyonBaslat(satir);
    }
  }

  async function sifirla(satir: KuyruKSatir) {
    if (!confirm(`${satir.competition_name} ${satir.season_label} kalibrasyonunu sıfırlamak istediğinizden emin misiniz?`)) return;

    await supabase.rpc('kalibrasyon_sifirla', {
      p_competition_name: satir.competition_name,
      p_season_label: satir.season_label,
    });
    await yukle();
  }

  const ligAdlari = ['Tümü', ...Object.keys(LIG_TURKISH)];
  const filtrelenmis = seciliLig === 'Tümü'
    ? kuyruk
    : kuyruk.filter(k => k.competition_name === seciliLig);

  // İstatistik özeti
  const toplam = filtrelenmis.length;
  const tamamlandi = filtrelenmis.filter(k => k.durum === 'tamamlandı').length;
  const bekliyor = filtrelenmis.filter(k => k.durum === 'bekliyor').length;
  const hataVar = filtrelenmis.filter(k => k.durum === 'hata').length;
  const tamamlanmisler = filtrelenmis.filter(k => k.durum === 'tamamlandı');
  const ortBrier = tamamlanmisler.length
    ? tamamlanmisler.reduce((s, k) => s + (k.ortalama_brier ?? 0), 0) / tamamlanmisler.length
    : null;
  const ortIsabet = tamamlanmisler.length
    ? tamamlanmisler.reduce((s, k) => s + (k.isabet_orani ?? 0), 0) / tamamlanmisler.length
    : null;

  return (
    <div className="min-h-screen bg-navy-950 p-6">
      <div className="max-w-6xl mx-auto">

        {/* Admin uyarısı */}
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-5 py-3 mb-6 flex items-start gap-3">
          <Shield className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-300">
            <strong>Kalibrasyon Merkezi — Yalnızca Yönetici.</strong> Bu ekran sistemin maç öncesi tahmin kalibrasyonunu yönetir. Dışarıya yansımaz.
          </p>
        </div>

        {/* Başlık */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
              <Sliders className="w-6 h-6 text-champagne" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white font-display">Kalibrasyon Merkezi</h1>
              <p className="text-sm text-readable-muted mt-1">
                Her lig ve sezon için sistem maç öncesinde elindeki verilerle tahmin yaparak kendini kalibre eder
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setBilgiPanel(!bilgiPanel)}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-navy-800 border border-navy-700 text-navy-400 hover:text-white transition-all"
            >
              <Info className="w-3.5 h-3.5" />
              Nasıl Çalışır?
            </button>
            <button
              onClick={yukle}
              disabled={yukleniyor || !!calisanSatir}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-navy-800 border border-navy-700 text-navy-400 hover:text-white transition-all disabled:opacity-40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${yukleniyor ? 'animate-spin' : ''}`} />
              Yenile
            </button>
          </div>
        </div>

        {/* Nasıl Çalışır paneli */}
        {bilgiPanel && (
          <div className="bg-navy-900/60 border border-navy-700 rounded-xl p-5 mb-6">
            <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Info className="w-4 h-4 text-champagne" />
              Kalibrasyon Nasıl Çalışır?
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-navy-300 leading-relaxed">
              <div>
                <p className="text-champagne font-semibold mb-1">Ne Yapıyor?</p>
                <p>Sistem, seçtiğiniz lig ve sezon için her maçı — sanki maç başlamadan 2 saat önce olmuş gibi — elinde o ana kadar olan verilerle tahmin ediyor. Maç sonucunu <strong className="text-white">kesinlikle görmüyor</strong>.</p>
              </div>
              <div>
                <p className="text-champagne font-semibold mb-1">Hangi Verileri Kullanıyor?</p>
                <p>ELO puanları (takımların o ana kadarki gücü), son 5 maç formu, gol ortalamaları, maç istatistikleri. Maçın sonucu, ikinci yarı ve COVID dönemi bilgileri kullanılmıyor.</p>
              </div>
              <div>
                <p className="text-champagne font-semibold mb-1">Neden Kalibrasyon Yapıyor?</p>
                <p>Her lig farklı. Bundesliga'da beraberlik az olur, Süper Lig'de ev sahibi avantajı yüksektir. Sistem bunu öğrenerek o lige özel düzeltmeler yapar.</p>
              </div>
              <div>
                <p className="text-champagne font-semibold mb-1">COVID Dönemi</p>
                <p>2020-03-01 ile 2021-08-31 arasındaki maçlar işaretlenir. Bu dönemde taraftar yoktu, ev sahibi avantajı düştü — kalibrasyon bu dönemde dondurulur, karışmaması için.</p>
              </div>
              <div>
                <p className="text-champagne font-semibold mb-1">Sapma İşaret Kuralı</p>
                <p>
                  <span className="text-amber-400 font-medium">+ pp</span> = model o sonucu gerçekten <strong className="text-white">fazla</strong> tahmin ediyor.{' '}
                  <span className="text-blue-300 font-medium">− pp</span> = model o sonucu <strong className="text-white">eksik</strong> tahmin ediyor.{' '}
                  Sıfıra yakın = iyi kalibre.
                </p>
              </div>
            </div>
          </div>
        )}

        {hata && (
          <div className="bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3 mb-5 flex items-center gap-2 text-xs text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {hata}
          </div>
        )}

        {/* Özet kartlar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <OzetKart label="Toplam" deger={toplam} />
          <OzetKart label="Tamamlandı" deger={tamamlandi} renk="green" />
          <OzetKart label="Bekliyor" deger={bekliyor} renk={bekliyor > 0 ? 'amber' : undefined} />
          <OzetKart label="Hata" deger={hataVar} renk={hataVar > 0 ? 'red' : undefined} />
          <OzetKart
            label="Ort. İsabet"
            deger={ortIsabet != null ? `${(ortIsabet * 100).toFixed(1)}%` : '–'}
            renk="blue"
          />
        </div>

        {/* Lig filtresi + Hepsini Çalıştır */}
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {ligAdlari.map(lig => (
              <button
                key={lig}
                onClick={() => setSeciliLig(lig)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  seciliLig === lig
                    ? 'bg-champagne/15 text-champagne border border-champagne/30'
                    : 'bg-navy-800 text-navy-400 border border-navy-700 hover:text-white'
                }`}
              >
                {lig === 'Tümü' ? 'Tüm Ligler' : LIG_TURKISH[lig] ?? lig}
              </button>
            ))}
          </div>

          {bekliyor > 0 && (
            <button
              onClick={() => siraliCalistir(seciliLig)}
              disabled={!!calisanSatir}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-champagne/15 border border-champagne/30 text-champagne text-sm font-semibold hover:bg-champagne/25 transition-all disabled:opacity-40 shrink-0"
            >
              {calisanSatir
                ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Çalışıyor...</>
                : <><Zap className="w-3.5 h-3.5" />{seciliLig === 'Tümü' ? 'Hepsini Kalibre Et' : `${LIG_TURKISH[seciliLig] ?? seciliLig}'i Kalibre Et`}</>
              }
            </button>
          )}
        </div>

        {/* Gruplandırılmış lig listesi */}
        {yukleniyor ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 bg-navy-900/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <LigGrubuListesi
            satirlar={filtrelenmis}
            calisanSatirId={calisanSatir}
            bestRunIndex={bestRunIndex}
            onBaslat={kalibrasyonBaslat}
            onSifirla={sifirla}
          />
        )}
      </div>
    </div>
  );
}

function LigGrubuListesi({
  satirlar, calisanSatirId, bestRunIndex, onBaslat, onSifirla,
}: {
  satirlar: KuyruKSatir[];
  calisanSatirId: string | null;
  bestRunIndex: Record<string, BestRunIndex>;
  onBaslat: (s: KuyruKSatir) => void;
  onSifirla: (s: KuyruKSatir) => void;
}) {
  // Ligi gruplara ayır
  const gruplar: Record<string, KuyruKSatir[]> = {};
  satirlar.forEach(s => {
    if (!gruplar[s.competition_name]) gruplar[s.competition_name] = [];
    gruplar[s.competition_name].push(s);
  });

  const [acikGruplar, setAcikGruplar] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    Object.keys(gruplar).forEach(g => { init[g] = true; });
    return init;
  });

  function toggleGrup(lig: string) {
    setAcikGruplar(prev => ({ ...prev, [lig]: !prev[lig] }));
  }

  return (
    <div className="space-y-3">
      {Object.entries(gruplar).map(([lig, sezonlar]) => {
        const tamamlandi = sezonlar.filter(s => s.durum === 'tamamlandı').length;
        const acik = acikGruplar[lig] ?? true;

        return (
          <div key={lig} className="bg-navy-900/50 border border-navy-800 rounded-xl overflow-hidden">
            {/* Lig başlığı */}
            <button
              onClick={() => toggleGrup(lig)}
              className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-navy-800/30 transition-colors"
            >
              <div className="flex-1 flex items-center gap-3 min-w-0">
                <span className="text-sm font-semibold text-white">
                  {LIG_TURKISH[lig] ?? lig}
                </span>
                <span className="text-xs text-navy-400">
                  {tamamlandi}/{sezonlar.length} sezon tamamlandı
                </span>
              </div>

              {/* İlerleme çubuğu */}
              <div className="hidden sm:flex items-center gap-2 w-32">
                <div className="flex-1 h-1.5 bg-navy-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${(tamamlandi / sezonlar.length) * 100}%` }}
                  />
                </div>
                <span className="text-[11px] text-navy-400 tabular-nums w-8 text-right">
                  {Math.round((tamamlandi / sezonlar.length) * 100)}%
                </span>
              </div>

              <ChevronDown className={`w-4 h-4 text-navy-500 transition-transform ${acik ? 'rotate-180' : ''} shrink-0`} />
            </button>

            {/* Sezon satırları */}
            {acik && (
              <div className="border-t border-navy-800/50">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-navy-800/50">
                        <th className="text-left px-5 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider">Sezon</th>
                        <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider">Durum</th>
                        <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider hidden sm:table-cell">Maç</th>
                        <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider hidden md:table-cell">Brier</th>
                        <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider hidden md:table-cell">İsabet</th>
                        <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider hidden lg:table-cell" title="Tahmin − Gerçek. + = model fazla tahmin ediyor, − = model eksik tahmin ediyor">Ev Sap. ⓘ</th>
                        <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider hidden lg:table-cell" title="Tahmin − Gerçek. + = model fazla tahmin ediyor, − = model eksik tahmin ediyor">Ber. Sap. ⓘ</th>
                        <th className="px-3 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sezonlar.sort((a, b) => a.season_label.localeCompare(b.season_label)).map(satir => (
                        <SezonSatiri
                          key={satir.id}
                          satir={satir}
                          bestRun={bestRunIndex[`${satir.competition_name}|${satir.season_label}`] ?? null}
                          calisuyor={calisanSatirId === satir.id}
                          disabled={!!calisanSatirId}
                          onBaslat={() => onBaslat(satir)}
                          onSifirla={() => onSifirla(satir)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formulaRozeti(formula: string | null | undefined): { label: string; cls: string } | null {
  if (!formula) return null;
  if (formula.includes('v2') || formula.includes('recalibrated')) {
    return { label: 'Draw V2', cls: 'bg-blue-500/15 text-blue-300 border border-blue-500/25' };
  }
  return { label: 'V1', cls: 'bg-navy-700 text-navy-500 border border-navy-600' };
}

function SezonSatiri({
  satir, bestRun, calisuyor, disabled, onBaslat, onSifirla,
}: {
  satir: KuyruKSatir;
  bestRun: BestRunIndex | null;
  calisuyor: boolean;
  disabled: boolean;
  onBaslat: () => void;
  onSifirla: () => void;
}) {
  const ilerleme = satir.mac_sayisi && satir.islenen_mac
    ? Math.round(((satir.islenen_mac ?? 0) / satir.mac_sayisi) * 100)
    : 0;

  // When completed, prefer live best-run metrics over stale kalibrasyon_kuyrugu snapshot.
  // home_gap is not in BestRunIndex, so always fall back to the queue row value.
  const displayBrier = satir.durum === 'tamamlandı' && bestRun ? bestRun.brier : satir.ortalama_brier;
  const displayIsabet = satir.durum === 'tamamlandı' && bestRun ? bestRun.hit_rate : satir.isabet_orani;
  const displayEvSap = satir.ev_sahibi_sapması;
  const displayBerSap = satir.durum === 'tamamlandı' && bestRun ? bestRun.draw_gap : satir.beraberlik_sapması;
  const fRozet = satir.durum === 'tamamlandı' ? formulaRozeti(bestRun?.prediction_formula) : null;

  return (
    <tr className={`border-b border-navy-800/30 last:border-0 transition-colors ${
      calisuyor ? 'bg-amber-500/5' : 'hover:bg-navy-800/20'
    }`}>
      <td className="px-5 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-white">{satir.season_label}</span>
          {fRozet && (
            <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-medium ${fRozet.cls}`}>
              {fRozet.label}
            </span>
          )}
          {satir.durum === 'tamamlandı' && bestRun?.is_production_candidate && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
              ★ üretim
            </span>
          )}
        </div>
        {satir.durum === 'tamamlandı' && bestRun && (
          <span className="text-[9px] text-navy-600 font-mono truncate max-w-[120px] block" title={bestRun.run_key}>
            {bestRun.run_key}
          </span>
        )}
      </td>

      <td className="px-3 py-3">
        <div className="flex flex-col gap-1">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium w-fit ${DURUM_RENK[satir.durum]}`}>
            {satir.durum === 'calisıyor' && <RefreshCw className="w-3 h-3 animate-spin" />}
            {satir.durum === 'tamamlandı' && <CheckCircle className="w-3 h-3" />}
            {satir.durum === 'hata' && <AlertCircle className="w-3 h-3" />}
            {satir.durum === 'bekliyor' && <Clock className="w-3 h-3" />}
            {DURUM_TR[satir.durum]}
          </span>
          {calisuyor && satir.mac_sayisi && (
            <div className="flex items-center gap-1.5">
              <div className="w-20 h-1 bg-navy-800 rounded-full overflow-hidden">
                <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${ilerleme}%` }} />
              </div>
              <span className="text-[10px] text-navy-400">{satir.islenen_mac ?? 0}/{satir.mac_sayisi}</span>
            </div>
          )}
          {satir.durum === 'hata' && satir.hata_mesaji && (
            <span className="text-[10px] text-red-400 truncate max-w-[150px]" title={satir.hata_mesaji}>
              {satir.hata_mesaji}
            </span>
          )}
        </div>
      </td>

      <td className="px-3 py-3 hidden sm:table-cell text-navy-300 tabular-nums">
        {satir.durum === 'tamamlandı'
          ? <span className="text-emerald-400">{satir.islenen_mac ?? satir.mac_sayisi}</span>
          : satir.mac_sayisi ?? '–'
        }
      </td>

      <td className="px-3 py-3 hidden md:table-cell tabular-nums">
        {displayBrier != null
          ? <BrierRenk deger={displayBrier} />
          : <span className="text-navy-600">–</span>
        }
      </td>

      <td className="px-3 py-3 hidden md:table-cell tabular-nums">
        {displayIsabet != null
          ? <span className="text-white">{(displayIsabet * 100).toFixed(1)}%</span>
          : <span className="text-navy-600">–</span>
        }
      </td>

      <td className="px-3 py-3 hidden lg:table-cell tabular-nums">
        {displayEvSap != null
          ? <SapmaRenk deger={displayEvSap} />
          : <span className="text-navy-600">–</span>
        }
      </td>

      <td className="px-3 py-3 hidden lg:table-cell tabular-nums">
        {displayBerSap != null
          ? <SapmaRenk deger={displayBerSap} />
          : <span className="text-navy-600">–</span>
        }
      </td>

      <td className="px-3 py-3">
        <div className="flex items-center gap-1 justify-end">
          {satir.durum === 'bekliyor' && (
            <button
              onClick={onBaslat}
              disabled={disabled}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-champagne/10 border border-champagne/25 text-champagne text-[11px] font-medium hover:bg-champagne/20 transition-all disabled:opacity-30"
            >
              <Play className="w-3 h-3" />
              Başlat
            </button>
          )}
          {satir.durum === 'tamamlandı' && (
            <button
              onClick={onSifirla}
              disabled={disabled}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-navy-500 text-[11px] hover:text-navy-300 transition-colors disabled:opacity-30"
              title="Sıfırla"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          )}
          {satir.durum === 'hata' && (
            <button
              onClick={onBaslat}
              disabled={disabled}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/25 text-red-400 text-[11px] font-medium hover:bg-red-500/20 transition-all disabled:opacity-30"
            >
              <RefreshCw className="w-3 h-3" />
              Tekrar Dene
            </button>
          )}
          {calisuyor && (
            <span className="flex items-center gap-1 px-2.5 py-1.5 text-amber-400 text-[11px]">
              <RefreshCw className="w-3 h-3 animate-spin" />
              İşleniyor
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

function BrierRenk({ deger }: { deger: number }) {
  const renk = deger < 0.28 ? 'text-emerald-400' : deger < 0.33 ? 'text-amber-400' : 'text-red-400';
  return <span className={`font-mono ${renk}`}>{deger.toFixed(4)}</span>;
}

function SapmaRenk({ deger }: { deger: number }) {
  const abs = Math.abs(deger);
  const renk = abs < 0.04 ? 'text-emerald-400' : abs < 0.08 ? 'text-amber-400' : 'text-red-400';
  const isaret = deger > 0 ? '+' : '';
  return <span className={`font-mono ${renk}`}>{isaret}{(deger * 100).toFixed(1)}pp</span>;
}

function OzetKart({ label, deger, renk }: { label: string; deger: number | string; renk?: 'green' | 'amber' | 'red' | 'blue' }) {
  const degerRenk = renk === 'green' ? 'text-emerald-400' :
    renk === 'amber' ? 'text-amber-400' :
    renk === 'red' ? 'text-red-400' :
    renk === 'blue' ? 'text-blue-400' : 'text-white';
  return (
    <div className="bg-navy-900/50 border border-navy-800 rounded-xl px-4 py-3">
      <div className={`text-xl font-bold tabular-nums ${degerRenk}`}>{deger}</div>
      <div className="text-[11px] text-readable-muted mt-0.5">{label}</div>
    </div>
  );
}

