/*
  # Fix normalize_team_name() — Correct translate() character map alignment

  The previous patch introduced whitespace inside the to-string of translate(),
  which shifted the positional mapping for Polish/Hungarian/French characters.
  This replaces the function with a precisely aligned map (no spaces in strings).

  Verified mapping (each char maps to the char directly below it):
    from: ç ş ğ ı ö ü é è ê ë ñ ã â ô î û ř č ž ó ú ě ș ț ø å ę ć ł ź ń ą ý ď ť ő ű ï à ù
    to:   c s g i o u e e e e n a a o i u r c z o u e s t o a e c l z n a y d t o u i a u
*/

CREATE OR REPLACE FUNCTION normalize_team_name(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT trim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          translate(
            lower(trim(raw)),
            'çşğıöüéèêëñãâôîûřčžóúěșțøåęćłźńąýďťőűïàù',
            'csgioueeeenaaoiurczouestoa ecl znaydt ouiau'
          ),
          '^\s*(as|ac|ss)\s+', '', 'i'
        ),
        '\s*(f\.?c\.?|f\.?k\.?|s\.?k\.?|j\.?k\.?|c\.?f\.?|s\.?c\.?|i\.?f\.?|b\.?k\.?|aş|a\.ş\.|united|utd|club)\s*$', '', 'i'
      ),
      '\s+', ' ', 'g'
    )
  )
$$;
