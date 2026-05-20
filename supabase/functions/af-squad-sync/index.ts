import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Default team IDs — all teams in tracked leagues (2025-26 season)
// These are populated on demand; batch call to sync all teams in AF tracked leagues
const DEFAULT_TEAM_IDS: number[] = [];

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
    // Accepts: { team_id } for single team, { team_ids: [...] } for batch
    // Or no params to auto-derive from af_standings_normalized
    let teamIds: number[] = [];

    if (body.team_id) {
      teamIds = [Number(body.team_id)];
    } else if (Array.isArray(body.team_ids)) {
      teamIds = body.team_ids.map(Number);
    } else {
      // Derive from af_standings_normalized — all tracked teams
      const { data: standingTeams } = await supabase
        .from("af_standings_normalized")
        .select("af_team_id")
        .order("af_team_id");
      if (standingTeams && standingTeams.length > 0) {
        const seen = new Set<number>();
        for (const row of standingTeams) {
          seen.add(row.af_team_id);
        }
        teamIds = [...seen];
      }
    }

    if (teamIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "No team IDs to process. Pass team_id, team_ids, or ensure af_standings_normalized has data." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Cap to 20 teams per invocation
    teamIds = teamIds.slice(0, 20);

    let logId: string | null = null;
    {
      const { data } = await supabase
        .schema("model_lab")
        .from("enrichment_sync_log")
        .insert({ sync_type: "squads", status: "running", leagues_seen: teamIds.length })
        .select("id")
        .maybeSingle();
      logId = data?.id ?? null;
    }

    let rowsInserted = 0;
    let rowsUpdated = 0;
    const errors: string[] = [];
    const CURRENT_SEASON = 2025;

    for (const teamId of teamIds) {
      try {
        const url = `https://v3.football.api-sports.io/players/squads?team=${teamId}`;
        const resp = await fetch(url, { headers: { "x-apisports-key": AF_KEY } });
        if (!resp.ok) throw new Error(`AF HTTP ${resp.status} for team ${teamId}`);
        const json = await resp.json();
        const squadData: any[] = json?.response ?? [];

        const players: any[] = squadData?.[0]?.players ?? [];
        const teamName: string = squadData?.[0]?.team?.name ?? null;

        const hash = `squad_${teamId}_s${CURRENT_SEASON}_${players.length}`;

        // Upsert raw
        const { error: rawErr } = await supabase
          .from("af_player_squads_raw")
          .upsert({
            af_team_id: teamId,
            response_hash: hash,
            response_json: json,
            http_status: resp.status,
            players_count: players.length,
            fetched_at: new Date().toISOString(),
            transform_status: "pending",
          }, { onConflict: "response_hash" });

        if (rawErr) {
          errors.push(`squad_raw team ${teamId}: ${rawErr.message}`);
          continue;
        }

        // Normalize each player
        for (const player of players) {
          try {
            const afPlayerId: number = player.id;

            const payload = {
              af_team_id: teamId,
              team_name: teamName,
              af_player_id: afPlayerId,
              player_name: player.name ?? null,
              player_age: player.age ?? null,
              player_number: player.number ?? null,
              player_position: player.position ?? null,
              player_photo: player.photo ?? null,
              is_captain: player.captain ?? false,
              last_seen_season: CURRENT_SEASON,
              raw_payload: player,
              synced_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };

            const { data: existing } = await supabase
              .from("af_player_squads_normalized")
              .select("id, first_seen_season, seasons_count")
              .eq("af_team_id", teamId)
              .eq("af_player_id", afPlayerId)
              .maybeSingle();

            if (existing) {
              await supabase
                .from("af_player_squads_normalized")
                .update({
                  ...payload,
                  first_seen_season: existing.first_seen_season ?? CURRENT_SEASON,
                  seasons_count: existing.seasons_count ?? 1,
                })
                .eq("af_team_id", teamId)
                .eq("af_player_id", afPlayerId);
              rowsUpdated++;
            } else {
              await supabase.from("af_player_squads_normalized").insert({
                ...payload,
                first_seen_season: CURRENT_SEASON,
                seasons_count: 1,
              });
              rowsInserted++;
            }
          } catch (playerErr: unknown) {
            const msg = playerErr instanceof Error ? playerErr.message : String(playerErr);
            errors.push(`squad_norm player ${player?.id} team ${teamId}: ${msg}`);
          }
        }

        // Mark raw as transformed
        await supabase
          .from("af_player_squads_raw")
          .update({ transform_status: "transformed" })
          .eq("response_hash", hash);

        // Update provider health
        await supabase
          .from("af_provider_feeds")
          .update({ last_success_at: new Date().toISOString() })
          .eq("feed_key", "af_squads");

      } catch (teamErr: unknown) {
        const msg = teamErr instanceof Error ? teamErr.message : String(teamErr);
        errors.push(`team ${teamId}: ${msg}`);
      }

      // Rate limit safety — 300ms between teams
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
          leagues_seen: teamIds.length,
          rows_inserted: rowsInserted,
          rows_updated: rowsUpdated,
          errors_json: errors.slice(0, 20).map((e) => e.slice(0, 200)),
          duration_ms: durationMs,
        })
        .eq("id", logId);
    }

    return new Response(JSON.stringify({
      sync_type: "squads",
      teams_processed: teamIds.length,
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
