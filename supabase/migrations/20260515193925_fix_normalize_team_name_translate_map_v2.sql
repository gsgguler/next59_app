/*
  # Fix normalize_team_name() — Verified 40-char translate map

  Corrects from/to string alignment. Both strings are exactly 40 Unicode characters.

  Mapping (position → from char → to char):
   1:ç→c  2:ş→s  3:ğ→g  4:ı→i  5:ö→o  6:ü→u  7:é→e  8:è→e  9:ê→e 10:ë→e
  11:ñ→n 12:ã→a 13:â→a 14:ô→o 15:î→i 16:û→u 17:ř→r 18:č→c 19:ž→z 20:ó→o
  21:ú→u 22:ě→e 23:ș→s 24:ț→t 25:ø→o 26:å→a 27:ę→e 28:ć→c 29:ł→l 30:ź→z
  31:ń→n 32:ą→a 33:ý→y 34:ď→d 35:ť→t 36:ő→o 37:ű→u 38:ï→i 39:à→a 40:ù→u
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
            'csgioueeeenaaoiurczouestoaeclznaydtouiau'
          ),
          '^\s*(as|ac|ss)\s+', '', 'i'
        ),
        '\s*(f\.?c\.?|f\.?k\.?|s\.?k\.?|j\.?k\.?|c\.?f\.?|s\.?c\.?|i\.?f\.?|b\.?k\.?|aş|a\.ş\.|united|utd|club)\s*$',
        '', 'i'
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
