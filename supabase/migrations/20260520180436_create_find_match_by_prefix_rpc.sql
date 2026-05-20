/*
  # Create find_match_by_prefix RPC

  Allows frontend to resolve a short UUID prefix (e.g. "6aaf4c64") to a full UUID.
  Used by MacTahminPage when the URL contains a short match ID instead of a full UUID.

  ## Function
  - `find_match_by_prefix(prefix text)` — returns the first matching match id whose
    text representation starts with the given prefix. Returns NULL if no match.

  ## Security
  - SECURITY DEFINER with fixed search_path
  - Granted to anon and authenticated so the public page can call it
*/

CREATE OR REPLACE FUNCTION public.find_match_by_prefix(prefix text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM matches
  WHERE id::text LIKE (prefix || '%')
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.find_match_by_prefix(text) TO anon, authenticated;
