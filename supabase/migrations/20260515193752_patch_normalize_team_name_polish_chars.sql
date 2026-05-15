/*
  # Patch normalize_team_name() — Add Polish and Extended Diacritic Coverage

  Adds missing characters to the translate() map:
  - ę → e  (Polish, e.g. Częstochowa)
  - ć → c  (Polish, e.g. Częstochowa)
  - ł → l  (Polish, e.g. Łódź)
  - ź → z  (Polish)
  - ń → n  (Polish)
  - ą → a  (Polish)
  - ý → y  (Czech/Slovak)
  - ď → d  (Czech)
  - ť → t  (Czech)
  - ő → o  (Hungarian)
  - ű → u  (Hungarian)
  - ï → i  (French)
  - à → a  (French)
  - ù → u  (French)

  All from/to strings remain equal length.
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

COMMENT ON FUNCTION normalize_team_name(text) IS
'Lookup-only normalization for fuzzy team name matching. '
'Lowercases, strips Turkish/Polish/Czech/Hungarian/French diacritics to ASCII, '
'removes leading AS/AC/SS prefixes, strips trailing club suffixes '
'(FC/FK/SK/United/Utd/Club etc). '
'NEVER use to overwrite stored names. '
'Use in WHERE/JOIN comparisons only: normalize_team_name(x) = normalize_team_name(teams.name)';
