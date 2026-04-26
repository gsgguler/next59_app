import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const API_BASE = "https://v3.football.api-sports.io";
const WC_HOST_COUNTRIES = ["US", "MX", "CA"];

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function callApi(
  endpoint: string,
): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
  const apiKey = Deno.env.get("API_FOOTBALL_KEY");
  if (!apiKey) throw new Error("API_FOOTBALL_KEY not configured");
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, { headers: { "x-apisports-key": apiKey } });
  const rateLimitHeaders: Record<string, string> = {};
  for (const [key, value] of res.headers.entries()) {
    if (key.startsWith("x-ratelimit") || key.startsWith("x-request")) {
      rateLimitHeaders[key] = value;
    }
  }
  const body = await res.json();
  return { status: res.status, headers: rateLimitHeaders, body };
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

interface FixtureData {
  fixture: {
    id: number;
    date: string;
    venue?: { city?: string; country?: string };
    status?: { short: string };
  };
  league: { id: number; name: string; country?: string; round?: string };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
  goals: { home: number | null; away: number | null };
  score: {
    halftime?: { home: number | null; away: number | null };
    fulltime?: { home: number | null; away: number | null };
  };
}

interface TeamInfo {
  team_id: string;
  name: string;
  api_football_id: string;
  country_code: string;
}

interface EloState {
  rating: number;
  matchCount: number;
  lastMatchAt: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  last5Results: number[]; // points: W=3, D=1, L=0
  last10Results: number[];
  goalsFor: number[];
  goalsAgainst: number[];
  allMatches: Array<{
    date: string;
    opponent_api_id: number;
    goals_for: number;
    goals_against: number;
    result: "W" | "D" | "L";
    is_home: boolean;
    venue_country: string | null;
  }>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = getSupabase();
    const log: string[] = [];
    const errors: string[] = [];
    let apiCallsUsed = 0;
    let rowsRaw = 0;

    // ═══════════════════════════════════════
    // PHASE 1 — RAW FETCH: 48 TEAMS HISTORY
    // ═══════════════════════════════════════

    // Create ingestion run
    const { data: run, error: runErr } = await supabase
      .from("ingestion_runs")
      .insert({
        provider_name: "api-football",
        ingestion_type: "national_team_history_strength",
        league_code: "WC",
        season_code: "2026",
        status: "started",
        metadata: {
          description: "WC 2026 national team history fetch + strength engine",
        },
      })
      .select("id")
      .single();

    if (runErr || !run) {
      throw new Error(`Failed to create ingestion run: ${runErr?.message}`);
    }
    const runId = run.id;
    log.push(`Ingestion run created: ${runId}`);

    // Load all 48 WC teams with their API-Football IDs
    const { data: wcTeamsRaw, error: teamsErr } = await supabase
      .from("provider_mappings")
      .select("internal_entity_id, provider_entity_id, provider_entity_name")
      .eq("entity_type", "team")
      .eq("provider_name", "api-football")
      .eq("is_primary", true);

    if (teamsErr || !wcTeamsRaw) {
      throw new Error(`Failed to load team mappings: ${teamsErr?.message}`);
    }

    // Get WC team IDs
    const { data: wcMatchTeams } = await supabase.rpc("", {});
    // Instead, query WC teams directly
    const { data: wcTeamIds } = await supabase
      .from("matches")
      .select("home_team_id, away_team_id, competition_season_id")
      .eq("status", "scheduled");

    // Get WC season ID
    const { data: wcSeason } = await supabase
      .from("competition_seasons")
      .select("id")
      .eq("season_code", "2026")
      .maybeSingle();

    if (!wcSeason) throw new Error("WC 2026 season not found");

    const { data: wcMatches } = await supabase
      .from("matches")
      .select("home_team_id, away_team_id")
      .eq("competition_season_id", wcSeason.id);

    const wcTeamIdSet = new Set<string>();
    for (const m of wcMatches ?? []) {
      wcTeamIdSet.add(m.home_team_id);
      wcTeamIdSet.add(m.away_team_id);
    }

    // Get team details
    const { data: teamDetails } = await supabase
      .from("teams")
      .select("id, name, country_code, team_type")
      .in("id", [...wcTeamIdSet]);

