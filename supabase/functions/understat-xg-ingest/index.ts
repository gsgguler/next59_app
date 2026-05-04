import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Understat URL slugs (Eredivisie not covered by Understat)
const LEAGUE_SLUGS = ["EPL", "La_liga", "Bundesliga", "Serie_A", "Ligue_1"];
const SEASONS = [2020, 2021, 2022, 2023, 2024];

// Map URL slug → DB slug for storage
const SLUG_TO_DB: Record<string, string> = {
  "EPL": "EPL",
  "La_liga": "La_liga",
  "Bundesliga": "Bundesliga",
  "Serie_A": "Serie_A",
  "Ligue_1": "Ligue_1",
};

interface UnderstatMatch {
  id: string;
  h: { id: string; title: string; short_title: string };
  a: { id: string; title: string; short_title: string };
  goals: { h: string; a: string };
  xG: { h: string; a: string };
  datetime: string;
  isResult: boolean;
}

async function fetchLeagueMatches(slug: string, season: number): Promise<UnderstatMatch[]> {
  const url = `https://understat.com/league/${slug}/${season}`;

  const html = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
    },
  }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${url}`);
    return r.text();
  });

  const datesMatch = html.match(/var\s+datesData\s*=\s*JSON\.parse\(['"](.+?)['"]\s*\)/s);
  if (!datesMatch) {
    // Return html snippet for debugging
    const snippet = html.slice(0, 500);
    throw new Error(`datesData not found in HTML. Snippet: ${snippet}`);
  }

  // Decode \xHH escape sequences produced by Understat's PHP json_encode
  const raw = datesMatch[1].replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );

  // Also decode unicode escapes just in case
  const decoded = raw.replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );

  const matches: UnderstatMatch[] = JSON.parse(decoded);
  return matches;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));

    // FBref HTML inspection mode
    if (body.fbref_inspect === true) {
      const url = "https://fbref.com/en/comps/9/2023-2024/schedule/2023-2024-Premier-League-Scores-and-Fixtures";
      const resp = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      const html = await resp.text();
      const tableIdMatch = html.match(/id="(sched_[^"]+)"/);
      // Extract first 3 data rows text
      const rowMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
      const dataRows: string[] = [];
      for (const rm of rowMatches) {
        const txt = rm[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        if (txt.length > 20 && !txt.includes("thead") && dataRows.length < 3) dataRows.push(txt.slice(0, 200));
      }
      return new Response(JSON.stringify({
        http_status: resp.status,
        html_length: html.length,
        has_cloudflare_challenge: html.includes("challenge-platform") || html.includes("cf-mitigated"),
        has_score_table: html.includes('id="sched_'),
        has_xg_columns: /<th[^>]*>[^<]*xG[^<]*<\/th>/i.test(html) || html.includes('data-stat="xg"'),
        table_id_found: tableIdMatch?.[1] ?? null,
        first_3_rows_text: dataRows,
      }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const leagueFilter: string | null = body.league_slug ?? null;
    const seasonFilter: number | null = body.season_year ?? null;
    const debugMode: boolean = body.debug === true;

    const leagues = leagueFilter ? [leagueFilter] : LEAGUE_SLUGS;
    const seasons = seasonFilter ? [seasonFilter] : SEASONS;

    // Inspect mode: return HTML structure analysis
    if (body.inspect === true) {
      const slug = leagueFilter ?? "EPL";
      const year = seasonFilter ?? 2023;
      const url = `https://understat.com/league/${slug}/${year}`;
      try {
        const resp = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
          },
        });
        const html = await resp.text();
        const len = html.length;

        const searchTerms = ["JSON.parse", "datesData", "teamsData", "playersData", "var "];
        const findings: Record<string, unknown> = {};
        for (const term of searchTerms) {
          const idx = html.indexOf(term);
          findings[term] = idx === -1
            ? null
            : { pos: idx, excerpt: html.slice(Math.max(0, idx - 50), idx + 150) };
        }

        return new Response(JSON.stringify({
          url,
          http_status: resp.status,
          html_length: len,
          slice_5000_6000: html.slice(5000, 6000),
          slice_10000_11000: html.slice(10000, 11000),
          slice_15000_16000: html.slice(15000, 16000),
          findings,
        }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return new Response(JSON.stringify({ error: msg, url }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Debug mode: fetch one league/season and return raw sample without inserting
    if (debugMode) {
      const slug = leagueFilter ?? "EPL";
      const year = seasonFilter ?? 2023;
      try {
        const matches = await fetchLeagueMatches(slug, year);
        return new Response(JSON.stringify({
          slug, year,
          total_matches: matches.length,
          finished_with_xg: matches.filter((m) => m.isResult && m.xG?.h != null).length,
          sample: matches.slice(0, 3),
        }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return new Response(JSON.stringify({ error: msg }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    let totalInserted = 0, totalSkipped = 0, totalFailed = 0;
    const results: Record<string, unknown>[] = [];
    const errors: string[] = [];

    for (const slug of leagues) {
      for (const year of seasons) {
        let inserted = 0, skipped = 0;
        const dbSlug = SLUG_TO_DB[slug] ?? slug;

        try {
          const matches = await fetchLeagueMatches(slug, year);

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
                  league_slug: dbSlug,
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

        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    // Run canonical mapping after ingest
    const { data: mapResult, error: mapErr } = await supabase
      .rpc("map_understat_to_matches");

    return new Response(
      JSON.stringify({
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
