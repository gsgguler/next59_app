/*
  # Foundation Schema — Core Tables

  Bu migration, sistemin tamamen boş bir Supabase instance'ında çalışabilmesi için
  gereken temel public schema tablolarını oluşturur.

  ## Tablolar
  1. profiles — Kullanıcı profilleri (auth.users ile 1:1)
  2. countries — Ülke referans verisi
  3. venues — Stadyum/saha bilgileri
  4. competitions — Lig/turnuva bilgileri
  5. competition_seasons — Sezon kaydı
  6. teams — Takım master kayıtları
  7. team_participations — Takım-sezon ilişkisi
  8. matches — Maç kayıtları (ana tablo)
  9. match_events — Maç olayları (gol, kart, vb.)
  10. match_statistics — Maç istatistikleri
  11. match_context — Maç bağlam verisi
  12. predictions — Tahmin kayıtları
  13. actual_outcomes — Gerçekleşen sonuçlar
  14. data_sources — Veri kaynağı referansı
  15. providers — Canonical veri sağlayıcıları

  ## Güvenlik
  - Her tablo için RLS etkin
  - Public tablolar için anon/authenticated okuma politikaları
  - Hassas tablolar için authenticated-only politikaları
*/

-- ─── countries ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.countries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  iso2       text UNIQUE,
  iso3       text UNIQUE,
  fifa_code  text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read countries"
  ON public.countries FOR SELECT
  TO anon, authenticated
  USING (true);

-- ─── venues ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.venues (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_football_id   int UNIQUE,
  name              text NOT NULL,
  city              text,
  country_id        uuid REFERENCES public.countries(id) ON DELETE SET NULL,
  capacity          int,
  image_url         text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read venues"
  ON public.venues FOR SELECT
  TO anon, authenticated
  USING (true);

-- ─── competitions ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.competitions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  slug             text UNIQUE,
  country_id       uuid REFERENCES public.countries(id) ON DELETE SET NULL,
  competition_type text NOT NULL DEFAULT 'domestic_league'
                   CHECK (competition_type IN ('domestic_league','domestic_cup','international_cup','continental_club','other')),
  api_football_id  int UNIQUE,
  logo_url         text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read competitions"
  ON public.competitions FOR SELECT
  TO anon, authenticated
  USING (true);

-- ─── competition_seasons ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.competition_seasons (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id  uuid NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  season_code     text NOT NULL,
  season_label    text,
  host_countries  text[],
  start_date      date,
  end_date        date,
  is_current      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competition_id, season_code)
);

ALTER TABLE public.competition_seasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read competition seasons"
  ON public.competition_seasons FOR SELECT
  TO anon, authenticated
  USING (true);