    const teamMap = new Map<string, TeamInfo>();
    for (const t of teamDetails ?? []) {
      const mapping = wcTeamsRaw.find((m) => m.internal_entity_id === t.id);
      if (mapping) {
        teamMap.set(t.id, {
          team_id: t.id,
          name: t.name,
          api_football_id: mapping.provider_entity_id,
          country_code: t.country_code,
        });
      }
    }

    log.push(`WC teams with API-Football mappings: ${teamMap.size}`);

    if (teamMap.size < 48) {
      errors.push(`Expected 48 teams, found ${teamMap.size} with mappings`);
    }

    // Fetch last 30 fixtures for each team
    const teamFixtures = new Map<string, FixtureData[]>();
    const failedTeams: string[] = [];

    for (const [teamId, info] of teamMap) {
      try {
        const res = await callApi(`/fixtures?team=${info.api_football_id}&last=30`);
        apiCallsUsed++;

        const resJson = JSON.stringify(res.body);
        const resHash = await sha256(resJson);

        // Store raw response
        const { error: rawErr } = await supabase
          .from("api_football_raw_responses")
          .insert({
            endpoint: "/fixtures",
            request_params: { team: parseInt(info.api_football_id), last: 30 },
            provider_entity_type: "fixture_list",
            provider_entity_id: `team_${info.api_football_id}_last30`,
            response_hash: resHash,
            response_json: res.body,
            http_status: res.status,
            fetched_at: new Date().toISOString(),
            season_code: "multi",
            league_code: "INT",
            ingestion_run_id: runId,
            transform_status: "pending",
          });

        if (rawErr) {
          if (rawErr.code === "23505") {
            rowsRaw++;
          } else {
            errors.push(`Raw store ${info.name}: ${rawErr.message}`);
          }
        } else {
          rowsRaw++;
        }

        // Extract finished fixtures
        const body = res.body as { response?: FixtureData[]; results?: number };
        const fixtures = (body?.response ?? []).filter(
          (f) => f.fixture?.status?.short === "FT" &&
            f.goals?.home !== null &&
            f.goals?.away !== null,
        );
        teamFixtures.set(teamId, fixtures);
      } catch (fetchErr) {
        failedTeams.push(info.name);
        errors.push(`Fetch ${info.name}: ${(fetchErr as Error).message}`);
        teamFixtures.set(teamId, []);
      }
    }

    log.push(`API calls used: ${apiCallsUsed}`);
    log.push(`Raw rows stored: ${rowsRaw}`);
    log.push(`Failed teams: ${failedTeams.length}`);

    // ═══════════════════════════════════════
    // PHASE 2 — ELO COMPUTATION
    // ═══════════════════════════════════════

    // Collect ALL unique matches across all 48 teams, deduplicate by fixture.id
    const allMatchesMap = new Map<number, { fixture: FixtureData; date: string }>();
    for (const [, fixtures] of teamFixtures) {
      for (const f of fixtures) {
        if (!allMatchesMap.has(f.fixture.id)) {
          allMatchesMap.set(f.fixture.id, {
            fixture: f,
            date: f.fixture.date,
          });
        }
      }
    }

    // Sort all matches by date ascending for chronological Elo processing
    const sortedMatches = [...allMatchesMap.values()].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    log.push(`Total unique fixtures across all teams: ${sortedMatches.length}`);

    // Initialize Elo state for all teams (keyed by API-Football team ID)
    const eloByApiId = new Map<number, number>();
    const matchCountByApiId = new Map<number, number>();

    // Build reverse lookup: API-Football ID -> internal team_id
    const apiIdToInternal = new Map<number, string>();
    for (const [teamId, info] of teamMap) {
      const apiId = parseInt(info.api_football_id);
      eloByApiId.set(apiId, 1500);
      matchCountByApiId.set(apiId, 0);
      apiIdToInternal.set(apiId, teamId);
    }

    // K factor
    const K = 30;

