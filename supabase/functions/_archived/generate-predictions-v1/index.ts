import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface TeamFeatures {
  total_historical_matches: number;
  last5: {
    matches_used: number;
    avg_points: number;
    avg_goals_for: number;
    avg_goals_against: number;
    clean_sheet_rate: number;
  };
  home_form: {
    matches_used: number;
    avg_points: number;
    avg_goals_for: number;
    avg_goals_against: number;
  };
  away_form: {
    matches_used: number;
    avg_points: number;
    avg_goals_for: number;
    avg_goals_against: number;
  };
}

interface H2HFeatures {
  meetings: number;
  home_wins: number;
  draws: number;
  away_wins: number;
  avg_total_goals: number;
}

interface MatchData {
  id: string;
  home_team_id: string;
  away_team_id: string;
  kickoff_at: string;
  matchweek: number | null;
  is_neutral_venue: boolean;
  competition_season_id: string;
  round_name: string | null;
  home_team: { name: string } | null;
  away_team: { name: string } | null;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function normalize1x2(home: number, draw: number, away: number): [number, number, number] {
  const total = home + draw + away;
  if (total <= 0) return [0.333, 0.334, 0.333];
  return [home / total, draw / total, away / total];
}

function computeConfidence(
  homeFeatures: TeamFeatures,
  awayFeatures: TeamFeatures,
  isNeutralVenue: boolean,
  matchweek: number | null,
): number {
  const homeMatches = homeFeatures.total_historical_matches;
  const awayMatches = awayFeatures.total_historical_matches;
  const minMatches = Math.min(homeMatches, awayMatches);

  let conf: number;
  if (minMatches >= 10) conf = 1.0;
  else if (minMatches >= 5) conf = 0.8;
  else if (minMatches >= 2) conf = 0.6;
  else conf = 0.4;

  if (isNeutralVenue) conf -= 0.10;
  if (matchweek !== null && matchweek < 5) conf -= 0.10;

  return clamp(parseFloat(conf.toFixed(2)), 0.10, 1.00);
}

function computeConfidenceLabel(score: number): string {
  if (score >= 0.85) return "very_high";
  if (score >= 0.65) return "high";
  if (score >= 0.45) return "medium";
  return "low";
}

function generateCassandraCode(
  homeName: string,
  awayName: string,
  matchweek: number | null,
  matchId: string,
): string {
  const h = homeName.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, "X");
  const a = awayName.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, "X");
  const mw = matchweek !== null ? `MW${matchweek}` : "GS";
  const suffix = matchId.substring(0, 4);
  return `MVP-${h}-${a}-${mw}-${suffix}`;
}