-- ─── teams ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.teams (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  short_name       text,
  code             text,
  country_id       uuid REFERENCES public.countries(id) ON DELETE SET NULL,
  country_code     text,
  api_football_id  int UNIQUE,
  venue_id         uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  logo_url         text,
  founded          int,
  team_type        text NOT NULL DEFAULT 'club'
                   CHECK (team_type IN ('club','national_team')),
  fifa_code        text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_teams_name_country_lower
  ON public.teams (lower(name), COALESCE(country_code, ''));

CREATE UNIQUE INDEX IF NOT EXISTS uq_teams_fifa_code
  ON public.teams (fifa_code)
  WHERE fifa_code IS NOT NULL;

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read teams"
  ON public.teams FOR SELECT
  TO anon, authenticated
  USING (true);

-- ─── team_participations ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_participations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id               uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  competition_season_id uuid NOT NULL REFERENCES public.competition_seasons(id) ON DELETE CASCADE,
  stage                 text CHECK (stage IN ('group_stage','round_of_32','round_of_16','quarter_final','semi_final','third_place','final',NULL)),
  group_name            text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_team_participation
  ON public.team_participations (team_id, competition_season_id, COALESCE(stage,''), COALESCE(group_name,''));

ALTER TABLE public.team_participations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read team participations"
  ON public.team_participations FOR SELECT
  TO anon, authenticated
  USING (true);

-- ─── data_sources ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.data_sources (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  slug        text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.data_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read data sources"
  ON public.data_sources FOR SELECT
  TO anon, authenticated
  USING (true);

-- ─── matches ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.matches (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_season_id       uuid NOT NULL REFERENCES public.competition_seasons(id) ON DELETE CASCADE,
  home_team_id                uuid NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
  away_team_id                uuid NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
  venue_id                    uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  api_football_fixture_id     int UNIQUE,
  deterministic_source_match_id text UNIQUE,
  match_date                  date,
  match_time                  time,
  timezone                    text DEFAULT 'UTC',
  timestamp                   bigint,
  kickoff_at                  timestamptz,
  stage                       text CHECK (stage IN ('group_stage','round_of_32','round_of_16','quarter_final','semi_final','third_place','final',NULL)),
  group_name                  text,
  round                       text,
  referee                     text,
  attendance                  int,
  status_short                text NOT NULL DEFAULT 'NS',
  status_long                 text,
  status_elapsed              int,
  status_extra                int,
  home_score_ht               int,
  away_score_ht               int,
  home_score_ft               int,
  away_score_ft               int,
  home_score_et               int,
  away_score_et               int,
  home_score_pen              int,
  away_score_pen              int,
  result                      text CHECK (result IN ('H','D','A',NULL)),
  half_time_result            text CHECK (half_time_result IN ('H','D','A',NULL)),
  source_id                   uuid REFERENCES public.data_sources(id) ON DELETE SET NULL,
  ingestion_run_id            uuid,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_matches_competition_season ON public.matches(competition_season_id);
CREATE INDEX IF NOT EXISTS idx_matches_home_team ON public.matches(home_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_away_team ON public.matches(away_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON public.matches(status_short);
CREATE INDEX IF NOT EXISTS idx_matches_kickoff ON public.matches(kickoff_at);
CREATE INDEX IF NOT EXISTS idx_matches_timestamp ON public.matches(timestamp);

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read matches"
  ON public.matches FOR SELECT
  TO anon, authenticated
  USING (true);

-- ─── match_events ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.match_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id    uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  team_id     uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  type        text,
  detail      text,
  comments    text,
  player_id   int,
  player_name text,
  assist_id   int,
  assist_name text,
  minute      int,
  extra_minute int,
  is_current  boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_events_match_id ON public.match_events(match_id);

ALTER TABLE public.match_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read match events"
  ON public.match_events FOR SELECT
  TO authenticated
  USING (true);

-- ─── match_statistics ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.match_statistics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  team_id         uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  stat_type       text NOT NULL,
  value_home      numeric,
  value_away      numeric,
  is_current      boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_stats_match_id ON public.match_statistics(match_id);

ALTER TABLE public.match_statistics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read match statistics"
  ON public.match_statistics FOR SELECT
  TO authenticated
  USING (is_current = true);

-- ─── match_context ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.match_context (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        uuid NOT NULL UNIQUE REFERENCES public.matches(id) ON DELETE CASCADE,
  home_elo        numeric,
  away_elo        numeric,
  home_form       jsonb,
  away_form       jsonb,
  h2h_summary     jsonb,
  weather         jsonb,
  is_current      boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.match_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read match context"
  ON public.match_context FOR SELECT
  TO authenticated
  USING (is_current = true);

-- ─── profiles ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id                    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 text,
  display_name          text,
  avatar_url            text,
  role                  text NOT NULL DEFAULT 'user'
                        CHECK (role IN ('user','admin','super_admin')),
  personal_organization_id uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins read all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = auth.uid() AND p2.role IN ('admin','super_admin')
    )
  );

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── actual_outcomes ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.actual_outcomes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  result          text CHECK (result IN ('H','D','A')),
  home_score_ft   int,
  away_score_ft   int,
  is_current      boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_actual_outcomes_match_id ON public.actual_outcomes(match_id);

ALTER TABLE public.actual_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read actual outcomes"
  ON public.actual_outcomes FOR SELECT
  TO authenticated
  USING (is_current = true);

-- ─── predictions ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.predictions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id         uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  model_version    text,
  p_home           numeric NOT NULL CHECK (p_home BETWEEN 0 AND 1),
  p_draw           numeric NOT NULL CHECK (p_draw BETWEEN 0 AND 1),
  p_away           numeric NOT NULL CHECK (p_away BETWEEN 0 AND 1),
  confidence       numeric,
  is_elite_only    boolean NOT NULL DEFAULT false,
  superseded_by    uuid REFERENCES public.predictions(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_predictions_match_id ON public.predictions(match_id);

ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read predictions"
  ON public.predictions FOR SELECT
  TO authenticated
  USING (
    superseded_by IS NULL
    AND (is_elite_only = false OR is_elite_only IS NULL)
  );

-- ─── providers ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.providers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  type        text NOT NULL DEFAULT 'live'
              CHECK (type IN ('live','historical','static')),
  config_json jsonb DEFAULT '{}'::jsonb,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read providers"
  ON public.providers FOR SELECT
  TO authenticated
  USING (true);