    // Process matches chronologically
    for (const { fixture: f } of sortedMatches) {
      const homeApiId = f.teams.home.id;
      const awayApiId = f.teams.away.id;
      const homeGoals = f.goals.home!;
      const awayGoals = f.goals.away!;

      // Get current ratings (default 1500 for teams not in our set)
      const homeRating = eloByApiId.get(homeApiId) ?? 1500;
      const awayRating = eloByApiId.get(awayApiId) ?? 1500;

      // Home advantage: +60 if not neutral venue
      // For international matches, most are neutral or away
      // Simple heuristic: if venue country matches home team country, apply home advantage
      let homeAdv = 0;
      const venueCountry = f.fixture.venue?.country?.toLowerCase() ?? "";
      const homeCountry = f.league?.country?.toLowerCase() ?? "";
      // Keep it simple: international matches are mostly neutral
      // Only apply home advantage if fixture is clearly a home match
      // (venue country matches the home team's league country)
      if (venueCountry && homeCountry && venueCountry === homeCountry) {
        homeAdv = 60;
      }

      // Expected scores
      const eHome = 1 / (1 + Math.pow(10, (awayRating - (homeRating + homeAdv)) / 400));
      const eAway = 1 - eHome;

      // Actual scores
      let sHome: number;
      let sAway: number;
      if (homeGoals > awayGoals) {
        sHome = 1;
        sAway = 0;
      } else if (homeGoals === awayGoals) {
        sHome = 0.5;
        sAway = 0.5;
      } else {
        sHome = 0;
        sAway = 1;
      }

      // Update ratings only for teams in our WC set
      if (eloByApiId.has(homeApiId)) {
        const newRating = homeRating + K * (sHome - eHome);
        eloByApiId.set(homeApiId, newRating);
        matchCountByApiId.set(homeApiId, (matchCountByApiId.get(homeApiId) ?? 0) + 1);
      }
      if (eloByApiId.has(awayApiId)) {
        const newRating = awayRating + K * (sAway - eAway);
        eloByApiId.set(awayApiId, newRating);
        matchCountByApiId.set(awayApiId, (matchCountByApiId.get(awayApiId) ?? 0) + 1);
      }
    }

    // ═══════════════════════════════════════
    // PHASE 2B — FORM + ATTACK + DEFENSE per team
    // ═══════════════════════════════════════

    // Build per-team stats from their specific fixture lists
    const teamStats = new Map<
      string,
      {
        elo: number;
        matchCount: number;
        form5: number;
        form10: number;
        attackScore: number;
        defenseScore: number;
        lastMatchAt: string | null;
        windowStart: string | null;
        windowEnd: string | null;
        goalsFor: number;
        goalsAgainst: number;
        totalMatches: number;
      }
    >();

    for (const [teamId, info] of teamMap) {
      const apiId = parseInt(info.api_football_id);
      const fixtures = teamFixtures.get(teamId) ?? [];

      // Sort by date descending for form calculation
      const sorted = [...fixtures].sort(
        (a, b) => new Date(b.fixture.date).getTime() - new Date(a.fixture.date).getTime(),
      );

      const results: number[] = [];
      let totalGF = 0;
      let totalGA = 0;

      for (const f of sorted) {
        const isHome = f.teams.home.id === apiId;
        const gf = isHome ? f.goals.home! : f.goals.away!;
        const ga = isHome ? f.goals.away! : f.goals.home!;
        totalGF += gf;
        totalGA += ga;

        if (gf > ga) results.push(3);
        else if (gf === ga) results.push(1);
        else results.push(0);
      }

      const last5 = results.slice(0, 5);
      const last10 = results.slice(0, 10);
      const form5 = last5.length > 0 ? last5.reduce((a, b) => a + b, 0) / (last5.length * 3) : 0;
      const form10 = last10.length > 0 ? last10.reduce((a, b) => a + b, 0) / (last10.length * 3) : 0;

      const matchCount = matchCountByApiId.get(apiId) ?? 0;
      const avgGF = sorted.length > 0 ? totalGF / sorted.length : 0;
      const avgGA = sorted.length > 0 ? totalGA / sorted.length : 0;

      // Attack score: goals per match (higher = better)
      const attackScore = avgGF;
      // Defense score: inverse of goals conceded (higher = better defense)
      // Use 2.0 - avgGA clamped to [0, 2] so that a team conceding 0/match = 2.0, conceding 2/match = 0
      const defenseScore = clamp(2.0 - avgGA, 0, 2.0);

      const dates = sorted.map((f) => f.fixture.date);
      const lastMatchAt = dates.length > 0 ? dates[0] : null;
      const windowStart = dates.length > 0 ? dates[dates.length - 1] : null;
      const windowEnd = dates.length > 0 ? dates[0] : null;

      teamStats.set(teamId, {
        elo: eloByApiId.get(apiId) ?? 1500,
        matchCount,
        form5: parseFloat(form5.toFixed(3)),
        form10: parseFloat(form10.toFixed(3)),
        attackScore: parseFloat(attackScore.toFixed(3)),
        defenseScore: parseFloat(defenseScore.toFixed(3)),
        lastMatchAt,
        windowStart,
        windowEnd,
        goalsFor: totalGF,
        goalsAgainst: totalGA,
        totalMatches: sorted.length,
      });
    }

