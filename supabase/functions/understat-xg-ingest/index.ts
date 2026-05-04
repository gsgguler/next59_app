import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const LEAGUE_SLUGS = ["EPL", "La_liga", "Bundesliga", "Serie_A", "Ligue_1", "Eredivisie"];
const SEASONS = [2020, 2021, 2022, 2023, 2024];

const LEAGUE_API_NAMES: Record<string, string> = {
  "EPL": "EPL",
  "La_liga": "La liga",
  "Bundesliga": "Bundesliga",
  "Serie_A": "Serie A",
  "Ligue_1": "Ligue 1",
  "Eredivisie": "Eredivisie",
};

// Candidate endpoint paths to probe
const CANDIDATE_ENDPOINTS = [
  "getLeagueMatchesResults",
  "getLeagueFixturesData",
  "getLeagueMatches",
  "getLeagueResults",
  "getMatchesResults",
  "getLeagueDates",
];

interface UnderstatMatch {
  id: string;
  h: { id: string; title: string; short_title: string };
  a: { id: string; title: string; short_title: string };
  goals: { h: string; a: string };
  xG: { h: string; a: string };
  datetime: string;
  isResult: boolean;
}

interface UnderstatAjaxResponse {
  response: boolean;
  data: UnderstatMatch[] | Record<string, UnderstatMatch>;
}

async function probeEndpoints(leagueName: string, season: number): Promise<{
  working: string | null;
  results: Record<string, { status: number; body_preview: string }>;
}> {
  const results: Record<string, { status: number; body_preview: string }> = {};
  let working: string | null = null;

  for (const endpointName of CANDIDATE_ENDPOINTS) {
    const url = `https://understat.com/main/${endpointName}/`;
    const formData = new URLSearchParams();
    formData.append("league", leagueName);
    formData.append("season", String(season));

    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json, text/javascript, */*; q=0.01",
          "Accept-Language": "en-US,en;q=0.9",
          "Origin": "https://understat.com",
          "Referer": "https://understat.com/league/EPL",
        },
        body: formData.toString(),
      });

      const text = await resp.text();
      const preview = text.slice(0, 200);
      results[endpointName] = { status: resp.status, body_preview: preview };

      if (resp.status === 200 && text.includes('"response"') && text.includes('"data"')) {
        working = endpointName;
        break;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      results[endpointName] = { status: 0, body_preview: `error: ${msg}` };
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  return { working, results };
}

async function fetchLeagueMatches(endpointName: string, leagueName: string, season: number): Promise<UnderstatMatch[]> {
  const url = `https://understat.com/main/${endpointName}/`;
  const formData = new URLSearchParams();
  formData.append("league", leagueName);
  formData.append("season", String(season));

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Accept-Language": "en-US,en;q=0.9",
      "Origin": "https://understat.com",
      "Referer": "https://understat.com/league/EPL",
    },
    body: formData.toString(),
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

  const json: UnderstatAjaxResponse = await resp.json();
  if (!json.response) throw new Error("API returned response=false");

  const data = json.data;
  if (Array.isArray(data)) return data;
  return Object.values(data) as UnderstatMatch[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const leagueFilter: string | null = body.league_slug ?? null;
    const seasonFilter: number | null = body.season_year ?? null;

    // Probe mode: find which endpoint works
    if (body.probe === true) {
      const probeLeague = LEAGUE_API_NAMES[leagueFilter ?? "EPL"] ?? "EPL";
      const probeSeason = seasonFilter ?? 2023;
      const result = await probeEndpoints(probeLeague, probeSeason);
      return new Response(JSON.stringify(result, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Allow caller to override endpoint name; default to getLeagueMatchesResults
    const endpointName: string = body.endpoint_name ?? "getLeagueMatchesResults";

    const leagues = leagueFilter ? [leagueFilter] : LEAGUE_SLUGS;
    const seasons = seasonFilter ? [seasonFilter] : SEASONS;

    let totalInserted = 0, totalSkipped = 0, totalFailed = 0;
    const results: Record<string, unknown>[] = [];
    const errors: string[] = [];

    for (const slug of leagues) {
      for (const year of seasons) {
        let inserted = 0, skipped = 0;

        try {
          const leagueName = LEAGUE_API_NAMES[slug] ?? slug;
          const matches = await fetchLeagueMatches(endpointName, leagueName, year);

          if (matches.length === 0) {
            errors.push(`${slug}/${year}: 0 matches returned`);
            results.push({ slug, year, inserted: 0, skipped: 0, parsed: 0 });
            continue;
          }

          const finished = matches.filter(
            (m) => m.isResult && m.xG?.h != null && m.xG?.a != null,
          );

          for (const m of finished) {
            const matchDate = m.datetime ? m.datetime.split(" ")[0] : null;
            const homeXg = parseFloat(m.xG.h);
            const awayXg = parseFloat(m.xG.a);
            const homeGoals = parseInt(m.goals.h, 10);
            const awayGoals = parseInt(m.goals.a, 10);

            const { error } = await supabase
              .from("understat_matches_raw")
              .upsert(
                {
                  understat_match_id: parseInt(m.id, 10),
                  league_slug: slug,
                  season_year: year,
                  match_date: matchDate,
                  home_team: m.h.title,
                  away_team: m.a.title,
                  home_xg: isNaN(homeXg) ? null : homeXg,
                  away_xg: isNaN(awayXg) ? null : awayXg,
                  home_goals: isNaN(homeGoals) ? null : homeGoals,
                  away_goals: isNaN(awayGoals) ? null : awayGoals,
                  raw_response: m as unknown as Record<string, unknown>,
                },
                { onConflict: "understat_match_id", ignoreDuplicates: false },
              );

            if (error) {
              if (error.code === "23505") { skipped++; }
              else { errors.push(`match ${m.id}: ${error.message}`); }
            } else {
              inserted++;
            }
          }

          totalInserted += inserted;
          totalSkipped += skipped;
          results.push({ slug, year, parsed: matches.length, finished: finished.length, inserted, skipped });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`${slug}/${year}: ${msg}`);
          totalFailed++;
        }

        await new Promise((r) => setTimeout(r, 1200));
      }
    }

    const { data: mapResult, error: mapErr } = await supabase
      .rpc("map_understat_to_matches");

    return new Response(
      JSON.stringify({
        endpoint_used: endpointName,
        leagues_processed: leagues.length,
        seasons_processed: seasons.length,
        total_inserted: totalInserted,
        total_skipped: totalSkipped,
        total_failed: totalFailed,
        mapping: mapResult ?? null,
        mapping_error: mapErr?.message ?? null,
        by_league_season: results,
        errors: errors.slice(0, 20),
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
