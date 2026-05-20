import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, RefreshCw, TrendingUp, TrendingDown,
  Minus, Shield, AlertCircle, ChevronDown, Info,
  CheckCircle2, XCircle, Star,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useActiveModelStack } from '../../hooks/useActiveModelStack';

interface BestRun {
  competition_name: string;
  season_label: string;
  run_id: string;
  run_key: string;
  model_version: string;
  feature_version: string;
  elo_version: string;
  prediction_formula: string;
  started_at: string;
  completed_at: string | null;
  is_valid: boolean;
  is_production_candidate: boolean;
  invalidated_at: string | null;
  invalidation_reason: string | null;
  n_matches: number;
  brier: number;
  log_loss: number;
  rps: number;
  hit_rate: number;
  pred_draw_rate: number;
  actual_draw_rate: number;
  draw_gap: number;
  pred_home_rate: number;
  actual_home_rate: number;
  home_gap: number;
  pred_away_rate: number;
  actual_away_rate: number;
  away_gap: number;
  overconfidence_count: number;
  upset_miss_count: number;
}

interface AllRun {
  competition_name: string;
  season_label: string;
  run_id: string;
  run_key: string;
  prediction_formula: string;
  started_at: string;
  is_valid: boolean;
  is_production_candidate: boolean;
  brier: number;
  hit_rate: number;
  draw_gap: number;
  n_matches: number;
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

function formulaLabel(formula: string): { label: string; cls: string } {
  if (formula.includes('v2') || formula.includes('draw_recalibrated') || formula.match(/formula_v[2-9]/)) {
    return { label: 'Draw V2', cls: 'bg-blue-500/15 text-blue-300 border border-blue-500/25' };
  }
  return { label: 'V1', cls: 'bg-navy-800 text-navy-500 border border-navy-700' };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('tr-TR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return '–';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}d ${s % 60}s`;
}

export default function KalibrasyonDurumuPage() {
  const { stack: activeStack } = useActiveModelStack();
  const [rows, setRows] = useState<BestRun[]>([]);
  const [allRuns, setAllRuns] = useState<AllRun[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [seciliLig, setSeciliLig] = useState<string>('Tümü');
  const [acikGruplar, setAcikGruplar] = useState<Record<string, boolean>>({});
  // Per-season toggle: season key → run_id override
  const [sezonToggle, setSezonToggle] = useState<Record<string, string>>({});

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    const [bestRes, allRes] = await Promise.all([
      supabase
        .from('v_best_replay_run_per_season' as 'profiles')
        .select('*')
        .order('competition_name')
        .order('season_label'),
      supabase
        .from('v_replay_run_season_metrics' as 'profiles')
        .select('competition_name,season_label,run_id,run_key,prediction_formula,started_at,brier,hit_rate,draw_gap,n_matches')
        .order('started_at', { ascending: false }),
    ]);

    if (bestRes.error) setHata(bestRes.error.message);
    else if (bestRes.data) setRows(bestRes.data as unknown as BestRun[]);

    if (!allRes.error && allRes.data) setAllRuns(allRes.data as unknown as AllRun[]);

    setYukleniyor(false);
  }, []);

  useEffect(() => {
    document.title = 'Kalibrasyon Durumu | Admin | Next59';
    yukle();
  }, [yukle]);

  const ligAdlari = ['Tümü', ...Array.from(new Set(rows.map(r => r.competition_name)))];

  const filtrelenmis = seciliLig === 'Tümü'
    ? rows
    : rows.filter(r => r.competition_name === seciliLig);

  const gruplar: Record<string, BestRun[]> = {};
  filtrelenmis.forEach(s => {
    if (!gruplar[s.competition_name]) gruplar[s.competition_name] = [];
    gruplar[s.competition_name].push(s);
  });

  function toggleGrup(lig: string) {
    setAcikGruplar(prev => ({ ...prev, [lig]: !(prev[lig] ?? true) }));
  }

  function sezonKey(row: BestRun) {
    return `${row.competition_name}|${row.season_label}`;
  }

  // Effective row for display — may be overridden by toggle
  function effectiveRow(defaultRow: BestRun): BestRun {
    const key = sezonKey(defaultRow);
    const overrideRunId = sezonToggle[key];
    if (!overrideRunId || overrideRunId === defaultRow.run_id) return defaultRow;
    const alt = allRuns.find(r => r.run_id === overrideRunId);
    if (!alt) return defaultRow;
    // Merge override run's metrics into the display row structure
    return {
      ...defaultRow,
      run_id: alt.run_id,
      run_key: alt.run_key,
      prediction_formula: alt.prediction_formula,
      started_at: alt.started_at,
      n_matches: alt.n_matches,
      brier: alt.brier,
      hit_rate: alt.hit_rate,
      draw_gap: alt.draw_gap,
      // Partial — full metrics only on default row, show what we have
      log_loss: (alt as unknown as BestRun).log_loss ?? defaultRow.log_loss,
      rps: (alt as unknown as BestRun).rps ?? defaultRow.rps,
      pred_draw_rate: (alt as unknown as BestRun).pred_draw_rate ?? defaultRow.pred_draw_rate,
      actual_draw_rate: (alt as unknown as BestRun).actual_draw_rate ?? defaultRow.actual_draw_rate,
      home_gap: (alt as unknown as BestRun).home_gap ?? defaultRow.home_gap,
      away_gap: (alt as unknown as BestRun).away_gap ?? defaultRow.away_gap,
    };
  }

  // Global stats from best-run rows only
  const ortBrier = rows.length
    ? rows.reduce((s, r) => s + (r.brier ?? 0), 0) / rows.length : null;
  const ortIsabet = rows.length
    ? rows.reduce((s, r) => s + (r.hit_rate ?? 0), 0) / rows.length : null;
  const ortBerSap = rows.length
    ? rows.reduce((s, r) => s + (r.draw_gap ?? 0), 0) / rows.length : null;
  const ortEvSap = rows.length
    ? rows.reduce((s, r) => s + (r.home_gap ?? 0), 0) / rows.length : null;

  return (
    <div className="min-h-screen bg-navy-950 p-6">
      <div className="max-w-6xl mx-auto">

        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-5 py-3 mb-6 flex items-start gap-3">
          <Shield className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-300">
            <strong>Kalibrasyon Durumu — Yalnızca Yönetici.</strong> Her lig-sezon için en iyi (veya en güncel) replay run metriklerini gösterir.
          </p>
        </div>

        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
              <BarChart3 className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white font-display">Kalibrasyon Durumu</h1>
              <p className="text-sm text-readable-muted mt-1">
                Formül versiyonu farkındalıklı metrik görünümü
                {activeStack && (
                  <span className="ml-2 font-mono text-xs text-blue-400">{activeStack.prediction_formula}</span>
                )}
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
          <MetrikKart label="Sezon Sayısı" deger={rows.length} alt={`${ligAdlari.length - 1} lig`} />
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

        {/* Sapma açıklaması */}
        {(ortEvSap != null || ortBerSap != null) && (
          <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-4 mb-6">
            <h2 className="text-xs font-semibold text-navy-400 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Info className="w-3.5 h-3.5" />
              Genel Sapma Analizi
            </h2>
            {/* Sign convention legend */}
            <div className="bg-navy-800/50 rounded-lg px-3 py-2 mb-3 text-[11px] text-navy-400">
              <span className="text-white font-medium">Sapma işareti:</span>
              {' '}
              <span className="text-amber-400">+pp</span> = model o sonucu gerçekten <strong className="text-white">fazla</strong> tahmin ediyor &nbsp;·&nbsp;
              <span className="text-blue-400">−pp</span> = model o sonucu <strong className="text-white">eksik</strong> tahmin ediyor
            </div>
            <div className="flex flex-wrap gap-6">
              <SapmaGostergesi label="Ev Sahibi Sapması" deger={ortEvSap} />
              <SapmaGostergesi label="Beraberlik Sapması" deger={ortBerSap} />
            </div>
            <p className="text-xs text-navy-500 mt-3">
              Beraberlik sapması {ortBerSap != null && Math.abs(ortBerSap) > 0.06
                ? <span className="text-amber-400 font-medium">yüksek — draw prior ayarı önerilebilir.</span>
                : <span className="text-emerald-400 font-medium">kabul edilebilir aralıkta.</span>
              }
            </p>
          </div>
        )}

        {/* Lig filtresi */}
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
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(gruplar).map(([lig, sezonlar]) => {
              const acik = acikGruplar[lig] ?? true;
              const ligAllRuns = allRuns.filter(r => r.competition_name === lig);
              const enIyiBrier = sezonlar.reduce((mn, s) =>
                s.brier != null && s.brier < mn ? s.brier : mn, Infinity);
              const drawV2Count = sezonlar.filter(s =>
                s.prediction_formula.includes('v2') || s.prediction_formula.includes('recalibrated')
              ).length;
              const prodCandidateCount = sezonlar.filter(s => s.is_production_candidate).length;

              return (
                <div key={lig} className="bg-navy-900/50 border border-navy-800 rounded-xl overflow-hidden">
                  <button
                    onClick={() => toggleGrup(lig)}
                    className="w-full flex items-center gap-3 px-5 py-4 hover:bg-navy-800/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm font-semibold text-white">{LIG_TURKISH[lig] ?? lig}</span>
                        <span className="text-xs text-navy-500">{sezonlar.length} sezon</span>
                        {drawV2Count > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/25">
                            {drawV2Count} Draw V2
                          </span>
                        )}
                        {prodCandidateCount > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 flex items-center gap-0.5 inline-flex">
                            <Star className="w-2.5 h-2.5" />
                            {prodCandidateCount} üretim adayı
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1">
                        {enIyiBrier !== Infinity && (
                          <span className="text-[11px] text-navy-400">
                            En iyi Brier: <span className="text-emerald-400 font-mono">{enIyiBrier.toFixed(4)}</span>
                          </span>
                        )}
                        <span className="text-[11px] text-navy-400">
                          {ligAllRuns.length} run kaydı
                        </span>
                      </div>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-navy-500 transition-transform shrink-0 ${acik ? 'rotate-180' : ''}`} />
                  </button>

                  {acik && (
                    <>
                      <div className="border-t border-navy-800/50 overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-navy-800/50">
                              <th className="text-left px-5 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider">Sezon</th>
                              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider">Formül</th>
                              <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider hidden sm:table-cell" title="Üretim adayı ve geçerlilik durumu">Durum</th>
                              <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider">Maç</th>
                              <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider">Brier</th>
                              <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider">İsabet</th>
                              <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider hidden lg:table-cell" title="Tahmin − Gerçek. + = fazla tahmin, − = eksik tahmin">Ev Sap. ⓘ</th>
                              <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider hidden lg:table-cell" title="Tahmin − Gerçek. + = fazla tahmin, − = eksik tahmin">Ber. Sap. ⓘ</th>
                              <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider hidden xl:table-cell">Run Tarihi</th>
                              <th className="px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider hidden md:table-cell">Run Key</th>
                              <th className="px-3 py-2.5"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {sezonlar
                              .sort((a, b) => a.season_label.localeCompare(b.season_label))
                              .map(defaultRow => {
                                const key = sezonKey(defaultRow);
                                const row = effectiveRow(defaultRow);
                                const fLabel = formulaLabel(row.prediction_formula);
                                // Alt runs for this season (excluding current)
                                const altRuns = ligAllRuns.filter(
                                  r => r.season_label === row.season_label && r.run_id !== row.run_id
                                );

                                return (
                                  <tr key={defaultRow.run_id} className="border-b border-navy-800/30 last:border-0 hover:bg-navy-800/20 transition-colors">
                                    <td className="px-5 py-3 font-medium text-white">{row.season_label}</td>
                                    <td className="px-3 py-3">
                                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${fLabel.cls}`}>
                                        {fLabel.label}
                                      </span>
                                    </td>
                                    <td className="px-3 py-3 hidden sm:table-cell">
                                      <RunDurumuBadge
                                        isValid={row.is_valid}
                                        isProductionCandidate={row.is_production_candidate}
                                        invalidationReason={row.invalidation_reason}
                                      />
                                    </td>
                                    <td className="px-3 py-3 text-right text-navy-300 tabular-nums">{row.n_matches}</td>
                                    <td className="px-3 py-3 text-right tabular-nums">
                                      <BrierRenk deger={row.brier} />
                                    </td>
                                    <td className="px-3 py-3 text-right tabular-nums">
                                      <IsabetRenk deger={row.hit_rate} />
                                    </td>
                                    <td className="px-3 py-3 text-right tabular-nums hidden lg:table-cell">
                                      <SapmaRenk deger={row.home_gap} />
                                    </td>
                                    <td className="px-3 py-3 text-right tabular-nums hidden lg:table-cell">
                                      <SapmaRenk deger={row.draw_gap} />
                                    </td>
                                    <td className="px-3 py-3 text-right text-navy-500 text-[10px] hidden xl:table-cell whitespace-nowrap">
                                      {formatDate(row.started_at)}
                                    </td>
                                    <td className="px-3 py-3 hidden md:table-cell">
                                      <span className="font-mono text-[10px] text-navy-500 truncate max-w-[140px] block" title={row.run_key}>
                                        {row.run_key}
                                      </span>
                                    </td>
                                    {/* Version toggle */}
                                    <td className="px-3 py-3">
                                      {altRuns.length > 0 && (
                                        <div className="flex items-center gap-0.5">
                                          <button
                                            onClick={() => setSezonToggle(prev => {
                                              const next = { ...prev };
                                              delete next[key];
                                              return next;
                                            })}
                                            className={`px-1.5 py-0.5 rounded-l text-[10px] border transition-all ${
                                              !sezonToggle[key] || sezonToggle[key] === defaultRow.run_id
                                                ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                                                : 'bg-navy-800 text-navy-500 border-navy-700 hover:text-white'
                                            }`}
                                          >
                                            Best
                                          </button>
                                          {altRuns.map(ar => (
                                            <button
                                              key={ar.run_id}
                                              onClick={() => setSezonToggle(prev => ({ ...prev, [key]: ar.run_id }))}
                                              className={`px-1.5 py-0.5 border-y border-r text-[10px] last:rounded-r transition-all ${
                                                sezonToggle[key] === ar.run_id
                                                  ? 'bg-navy-600 text-white border-navy-500'
                                                  : 'bg-navy-800 text-navy-500 border-navy-700 hover:text-white'
                                              }`}
                                              title={ar.run_key}
                                            >
                                              {formulaLabel(ar.prediction_formula).label}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>

                      {/* Draw bias trend chart */}
                      {sezonlar.length > 1 && (
                        <div className="border-t border-navy-800/50 px-5 py-4">
                          <p className="text-[11px] font-semibold text-navy-500 uppercase tracking-wider mb-1">Beraberlik Sapması Trendi</p>
                          <p className="text-[10px] text-navy-600 mb-3">
                            + = model fazla tahmin ediyor &nbsp;·&nbsp; − = model eksik tahmin ediyor
                          </p>
                          <div className="flex items-end gap-2 h-16">
                            {sezonlar
                              .sort((a, b) => a.season_label.localeCompare(b.season_label))
                              .map(s => {
                                const row = effectiveRow(s);
                                const sap = row.draw_gap ?? 0;
                                const yukseklik = Math.min(Math.abs(sap) * 400, 100);
                                const renk = Math.abs(sap) < 0.04 ? 'bg-emerald-500' :
                                  Math.abs(sap) < 0.08 ? 'bg-amber-500' : 'bg-red-500';
                                const fLabel = formulaLabel(row.prediction_formula);
                                return (
                                  <div key={s.season_label} className="flex flex-col items-center gap-1 flex-1">
                                    <span className="text-[9px] text-navy-500 tabular-nums">
                                      {sap > 0 ? '+' : ''}{(sap * 100).toFixed(1)}
                                    </span>
                                    <div
                                      className={`w-full rounded-sm ${renk} opacity-70 min-h-[2px] relative`}
                                      style={{ height: `${Math.max(yukseklik, 4)}%` }}
                                      title={`${row.run_key}\n${fLabel.label}`}
                                    />
                                    <span className={`text-[8px] truncate w-full text-center ${
                                      fLabel.label === 'Draw V2' ? 'text-blue-400' : 'text-navy-600'
                                    }`}>
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

        {/* Version metadata panel */}
        {rows.length > 0 && (
          <div className="mt-6 bg-navy-900/50 border border-navy-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-navy-800/50">
              <h2 className="text-sm font-semibold text-white">Aktif Formül Versiyonları</h2>
              <p className="text-xs text-navy-500 mt-0.5">
                Her sezon için gösterilen run'ın model/formül/elo versiyonu
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-navy-800/50">
                    <th className="text-left px-5 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider">Lig / Sezon</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider">Run Key</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider hidden sm:table-cell">Formül</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider hidden sm:table-cell">Durum</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider hidden md:table-cell">Model</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider hidden lg:table-cell">ELO</th>
                    <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-navy-500 uppercase tracking-wider hidden xl:table-cell">Son Çalıştırma</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 20).map(row => {
                    const fLabel = formulaLabel(row.prediction_formula);
                    return (
                      <tr key={`${row.competition_name}|${row.season_label}`} className="border-b border-navy-800/30 last:border-0 hover:bg-navy-800/20 transition-colors">
                        <td className="px-5 py-2.5">
                          <div className="font-medium text-white">{LIG_TURKISH[row.competition_name] ?? row.competition_name}</div>
                          <div className="text-navy-500">{row.season_label}</div>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[10px] text-navy-400 max-w-[160px] truncate" title={row.run_key}>
                          {row.run_key}
                        </td>
                        <td className="px-3 py-2.5 hidden sm:table-cell">
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${fLabel.cls}`}>
                            {fLabel.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 hidden sm:table-cell">
                          <RunDurumuBadge
                            isValid={row.is_valid}
                            isProductionCandidate={row.is_production_candidate}
                            invalidationReason={row.invalidation_reason}
                          />
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[10px] text-navy-500 hidden md:table-cell">{row.model_version}</td>
                        <td className="px-3 py-2.5 font-mono text-[10px] text-navy-500 hidden lg:table-cell">{row.elo_version}</td>
                        <td className="px-3 py-2.5 text-right text-navy-500 text-[10px] hidden xl:table-cell">
                          {formatDate(row.started_at)}{row.completed_at ? ` (${formatDuration(row.started_at, row.completed_at)})` : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function SapmaGostergesi({ label, deger }: { label: string; deger: number | null }) {
  if (deger == null) return null;
  const abs = Math.abs(deger);
  const renk = abs < 0.04 ? 'text-emerald-400' : abs < 0.08 ? 'text-amber-400' : 'text-red-400';
  const Icon = deger > 0.01 ? TrendingUp : deger < -0.01 ? TrendingDown : Minus;
  const ikonRenk = deger > 0.01 ? 'text-amber-400' : deger < -0.01 ? 'text-blue-400' : 'text-emerald-400';
  const yorum = deger > 0.01
    ? '+ model fazla tahmin ediyor'
    : deger < -0.01
    ? '− model eksik tahmin ediyor'
    : 'Dengeli';
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-navy-500">{label}</span>
      <div className="flex items-center gap-1.5">
        <Icon className={`w-3.5 h-3.5 ${ikonRenk}`} />
        <span className={`text-base font-bold font-mono ${renk}`}>
          {deger > 0 ? '+' : ''}{(deger * 100).toFixed(1)}pp
        </span>
      </div>
      <span className="text-[10px] text-navy-600">{yorum}</span>
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

function SapmaRenk({ deger }: { deger: number | null }) {
  if (deger == null) return <span className="text-navy-600">–</span>;
  const abs = Math.abs(deger);
  const renk = abs < 0.04 ? 'text-emerald-400' : abs < 0.08 ? 'text-amber-400' : 'text-red-400';
  const isaret = deger > 0 ? '+' : '';
  return <span className={`font-mono ${renk}`}>{isaret}{(deger * 100).toFixed(1)}pp</span>;
}

function RunDurumuBadge({
  isValid,
  isProductionCandidate,
  invalidationReason,
}: {
  isValid: boolean;
  isProductionCandidate: boolean;
  invalidationReason: string | null;
}) {
  if (!isValid) {
    return (
      <span
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/15 text-red-400 border border-red-500/25"
        title={invalidationReason ?? 'Geçersiz run'}
      >
        <XCircle className="w-2.5 h-2.5" />
        Geçersiz
      </span>
    );
  }
  if (isProductionCandidate) {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
        <Star className="w-2.5 h-2.5" />
        Üretim
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-navy-800 text-navy-500 border border-navy-700">
      <CheckCircle2 className="w-2.5 h-2.5" />
      Geçerli
    </span>
  );
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