    // ═══════════════════════════════════════
    // PHASE 3 — VENUE BRAIN
    // ═══════════════════════════════════════

    // Host teams get positive venue_score
    const venueScores = new Map<string, number>();
    for (const [teamId, info] of teamMap) {
      if (WC_HOST_COUNTRIES.includes(info.country_code)) {
        venueScores.set(teamId, 0.1);
      } else {
        venueScores.set(teamId, 0.0);
      }
    }

    // ═══════════════════════════════════════
    // PHASE 4 — CONFIDENCE + UPSERT RATINGS
    // ═══════════════════════════════════════

    let ratingsUpserted = 0;

    for (const [teamId, stats] of teamStats) {
      const info = teamMap.get(teamId)!;
      const venue = venueScores.get(teamId) ?? 0;

      // Confidence calculation
      let confidence: number;
      if (stats.matchCount >= 20) confidence = 0.85;
      else if (stats.matchCount >= 15) confidence = 0.75;
      else if (stats.matchCount >= 10) confidence = 0.60;
      else if (stats.matchCount >= 5) confidence = 0.45;
      else if (stats.matchCount >= 1) confidence = 0.25;
      else confidence = 0.10;

      confidence = clamp(confidence, 0.10, 1.00);

      const { error: upsertErr } = await supabase
        .from("team_strength_ratings")
        .upsert(
          {
            team_id: teamId,
            provider_name: "api-football",
            rating_scope: "national_team_recent",
            rating_version: "wc2026_v1",
            elo_rating: parseFloat(stats.elo.toFixed(2)),
            form_score: stats.form5,
            attack_score: stats.attackScore,
            defense_score: stats.defenseScore,
            market_score: null,
            venue_score: venue,
            match_count: stats.matchCount,
            last_match_at: stats.lastMatchAt,
            data_window_start: stats.windowStart ? stats.windowStart.substring(0, 10) : null,
            data_window_end: stats.windowEnd ? stats.windowEnd.substring(0, 10) : null,
            confidence_score: confidence,
            metadata: {
              source: "api-football-international",
              ingestion_run_id: runId,
              total_matches_considered: stats.totalMatches,
              goals_for: stats.goalsFor,
              goals_against: stats.goalsAgainst,
              form_last_10: stats.form10,
              is_host: WC_HOST_COUNTRIES.includes(info.country_code),
            },
            updated_at: new Date().toISOString(),
          },
          { onConflict: "team_id,provider_name,rating_scope,rating_version" },
        );

      if (upsertErr) {
        errors.push(`Rating upsert ${info.name}: ${upsertErr.message}`);
      } else {
        ratingsUpserted++;
      }
    }

    log.push(`Ratings upserted: ${ratingsUpserted}`);

    // ═══════════════════════════════════════
    // PHASE 5 — REGENERATE WC PREDICTIONS
    // ═══════════════════════════════════════

    // Load all 72 WC matches
    const { data: wcMatchList, error: wcMatchErr } = await supabase
      .from("matches")
      .select(`
        id, home_team_id, away_team_id, kickoff_at, matchweek,
        is_neutral_venue, competition_season_id, round_name,
        home_team:teams!matches_home_team_id_fkey(name),
        away_team:teams!matches_away_team_id_fkey(name)
      `)
      .eq("competition_season_id", wcSeason.id)
      .eq("status", "scheduled")
      .order("kickoff_at");

    if (wcMatchErr || !wcMatchList) {
      throw new Error(`Failed to load WC matches: ${wcMatchErr?.message}`);
    }

    log.push(`WC matches to predict: ${wcMatchList.length}`);

    // Check for existing predictions to handle versioning
    const { data: existingPreds } = await supabase
      .from("predictions")
      .select("id, match_id, version, model_version")
      .eq("is_current", true)
      .in(
        "match_id",
        wcMatchList.map((m) => m.id),
      );

    const existingPredMap = new Map<string, { id: string; version: number; model_version: string }>();
    for (const p of existingPreds ?? []) {
      existingPredMap.set(p.match_id, { id: p.id, version: p.version, model_version: p.model_version });
    }

    let predictionsCreated = 0;
    let predictionsSuperseded = 0;
    const samplePredictions: unknown[] = [];

