import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// FBref comp IDs and URL name fragments
const LEAGUES: Array<{
  comp_id: number;
  fd_code: string;
  url_name: string;
  label: string;
}> = [
  { comp_id: 9,  fd_code: "E0",  url_name: "Premier-League",  label: "Premier League" },
  { comp_id: 12, fd_code: "SP1", url_name: "La-Liga",         label: "La Liga" },
  { comp_id: 11, fd_code: "I1",  url_name: "Serie-A",         label: "Serie A" },
  { comp_id: 20, fd_code: "D1",  url_name: "Bundesliga",      label: "Bundesliga" },
  { comp_id: 13, fd_code: "F1",  url_name: "Ligue-1",         label: "Ligue 1" },
  { comp_id: 23, fd_code: "N1",  url_name: "Eredivisie",      label: "Eredivisie" },
  { comp_id: 26, fd_code: "T1",  url_name: "Super-Lig",       label: "Super Lig" },
];

// FBref season labels
const SEASONS = ["2020-2021", "2021-2022", "2022-2023", "2023-2024", "2024-2025"];

function fbrefUrl(comp_id: number, season: string, url_name: string): string {
  return `https://fbref.com/en/comps/${comp_id}/${season}/schedule/${season}-${url_name}-Scores-and-Fixtures`;
}

async function fetchHtml(url: string): Promise<{ ok: boolean; status: number; text: string }> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 30000);
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
      },
      signal: ctrl.signal,
    });
    const text = await resp.text();
    return { ok: resp.ok, status: resp.status, text };
  } finally {
    clearTimeout(timeout);
  }
}

interface ParsedMatch {
  match_date: string | null;
  home_team: string | null;
  away_team: string | null;
  home_goals: number | null;
  away_goals: number | null;
  home_xg: number | null;
  away_xg: number | null;
  fbref_match_id: string | null;
  raw_row: Record<string, string>;
}

