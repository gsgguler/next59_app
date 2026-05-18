import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const LEAGUE_SEASONS: Record<number, { af_season: number }> = {
  39:  { af_season: 2025 }, // Premier League
  61:  { af_season: 2025 }, // Ligue 1
  78:  { af_season: 2025 }, // Bundesliga
  88:  { af_season: 2025 }, // Eredivisie
  135: { af_season: 2025 }, // Serie A
  140: { af_season: 2025 }, // La Liga
  203: { af_season: 2025 }, // Süper Lig
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startedAt = new Date();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const AF_KEY = Deno.env.get("API_FOOTBALL_KEY");
    if (!AF_KEY) throw new Error("API_FOOTBALL_KEY not set");

    const body = await req.json().catch(() => ({}));
    const leagueFilter: number | null = body.league_id ?? null;
    // Optional: explicit team list; otherwise derives from standings table
    const teamIds: number[] | null = body.team_ids ?? null;
    // Max teams per call — throttle budget
    const maxTeams: number = Math.min(body.max_teams ?? 40, 80);

    let logId: string | null = null;
    {
      const { data } = await supabase
        .schema("model_lab")
        .from("enrichment_sync_log")
        .insert({ sync_type: "team_statistics", status: "running" })
        .select("id")
        .maybeSingle();
      logId = data?.id ?? null;
    }

    // Build list of (leagueId, afSeason, teamId) triples to fetch
    type FetchTarget = { leagueId: number; afSeason: number; teamId: number };
    const targets: FetchTarget[] = [];

    if (teamIds && leagueFilter && LEAGUE_SEASONS[leagueFilter]) {
      for (const tid of teamIds) {
        targets.push({ leagueId: leagueFilter, afSeason: LEAGUE_SEASONS[leagueFilter].af_season, teamId: tid });
      }
    } else {
      // Derive team list from af_standings_normalized
      const leaguesToQuery = leagueFilter
        ? [leagueFilter].filter((id) => LEAGUE_SEASONS[id])
        : Object.keys(LEAGUE_SEASONS).map(Number);

      for (const leagueId of leaguesToQuery) {
        const { af_season } = LEAGUE_SEASONS[leagueId];
        const { data: rows } = await supabase
          .from("af_standings_normalized")
          .select("af_team_id")
          .eq("af_league_id", leagueId)
          .eq("af_season", af_season)
          .limit(30);

        if (rows && rows.length > 0) {
          for (const row of rows) {
            targets.push({ leagueId, afSeason: af_season, teamId: row.af_team_id });
          }
        }
      }
    }

    // Cap to budget
    const cappedTargets = targets.slice(0, maxTeams);

    let rowsInserted = 0;
    let rowsUpdated = 0;
    const errors: string[] = [];

    for (const { leagueId, afSeason, teamId } of cappedTargets) {
      try {
        const url = `https://v3.football.api-sports.io/teams/statistics?league=${leagueId}&season=${afSeason}&team=${teamId}`;
        const resp = await fetch(url, { headers: { "x-apisports-key": AF_KEY } });
        if (!resp.ok) throw new Error(`AF HTTP ${resp.status}`);
        const json = await resp.json();
        const stats = json?.response ?? null;

        if (!stats) {
          errors.push(`team_stats no response: league ${leagueId} team ${teamId}`);
          continue;
        }

        // Upsert raw
        const { error: rawErr } = await supabase
          .from("af_team_statistics_raw")
          .upsert({
            af_league_id: leagueId,
            af_season: afSeason,
            af_team_id: teamId,
            request_params: { league: leagueId, season: afSeason, team: teamId },
            response_json: json,
            http_status: resp.status,
            fetched_at: new Date().toISOString(),
            transform_status: "pending",
          }, { onConflict: "af_league_id,af_season,af_team_id" });

        if (rawErr) {
          errors.push(`team_stats_raw league ${leagueId} team ${teamId}: ${rawErr.message}`);
          continue;
        }

        // Normalize
        const fixtures = stats.fixtures ?? {};
        const goals = stats.goals ?? {};
        const cleanSheet = stats.clean_sheet ?? {};
        const failedToScore = stats.failed_to_score ?? {};
        const biggestWins = stats.biggest?.wins ?? {};
        const biggestLosses = stats.biggest?.loses ?? {};
        const streaks = stats.biggest?.streak ?? {};
        const penalty = stats.penalty ?? {};

        const totalPlayed = (fixtures.played?.home ?? 0) + (fixtures.played?.away ?? 0);
        const totalGoalsFor = (goals.for?.total?.home ?? 0) + (goals.for?.total?.away ?? 0);
        const totalGoalsAgainst = (goals.against?.total?.home ?? 0) + (goals.against?.total?.away ?? 0);
        const totalCS = (cleanSheet.home ?? 0) + (cleanSheet.away ?? 0);
        const totalFTS = (failedToScore.home ?? 0) + (failedToScore.away ?? 0);

        const payload = {
          af_league_id: leagueId,
          af_season: afSeason,
          af_team_id: teamId,
          team_name: stats.team?.name ?? null,
          league_name: stats.league?.name ?? null,
          total_played: totalPlayed,
          home_played: fixtures.played?.home ?? 0,
          away_played: fixtures.played?.away ?? 0,
          goals_for_total: totalGoalsFor,
          goals_for_avg: totalPlayed > 0 ? parseFloat((totalGoalsFor / totalPlayed).toFixed(2)) : 0,
          goals_for_home_avg: (fixtures.played?.home ?? 0) > 0
            ? parseFloat(((goals.for?.total?.home ?? 0) / (fixtures.played?.home ?? 1)).toFixed(2)) : 0,
          goals_for_away_avg: (fixtures.played?.away ?? 0) > 0
            ? parseFloat(((goals.for?.total?.away ?? 0) / (fixtures.played?.away ?? 1)).toFixed(2)) : 0,
          goals_against_total: totalGoalsAgainst,
          goals_against_avg: totalPlayed > 0 ? parseFloat((totalGoalsAgainst / totalPlayed).toFixed(2)) : 0,
          goals_against_home_avg: (fixtures.played?.home ?? 0) > 0
            ? parseFloat(((goals.against?.total?.home ?? 0) / (fixtures.played?.home ?? 1)).toFixed(2)) : 0,
          goals_against_away_avg: (fixtures.played?.away ?? 0) > 0
            ? parseFloat(((goals.against?.total?.away ?? 0) / (fixtures.played?.away ?? 1)).toFixed(2)) : 0,
          clean_sheet_total: totalCS,
          clean_sheet_home: cleanSheet.home ?? 0,
          clean_sheet_away: cleanSheet.away ?? 0,
          clean_sheet_rate: totalPlayed > 0 ? parseFloat((totalCS / totalPlayed).toFixed(3)) : 0,
          failed_to_score_total: totalFTS,
          failed_to_score_home: failedToScore.home ?? 0,
          failed_to_score_away: failedToScore.away ?? 0,
          failed_to_score_rate: totalPlayed > 0 ? parseFloat((totalFTS / totalPlayed).toFixed(3)) : 0,
          form_string: stats.form ?? null,
          biggest_win_home: biggestWins.home ?? null,
          biggest_win_away: biggestWins.away ?? null,
          biggest_loss_home: biggestLosses.home ?? null,
          biggest_loss_away: biggestLosses.away ?? null,
          current_win_streak: streaks.wins ?? 0,
          current_draw_streak: streaks.draws ?? 0,
          current_loss_streak: streaks.loses ?? 0,
          penalty_scored_total: penalty.scored?.total ?? 0,
          penalty_missed_total: penalty.missed?.total ?? 0,
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { data: ex } = await supabase
          .from("af_team_statistics_normalized")
          .select("id")
          .eq("af_league_id", leagueId)
          .eq("af_season", afSeason)
          .eq("af_team_id", teamId)
          .maybeSingle();

        if (ex) {
          await supabase.from("af_team_statistics_normalized").update(payload)
            .eq("af_league_id", leagueId)
            .eq("af_season", afSeason)
            .eq("af_team_id", teamId);
          rowsUpdated++;
        } else {
          await supabase.from("af_team_statistics_normalized").insert(payload);
          rowsInserted++;
        }

        await supabase
          .from("af_team_statistics_raw")
          .update({ transform_status: "transformed" })
          .eq("af_league_id", leagueId)
          .eq("af_season", afSeason)
          .eq("af_team_id", teamId);

      } catch (teamErr: unknown) {
        const msg = teamErr instanceof Error ? teamErr.message : String(teamErr);
        errors.push(`league ${leagueId} team ${teamId}: ${msg}`);
      }

      await new Promise((r) => setTimeout(r, 350));
    }

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    if (logId) {
      await supabase
        .schema("model_lab")
        .from("enrichment_sync_log")
        .update({
          completed_at: completedAt.toISOString(),
          status: errors.length > 0 && rowsInserted === 0 && rowsUpdated === 0 ? "failed" : "completed",
          leagues_seen: cappedTargets.length,
          rows_inserted: rowsInserted,
          rows_updated: rowsUpdated,
          errors_json: errors.slice(0, 20).map((e) => e.slice(0, 200)),
          duration_ms: durationMs,
        })
        .eq("id", logId);
    }

    return new Response(JSON.stringify({
      sync_type: "team_statistics",
      teams_processed: cappedTargets.length,
      rows_inserted: rowsInserted,
      rows_updated: rowsUpdated,
      errors: errors.slice(0, 5),
      duration_ms: durationMs,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
