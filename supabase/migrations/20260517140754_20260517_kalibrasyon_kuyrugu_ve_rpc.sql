/*
  # Kalibrasyon Kuyruğu — Tablo ve Yardımcı Fonksiyonlar

  ## Yeni Tablo
  - model_lab.kalibrasyon_kuyrugu
    Her lig × sezon kombinasyonu için kalibrasyon durumunu takip eder.
    Admin panelinden sıralı çalıştırma için kullanılır.

  ## Yeni Fonksiyonlar
  - model_lab.kalibrasyon_kuyrugu_listele() → mevcut durum özeti
  - model_lab.kalibrasyon_kuyruğu_sıfırla(p_competition, p_season) → kuyruğu sıfırla
*/

CREATE TABLE IF NOT EXISTS model_lab.kalibrasyon_kuyrugu (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_name    text NOT NULL,
  season_label        text NOT NULL,
  durum               text NOT NULL DEFAULT 'bekliyor'
                      CHECK (durum IN ('bekliyor','calisıyor','tamamlandı','hata')),
  run_key             text,
  run_id              uuid,
  mac_sayisi          integer,
  islenen_mac         integer DEFAULT 0,
  ortalama_brier      numeric,
  ortalama_logloss    numeric,
  isabet_orani        numeric,
  ev_sahibi_sapması   numeric,
  beraberlik_sapması  numeric,
  hata_mesaji         text,
  baslangic_zamani    timestamptz,
  bitis_zamani        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competition_name, season_label)
);

ALTER TABLE model_lab.kalibrasyon_kuyrugu ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin kalibrasyon kuyruğunu okuyabilir"
  ON model_lab.kalibrasyon_kuyrugu FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admin kalibrasyon kuyruğuna yazabilir"
  ON model_lab.kalibrasyon_kuyrugu FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admin kalibrasyon kuyruğunu güncelleyebilir"
  ON model_lab.kalibrasyon_kuyrugu FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Mevcut feature matrix verisine göre kuyruğu ilk dolduran fonksiyon
CREATE OR REPLACE FUNCTION model_lab.kalibrasyon_kuyrugu_baslangic_doldur()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_eklenen integer := 0;
BEGIN
  INSERT INTO model_lab.kalibrasyon_kuyrugu (competition_name, season_label, mac_sayisi)
  SELECT
    fm.competition_name,
    fm.season_label,
    COUNT(*) AS mac_sayisi
  FROM model_lab.match_feature_matrix_v2 fm
  WHERE fm.elo_version = 'elo_v2_ha0_k20_global'
    AND fm.season_label >= '2019-2020'
  GROUP BY fm.competition_name, fm.season_label
  ON CONFLICT (competition_name, season_label) DO NOTHING;

  GET DIAGNOSTICS v_eklenen = ROW_COUNT;

  -- Tamamlanan replay'leri işaretle
  UPDATE model_lab.kalibrasyon_kuyrugu kk
  SET durum = 'tamamlandı',
      run_id = r.id,
      run_key = r.run_key,
      islenen_mac = r.processed_matches,
      updated_at = now()
  FROM model_lab.replay_prediction_runs r
  WHERE r.scope_competition = kk.competition_name
    AND r.run_key LIKE '%' || REPLACE(kk.season_label, '-', '_') || '%'
    AND r.status = 'done'
    AND kk.durum = 'bekliyor';

  -- Tamamlanan kayıtlar için metrikleri güncelle
  UPDATE model_lab.kalibrasyon_kuyrugu kk
  SET
    ortalama_brier    = m.avg_brier,
    ortalama_logloss  = m.avg_logloss,
    isabet_orani      = m.hit_rate,
    ev_sahibi_sapması = m.home_bias,
    beraberlik_sapması = m.draw_bias
  FROM (
    SELECT
      p.competition_name,
      p.season_label,
      AVG(e.brier_score)  AS avg_brier,
      AVG(e.log_loss)     AS avg_logloss,
      AVG(CASE WHEN e.was_correct THEN 1.0 ELSE 0.0 END) AS hit_rate,
      AVG(CASE WHEN e.actual_result='H' THEN 1.0 ELSE 0.0 END) - AVG(p.p_home) AS home_bias,
      AVG(CASE WHEN e.actual_result='D' THEN 1.0 ELSE 0.0 END) - AVG(p.p_draw) AS draw_bias
    FROM model_lab.replay_match_predictions p
    JOIN model_lab.replay_match_evaluations e ON e.prediction_id = p.id
    GROUP BY p.competition_name, p.season_label
  ) m
  WHERE m.competition_name = kk.competition_name
    AND m.season_label = kk.season_label
    AND kk.durum = 'tamamlandı';

  RETURN v_eklenen;
END;
$$;