    for (const match of wcMatchList) {
      const homeStats = teamStats.get(match.home_team_id);
      const awayStats = teamStats.get(match.away_team_id);
      const homeName = (match.home_team as unknown as { name: string })?.name ?? "Home";
      const awayName = (match.away_team as unknown as { name: string })?.name ?? "Away";

      if (!homeStats || !awayStats) {
        errors.push(`Missing stats for ${homeName} vs ${awayName}`);
        continue;
      }

      const homeVenue = venueScores.get(match.home_team_id) ?? 0;
      const awayVenue = venueScores.get(match.away_team_id) ?? 0;

      // Weighted strength blend
      const homeStrength =
        homeStats.elo * 0.40 +
        homeStats.form5 * 1500 * 0.25 + // scale form to Elo range
        homeStats.attackScore * 750 * 0.15 +
        homeStats.defenseScore * 750 * 0.15 +
        homeVenue * 1500 * 0.05;

      const awayStrength =
        awayStats.elo * 0.40 +
        awayStats.form5 * 1500 * 0.25 +
        awayStats.attackScore * 750 * 0.15 +
        awayStats.defenseScore * 750 * 0.15 +
        awayVenue * 1500 * 0.05;

      // Convert strength difference to 1X2 probabilities
      const strengthDiff = homeStrength - awayStrength;

      let rawHome = 0.33 + (strengthDiff / 400) * 0.15;
      let rawAway = 0.33 + (-strengthDiff / 400) * 0.15;
      let rawDraw = 1.0 - rawHome - rawAway;

      // Neutral venue: no home advantage (all WC matches are neutral)
      // Already accounted for in the base calculation

      // Clamp minimums
      rawHome = Math.max(rawHome, 0.10);
      rawAway = Math.max(rawAway, 0.10);
      rawDraw = Math.max(rawDraw, 0.10);

      // Normalize to sum=1
      const total = rawHome + rawDraw + rawAway;
      const homeProb = parseFloat((rawHome / total).toFixed(3));
      const drawProb = parseFloat((rawDraw / total).toFixed(3));
      const awayProb = parseFloat((rawAway / total).toFixed(3));

      // Over 2.5
      let over25Base = (homeStats.attackScore + awayStats.attackScore) / 4.0;
      // Adjust by defense (poor defense = more goals)
      over25Base += (2.0 - homeStats.defenseScore) * 0.05;
      over25Base += (2.0 - awayStats.defenseScore) * 0.05;
      const over25Prob = clamp(parseFloat(over25Base.toFixed(3)), 0.20, 0.80);

      // BTTS
      let bttsBase = 0.45;
      bttsBase += (homeStats.attackScore + awayStats.attackScore - homeStats.defenseScore - awayStats.defenseScore) * 0.02;
      // Both teams scoring relates to attack strength and opponent's defensive weakness
      bttsBase += (homeStats.attackScore > 1.0 ? 0.05 : 0) + (awayStats.attackScore > 1.0 ? 0.05 : 0);
      const bttsProb = clamp(parseFloat(bttsBase.toFixed(3)), 0.20, 0.80);

      // Confidence
      let conf = 0.50;
      if (homeStats.matchCount >= 10 && awayStats.matchCount >= 10) conf += 0.10;
      if (homeStats.matchCount >= 20 && awayStats.matchCount >= 20) conf += 0.10;
      if (Math.abs(homeStats.elo - awayStats.elo) > 200) conf += 0.05;
      if (homeStats.matchCount < 3 || awayStats.matchCount < 3) conf -= 0.10;
      if (homeStats.matchCount < 8 || awayStats.matchCount < 8) conf -= 0.05;
      conf = clamp(parseFloat(conf.toFixed(2)), 0.20, 0.95);

      const confLabel = conf >= 0.70 ? "high" : conf >= 0.50 ? "medium" : "low";

      // Data quality penalty
      let dqp = 0;
      if (homeStats.matchCount < 5) dqp += 0.3;
      if (awayStats.matchCount < 5) dqp += 0.3;
      if (homeStats.matchCount < 10) dqp += 0.1;
      if (awayStats.matchCount < 10) dqp += 0.1;
      dqp = clamp(dqp, 0, 1);

      const missingFlags: string[] = [];
      if (homeStats.matchCount < 5) missingFlags.push("home_low_history");
      if (awayStats.matchCount < 5) missingFlags.push("away_low_history");

      const modelOutputRaw = {
        "1x2_home": homeProb,
        "1x2_draw": drawProb,
        "1x2_away": awayProb,
        over_2_5: over25Prob,
        btts_yes: bttsProb,
      };

      const headlineProb = Math.max(homeProb, drawProb, awayProb);

      const featureSnapshot = {
        home_team: homeName,
        away_team: awayName,
        home_elo: parseFloat(homeStats.elo.toFixed(2)),
        away_elo: parseFloat(awayStats.elo.toFixed(2)),
        elo_diff: parseFloat((homeStats.elo - awayStats.elo).toFixed(2)),
        home_form5: homeStats.form5,
        away_form5: awayStats.form5,
        home_attack: homeStats.attackScore,
        away_attack: awayStats.attackScore,
        home_defense: homeStats.defenseScore,
        away_defense: awayStats.defenseScore,
        home_venue: homeVenue,
        away_venue: awayVenue,
        home_match_count: homeStats.matchCount,
        away_match_count: awayStats.matchCount,
        strength_diff: parseFloat(strengthDiff.toFixed(2)),
      };

      // Generate statement
      let outcome: string;
      if (homeProb > drawProb && homeProb > awayProb) {
        outcome = homeProb > 0.45 ? `${homeName} are clear favorites` : `${homeName} have a slight edge`;
      } else if (awayProb > drawProb && awayProb > homeProb) {
        outcome = awayProb > 0.45 ? `${awayName} are clear favorites` : `${awayName} have a slight edge`;
      } else {
        outcome = "An evenly matched contest expected";
      }
      const goalNote = over25Prob > 0.55 ? "with goals expected" : over25Prob < 0.35 ? "in a likely tight affair" : "with moderate goal expectation";
      const bttsNote = bttsProb > 0.55 ? " Both sides likely to score." : "";
      const statement = `${outcome} ${goalNote}.${bttsNote}`;

      const contentForHash = JSON.stringify({
        match_id: match.id,
        model_version: "wc2026_strength_v1",
        predictions: modelOutputRaw,
      });
      const contentHash = await sha256(contentForHash);

      // Handle idempotency / versioning
      const existing = existingPredMap.get(match.id);

      if (existing) {
        const newVersion = existing.version + 1;
        const cassandraCode = `STR-${homeName.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, "X")}-${awayName.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, "X")}-v${newVersion}-${match.id.substring(0, 4)}`;

        const { data: newPred, error: insertErr } = await supabase
          .from("predictions")
          .insert({
            match_id: match.id,
            version: newVersion,
            is_current: true,
            supersedes: existing.id,
            cassandra_code: cassandraCode,
            statement,
            probability: parseFloat(headlineProb.toFixed(3)),
            confidence_label: confLabel,
            category: "pre_match",
            model_version: "wc2026_strength_v1",
            model_input_features: featureSnapshot,
            model_output_raw: modelOutputRaw,
            content_hash: contentHash,
            hash_algorithm: "sha-256",
            hash_input_fields: ["match_id", "model_version", "predictions"],
            access_level: "free",
            data_quality_penalty: dqp,
            missing_data_flags: missingFlags,
            generation_source: "ensemble_model",
            generated_by_function: "wc2026-strength-engine",
          })
          .select("id")
          .single();

        if (insertErr) {
          errors.push(`Predict ${homeName} vs ${awayName}: ${insertErr.message}`);
          continue;
        }

        // Mark old as superseded
        await supabase
          .from("predictions")
          .update({
            is_current: false,
            superseded_at: new Date().toISOString(),
            superseded_by: newPred!.id,
          })
          .eq("id", existing.id);

        predictionsSuperseded++;
        predictionsCreated++;
      } else {
        // New prediction (no existing)
        const cassandraCode = `STR-${homeName.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, "X")}-${awayName.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, "X")}-v1-${match.id.substring(0, 4)}`;

        const { error: insertErr } = await supabase
          .from("predictions")
          .insert({
            match_id: match.id,
            version: 1,
            is_current: true,
            supersedes: null,
            cassandra_code: cassandraCode,
            statement,
            probability: parseFloat(headlineProb.toFixed(3)),
            confidence_label: confLabel,
            category: "pre_match",
            model_version: "wc2026_strength_v1",
            model_input_features: featureSnapshot,
            model_output_raw: modelOutputRaw,
            content_hash: contentHash,
            hash_algorithm: "sha-256",
            hash_input_fields: ["match_id", "model_version", "predictions"],
            access_level: "free",
            data_quality_penalty: dqp,
            missing_data_flags: missingFlags,
            generation_source: "ensemble_model",
            generated_by_function: "wc2026-strength-engine",
          });

        if (insertErr) {
          errors.push(`Predict ${homeName} vs ${awayName}: ${insertErr.message}`);
          continue;
        }
        predictionsCreated++;
      }

      if (samplePredictions.length < 5) {
        samplePredictions.push({
          match: `${homeName} vs ${awayName}`,
          home_elo: parseFloat(homeStats.elo.toFixed(1)),
          away_elo: parseFloat(awayStats.elo.toFixed(1)),
          elo_diff: parseFloat((homeStats.elo - awayStats.elo).toFixed(1)),
          predictions: modelOutputRaw,
          confidence: conf,
          confidence_label: confLabel,
        });
      }
    }

