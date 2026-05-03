import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const LEAGUE_MAP: Record<string, number> = {
  "Premier League": 39, "La Liga": 140, "Serie A": 135,
  "Bundesliga": 78, "Ligue 1": 61, "Eredivisie": 88, "Sueper Lig": 203,
};
const SEASONS = [2019, 2020, 2021, 2022, 2023, 2024];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const AF_KEY = Deno.env.get("API_FOOTBALL_KEY");
    if (!AF_KEY) throw new Error("API_FOOTBALL_KEY not set");

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const leagueFilter: number | null = body.league_id ?? null;
    const seasonFilter: number | null = body.season ?? null;

    let apiAttempted = 0, apiSuccess = 0, apiFailed = 0;
    let rawStored = 0, rawSkipped = 0;
    const fetched: Array<{ league_id: number; season: number; fixture_count: number }> = [];
    const skipped: Array<{ league_id: number; season: number; reason: string }> = [];

    const leagueNames = Object.fromEntries(Object.entries(LEAGUE_MAP).map(([n, id]) => [id, n]));

    for (const [, leagueId] of Object.entries(LEAGUE_MAP)) {
      if (leagueFilter && leagueId !== leagueFilter) continue;

      for (const season of SEASONS) {
        if (seasonFilter && season !== seasonFilter) continue;

        // Check if full payload already cached
        const { data: cachedRaw } = await supabase
          .from("api_football_fixture_probe_raw")
          .select("fixture_count")
          .eq("league_id", leagueId)
          .eq("season", season)
          .eq("transform_status", "full")
          .maybeSingle();

        if (cachedRaw) {
          skipped.push({ league_id: leagueId, season, reason: "already_full" });
          continue;
        }

        // Fetch full fixture list from AF API
        const endpoint = `https://v3.football.api-sports.io/fixtures?league=${leagueId}&season=${season}`;
        apiAttempted++;
        let httpStatus = 0;
        try {
          const resp = await fetch(endpoint, { headers: { "x-apisports-key": AF_KEY } });
          httpStatus = resp.status;
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const json = await resp.json();
          const afFixtures: any[] = json?.response ?? [];
          apiSuccess++;

          const hash = `full-${leagueId}-${season}-${afFixtures.length}`;
          const { error: rawErr } = await supabase
            .from("api_football_fixture_probe_raw")
            .upsert({
              endpoint,
              request_params: { league: leagueId, season },
              league_id: leagueId,
              season,
              response_hash: hash,
              response_json: { fixture_count: afFixtures.length, fixtures: afFixtures },
              http_status: httpStatus,
              transform_status: "full",
            }, { onConflict: "response_hash", ignoreDuplicates: false });

          if (rawErr?.code === "23505") {
            rawSkipped++;
            skipped.push({ league_id: leagueId, season, reason: "hash_collision" });
          } else if (rawErr) {
            throw new Error(`DB upsert failed: ${rawErr.message}`);
          } else {
            rawStored++;
            fetched.push({ league_id: leagueId, season, fixture_count: afFixtures.length });
          }
        } catch (e: any) {
          apiFailed++;
          await supabase.from("api_football_fixture_probe_raw").insert({
            endpoint,
            request_params: { league: leagueId, season },
            league_id: leagueId,
            season,
            response_hash: null,
            response_json: null,
            http_status: httpStatus,
            transform_status: "error",
            error_message: e.message,
          }).catch(() => {});
          skipped.push({ league_id: leagueId, season, reason: `api_error: ${e.message}` });
        }

        // Respect AF rate limit
        await new Promise((r) => setTimeout(r, 250));
      }
    }

    return new Response(JSON.stringify({
      mode: "fetch_only",
      api_calls: { attempted: apiAttempted, success: apiSuccess, failed: apiFailed },
      raw: { stored: rawStored, skipped: rawSkipped },
      fetched: fetched.map(f => `${leagueNames[f.league_id]} ${f.season} → ${f.fixture_count} fixtures`),
      skipped_count: skipped.filter(s => s.reason !== "already_full").length,
      already_cached: skipped.filter(s => s.reason === "already_full").length,
      next: apiFailed === 0
        ? "All payloads stored. Run SELECT af_run_fixture_mapping() to map DB matches."
        : `${apiFailed} failures — check skipped list before mapping.`,
      errors: skipped.filter(s => s.reason !== "already_full" && s.reason !== "hash_collision"),
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
