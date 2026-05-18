/*
  # Security Hardening — Phase 3: model_lab Function search_path Isolation

  Applies SET search_path = model_lab, public, pg_temp to all model_lab
  SECURITY DEFINER functions that had no search_path set.

  ## What this does
  Prevents schema shadowing in model lab pipeline and validation functions.
  These functions operate primarily in model_lab schema with public access
  for match/team data — both are included in the path.

  ## What this does NOT do
  - Does not change any function body or logic
  - Does not recreate any function
  - Does not affect any calibration or prediction data

  ## Functions altered (12 model_lab + misc public tier 2/3)
  model_lab:
  1.  model_lab.get_active_gold_freeze()
  2.  model_lab.ml_check_feature_matrix_coverage()
  3.  model_lab.ml_check_no_future_rolling_features()
  4.  model_lab.ml_check_no_self_match_rolling()
  5.  model_lab.ml_check_no_target_event_leakage()
  6.  model_lab.ml_check_training_cutoff_integrity()
  7.  model_lab.ml_populate_calibration_predictions_v1()
  8.  model_lab.ml_populate_feature_matrix_v1(text, text)
  9.  model_lab.ml_populate_feature_snapshot_rolling_v1()
  10. model_lab.ml_populate_feature_snapshot_v1()
  11. model_lab.ml_run_elo_v1(text)
  12. model_lab.ml_run_leakage_checks()

  public (Tier 2 misc):
  13. public.alert_poor_vitals()
  14. public.ml_populate_feature_snapshot()
  15. public.trg_editorial_audit()
  16. public.trg_review_queue_version()
  17. public.wch_get_edition_match_counts()
  18. public.wch_get_of_raw_editions()
  19. public.wch_insert_of_matches(jsonb)
  20. public.wch_mark_of_raw_transformed(integer)
  21. public.wch_of_enqueue_all()
  22. public.wch_of_fetch_status()
  23. public.wch_of_fetch_year(integer)
  24. public.wch_of_process_all()
  25. public.wch_of_process_year(integer)
  26. public.wch_store_of_raw(integer, text, text, jsonb)
  27. public.wch_upsert_edition_full(integer, text, date, date, integer, integer, text)
  28. public.wch_upsert_teams_bulk(jsonb)
*/

-- ── model_lab functions ───────────────────────────────────────────────────────

ALTER FUNCTION model_lab.get_active_gold_freeze()
  SET search_path = model_lab, public, pg_temp;

ALTER FUNCTION model_lab.ml_check_feature_matrix_coverage()
  SET search_path = model_lab, public, pg_temp;

ALTER FUNCTION model_lab.ml_check_no_future_rolling_features()
  SET search_path = model_lab, public, pg_temp;

ALTER FUNCTION model_lab.ml_check_no_self_match_rolling()
  SET search_path = model_lab, public, pg_temp;

ALTER FUNCTION model_lab.ml_check_no_target_event_leakage()
  SET search_path = model_lab, public, pg_temp;

ALTER FUNCTION model_lab.ml_check_training_cutoff_integrity()
  SET search_path = model_lab, public, pg_temp;

ALTER FUNCTION model_lab.ml_populate_calibration_predictions_v1()
  SET search_path = model_lab, public, pg_temp;

ALTER FUNCTION model_lab.ml_populate_feature_matrix_v1(text, text)
  SET search_path = model_lab, public, pg_temp;

ALTER FUNCTION model_lab.ml_populate_feature_snapshot_rolling_v1()
  SET search_path = model_lab, public, pg_temp;

ALTER FUNCTION model_lab.ml_populate_feature_snapshot_v1()
  SET search_path = model_lab, public, pg_temp;

ALTER FUNCTION model_lab.ml_run_elo_v1(text)
  SET search_path = model_lab, public, pg_temp;

ALTER FUNCTION model_lab.ml_run_leakage_checks()
  SET search_path = model_lab, public, pg_temp;

-- ── public wch_* functions (wc_history schema access needed) ─────────────────

ALTER FUNCTION public.wch_get_edition_match_counts()
  SET search_path = wc_history, public, pg_temp;

ALTER FUNCTION public.wch_get_of_raw_editions()
  SET search_path = wc_history, public, pg_temp;

ALTER FUNCTION public.wch_insert_of_matches(jsonb)
  SET search_path = wc_history, public, pg_temp;

ALTER FUNCTION public.wch_mark_of_raw_transformed(integer)
  SET search_path = wc_history, public, pg_temp;

ALTER FUNCTION public.wch_of_enqueue_all()
  SET search_path = wc_history, public, pg_temp;

ALTER FUNCTION public.wch_of_fetch_status()
  SET search_path = wc_history, public, pg_temp;

ALTER FUNCTION public.wch_of_fetch_year(integer)
  SET search_path = wc_history, public, pg_temp;

ALTER FUNCTION public.wch_of_process_all()
  SET search_path = wc_history, public, pg_temp;

ALTER FUNCTION public.wch_of_process_year(integer)
  SET search_path = wc_history, public, pg_temp;

ALTER FUNCTION public.wch_store_of_raw(integer, text, text, jsonb)
  SET search_path = wc_history, public, pg_temp;

ALTER FUNCTION public.wch_upsert_edition_full(integer, text, date, date, integer, integer, text)
  SET search_path = wc_history, public, pg_temp;

ALTER FUNCTION public.wch_upsert_teams_bulk(jsonb)
  SET search_path = wc_history, public, pg_temp;

-- ── public misc (alert, trigger, snapshot) ────────────────────────────────────

ALTER FUNCTION public.alert_poor_vitals()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.ml_populate_feature_snapshot()
  SET search_path = model_lab, public, pg_temp;

ALTER FUNCTION public.trg_editorial_audit()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.trg_review_queue_version()
  SET search_path = public, pg_temp;
