-- Seed team_display_names for any team whose teams.name matches a
-- team_text_display_overrides.raw_name entry, provided no tr-TR primary
-- display name already exists. This covers teams like Goztep→Göztepe,
-- Buyuksehir→Başakşehir, etc. that were ingested with ASCII-mangled names.
INSERT INTO public.team_display_names (team_id, display_name, locale, source, is_primary)
SELECT
  t.id,
  o.display_name,
  'tr-TR',
  'text_override_backfill',
  true
FROM public.teams t
JOIN public.team_text_display_overrides o
  ON o.raw_name = t.name
WHERE NOT EXISTS (
  SELECT 1
  FROM public.team_display_names tdn
  WHERE tdn.team_id = t.id
    AND tdn.locale  = 'tr-TR'
    AND tdn.is_primary = true
);
