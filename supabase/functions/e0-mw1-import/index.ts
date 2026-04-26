import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const INGESTION_RUN_ID = "91d06e42-dcc5-4120-89fa-e341f9f79e20";

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function parseMatchweek(round: string): number | null {
  const m = round.match(/Regular Season - (\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = getSupabase();
    const log: string[] = [];
    const errors: string[] = [];

    // ═══════════════════════════
    // STEP 1 — VERIFY / FIND COMPETITION
    // ═══════════════════════════

    const { data: existingComp } = await supabase
      .from("competitions")
      .select("id")
      .eq("code", "PL")
      .maybeSingle();

    let competitionId: string;

    if (existingComp) {
      competitionId = existingComp.id;
      log.push(`Competition already exists: ${competitionId}`);
    } else {
      const { data: newComp, error: compErr } = await supabase
        .from("competitions")
        .insert({
          name: "Premier League",
          short_name: "PL",
          code: "PL",
          type: "league",
          country_code: "GB",
          confederation: "UEFA",
          is_domestic: true,
          tier: 1,
          competition_priority: 2,
          api_football_id: 39,
          is_active: true,
          is_supported: true,
        })
        .select("id")
        .single();

      if (compErr || !newComp) {
        throw new Error(`Failed to create competition: ${compErr?.message}`);
      }
      competitionId = newComp.id;
      log.push(`Competition created: ${competitionId}`);
    }

    // ═══════════════════════════
    // STEP 2 — VERIFY / FIND COMPETITION SEASON
    // ═══════════════════════════

    const { data: existingSeason } = await supabase
      .from("competition_seasons")
      .select("id")
      .eq("competition_id", competitionId)
      .eq("season_code", "2024-2025")
      .maybeSingle();

    let seasonId: string;

    if (existingSeason) {
      seasonId = existingSeason.id;
      log.push(`Competition season already exists: ${seasonId}`);
    } else {
      const { data: newSeason, error: seasonErr } = await supabase
        .from("competition_seasons")
        .insert({
          competition_id: competitionId,
          season_code: "2024-2025",
          start_date: "2024-08-16",
          end_date: "2025-05-25",
          is_current: true,
          total_matchweeks: 38,
          current_matchweek: 38,
        })
        .select("id")
        .single();

      if (seasonErr || !newSeason) {
        throw new Error(`Failed to create season: ${seasonErr?.message}`);
      }
      seasonId = newSeason.id;
      log.push(`Competition season created: ${seasonId}`);
    }

    // ═══════════════════════════
    // STEP 3 — RESOLVE 20 TEAMS FROM RAW DATA
    // ═══════════════════════════

    const { data: rawTeams, error: rawTeamsErr } = await supabase
      .from("api_football_raw_responses")
      .select("provider_entity_id, response_json")
      .eq("ingestion_run_id", INGESTION_RUN_ID)
      .eq("provider_entity_type", "team")
      .order("provider_entity_id");

    if (rawTeamsErr || !rawTeams) {
      throw new Error(`Failed to load raw teams: ${rawTeamsErr?.message}`);
    }

    log.push(`Raw teams loaded: ${rawTeams.length}`);

    let teamsCreated = 0;
    let teamsSkipped = 0;
    let teamMappingsCreated = 0;
    const teamIdMap: Record<string, string> = {};

    for (const raw of rawTeams) {
      const team = (raw.response_json as { team: { id: number; name: string; code: string | null; country: string; founded: number; logo: string; national: boolean } }).team;
      const apiTeamId = String(team.id);

      const { data: existingTeam } = await supabase
        .from("teams")
        .select("id")
        .eq("api_football_id", team.id)
        .maybeSingle();

      let internalTeamId: string;

      if (existingTeam) {
        internalTeamId = existingTeam.id;
        teamsSkipped++;
      } else {
        const { data: newTeam, error: teamErr } = await supabase
          .from("teams")
          .insert({
            name: team.name,
            short_name: team.code,
            country_code: "EN",
            team_type: "club",
            founded_year: team.founded,
            logo_url: team.logo,
            api_football_id: team.id,
            is_active: true,
          })
          .select("id")
          .single();

        if (teamErr || !newTeam) {
          errors.push(`Team ${team.name}: ${teamErr?.message}`);
          continue;
        }
        internalTeamId = newTeam.id;
        teamsCreated++;
      }

      teamIdMap[apiTeamId] = internalTeamId;

      const { error: pmErr } = await supabase
        .from("provider_mappings")
        .upsert(
          {
            entity_type: "team",
            provider_name: "api-football",
            provider_entity_id: apiTeamId,
            provider_entity_name: team.name,
            internal_entity_id: internalTeamId,
            confidence_score: 1.0,
            match_method: "id_crossref",
            is_primary: true,
            metadata: { api_football_id: team.id, country: team.country },
          },
          { onConflict: "entity_type,provider_name,provider_entity_id" },
        );

      if (pmErr) {
        errors.push(`Team mapping ${team.name}: ${pmErr.message}`);
      } else {
        teamMappingsCreated++;
      }
    }

    log.push(`Teams created: ${teamsCreated}, skipped: ${teamsSkipped}`);
    log.push(`Team mappings upserted: ${teamMappingsCreated}`);

    // ═══════════════════════════
    // STEP 4 — IMPORT MW1 FIXTURES ONLY (10 matches)
    // ═══════════════════════════

    const { data: rawFixtures, error: rawFixErr } = await supabase
      .from("api_football_raw_responses")
      .select("provider_entity_id, response_json")
      .eq("ingestion_run_id", INGESTION_RUN_ID)
      .eq("provider_entity_type", "fixture")
      .order("provider_entity_id");

    if (rawFixErr || !rawFixtures) {
      throw new Error(`Failed to load raw fixtures: ${rawFixErr?.message}`);
    }

    log.push(`Raw fixtures loaded: ${rawFixtures.length}`);

    const mw1Fixtures = rawFixtures.filter((r) => {
      const rj = r.response_json as { league?: { round?: string } };
      return rj?.league?.round === "Regular Season - 1";
    });

    log.push(`MW1 fixtures filtered: ${mw1Fixtures.length}`);

    let matchesCreated = 0;
    let matchesSkipped = 0;
    let matchMappingsCreated = 0;

    for (const raw of mw1Fixtures) {
      const rj = raw.response_json as {
        fixture: { id: number; date: string; timezone: string; venue: { id: number | null; name: string | null; city: string | null } };
        league: { round: string };
        teams: { home: { id: number; name: string }; away: { id: number; name: string } };
        goals: { home: number | null; away: number | null };
        score: { halftime: { home: number | null; away: number | null } };
      };

      const fixtureId = String(rj.fixture.id);
      const homeApiId = String(rj.teams.home.id);
      const awayApiId = String(rj.teams.away.id);

      const homeTeamId = teamIdMap[homeApiId];
      const awayTeamId = teamIdMap[awayApiId];

      if (!homeTeamId || !awayTeamId) {
        errors.push(`Fixture ${fixtureId}: unresolved team IDs home=${homeApiId} away=${awayApiId}`);
        continue;
      }

      const matchweek = parseMatchweek(rj.league.round);

      const { data: existingMatch } = await supabase
        .from("matches")
        .select("id")
        .eq("source_provider", "api-football")
        .eq("source_match_id", fixtureId)
        .maybeSingle();

      let internalMatchId: string;

      if (existingMatch) {
        internalMatchId = existingMatch.id;
        matchesSkipped++;
      } else {
        const { data: newMatch, error: matchErr } = await supabase
          .from("matches")
          .insert({
            competition_season_id: seasonId,
            home_team_id: homeTeamId,
            away_team_id: awayTeamId,
            kickoff_at: rj.fixture.date,
            timezone: rj.fixture.timezone || "UTC",
            status: "finished",
            matchweek,
            round_name: rj.league.round,
            stage: null,
            home_goals_ft: rj.goals?.home,
            away_goals_ft: rj.goals?.away,
            home_goals_ht: rj.score?.halftime?.home,
            away_goals_ht: rj.score?.halftime?.away,
            source_provider: "api-football",
            source_match_id: fixtureId,
            is_neutral_venue: false,
            api_football_id: rj.fixture.id,
          })
          .select("id")
          .single();

        if (matchErr || !newMatch) {
          errors.push(`Match ${fixtureId} (${rj.teams.home.name} vs ${rj.teams.away.name}): ${matchErr?.message}`);
          continue;
        }
        internalMatchId = newMatch.id;
        matchesCreated++;
      }

      const { error: mpmErr } = await supabase
        .from("provider_mappings")
        .upsert(
          {
            entity_type: "match",
            provider_name: "api-football",
            provider_entity_id: fixtureId,
            provider_entity_name: `${rj.teams.home.name} vs ${rj.teams.away.name}`,
            internal_entity_id: internalMatchId,
            confidence_score: 1.0,
            match_method: "id_crossref",
            is_primary: true,
            metadata: {
              round: rj.league.round,
              venue_name: rj.fixture.venue?.name ?? null,
            },
          },
          { onConflict: "entity_type,provider_name,provider_entity_id" },
        );

      if (mpmErr) {
        errors.push(`Match mapping ${fixtureId}: ${mpmErr.message}`);
      } else {
        matchMappingsCreated++;
      }
    }

    log.push(`MW1 matches created: ${matchesCreated}, skipped: ${matchesSkipped}`);
    log.push(`MW1 match mappings upserted: ${matchMappingsCreated}`);

    // ═══════════════════════════
    // STEP 5 — COMPETITION + SEASON MAPPINGS
    // ═══════════════════════════

    const { error: compPmErr } = await supabase
      .from("provider_mappings")
      .upsert(
        {
          entity_type: "competition",
          provider_name: "api-football",
          provider_entity_id: "39",
          provider_entity_name: "Premier League",
          internal_entity_id: competitionId,
          confidence_score: 1.0,
          match_method: "id_crossref",
          is_primary: true,
          metadata: { api_football_league_id: 39 },
        },
        { onConflict: "entity_type,provider_name,provider_entity_id" },
      );

    if (compPmErr) {
      errors.push(`Competition mapping: ${compPmErr.message}`);
    } else {
      log.push("Competition provider mapping upserted");
    }

    const { error: seasonPmErr } = await supabase
      .from("provider_mappings")
      .upsert(
        {
          entity_type: "competition_season",
          provider_name: "api-football",
          provider_entity_id: "39_2024",
          provider_entity_name: "Premier League 2024/25",
          internal_entity_id: seasonId,
          confidence_score: 1.0,
          match_method: "id_crossref",
          is_primary: true,
          metadata: { api_football_league_id: 39, season: 2024 },
        },
        { onConflict: "entity_type,provider_name,provider_entity_id" },
      );

    if (seasonPmErr) {
      errors.push(`Season mapping: ${seasonPmErr.message}`);
    } else {
      log.push("Season provider mapping upserted");
    }

    const report = {
      phase: "Phase 3 — MW1 Partial Import (Idempotency Test)",
      ingestion_run_id: INGESTION_RUN_ID,
      competition_id: competitionId,
      season_id: seasonId,
      teams_created: teamsCreated,
      teams_skipped: teamsSkipped,
      team_mappings_upserted: teamMappingsCreated,
      mw1_matches_created: matchesCreated,
      mw1_matches_skipped: matchesSkipped,
      mw1_match_mappings_upserted: matchMappingsCreated,
      comp_season_mappings_upserted: 2,
      idempotency_result: teamsCreated === 0 && matchesCreated === 0
        ? "PASS — zero new rows created, all entities pre-existing"
        : "CREATED_NEW — not fully idempotent",
      errors,
      log,
    };

    return new Response(JSON.stringify(report, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
