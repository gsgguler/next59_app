import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// AF league ID → {competition_season_id, competition_id, season_year}
// Current season = 2025-2026 (year=2025 in AF API)
const LEAGUE_SEASONS: Record<number, { cs_id: string; af_season: number }> = {
  39:  { cs_id: "f0f5f43c-55c4-44a1-9ca6-dbed10460097", af_season: 2025 }, // Premier League
  61:  { cs_id: "96b68baf-5368-43ed-93d4-05720a45a843", af_season: 2025 }, // Ligue 1
  78:  { cs_id: "dff96a19-a77a-42ae-bf04-bae1098e8411", af_season: 2025 }, // Bundesliga
  88:  { cs_id: "09af551c-9bae-48ed-aa01-28a328f0d5cb", af_season: 2025 }, // Eredivisie
  135: { cs_id: "160eb576-5b10-4803-be2c-e92eeb4afd82", af_season: 2025 }, // Serie A
  140: { cs_id: "60b9c7ec-ae43-4986-98e8-77ac6de3c3f2", af_season: 2025 }, // La Liga
  203: { cs_id: "fb898419-630e-439c-a709-003b9ac3bb34", af_season: 2025 }, // Süper Lig
};

const LEAGUE_IDS = Object.keys(LEAGUE_SEASONS).map(Number);

interface AfFixture {
  fixture: {
    id: number;
    date: string;   // ISO timestamp e.g. "2025-05-18T14:00:00+00:00"
    timestamp: number;
    status: { short: string; long: string; elapsed: number | null };
    referee: string | null;
    venue: { name: string | null; city: string | null };
  };
  league: { id: number; round: string };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
  score: {
    halftime: { home: number | null; away: number | null };
    fulltime: { home: number | null; away: number | null };
  };
}

// Resolve AF team name to DB team_id via af_team_aliases
async function resolveTeamId(
  supabase: ReturnType<typeof createClient>,
  leagueId: number,
  afTeamName: string,
): Promise<string | null> {
  const afNorm = normalizeTeamName(afTeamName);

  // Look up alias: af_norm -> db_norm
  const { data: alias } = await supabase
    .from("af_team_aliases")
    .select("db_norm")
    .eq("league_id", leagueId)
    .eq("af_norm", afNorm)
    .maybeSingle();

  const dbNorm = alias?.db_norm ?? afNorm; // fallback: use af_norm directly

  // Fetch all teams and match by normalize_team_name in DB
  // We use a DB RPC to avoid pulling all teams
  const { data: team } = await supabase.rpc("resolve_team_by_normalized_name", {
    p_norm: dbNorm,
  }).maybeSingle() as { data: { id: string } | null };

  if (team?.id) return team.id;

  // Secondary fallback: try af_norm directly as db_norm
  if (dbNorm !== afNorm) {
    const { data: team2 } = await supabase.rpc("resolve_team_by_normalized_name", {
      p_norm: afNorm,
    }).maybeSingle() as { data: { id: string } | null };
    if (team2?.id) return team2.id;
  }

  return null;
}

