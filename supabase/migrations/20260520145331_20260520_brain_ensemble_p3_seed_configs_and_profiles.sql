/*
  # Brain Ensemble — Seed brain_configs and brain_weight_profiles — P3

  ## Summary
  Seeds the 6 brain definitions and 6 weight profiles with exact values from
  the specification. Also creates the initial meta_v1 model (weighted_average
  baseline, not yet active) and seeds a bootstrap performance tracking row
  per brain.

  ## Seeded Data

  ### brain_configs (6 rows)
  - tactical (weight 0.20, sort 1)
  - statistical (weight 0.25, sort 2)
  - psychological (weight 0.15, sort 3)
  - live (weight 0.10, sort 4, is_live_only = true)
  - conditions (weight 0.10, sort 5)
  - news (weight 0.05, sort 6)

  ### brain_weight_profiles (6 rows)
  - league_standard (is_default = true)
  - derby_match
  - cup_final
  - live_60min
  - weather_extreme
  - transfer_window_chaos

  ### meta_learner_models (1 bootstrap row)
  - meta_v1: weighted_average baseline, not active (needs training first)

  ## Important Notes
  1. Weights in each profile are validated to sum to 1.00
  2. league_standard is is_default = true; all others false
  3. Brain system prompts are full-length and match the specification
*/

-- ─── brain_configs ────────────────────────────────────────────────────────────

INSERT INTO public.brain_configs
  (brain_key, display_name, role_description, system_prompt, default_weight,
   input_spec, output_spec, is_active, is_live_only, sort_order)
VALUES

('tactical',
 'Taktik Analist',
 'Kadro analizi, formasyon eşleşmesi, oyuncu uyumu',
 'Sen bir UEFA Pro Lisans sahibi taktik analistisin. Görevin: verilen maç için her iki takımın beklenen formasyonlarını, oyuncu bireysel güçlü/zayıf yönlerini, formasyon eşleşmesinin kazanma olasılığına etkisini ve kritik bireysel karşılaşmaları analiz etmek. Kadroda eksik oyuncuların taktik boşluk yaratıp yaratmadığını değerlendir. Sonucu { winner_prob: {home, draw, away}, confidence: 0-1, key_factors: [...], tactical_edge: string } formatında döndür.',
 0.200,
 '{"lineups": "object", "player_stats": "array", "team_formation_history": "array"}',
 '{"winner_prob": {"home": "float", "draw": "float", "away": "float"}, "confidence": "float", "key_factors": "array", "tactical_edge": "string"}',
 true, false, 1),

('statistical',
 'İstatistik Uzmanı',
 'xG, ELO, Poisson, form, tarihsel veriler',
 'Sen bir futbol veri bilimci ve istatistik uzmanısın. Görevin: ELO derecelendirmelerini, xG (beklenen gol) verilerini, Poisson modeli tahminlerini, son form eğrisini, kafa kafaya geçmişini ve sezon istatistiklerini kullanarak sayısal olasılıklar üret. Her tahmin için hangi istatistiksel sinyalin en güçlü olduğunu belirt. Sonucu { winner_prob: {home, draw, away}, expected_goals: {home, away}, confidence: 0-1, model_signals: [...] } formatında döndür.',
 0.250,
 '{"team_elo_snapshots": "object", "xg_data": "object", "match_history": "array", "form_last_5": "object"}',
 '{"winner_prob": {"home": "float", "draw": "float", "away": "float"}, "expected_goals": {"home": "float", "away": "float"}, "confidence": "float", "model_signals": "array"}',
 true, false, 2),

