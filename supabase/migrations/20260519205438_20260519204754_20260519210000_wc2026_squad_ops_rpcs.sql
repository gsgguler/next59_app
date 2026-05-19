/*
  # WC2026 Bench Impact Readiness RPC

  ## Summary
  Adds `wc2026_get_bench_impact_readiness()` — a read-only diagnostic function
  that returns one row per team showing exactly what bench data is present,
  what is missing, why the bench impact index is at neutral 0.0, and what is
  needed before a real index can be computed.

  ## What it returns
  - All 144 calibration profile rows (latest per team)
  - bench_available flag FROM the calibration engine (always true = default flag, not real data)
  - has_bench_data: TRUE only when bench_avg_rating IS NOT NULL (real data present)
  - has_probable_xi_data: TRUE only when probable_xi_avg_rating IS NOT NULL
  - has_player_pool: TRUE when player_pool_count > 0
  - has_perf_snapshots: TRUE when at least one wc2026_player_performance_snapshots row exists
  - probable_squad_count: rows in wc2026_probable_squads for this team
  - bench_readiness_status: 'nötr_varsayım' | 'veri_bekleniyor' | 'kısmi' | 'hazır'
  - bench_readiness_reason: human-readable Turkish explanation
  - availability_window: text warning about when official squad data is expected

  ## Security
  SECURITY DEFINER, search_path locked, granted to authenticated only.
  Read-only — touches no data.
*/

CREATE OR REPLACE FUNCTION public.wc2026_get_bench_impact_readiness()
RETURNS TABLE (
  api_football_team_id        integer,
  team_name                   text,
  fifa_code                   text,
  confederation               text,
  calibration_confidence      text,
  -- bench index (always present, may be 0.0 neutral)
  wc2026_bench_impact_index   numeric,
  bench_avg_rating            numeric,
  bench_quality_vs_xi         numeric,
  -- data presence flags (honest, not engine defaults)
  has_bench_data              boolean,
  has_probable_xi_data        boolean,
  has_player_pool             boolean,
  has_perf_snapshots          boolean,
  -- counts
  player_pool_count           integer,
  probable_squad_count        bigint,
  perf_snapshot_count         bigint,
  -- derived readiness
  bench_readiness_status      text,
  bench_readiness_reason      text,
  availability_window_warning text,
  -- calibration metadata
  calibrated_at               timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH latest_profiles AS (
  SELECT DISTINCT ON (api_football_team_id)
    api_football_team_id,
    team_name,
    fifa_code,
    confederation,
    calibration_confidence,
    wc2026_bench_impact_index,
    bench_avg_rating,
    bench_quality_vs_xi,
    probable_xi_avg_rating,
    player_pool_count,
    calibrated_at
  FROM public.wc2026_team_calibration_profiles
  ORDER BY api_football_team_id, calibrated_at DESC
),
squad_counts AS (
  SELECT api_football_team_id, COUNT(*) AS cnt
  FROM public.wc2026_probable_squads
  GROUP BY api_football_team_id
),
snapshot_counts AS (
  SELECT api_football_team_id, COUNT(*) AS cnt
  FROM public.wc2026_player_performance_snapshots
  GROUP BY api_football_team_id
)
SELECT
  p.api_football_team_id,
  p.team_name,
  p.fifa_code,
  p.confederation,
  p.calibration_confidence,

  -- bench index: NULL → 0.0 (explicit neutral)
  COALESCE(p.wc2026_bench_impact_index, 0.0)  AS wc2026_bench_impact_index,
  p.bench_avg_rating,
  p.bench_quality_vs_xi,

  -- HONEST flags: only true when actual data exists, not engine defaults
  (p.bench_avg_rating IS NOT NULL)            AS has_bench_data,
  (p.probable_xi_avg_rating IS NOT NULL)      AS has_probable_xi_data,
  (p.player_pool_count > 0)                   AS has_player_pool,
  (COALESCE(sn.cnt, 0) > 0)                   AS has_perf_snapshots,

  p.player_pool_count,
  COALESCE(sq.cnt, 0)                         AS probable_squad_count,
  COALESCE(sn.cnt, 0)                         AS perf_snapshot_count,

  -- readiness status
  CASE
    WHEN p.bench_avg_rating IS NOT NULL AND p.probable_xi_avg_rating IS NOT NULL
      THEN 'hazır'
    WHEN p.bench_avg_rating IS NOT NULL OR p.probable_xi_avg_rating IS NOT NULL
      THEN 'kısmi'
    WHEN p.player_pool_count > 0
      THEN 'veri_bekleniyor'
    ELSE 'nötr_varsayım'
  END AS bench_readiness_status,

  -- readiness reason (Turkish, honest)
  CASE
    WHEN p.bench_avg_rating IS NOT NULL AND p.probable_xi_avg_rating IS NOT NULL
      THEN 'Yedek ve ilk 11 verileri mevcut — endeks aktif hesaplandı.'
    WHEN p.bench_avg_rating IS NOT NULL
      THEN 'Yedek verisi var; muhtemel XI verisi eksik — kısmi hesaplama.'
    WHEN p.probable_xi_avg_rating IS NOT NULL
      THEN 'Muhtemel XI verisi var; yedek verisi eksik — kısmi hesaplama.'
    WHEN p.player_pool_count > 0
      THEN 'Oyuncu havuzu mevcut; yedek/XI ayrımı henüz yapılmadı.'
    ELSE 'Yedek oyuncu verisi yok. Nötr varsayım (0.0) uygulandı. Resmî kadro açıklanana kadar değişmez.'
  END AS bench_readiness_reason,

  -- availability window warning
  'Resmî kadro: DK 2026 grup aşaması öncesi (Haziran 2026). '
  || 'Kesin yedek verisi bu tarihe kadar beklenmez. '
  || 'Kalibrasyonu engellemez — nötr varsayım aktif.' AS availability_window_warning,

  p.calibrated_at

FROM latest_profiles p
LEFT JOIN squad_counts  sq ON sq.api_football_team_id = p.api_football_team_id
LEFT JOIN snapshot_counts sn ON sn.api_football_team_id = p.api_football_team_id
ORDER BY p.confederation, p.team_name;
$$;

GRANT EXECUTE ON FUNCTION public.wc2026_get_bench_impact_readiness() TO authenticated;