// Client-side normalization matching DB normalize_team_name() function
function normalizeTeamName(raw: string): string {
  const diacriticMap: Record<string, string> = {
    'ç':'c','ş':'s','ğ':'g','ı':'i','ö':'o','ü':'u',
    'é':'e','è':'e','ê':'e','ë':'e','ñ':'n','ã':'a','â':'a',
    'ô':'o','î':'i','û':'u','ř':'r','č':'c','ž':'z','ó':'o',
    'ú':'u','ě':'e','ș':'s','ț':'t','ø':'o','å':'a','ę':'e',
    'ć':'c','ł':'l','ź':'z','ń':'n','ą':'a','ý':'y','ď':'d',
    'ť':'t','ő':'o','ű':'u','ï':'i','à':'a','ù':'u',
  };
  let s = raw.toLowerCase().trim();
  s = s.replace(/[çşğıöüéèêëñãâôîûřčžóúěșțøåęćłźńąýďťőűïàù]/g, (c) => diacriticMap[c] ?? c);
  s = s.replace(/^\s*(as|ac|ss)\s+/i, '');
  s = s.replace(/\s*(f\.?c\.?|f\.?k\.?|s\.?k\.?|j\.?k\.?|c\.?f\.?|s\.?c\.?|i\.?f\.?|b\.?k\.?|aş|a\.ş\.|united|utd|club)\s*$/i, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const AF_KEY = Deno.env.get("API_FOOTBALL_KEY");
    if (!AF_KEY) throw new Error("API_FOOTBALL_KEY not set");

    const body = await req.json().catch(() => ({}));
    // next_days: how many days ahead to fetch (default 14, max 28)
    const nextDays: number = Math.min(body.next_days ?? 14, 28);
    // league_id: restrict to one league (default: all 7)
    const leagueFilter: number | null = body.league_id ?? null;
    // dry_run: fetch and parse but do not write to DB
    const dryRun: boolean = body.dry_run === true;

    const leagues = leagueFilter ? [leagueFilter] : LEAGUE_IDS;

    let totalFetched = 0, totalInserted = 0, totalSkipped = 0, totalUnmapped = 0;
    const leagueSummary: Array<{
      league_id: number;
      fixtures_from_api: number;
      inserted: number;
      skipped_exists: number;
      unmapped_teams: number;
      errors: string[];
    }> = [];

    for (const leagueId of leagues) {
      const leagueConfig = LEAGUE_SEASONS[leagueId];
      if (!leagueConfig) continue;

      const endpoint = `https://v3.football.api-sports.io/fixtures?league=${leagueId}&season=${leagueConfig.af_season}&next=${nextDays}`;
      const summary = { league_id: leagueId, fixtures_from_api: 0, inserted: 0, skipped_exists: 0, unmapped_teams: 0, errors: [] as string[] };

      let httpStatus = 0;
      try {
        const resp = await fetch(endpoint, {
          headers: { "x-apisports-key": AF_KEY },
        });
        httpStatus = resp.status;
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const json = await resp.json();
        const fixtures: AfFixture[] = json?.response ?? [];
        summary.fixtures_from_api = fixtures.length;
        totalFetched += fixtures.length;

        // Store raw response
        if (!dryRun && fixtures.length > 0) {
          const hash = `upcoming-${leagueId}-${leagueConfig.af_season}-${nextDays}d-${new Date().toISOString().slice(0, 13)}`;
          await supabase.from("api_football_fixture_probe_raw").upsert({
            endpoint,
            request_params: { league: leagueId, season: leagueConfig.af_season, next: nextDays },
            league_id: leagueId,
            season: leagueConfig.af_season,
            response_hash: hash,
            response_json: { fixture_count: fixtures.length, fixtures },
            http_status: httpStatus,
            transform_status: "upcoming_ns",
          }, { onConflict: "response_hash", ignoreDuplicates: true });
        }

        for (const fix of fixtures) {
          const fixtureId = fix.fixture.id;
          const statusShort = fix.fixture.status.short;

          // Only process NS (not started), TBD, or PST (postponed)
          if (!["NS", "TBD", "PST"].includes(statusShort)) {
            summary.skipped_exists++;
            continue;
          }

          // Check if already in matches table
          const { data: existingMatch } = await supabase
            .from("matches")
            .select("id")
            .eq("api_football_fixture_id", fixtureId)
            .maybeSingle();

          if (existingMatch) {
            summary.skipped_exists++;
            totalSkipped++;
            continue;
          }

          // Also check af_fixture_mappings for a match_id link
          const { data: existingMapping } = await supabase
            .from("af_fixture_mappings")
            .select("match_id")
            .eq("af_fixture_id", fixtureId)
            .not("match_id", "is", null)
            .maybeSingle();

          if (existingMapping?.match_id) {
            // Update the existing match with the fixture_id if not set
            if (!dryRun) {
              await supabase.from("matches").update({
                api_football_fixture_id: fixtureId,
                status_short: statusShort,
                status_long: fix.fixture.status.long,
              }).eq("id", existingMapping.match_id);
            }
            summary.skipped_exists++;
            totalSkipped++;
            continue;
          }

          if (dryRun) {
            summary.inserted++;
            totalInserted++;
            continue;
          }

          // Resolve team IDs
          const homeTeamId = await resolveTeamId(supabase, leagueId, fix.teams.home.name);
          const awayTeamId = await resolveTeamId(supabase, leagueId, fix.teams.away.name);

          if (!homeTeamId || !awayTeamId) {
            summary.unmapped_teams++;
            totalUnmapped++;
            summary.errors.push(
              `fixture ${fixtureId}: unmapped ${!homeTeamId ? fix.teams.home.name : ''} ${!awayTeamId ? fix.teams.away.name : ''}`.trim()
            );

            // Store in af_fixture_mappings as needs_review so we know about it
            await supabase.from("af_fixture_mappings").upsert({
              af_fixture_id: fixtureId,
              af_league_id: leagueId,
              af_season: leagueConfig.af_season,
              af_date: fix.fixture.date ? fix.fixture.date.slice(0, 10) : null,
              af_home_team: fix.teams.home.name,
              af_away_team: fix.teams.away.name,
              mapping_status: "needs_review",
              confidence: 0,
              match_reason: "team_unmapped",
            }, { onConflict: "af_fixture_id", ignoreDuplicates: false });

            continue;
          }

          // Build deterministic_source_match_id
          const matchDate = fix.fixture.date ? fix.fixture.date.slice(0, 10) : new Date(fix.fixture.timestamp * 1000).toISOString().slice(0, 10);
          const deterministicId = `af-${leagueId}-${leagueConfig.af_season}-${fixtureId}`;

          // Insert into matches
          const { data: newMatch, error: insertErr } = await supabase
            .from("matches")
            .insert({
              competition_season_id: leagueConfig.cs_id,
              home_team_id: homeTeamId,
              away_team_id: awayTeamId,
              api_football_fixture_id: fixtureId,
              deterministic_source_match_id: deterministicId,
              match_date: matchDate,
              timestamp: fix.fixture.timestamp,
              status_short: statusShort,
              status_long: fix.fixture.status.long,
              referee: fix.fixture.referee,
              round: fix.league.round,
            })
            .select("id")
            .single();

          if (insertErr) {
            if (insertErr.code === "23505") {
              // Duplicate on deterministic_source_match_id — update api_football_fixture_id
              await supabase.from("matches").update({
                api_football_fixture_id: fixtureId,
                status_short: statusShort,
                timestamp: fix.fixture.timestamp,
              }).eq("deterministic_source_match_id", deterministicId);
              summary.skipped_exists++;
              totalSkipped++;
            } else {
              summary.errors.push(`fixture ${fixtureId} insert: ${insertErr.message}`);
            }
            continue;
          }

          // Record mapping
          await supabase.from("af_fixture_mappings").upsert({
            match_id: newMatch.id,
            af_fixture_id: fixtureId,
            af_league_id: leagueId,
            af_season: leagueConfig.af_season,
            af_date: matchDate,
            af_home_team: fix.teams.home.name,
            af_away_team: fix.teams.away.name,
            mapping_status: "verified",
            confidence: 1.0,
            match_reason: "af_upcoming_ingest",
          }, { onConflict: "af_fixture_id", ignoreDuplicates: false });

          summary.inserted++;
          totalInserted++;

          // Trigger readiness assessment (non-blocking)
          EdgeRuntime.waitUntil(
            supabase.rpc("ml_assess_upcoming_match_readiness", { p_match_id: newMatch.id }).catch(() => {})
          );
        }
      } catch (e: any) {
        summary.errors.push(`api_error: ${e.message}`);
      }

      leagueSummary.push(summary);
      await new Promise((r) => setTimeout(r, 250));
    }

    return new Response(JSON.stringify({
      dry_run: dryRun,
      next_days: nextDays,
      leagues_processed: leagues.length,
      total_from_api: totalFetched,
      total_inserted: totalInserted,
      total_skipped: totalSkipped,
      total_unmapped: totalUnmapped,
      leagues: leagueSummary,
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
