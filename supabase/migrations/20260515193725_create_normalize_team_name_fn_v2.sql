/*
  # Create normalize_team_name() Helper Function v2

  Lookup-only normalization for fuzzy team name matching.
  NEVER modifies stored data. Use only in WHERE/JOIN comparisons.

  Steps:
  1. lowercase + trim
  2. Transliterate Turkish + common diacritics to ASCII
  3. Strip leading AS/AC/SS prefix
  4. Strip trailing club suffixes (FC, FK, SK, JK, CF, SC, IF, BK, United, Utd, Club)
  5. Collapse multiple internal spaces

  Translate map (from/to must be same character count):
    ç→c  ş→s  ğ→g  ı→i  ö→o  ü→u   (Turkish lowercase)
    é→e  è→e  ê→e  ë→e              (French é variants)
    ñ→n  ã→a  â→a  ô→o  î→i  û→u   (Iberian/French)
    ř→r  č→c  ž→z  ó→o  ú→u  ě→e   (Czech/Slovak)
    ș→s  ț→t  ø→o  å→a             (Romanian/Nordic)
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
            'çşğıöüéèêëñãâôîûřčžóúěșțøå',
            'csgioueeeenaaoiurczouestoa'
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
'Lowercases, strips Turkish/accented diacritics, removes leading AS/AC/SS prefixes, '
'strips trailing club suffixes (FC/FK/SK/United/Utd/Club etc). '
'NEVER use to overwrite stored names. '
'Use in WHERE/JOIN comparisons only: normalize_team_name(x) = normalize_team_name(teams.name)';
