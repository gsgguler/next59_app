import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const INGESTION_RUN_ID = "fa341ca2-1e59-4cef-b90a-9a8b390384ed";

const FIFA_CODE_OVERRIDES: Record<string, string> = {
  "775": "AUT",   // Austria (API returns AUS, collides with Australia)
  "22": "IRN",    // Iran (API returns IRA, collides with Iraq)
  "1567": "IRQ",  // Iraq (API returns IRA, collides with Iran)
  "17": "KOR",    // South Korea (API returns SOU, collides with South Africa)
  "1531": "RSA",  // South Africa (API returns SOU, collides with South Korea)
  "5530": "CUW",  // Curacao (API returns null)
};

const COUNTRY_CODE_MAP: Record<string, string> = {
  "Algeria": "DZ", "Argentina": "AR", "Australia": "AU", "Austria": "AT",
  "Belgium": "BE", "Bosnia": "BA", "Brazil": "BR", "Canada": "CA",
  "Cape-Verde-Islands": "CV", "Colombia": "CO", "Congo-DR": "CD",
  "Croatia": "HR", "Curacao": "CW", "Czech-Republic": "CZ",
  "Ecuador": "EC", "Egypt": "EG", "England": "EN", "France": "FR",
  "Germany": "DE", "Ghana": "GH", "Haiti": "HT", "Iran": "IR",
  "Iraq": "IQ", "Ivory-Coast": "CI", "Japan": "JP", "Jordan": "JO",
  "Mexico": "MX", "Morocco": "MA", "Netherlands": "NL",
  "New-Zealand": "NZ", "Norway": "NO", "Panama": "PA", "Paraguay": "PY",
  "Portugal": "PT", "Qatar": "QA", "Saudi-Arabia": "SA", "Scotland": "SC",
  "Senegal": "SN", "South-Africa": "ZA", "South-Korea": "KR",
  "Spain": "ES", "Sweden": "SE", "Switzerland": "CH", "Tunisia": "TN",
  "Turkey": "TR", "Uruguay": "UY", "USA": "US", "Uzbekistan": "UZ",
};

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function deriveFifaCode(apiTeamId: string, apiCode: string | null): string | null {
  if (FIFA_CODE_OVERRIDES[apiTeamId]) return FIFA_CODE_OVERRIDES[apiTeamId];
  return apiCode ?? null;
}

function deriveCountryCode(apiCountry: string): string {
  return COUNTRY_CODE_MAP[apiCountry] ?? "XX";
}

