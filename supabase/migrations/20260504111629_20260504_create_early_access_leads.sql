/*
  # Early Access Email Leads

  Stores email addresses submitted via the Hero section opt-in form.
  Used to notify users when WC2026 match analyses go live.

  - email: unique, required
  - source: where the signup came from (hero, footer, etc.)
  - notified_at: set when we send the launch notification
*/

CREATE TABLE IF NOT EXISTS public.early_access_leads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  source        text NOT NULL DEFAULT 'hero',
  created_at    timestamptz NOT NULL DEFAULT now(),
  notified_at   timestamptz,
  CONSTRAINT early_access_leads_email_unique UNIQUE (email)
);

ALTER TABLE public.early_access_leads ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (public opt-in)
CREATE POLICY "Anyone can submit early access email"
  ON public.early_access_leads FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only admins can read
CREATE POLICY "Admins can read early access leads"
  ON public.early_access_leads FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );
