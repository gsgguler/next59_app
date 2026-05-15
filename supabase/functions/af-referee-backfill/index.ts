import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const LEAGUE_MAP: Record<number, string> = {
  78: "D1", 61: "F1", 135: "I1", 88: "N1", 140: "SP1", 203: "T1",
};
const ALL_LEAGUES = Object.keys(LEAGUE_MAP).map(Number);
const ALL_SEASONS = [2020, 2021, 2022, 2023, 2024];
const SEASON_LABELS = ["202021", "202122", "202223", "202324", "202425"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const AF_KEY = Deno.env.get("API_FOOTBALL_KEY");
    if (!AF_KEY) throw new Error("API_FOOTBALL_KEY not set");

    const body = await req.json().catch(() => ({}));
    // mode: "ingest" | "backfill" | "verify" | "full" (default)
    const mode: string = body.mode ?? "full";
    const leagueIds: number[] = body.league_ids ?? ALL_LEAGUES;
    const seasons: number[] = body.seasons ?? ALL_SEASONS;

    const out: Record<string, unknown> = {};

    // ── PHASE 1: INGEST (30 API calls) ───────────────────────────────────────
    if (mode === "ingest" || mode === "full") {
      let apiCalls = 0, rowsInserted = 0, rowsSkipped = 0;
      const errors: string[] = [];

      for (const leagueId of leagueIds) {
        for (const season of seasons) {
          apiCalls++;
          const url = `https://v3.football.api-sports.io/fixtures?league=${leagueId}&season=${season}`;
          try {
            const ctrl = new AbortController();
            const afTimeout = setTimeout(() => ctrl.abort(), 15000);
            const resp = await fetch(url, {
              headers: { "x-apisports-key": AF_KEY },
              signal: ctrl.signal,
            });
            clearTimeout(afTimeout);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const json = await resp.json();
            const fixtures: any[] = json?.response ?? [];

            if (fixtures.length === 0) {
              errors.push(`L${leagueId}/${season}: 0 fixtures`);
              continue;
            }

            const rows = fixtures
              .filter((f: any) => f?.fixture?.id != null)
              .map((f: any) => ({
                fixture_id: f.fixture.id as number,
                league_id: leagueId,
                season,
                raw_response: f,
              }));

            // Insert via SECURITY DEFINER RPC (shared schema not exposed to PostgREST)
            for (let i = 0; i < rows.length; i += 500) {
              const chunk = rows.slice(i, i + 500);
              const { data: cnt, error } = await supabase.rpc("af_upsert_fixtures_raw", {
                rows: chunk,
              });
              if (error) throw error;
              rowsInserted += cnt ?? 0;
            }
            rowsSkipped += fixtures.length - rows.length;
          } catch (e: any) {
            errors.push(`L${leagueId}/${season}: ${e.message}`);
          }
          // AF free tier: 10 req/min → 1.1s gap
          await new Promise((r) => setTimeout(r, 1100));
        }
      }

      out.ingest = { api_calls: apiCalls, rows_inserted: rowsInserted, rows_skipped: rowsSkipped, errors };
    }

    // ── PHASE 2: BACKFILL via SQL function (bulk UPDATE) ─────────────────────
    if (mode === "backfill" || mode === "full") {
      const { data, error } = await supabase.rpc("af_apply_referee_backfill");
      if (error) throw error;
      out.backfill = data;
    }

    // ── PHASE 3: VERIFY ──────────────────────────────────────────────────────
    if (mode === "verify" || mode === "full") {
      const verify: Record<string, unknown> = {};

      for (const [lid, fdCode] of Object.entries(LEAGUE_MAP)) {
        if (!leagueIds.includes(Number(lid))) continue;

        // Count total + with_referee for 2020-2024 seasons
        const { data: rows } = await supabase
          .from("matches")
          .select("referee, competition_seasons!inner(football_data_uk_code, football_data_uk_season_label)")
          .eq("competition_seasons.football_data_uk_code", fdCode)
          .in("competition_seasons.football_data_uk_season_label", SEASON_LABELS)
          .limit(5000);

        if (rows) {
          const total = rows.length;
          const withRef = rows.filter((r: any) => r.referee != null).length;
          verify[fdCode] = {
            total,
            with_referee: withRef,
            pct: total > 0 ? Math.round(100 * withRef / total) : 0,
          };
        }
      }

      out.verify = verify;
    }

    return new Response(JSON.stringify(out, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