    log.push(`Predictions created: ${predictionsCreated}`);
    log.push(`Predictions superseded (old versions): ${predictionsSuperseded}`);

    // ═══════════════════════════════════════
    // PHASE 6 — UPDATE INGESTION RUN
    // ═══════════════════════════════════════

    const finalStatus = errors.length > 0 ? "completed_with_errors" : "completed";
    await supabase
      .from("ingestion_runs")
      .update({
        status: finalStatus,
        completed_at: new Date().toISOString(),
        api_calls_used: apiCallsUsed,
        rows_raw: rowsRaw,
        rows_transformed: ratingsUpserted,
        rows_failed: errors.length,
        error_summary: errors.length > 0 ? { errors: errors.slice(0, 50) } : null,
        metadata: {
          description: "WC 2026 national team history fetch + strength engine",
          ratings_upserted: ratingsUpserted,
          predictions_created: predictionsCreated,
          predictions_superseded: predictionsSuperseded,
          unique_fixtures: sortedMatches.length,
          failed_teams: failedTeams,
        },
      })
      .eq("id", runId);

    // Build top/bottom Elo rankings
    const rankings = [...teamStats.entries()]
      .map(([id, s]) => ({
        name: teamMap.get(id)!.name,
        elo: parseFloat(s.elo.toFixed(1)),
        matchCount: s.matchCount,
        form5: s.form5,
        attack: s.attackScore,
        defense: s.defenseScore,
      }))
      .sort((a, b) => b.elo - a.elo);