function generateStatement(
  homeName: string,
  awayName: string,
  predictions: {
    home_prob: number;
    draw_prob: number;
    away_prob: number;
    over25_prob: number;
    btts_prob: number;
  },
): string {
  const { home_prob, draw_prob, away_prob, over25_prob, btts_prob } = predictions;

  let outcome: string;
  if (home_prob > draw_prob && home_prob > away_prob) {
    outcome = `${homeName} are slight favorites`;
    if (home_prob > 0.45) outcome = `${homeName} are clear favorites`;
  } else if (away_prob > draw_prob && away_prob > home_prob) {
    outcome = `${awayName} are slight favorites`;
    if (away_prob > 0.45) outcome = `${awayName} are clear favorites`;
  } else {
    outcome = "An evenly matched contest expected";
  }

  const goalExpectation = over25_prob > 0.55
    ? "with goals expected"
    : over25_prob < 0.40
      ? "in a likely low-scoring affair"
      : "with moderate goal expectation";

  const bttsNote = btts_prob > 0.55 ? " Both teams likely to find the net." : "";

  return `${outcome} ${goalExpectation}.${bttsNote}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = getSupabase();
    const log: string[] = [];
    const errors: string[] = [];
    const teamsLackingData: string[] = [];

    // Load all WC 2026 group-stage matches
    const { data: wcMatches, error: matchErr } = await supabase
      .from("matches")
      .select(`
        id, home_team_id, away_team_id, kickoff_at, matchweek,
        is_neutral_venue, competition_season_id, round_name,
        home_team:teams!matches_home_team_id_fkey(name),
        away_team:teams!matches_away_team_id_fkey(name)
      `)
      .eq("status", "scheduled")
      .in("competition_season_id", [
        // WC 2026 season
        (await supabase
          .from("competition_seasons")
          .select("id")
          .eq("season_code", "2026")
          .maybeSingle()
        ).data?.id,
      ])
      .order("kickoff_at");

    if (matchErr || !wcMatches) {
      throw new Error(`Failed to load WC 2026 matches: ${matchErr?.message}`);
    }

    log.push(`WC 2026 matches loaded: ${wcMatches.length}`);

    if (wcMatches.length === 0) {
      throw new Error("No WC 2026 scheduled matches found");
    }

    const competitionSeasonId = wcMatches[0].competition_season_id;

    // Get league average goals (will be 0 for WC since no finished matches)
    const { data: leagueAvgData } = await supabase.rpc("compute_league_avg_goals", {
      p_competition_season_id: competitionSeasonId,
    });
    const leagueAvgGoals = parseFloat(leagueAvgData) || 2.5;
    log.push(`League avg goals: ${leagueAvgGoals} (default 2.5 for no-history tournament)`);

    // Track which predictions already exist for idempotency
    const existingMatchIds = new Set<string>();
    const { data: existingPreds } = await supabase
      .from("predictions")
      .select("id, match_id, version")
      .eq("model_version", "mvp_v1")
      .eq("is_current", true);

    if (existingPreds) {
      for (const p of existingPreds) {
        existingMatchIds.add(p.match_id);
      }
    }
    log.push(`Existing mvp_v1 predictions: ${existingMatchIds.size}`);

    let predictionsCreated = 0;
    let predictionsSuperseded = 0;
    const samplePredictions: unknown[] = [];

    for (const match of wcMatches as MatchData[]) {
      const homeName = (match.home_team as unknown as { name: string })?.name ?? "Home";
      const awayName = (match.away_team as unknown as { name: string })?.name ?? "Away";

      // Compute features using SQL functions
      const [homeFeatsResult, awayFeatsResult, h2hResult] = await Promise.all([
        supabase.rpc("compute_team_features", {
          p_team_id: match.home_team_id,
          p_before: match.kickoff_at,
        }),
        supabase.rpc("compute_team_features", {
          p_team_id: match.away_team_id,
          p_before: match.kickoff_at,
        }),
        supabase.rpc("compute_h2h_features", {
          p_home_team_id: match.home_team_id,
          p_away_team_id: match.away_team_id,
          p_before: match.kickoff_at,
        }),
      ]);

      const homeFeats: TeamFeatures = homeFeatsResult.data ?? {
        total_historical_matches: 0,
        last5: { matches_used: 0, avg_points: 0, avg_goals_for: 0, avg_goals_against: 0, clean_sheet_rate: 0 },
        home_form: { matches_used: 0, avg_points: 0, avg_goals_for: 0, avg_goals_against: 0 },
        away_form: { matches_used: 0, avg_points: 0, avg_goals_for: 0, avg_goals_against: 0 },
      };

      const awayFeats: TeamFeatures = awayFeatsResult.data ?? {
        total_historical_matches: 0,
        last5: { matches_used: 0, avg_points: 0, avg_goals_for: 0, avg_goals_against: 0, clean_sheet_rate: 0 },
        home_form: { matches_used: 0, avg_points: 0, avg_goals_for: 0, avg_goals_against: 0 },
        away_form: { matches_used: 0, avg_points: 0, avg_goals_for: 0, avg_goals_against: 0 },
      };

      const h2h: H2HFeatures = h2hResult.data ?? {
        meetings: 0, home_wins: 0, draws: 0, away_wins: 0, avg_total_goals: 0,
      };

      // Track teams with no data
      if (homeFeats.total_historical_matches === 0 && !teamsLackingData.includes(homeName)) {
        teamsLackingData.push(homeName);
      }
      if (awayFeats.total_historical_matches === 0 && !teamsLackingData.includes(awayName)) {
        teamsLackingData.push(awayName);
      }

      // ═══════════════════════════
      // HEURISTIC 1X2 CALCULATION
      // ═══════════════════════════
      let rawHome = 0.33;
      let rawDraw = 0.33;
      let rawAway = 0.33;

      // Form delta
      const homeFormPts = homeFeats.last5.avg_points;
      const awayFormPts = awayFeats.last5.avg_points;
      const formDelta = (homeFormPts - awayFormPts) * 0.05;
      rawHome += formDelta;
      rawAway -= formDelta;

      // Home advantage
      const homeHomePts = homeFeats.home_form.avg_points;
      const awayAwayPts = awayFeats.away_form.avg_points;
      const homeAdvDelta = (homeHomePts - awayAwayPts) * 0.03;
      rawHome += homeAdvDelta;
      rawAway -= homeAdvDelta;

      // H2H delta
      const h2hDelta = (h2h.home_wins - h2h.away_wins) * 0.02;
      rawHome += h2hDelta;
      rawAway -= h2hDelta;

      // Neutral venue penalty
      if (match.is_neutral_venue) {
        rawHome -= 0.05;
        rawAway += 0.025;
        rawDraw += 0.025;
      }

      // Normalize
      rawHome = Math.max(rawHome, 0.05);
      rawDraw = Math.max(rawDraw, 0.05);
      rawAway = Math.max(rawAway, 0.05);
      const [homeProb, drawProb, awayProb] = normalize1x2(rawHome, rawDraw, rawAway);

      // ═══════════════════════════
      // OVER 2.5 CALCULATION
      // ═══════════════════════════
      let over25Base = leagueAvgGoals / 3.0;
      const avgGoalsFor = (homeFeats.last5.avg_goals_for + awayFeats.last5.avg_goals_for) / 2;
      const avgGoalsAgainst = (homeFeats.last5.avg_goals_against + awayFeats.last5.avg_goals_against) / 2;
      if (homeFeats.total_historical_matches > 0 || awayFeats.total_historical_matches > 0) {
        over25Base += (avgGoalsFor - 1.0) * 0.10;
        over25Base += (avgGoalsAgainst - 1.0) * 0.05;
      }
      const over25Prob = clamp(parseFloat(over25Base.toFixed(3)), 0.15, 0.85);

      // ═══════════════════════════
      // BTTS CALCULATION
      // ═══════════════════════════
      let bttsBase = 0.45;
      if (homeFeats.total_historical_matches > 0) {
        const homeScoringRate = homeFeats.last5.avg_goals_for;
        const homeConcedingRate = homeFeats.last5.avg_goals_against;
        bttsBase += (homeScoringRate - 1.0) * 0.05;
        bttsBase += (homeConcedingRate - 1.0) * 0.05;
      }
      if (awayFeats.total_historical_matches > 0) {
        const awayScoringRate = awayFeats.last5.avg_goals_for;
        const awayConcedingRate = awayFeats.last5.avg_goals_against;
        bttsBase += (awayScoringRate - 1.0) * 0.05;
        bttsBase += (awayConcedingRate - 1.0) * 0.05;
      }
      const bttsProb = clamp(parseFloat(bttsBase.toFixed(3)), 0.20, 0.80);

      // ═══════════════════════════
      // CONFIDENCE SCORE
      // ═══════════════════════════
      const confidenceScore = computeConfidence(
        homeFeats, awayFeats, match.is_neutral_venue, match.matchweek,
      );
      const confidenceLabel = computeConfidenceLabel(confidenceScore);

      // ═══════════════════════════
      // DATA QUALITY PENALTY
      // ═══════════════════════════
      let dataQualityPenalty = 0;
      const missingDataFlags: string[] = [];
      if (homeFeats.total_historical_matches === 0) {
        dataQualityPenalty += 0.3;
        missingDataFlags.push("home_team_no_history");
      }
      if (awayFeats.total_historical_matches === 0) {
        dataQualityPenalty += 0.3;
        missingDataFlags.push("away_team_no_history");
      }
      if (h2h.meetings === 0) {
        dataQualityPenalty += 0.1;
        missingDataFlags.push("no_h2h_data");
      }
      dataQualityPenalty = clamp(dataQualityPenalty, 0, 1);

      // Build prediction outputs
      const modelOutputRaw = {
        "1x2_home": parseFloat(homeProb.toFixed(3)),
        "1x2_draw": parseFloat(drawProb.toFixed(3)),
        "1x2_away": parseFloat(awayProb.toFixed(3)),
        "over_2_5": over25Prob,
        "btts_yes": bttsProb,
      };

      const featureSnapshot = {
        home_team: homeName,
        away_team: awayName,
        home_features: homeFeats,
        away_features: awayFeats,
        h2h: h2h,
        league_avg_goals: leagueAvgGoals,
        is_neutral_venue: match.is_neutral_venue,
        matchweek: match.matchweek,
      };

      // Headline probability = max of 1X2
      const headlineProb = Math.max(homeProb, drawProb, awayProb);

      const statement = generateStatement(homeName, awayName, {
        home_prob: homeProb,
        draw_prob: drawProb,
        away_prob: awayProb,
        over25_prob: over25Prob,
        btts_prob: bttsProb,
      });

      const cassandraCode = generateCassandraCode(
        homeName, awayName, match.matchweek, match.id,
      );

      const contentForHash = JSON.stringify({
        match_id: match.id,
        model_version: "mvp_v1",
        predictions: modelOutputRaw,
      });
      const contentHash = await sha256(contentForHash);

      // Idempotency: supersede existing prediction if any
      if (existingMatchIds.has(match.id)) {
        const { data: oldPred } = await supabase
          .from("predictions")
          .select("id, version")
          .eq("match_id", match.id)
          .eq("model_version", "mvp_v1")
          .eq("is_current", true)
          .maybeSingle();

        if (oldPred) {
          // Insert new version first
          const newVersion = oldPred.version + 1;
          const { data: newPred, error: insertErr } = await supabase
            .from("predictions")
            .insert({
              match_id: match.id,
              version: newVersion,
              is_current: true,
              supersedes: oldPred.id,
              cassandra_code: `${cassandraCode}-v${newVersion}`,
              statement,
              probability: parseFloat(headlineProb.toFixed(3)),
              confidence_label: confidenceLabel,
              category: "pre_match",
              model_version: "mvp_v1",
              model_input_features: featureSnapshot,
              model_output_raw: modelOutputRaw,
              content_hash: contentHash,
              hash_algorithm: "sha-256",
              hash_input_fields: ["match_id", "model_version", "predictions"],
              access_level: "free",
              data_quality_penalty: dataQualityPenalty,
              missing_data_flags: missingDataFlags,
              generation_source: "ensemble_model",
              generated_by_function: "generate-predictions-v1",
            })
            .select("id")
            .single();

          if (insertErr) {
            errors.push(`Supersede ${match.id}: ${insertErr.message}`);
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
            .eq("id", oldPred.id);

          predictionsSuperseded++;
          predictionsCreated++;
          continue;
        }
      }

      // Insert new prediction (version 1)
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
          confidence_label: confidenceLabel,
          category: "pre_match",
          model_version: "mvp_v1",
          model_input_features: featureSnapshot,
          model_output_raw: modelOutputRaw,
          content_hash: contentHash,
          hash_algorithm: "sha-256",
          hash_input_fields: ["match_id", "model_version", "predictions"],
          access_level: "free",
          data_quality_penalty: dataQualityPenalty,
          missing_data_flags: missingDataFlags,
          generation_source: "ensemble_model",
          generated_by_function: "generate-predictions-v1",
        });

      if (insertErr) {
        errors.push(`Insert ${match.id} (${homeName} vs ${awayName}): ${insertErr.message}`);
        continue;
      }

      predictionsCreated++;

      if (samplePredictions.length < 3) {
        samplePredictions.push({
          match: `${homeName} vs ${awayName}`,
          matchweek: match.matchweek,
          kickoff_at: match.kickoff_at,
          predictions: modelOutputRaw,
          confidence: confidenceScore,
          confidence_label: confidenceLabel,
          data_quality_penalty: dataQualityPenalty,
          missing_data_flags: missingDataFlags,
        });
      }
    }

    log.push(`Predictions created: ${predictionsCreated}`);
    log.push(`Predictions superseded: ${predictionsSuperseded}`);
    log.push(`Teams lacking historical data: ${teamsLackingData.length}`);

    const report = {
      status: errors.length > 0 ? "CONDITIONAL" : "GO",
      model_version: "mvp_v1",
      total_matches: wcMatches.length,
      predictions_created: predictionsCreated,
      predictions_superseded: predictionsSuperseded,
      teams_lacking_data: teamsLackingData,
      teams_lacking_data_count: teamsLackingData.length,
      sample_predictions: samplePredictions,
      league_avg_goals: leagueAvgGoals,
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