('psychological',
 'Psikoloji Uzmanı',
 'Turnuva baskısı, seyirci etkisi, motivasyon, derbi faktörü',
 'Sen bir spor psikolog ve performans uzmanısın. Görevin: maçın önemine (küme düşme, şampiyonluk, derbi), seyirci baskısına, takım motivasyonuna, son büyük sonuçların yarattığı özgüven/travma etkisine ve tarihsel rakip psikolojisine dayalı olasılıklar üret. Psikolojik faktörün matematiksel tahmine +/-5 puan etki aralığını belirt. Sonucu { winner_prob: {home, draw, away}, pressure_impact: -5 to +5, confidence: 0-1, psych_factors: [...] } formatında döndür.',
 0.150,
 '{"match_importance": "string", "crowd_data": "object", "team_psych_profile": "object", "rivalry_index": "float"}',
 '{"winner_prob": {"home": "float", "draw": "float", "away": "float"}, "pressure_impact": "float", "confidence": "float", "psych_factors": "array"}',
 true, false, 3),

('live',
 'Canlı Gözlemci',
 'Momentum, kartlar, oyuncu değişiklikleri, anlık oyun akışı',
 'Sen bir canlı maç gözlemcisi ve anlık analistisin. Görevin: maçın mevcut dakikasına kadar yaşanan olayları (goller, kartlar, değişiklikler), momentum değişimlerini, baskı endeksini ve oyun akışını analiz ederek kalan süre için olasılıkları güncelle. Skor durumunun psikolojik etkisini de hesaba kat. Sonucu { winner_prob: {home, draw, away}, momentum_shift: string, current_threat_level: string, confidence: 0-1 } formatında döndür.',
 0.100,
 '{"live_match_states": "object", "events": "array", "momentum_score": "float", "pressure_index": "float", "current_minute": "integer"}',
 '{"winner_prob": {"home": "float", "draw": "float", "away": "float"}, "momentum_shift": "string", "current_threat_level": "string", "confidence": "float"}',
 true, true, 4),

('conditions',
 'Fiziksel Koşullar Analisti',
 'Hava durumu, saha durumu, yükseklik, seyahat mesafesi',
 'Sen bir spor fizyoloji ve çevresel faktör uzmanısın. Görevin: hava koşullarının (yağmur, rüzgar, sıcaklık), saha yüzeyinin, oynanacağı şehrin yüksekliğinin ve deplasman takımının seyahat yorgunluğunun maç sonucuna etkisini hesapla. Ekstrem koşullarda güçlü takımların avantajının nasıl değiştiğini modelle. Sonucu { winner_prob: {home, draw, away}, condition_impact: -5 to +5, confidence: 0-1, condition_factors: [...] } formatında döndür.',
 0.100,
 '{"weather_data": "object", "pitch_conditions": "string", "altitude_m": "integer", "travel_distance_km": "float", "fatigue_index": "float"}',
 '{"winner_prob": {"home": "float", "draw": "float", "away": "float"}, "condition_impact": "float", "confidence": "float", "condition_factors": "array"}',
 true, false, 5),

('news',
 'Haber & Söylenti Analisti',
 'Transfer haberleri, sakatlık söylentileri, kulis bilgileri',
 'Sen bir futbol istihbarat ve haber analistisin. Görevin: maç öncesi medya haberlerini, resmi olmayan sakatlık söylentilerini, transfer döneminin yarattığı dikkat dağınıklığını, olası kadro kararı sürprizlerini ve sosyal medya duyarlılığını analiz ederek tahminlere entegre et. Haberin güvenilirliğini ve etkisini de değerlendir. Sonucu { winner_prob: {home, draw, away}, sentiment_score: -10 to +10, confidence: 0-1, news_signals: [...] } formatında döndür.',
 0.050,
 '{"news_feed": "array", "injury_rumors": "array", "transfer_impact": "object", "social_sentiment": "float"}',
 '{"winner_prob": {"home": "float", "draw": "float", "away": "float"}, "sentiment_score": "float", "confidence": "float", "news_signals": "array"}',
 true, false, 6)

ON CONFLICT (brain_key) DO UPDATE SET
  display_name     = EXCLUDED.display_name,
  role_description = EXCLUDED.role_description,
  system_prompt    = EXCLUDED.system_prompt,
  default_weight   = EXCLUDED.default_weight,
  input_spec       = EXCLUDED.input_spec,
  output_spec      = EXCLUDED.output_spec,
  is_active        = EXCLUDED.is_active,
  is_live_only     = EXCLUDED.is_live_only,
  sort_order       = EXCLUDED.sort_order,
  updated_at       = now();