function parseMatchweek(round: string): number | null {
  const m = round.match(/Group Stage - (\d+)/);
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
    // STEP 1 — CREATE COMPETITION
    // ═══════════════════════════

    const { data: existingComp } = await supabase
      .from("competitions")
      .select("id")
      .eq("code", "WC")
      .maybeSingle();

    let competitionId: string;

    if (existingComp) {
      competitionId = existingComp.id;
      log.push(`Competition already exists: ${competitionId}`);
    } else {
      const { data: newComp, error: compErr } = await supabase
        .from("competitions")
        .insert({
          name: "World Cup",
          short_name: "WC",
          code: "WC",
          type: "cup",
          country_code: null,
          confederation: "FIFA",
          is_domestic: false,
          tier: 1,
          competition_priority: 1,
          api_football_id: 1,
          is_active: true,
          is_supported: true,
          data_coverage: {
            standings: true,
            predictions: true,
            fixtures_events: false,
            fixtures_lineups: false,
            fixtures_statistics: false,
            players: false,
            injuries: false,
            partial_tournament_data: true,
            group_stage_fixtures: 72,
            knockout_fixtures: 0,
            expected_total: 104,
          },
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
    // STEP 2 — CREATE COMPETITION SEASON
    // ═══════════════════════════

    const { data: existingSeason } = await supabase
      .from("competition_seasons")
      .select("id")
      .eq("competition_id", competitionId)
      .eq("season_code", "2026")
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
          season_code: "2026",
          start_date: "2026-06-11",
          end_date: "2026-07-19",
          is_current: true,
          total_matchweeks: null,
          current_matchweek: null,
          host_countries: ["US", "MX", "CA"],
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
    // STEP 3 — CREATE 48 NATIONAL TEAMS
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
      const countryCode = deriveCountryCode(team.country);
      const fifaCode = deriveFifaCode(apiTeamId, team.code);

      const collisionCodes = ["AUS", "IRA", "SOU"];
      const shortName = (team.code && !collisionCodes.includes(team.code)) ? team.code : null;

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
            short_name: shortName,
            country_code: countryCode,
            team_type: "national_team",
            fifa_code: fifaCode,
            founded_year: team.founded,
            logo_url: team.logo,
            city: null,
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
    log.push(`Team mappings created/updated: ${teamMappingsCreated}`);

    // ═══════════════════════════
    // STEP 4 — CREATE 72 MATCHES
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

    let matchesCreated = 0;
    let matchesSkipped = 0;
    let matchMappingsCreated = 0;

    for (const raw of rawFixtures) {
      const rj = raw.response_json as {
        fixture: { id: number; date: string; timezone: string; venue: { id: number | null; name: string | null; city: string | null } };
        league: { round: string };
        teams: { home: { id: number; name: string }; away: { id: number; name: string } };
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
            status: "scheduled",
            matchweek,
            round_name: rj.league.round,
            stage: "group_stage",
            group_name: null,
            home_goals_ft: null,
            away_goals_ft: null,
            home_goals_ht: null,
            away_goals_ht: null,
            home_goals_et: null,
            away_goals_et: null,
            home_goals_pens: null,
            away_goals_pens: null,
            source_provider: "api-football",
            source_match_id: fixtureId,
            is_neutral_venue: true,
            stadium_id: null,
            referee_id: null,
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

    log.push(`Matches created: ${matchesCreated}, skipped: ${matchesSkipped}`);
    log.push(`Match mappings created/updated: ${matchMappingsCreated}`);

    // ═══════════════════════════
    // STEP 5 — COMPETITION + SEASON MAPPINGS
    // ═══════════════════════════

    const { error: compPmErr } = await supabase
      .from("provider_mappings")
      .upsert(
        {
          entity_type: "competition",
          provider_name: "api-football",
          provider_entity_id: "1",
          provider_entity_name: "World Cup",
          internal_entity_id: competitionId,
          confidence_score: 1.0,
          match_method: "id_crossref",
          is_primary: true,
          metadata: { api_football_league_id: 1 },
        },
        { onConflict: "entity_type,provider_name,provider_entity_id" },
      );

    if (compPmErr) {
      errors.push(`Competition mapping: ${compPmErr.message}`);
    } else {
      log.push("Competition provider mapping created");
    }

    const { error: seasonPmErr } = await supabase
      .from("provider_mappings")
      .upsert(
        {
          entity_type: "competition_season",
          provider_name: "api-football",
          provider_entity_id: "1_2026",
          provider_entity_name: "World Cup 2026",
          internal_entity_id: seasonId,
          confidence_score: 1.0,
          match_method: "id_crossref",
          is_primary: true,
          metadata: { api_football_league_id: 1, season: 2026 },
        },
        { onConflict: "entity_type,provider_name,provider_entity_id" },
      );

    if (seasonPmErr) {
      errors.push(`Season mapping: ${seasonPmErr.message}`);
    } else {
      log.push("Season provider mapping created");
    }

    const report = {
      competition_id: competitionId,
      season_id: seasonId,
      teams_created: teamsCreated,
      teams_skipped: teamsSkipped,
      team_mappings: teamMappingsCreated,
      matches_created: matchesCreated,
      matches_skipped: matchesSkipped,
      match_mappings: matchMappingsCreated,
      comp_season_mappings: 2,
      total_provider_mappings: teamMappingsCreated + matchMappingsCreated + 2,
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