function parseScheduleTable(html: string): ParsedMatch[] {
  // Find the schedule table — FBref uses id="sched_SEASON_COMPID_1"
  const tableMatch = html.match(/<table[^>]+id="sched_[^"]*"[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) return [];

  const tableHtml = tableMatch[0];

  // Extract header cells to map column positions
  const theadMatch = tableHtml.match(/<thead>([\s\S]*?)<\/thead>/i);
  const headers: string[] = [];
  if (theadMatch) {
    const thMatches = theadMatch[1].matchAll(/<th[^>]*data-stat="([^"]*)"[^>]*>/gi);
    for (const m of thMatches) headers.push(m[1]);
  }

  const matches: ParsedMatch[] = [];

  // Extract tbody rows
  const tbodyMatch = tableHtml.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return [];

  const rowMatches = tbodyMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);

  for (const rowMatch of rowMatches) {
    const rowHtml = rowMatch[1];

    // Skip spacer/header rows
    if (rowHtml.includes('class="thead"') || rowHtml.trim() === "") continue;

    // Extract all td/th cells with data-stat attributes
    const cells: Record<string, string> = {};
    const cellMatches = rowHtml.matchAll(/<(?:td|th)[^>]*data-stat="([^"]*)"[^>]*>([\s\S]*?)<\/(?:td|th)>/gi);
    for (const cm of cellMatches) {
      const stat = cm[1];
      // Strip HTML tags from cell content
      const content = cm[2].replace(/<[^>]+>/g, "").trim();
      cells[stat] = content;
    }

    // Skip if no date (spacer row)
    if (!cells["date"] || cells["date"] === "") continue;

    // Extract match report link for fbref_match_id
    let matchId: string | null = null;
    const matchLinkMatch = rowHtml.match(/href="(\/en\/matches\/[^"]+)"/);
    if (matchLinkMatch) matchId = matchLinkMatch[1];

    // Parse numeric fields
    const homeGoals = cells["score"] ? parseInt(cells["score"].split("–")[0]?.trim() ?? "", 10) : NaN;
    const awayGoals = cells["score"] ? parseInt(cells["score"].split("–")[1]?.trim() ?? "", 10) : NaN;
    const homeXg = parseFloat(cells["xg"] ?? "");
    const awayXg = parseFloat(cells["xg_opp"] ?? "");

    matches.push({
      match_date: cells["date"] || null,
      home_team: cells["home_team"] || null,
      away_team: cells["away_team"] || null,
      home_goals: isNaN(homeGoals) ? null : homeGoals,
      away_goals: isNaN(awayGoals) ? null : awayGoals,
      home_xg: isNaN(homeXg) ? null : homeXg,
      away_xg: isNaN(awayXg) ? null : awayXg,
      fbref_match_id: matchId,
      raw_row: cells,
    });
  }

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

    // ─── INSPECT MODE ───────────────────────────────────────────────
    if (body.inspect === true) {
      const comp_id: number = body.comp_id ?? 9;
      const season: string = body.season ?? "2023-2024";
      const league = LEAGUES.find((l) => l.comp_id === comp_id) ?? LEAGUES[0];
      const url = fbrefUrl(comp_id, season, league.url_name);

      const { ok, status, text: html } = await fetchHtml(url);

      // Detect Cloudflare challenge
      const isCloudflare = html.includes("cf-browser-verification") ||
        html.includes("cf_clearance") ||
        html.includes("Cloudflare") && html.length < 50000;

      // Find table id
      const tableIdMatch = html.match(/id="(sched_[^"]+)"/);

      // Search for key patterns
      const searchTerms = ["xg", "xG", "Expected", "data-stat", "sched_", "JSON.parse", "score"];
      const findings: Record<string, { pos: number; excerpt: string } | null> = {};
      for (const term of searchTerms) {
        const idx = html.indexOf(term);
        findings[term] = idx === -1 ? null : {
          pos: idx,
          excerpt: html.slice(Math.max(0, idx - 30), idx + 120),
        };
      }

      // Try parsing the table
      const parsed = parseScheduleTable(html);
      const withXg = parsed.filter((m) => m.home_xg !== null);

      return new Response(JSON.stringify({
        url,
        http_status: status,
        http_ok: ok,
        html_length: html.length,
        is_cloudflare_blocked: isCloudflare,
        table_id: tableIdMatch?.[1] ?? null,
        parsed_rows: parsed.length,
        rows_with_xg: withXg.length,
        sample_parsed: parsed.slice(0, 3),
        findings,
        html_slice_head: html.slice(0, 300),
        html_slice_5k: html.slice(5000, 5500),
      }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── INGEST MODE ────────────────────────────────────────────────
    const compFilter: number | null = body.comp_id ?? null;
    const seasonFilter: string | null = body.season ?? null;
    const dryRun: boolean = body.dry_run === true;

    const leagues = compFilter ? LEAGUES.filter((l) => l.comp_id === compFilter) : LEAGUES;
    const seasons = seasonFilter ? [seasonFilter] : SEASONS;

    let totalInserted = 0, totalSkipped = 0, totalFailed = 0;
    const results: Record<string, unknown>[] = [];
    const errors: string[] = [];

    for (const league of leagues) {
      for (const season of seasons) {
        const url = fbrefUrl(league.comp_id, season, league.url_name);

        try {
          const { ok, status, text: html } = await fetchHtml(url);

          if (!ok) {
            errors.push(`${league.fd_code}/${season}: HTTP ${status}`);
            totalFailed++;
            continue;
          }

          // Detect Cloudflare
          if (html.includes("cf-browser-verification") || (html.includes("Cloudflare") && html.length < 50000)) {
            errors.push(`${league.fd_code}/${season}: Cloudflare blocked`);
            totalFailed++;
            continue;
          }

          const matches = parseScheduleTable(html);
          const withXg = matches.filter((m) => m.home_xg !== null && m.away_xg !== null && m.match_date !== null);

          if (dryRun) {
            results.push({
              fd_code: league.fd_code, season,
              parsed: matches.length, with_xg: withXg.length,
              sample: withXg.slice(0, 2),
            });
            continue;
          }

          let inserted = 0, skipped = 0;
          for (const m of withXg) {
            if (!m.home_team || !m.away_team || !m.match_date) continue;

            const { error } = await supabase
              .from("fbref_matches_raw")
              .upsert({
                comp_id: league.comp_id,
                season_label: season,
                match_date: m.match_date,
                home_team: m.home_team,
                away_team: m.away_team,
                home_xg: m.home_xg,
                away_xg: m.away_xg,
                home_goals: m.home_goals,
                away_goals: m.away_goals,
                fbref_match_id: m.fbref_match_id,
                raw_row: m.raw_row,
              }, {
                onConflict: "comp_id,season_label,match_date,home_team,away_team",
                ignoreDuplicates: false,
              });

            if (error) {
              if (error.code === "23505") skipped++;
              else errors.push(`${league.fd_code}/${season} ${m.match_date}: ${error.message}`);
            } else {
              inserted++;
            }
          }

          totalInserted += inserted;
          totalSkipped += skipped;
          results.push({ fd_code: league.fd_code, season, parsed: matches.length, with_xg: withXg.length, inserted, skipped });

        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`${league.fd_code}/${season}: ${msg}`);
          totalFailed++;
        }

        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    // Run canonical mapping
    let mapResult = null, mapErr = null;
    if (!dryRun && totalInserted > 0) {
      const { data, error } = await supabase.rpc("map_fbref_to_matches");
      mapResult = data;
      mapErr = error?.message ?? null;
    }

    return new Response(JSON.stringify({
      dry_run: dryRun,
      leagues_processed: leagues.length,
      seasons_processed: seasons.length,
      total_inserted: totalInserted,
      total_skipped: totalSkipped,
      total_failed: totalFailed,
      mapping_result: mapResult,
      mapping_error: mapErr,
      by_league_season: results,
      errors: errors.slice(0, 30),
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