    const report = {
      status: finalStatus === "completed" ? "GO" : "CONDITIONAL",
      ingestion_run_id: runId,
      phase1_raw_fetch: {
        api_calls_used: apiCallsUsed,
        raw_rows_stored: rowsRaw,
        failed_teams: failedTeams,
        total_unique_fixtures: sortedMatches.length,
        date_range: sortedMatches.length > 0
          ? {
              earliest: sortedMatches[0].date.substring(0, 10),
              latest: sortedMatches[sortedMatches.length - 1].date.substring(0, 10),
            }
          : null,
      },
      phase2_elo: {
        rating_system: "Elo K=30, initial=1500, home_adv=60",
        top_10: rankings.slice(0, 10),
        bottom_10: rankings.slice(-10),
        match_count_distribution: {
          min: Math.min(...rankings.map((r) => r.matchCount)),
          max: Math.max(...rankings.map((r) => r.matchCount)),
          avg: parseFloat(
            (rankings.reduce((s, r) => s + r.matchCount, 0) / rankings.length).toFixed(1),
          ),
        },
      },
      phase3_ratings: {
        rows_upserted: ratingsUpserted,
        rating_version: "wc2026_v1",
        confidence_distribution: {
          high: rankings.filter((r) => r.matchCount >= 20).length,
          medium: rankings.filter((r) => r.matchCount >= 10 && r.matchCount < 20).length,
          low: rankings.filter((r) => r.matchCount >= 5 && r.matchCount < 10).length,
          insufficient: rankings.filter((r) => r.matchCount < 5).length,
        },
      },
      phase4_predictions: {
        predictions_created: predictionsCreated,
        predictions_superseded: predictionsSuperseded,
        model_version: "wc2026_strength_v1",
        sample_predictions: samplePredictions,
      },
      errors: errors.slice(0, 20),
      log,
    };

    return new Response(JSON.stringify(report, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message, stack: (err as Error).stack }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