-- ─── brain_weight_profiles ────────────────────────────────────────────────────
-- Note: live brain weight included in all profiles; for prematch runs it is
-- zeroed out by the orchestrator (is_live_only guard).

INSERT INTO public.brain_weight_profiles
  (profile_key, display_name, description, weights, is_default, conditions)
VALUES

('league_standard',
 'Lig Standardı',
 'Standart lig maçı için dengeli ağırlık dağılımı',
 '{"tactical": 0.20, "statistical": 0.30, "psychological": 0.15, "live": 0.10, "conditions": 0.15, "news": 0.10}',
 true,
 '{"match_type": "league", "is_derby": false, "is_cup": false}'),

('derby_match',
 'Derbi Maçı',
 'Yerel veya tarihi rekabet içeren yüksek yoğunluklu derbiler',
 '{"tactical": 0.20, "statistical": 0.20, "psychological": 0.30, "live": 0.10, "conditions": 0.10, "news": 0.10}',
 false,
 '{"is_derby": true}'),

('cup_final',
 'Kupa Finali',
 'Tek maçlık eliminasyon finalleri ve büyük turnuva son turları',
 '{"tactical": 0.25, "statistical": 0.20, "psychological": 0.30, "live": 0.10, "conditions": 0.10, "news": 0.05}',
 false,
 '{"is_cup": true, "match_stage": "final"}'),

('live_60min',
 'Canlı 60. Dakika',
 'Maç başladıktan ve 60. dakikayı geçtikten sonra live gözlemci ön plana çıkar',
 '{"tactical": 0.15, "statistical": 0.20, "psychological": 0.10, "live": 0.40, "conditions": 0.10, "news": 0.05}',
 false,
 '{"is_live": true, "match_minute_gte": 60}'),

('weather_extreme',
 'Ekstrem Hava Koşulları',
 'Yoğun yağmur, kar, şiddetli rüzgar veya yüksek rakım maçları',
 '{"tactical": 0.15, "statistical": 0.20, "psychological": 0.10, "live": 0.10, "conditions": 0.40, "news": 0.05}',
 false,
 '{"weather_condition": "extreme"}'),

('transfer_window_chaos',
 'Transfer Dönemi Kaosu',
 'Son gün transferleri veya büyük oyuncu hareketleri döneminde artan belirsizlik',
 '{"tactical": 0.15, "statistical": 0.15, "psychological": 0.15, "live": 0.10, "conditions": 0.10, "news": 0.35}',
 false,
 '{"transfer_window_active": true}')

ON CONFLICT (profile_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description  = EXCLUDED.description,
  weights      = EXCLUDED.weights,
  is_default   = EXCLUDED.is_default,
  conditions   = EXCLUDED.conditions,
  updated_at   = now();

-- ─── meta_learner_models — bootstrap v1 ──────────────────────────────────────

INSERT INTO public.meta_learner_models
  (model_version, model_type, training_sample_count,
   feature_importance, learned_weights, bayesian_priors,
   model_artifact, is_active, notes)
VALUES
  ('meta_v1',
   'weighted_average',
   0,
   '{"tactical": 0.20, "statistical": 0.25, "psychological": 0.15, "live": 0.10, "conditions": 0.10, "news": 0.05}',
   '{"tactical": 0.20, "statistical": 0.25, "psychological": 0.15, "live": 0.10, "conditions": 0.10, "news": 0.05}',
   '{"alpha": 1.0, "beta": 1.0, "prior_home_win": 0.45, "prior_draw": 0.26, "prior_away_win": 0.29}',
   '{"type": "bootstrap_default", "version": 1, "coefficients": null}',
   false,
   'Bootstrap model using default spec weights. Activate after 100+ training samples.')
ON CONFLICT (model_version) DO NOTHING;