-- Tek bir satırı çalıştırılmış olarak işaretle (run başladığında frontend çağırır)
CREATE OR REPLACE FUNCTION model_lab.kalibrasyon_baslat(
  p_competition_name text,
  p_season_label     text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_run_key text;
  v_run_id  uuid;
BEGIN
  -- run_key oluştur
  v_run_key := lower(replace(p_competition_name, ' ', '_'))
    || '_' || replace(p_season_label, '-', '_') || '_v1';

  -- Kuyruğu güncelle
  UPDATE model_lab.kalibrasyon_kuyrugu
  SET durum = 'calisıyor',
      run_key = v_run_key,
      baslangic_zamani = now(),
      updated_at = now()
  WHERE competition_name = p_competition_name
    AND season_label = p_season_label;

  -- Replay fonksiyonunu çalıştır
  SELECT out_run_id INTO v_run_id
  FROM model_lab.ml_replay_competition_season_v1(
    p_competition_name,
    p_season_label,
    v_run_key
  );

  -- Kuyruğu tamamlandı olarak işaretle
  UPDATE model_lab.kalibrasyon_kuyrugu kk
  SET
    durum            = 'tamamlandı',
    run_id           = v_run_id,
    bitis_zamani     = now(),
    islenen_mac      = r.processed_matches,
    ortalama_brier   = m.avg_brier,
    ortalama_logloss = m.avg_logloss,
    isabet_orani     = m.hit_rate,
    ev_sahibi_sapması = m.home_bias,
    beraberlik_sapması = m.draw_bias,
    updated_at       = now()
  FROM model_lab.replay_prediction_runs r,
  (
    SELECT
      AVG(e.brier_score) AS avg_brier,
      AVG(e.log_loss)    AS avg_logloss,
      AVG(CASE WHEN e.was_correct THEN 1.0 ELSE 0.0 END) AS hit_rate,
      AVG(CASE WHEN e.actual_result='H' THEN 1.0 ELSE 0.0 END) - AVG(p.p_home) AS home_bias,
      AVG(CASE WHEN e.actual_result='D' THEN 1.0 ELSE 0.0 END) - AVG(p.p_draw) AS draw_bias
    FROM model_lab.replay_match_predictions p
    JOIN model_lab.replay_match_evaluations e ON e.prediction_id = p.id
    WHERE p.run_id = v_run_id
  ) m
  WHERE r.id = v_run_id
    AND kk.competition_name = p_competition_name
    AND kk.season_label = p_season_label;

  RETURN v_run_id;

EXCEPTION WHEN OTHERS THEN
  UPDATE model_lab.kalibrasyon_kuyrugu
  SET durum = 'hata',
      hata_mesaji = SQLERRM,
      bitis_zamani = now(),
      updated_at = now()
  WHERE competition_name = p_competition_name
    AND season_label = p_season_label;
  RAISE;
END;
$$;

-- Durumu sıfırla (tekrar çalıştırabilmek için)
CREATE OR REPLACE FUNCTION model_lab.kalibrasyon_sifirla(
  p_competition_name text,
  p_season_label     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
BEGIN
  -- Replay verilerini temizle
  DELETE FROM model_lab.league_calibration_events
  WHERE competition_name = p_competition_name
    AND model_version = 'prediction_v1';

  DELETE FROM model_lab.replay_match_evaluations
  WHERE run_id IN (
    SELECT id FROM model_lab.replay_prediction_runs
    WHERE scope_competition = p_competition_name
      AND run_key LIKE '%' || replace(p_season_label, '-', '_') || '%'
  );

  DELETE FROM model_lab.replay_match_predictions
  WHERE run_id IN (
    SELECT id FROM model_lab.replay_prediction_runs
    WHERE scope_competition = p_competition_name
      AND run_key LIKE '%' || replace(p_season_label, '-', '_') || '%'
  );

  DELETE FROM model_lab.replay_prediction_runs
  WHERE scope_competition = p_competition_name
    AND run_key LIKE '%' || replace(p_season_label, '-', '_') || '%';

  -- Kuyruğu sıfırla
  UPDATE model_lab.kalibrasyon_kuyrugu
  SET durum = 'bekliyor',
      run_key = null, run_id = null,
      islenen_mac = 0,
      ortalama_brier = null, ortalama_logloss = null,
      isabet_orani = null, ev_sahibi_sapması = null, beraberlik_sapması = null,
      hata_mesaji = null,
      baslangic_zamani = null, bitis_zamani = null,
      updated_at = now()
  WHERE competition_name = p_competition_name
    AND season_label = p_season_label;
END;
$$;

-- İzin ver
GRANT EXECUTE ON FUNCTION model_lab.kalibrasyon_kuyrugu_baslangic_doldur() TO authenticated;
GRANT EXECUTE ON FUNCTION model_lab.kalibrasyon_baslat(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION model_lab.kalibrasyon_sifirla(text, text) TO authenticated;

-- Kuyruğu başlangıç verisiyle doldur
SELECT model_lab.kalibrasyon_kuyrugu_baslangic_doldur();
