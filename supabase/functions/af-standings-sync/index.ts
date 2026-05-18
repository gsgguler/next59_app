import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// AF league ID → competition_season_id (2025-2026)
const LEAGUE_SEASONS: Record<number, { cs_id: string; af_season: number }> = {
  39:  { cs_id: "f0f5f43c-55c4-44a1-9ca6-dbed10460097", af_season: 2025 }, // Premier League
  61:  { cs_id: "96b68baf-5368-43ed-93d4-05720a45a843", af_season: 2025 }, // Ligue 1
  78:  { cs_id: "dff96a19-a77a-42ae-bf04-bae1098e8411", af_season: 2025 }, // Bundesliga
  88:  { cs_id: "09af551c-9bae-48ed-aa01-28a328f0d5cb", af_season: 2025 }, // Eredivisie
  135: { cs_id: "160eb576-5b10-4803-be2c-e92eeb4afd82", af_season: 2025 }, // Serie A
  140: { cs_id: "60b9c7ec-ae43-4986-98e8-77ac6de3c3f2", af_season: 2025 }, // La Liga
  203: { cs_id: "fb898419-630e-439c-a709-003b9ac3bb34", af_season: 2025 }, // Süper Lig
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

    const leagueIds = leagueFilter
      ? [leagueFilter].filter((id) => LEAGUE_SEASONS[id])
      : Object.keys(LEAGUE_SEASONS).map(Number);

    let logId: string | null = null;
    {
      const { data } = await supabase
        .schema("model_lab")
        .from("enrichment_sync_log")
        .insert({
          sync_type: "standings",
          status: "running",
          leagues_seen: leagueIds.length,
        })
        .select("id")
        .maybeSingle();
      logId = data?.id ?? null;
    }

    let rowsInserted = 0;
    let rowsUpdated = 0;
    const errors: string[] = [];

    for (const leagueId of leagueIds) {
      const { af_season } = LEAGUE_SEASONS[leagueId];
      try {
        const url = `https://v3.football.api-sports.io/standings?league=${leagueId}&season=${af_season}`;
        const resp = await fetch(url, { headers: { "x-apisports-key": AF_KEY } });
        if (!resp.ok) throw new Error(`AF HTTP ${resp.status} for league ${leagueId}`);
        const json = await resp.json();

        // Compute response hash for dedup
        const hash = `standings_${leagueId}_${af_season}_${JSON.stringify(json?.response ?? []).length}`;

        // Store raw
        const { error: rawErr } = await supabase
          .from("af_standings_raw")
          .upsert({
            af_league_id: leagueId,
            af_season,
            response_hash: hash,
            response_json: json,
            http_status: resp.status,
            fetched_at: new Date().toISOString(),
            transform_status: "pending",
          }, { onConflict: "response_hash" });

        if (rawErr) {
          errors.push(`standings_raw league ${leagueId}: ${rawErr.message}`);
          continue;
        }

        // Normalize — standings response structure:
        // json.response[0].league.standings[0] = array of team rows
        const standings = json?.response?.[0]?.league?.standings?.[0] ?? [];
        for (const row of standings) {
          try {
            const teamId: number = row.team.id;
            const payload = {
              af_league_id: leagueId,
              af_season,
              af_team_id: teamId,
              team_name: row.team.name ?? null,
              team_logo: row.team.logo ?? null,
              league_name: json?.response?.[0]?.league?.name ?? null,
              rank: row.rank ?? null,
              group_name: row.group ?? null,
              points: row.points ?? 0,
              played: row.all?.played ?? 0,
              wins: row.all?.win ?? 0,
              draws: row.all?.draw ?? 0,
              losses: row.all?.lose ?? 0,
              goals_for: row.all?.goals?.for ?? 0,
              goals_against: row.all?.goals?.against ?? 0,
              goal_difference: row.goalsDiff ?? 0,
              form_string: row.form ?? null,
              home_played: row.home?.played ?? 0,
              home_wins: row.home?.win ?? 0,
              home_draws: row.home?.draw ?? 0,
              home_losses: row.home?.lose ?? 0,
              home_goals_for: row.home?.goals?.for ?? 0,
              home_goals_against: row.home?.goals?.against ?? 0,
              away_played: row.away?.played ?? 0,
              away_wins: row.away?.win ?? 0,
              away_draws: row.away?.draw ?? 0,
              away_losses: row.away?.lose ?? 0,
              away_goals_for: row.away?.goals?.for ?? 0,
              away_goals_against: row.away?.goals?.against ?? 0,
              status: row.status ?? null,
              description: row.description ?? null,
              synced_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };

            const existing = await supabase
              .from("af_standings_normalized")
              .select("id")
              .eq("af_league_id", leagueId)
              .eq("af_season", af_season)
              .eq("af_team_id", teamId)
              .maybeSingle();

            if (existing.data) {
              await supabase
                .from("af_standings_normalized")
                .update(payload)
                .eq("af_league_id", leagueId)
                .eq("af_season", af_season)
                .eq("af_team_id", teamId);
              rowsUpdated++;
            } else {
              await supabase.from("af_standings_normalized").insert(payload);
              rowsInserted++;
            }
          } catch (rowErr: unknown) {
            const msg = rowErr instanceof Error ? rowErr.message : String(rowErr);
            errors.push(`standings_norm team ${row?.team?.id} league ${leagueId}: ${msg}`);
          }
        }

        // Mark raw as transformed
        await supabase
          .from("af_standings_raw")
          .update({ transform_status: "transformed" })
          .eq("response_hash", hash);

      } catch (leagueErr: unknown) {
        const msg = leagueErr instanceof Error ? leagueErr.message : String(leagueErr);
        errors.push(`league ${leagueId}: ${msg}`);
      }

      // Rate limit safety
      await new Promise((r) => setTimeout(r, 300));
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
          rows_inserted: rowsInserted,
          rows_updated: rowsUpdated,
          errors_json: errors.slice(0, 20).map((e) => e.slice(0, 200)),
          duration_ms: durationMs,
        })
        .eq("id", logId);
    }

    return new Response(JSON.stringify({
      sync_type: "standings",
      leagues_processed: leagueIds.length,
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
