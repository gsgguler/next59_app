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
    // Prefer fixture-scoped fetch when fixture_ids provided; fall back to league+season
    const fixtureIds: number[] = body.fixture_ids ?? [];
    const leagueFilter: number | null = body.league_id ?? null;

    let logId: string | null = null;
    {
      const { data } = await supabase
        .schema("model_lab")
        .from("enrichment_sync_log")
        .insert({ sync_type: "injuries", status: "running" })
        .select("id")
        .maybeSingle();
      logId = data?.id ?? null;
    }

    let rowsInserted = 0;
    let rowsUpdated = 0;
    const errors: string[] = [];

    // Build fetch list — prefer fixture-scoped if available
    type FetchTarget =
      | { type: "fixture"; fixtureId: number }
      | { type: "league"; leagueId: number; afSeason: number };

    const targets: FetchTarget[] = fixtureIds.length > 0
      ? fixtureIds.map((id) => ({ type: "fixture" as const, fixtureId: id }))
      : (leagueFilter
          ? [{ type: "league" as const, leagueId: leagueFilter, afSeason: LEAGUE_SEASONS[leagueFilter]?.af_season ?? 2025 }]
          : Object.entries(LEAGUE_SEASONS).map(([id, val]) => ({
              type: "league" as const,
              leagueId: Number(id),
              afSeason: val.af_season,
            }))
        );

    for (const target of targets) {
      try {
        let url: string;
        let rawLeagueId: number | null = null;
        let rawSeason: number | null = null;
        let rawFixtureId: number | null = null;

        if (target.type === "fixture") {
          url = `https://v3.football.api-sports.io/injuries?fixture=${target.fixtureId}`;
          rawFixtureId = target.fixtureId;
        } else {
          url = `https://v3.football.api-sports.io/injuries?league=${target.leagueId}&season=${target.afSeason}`;
          rawLeagueId = target.leagueId;
          rawSeason = target.afSeason;
        }

        const resp = await fetch(url, { headers: { "x-apisports-key": AF_KEY } });
        if (!resp.ok) throw new Error(`AF HTTP ${resp.status}`);
        const json = await resp.json();
        const players: any[] = json?.response ?? [];

        // Deduplicate raw by hash
        const hashKey = target.type === "fixture"
          ? `injuries_fix${target.fixtureId}_${players.length}`
          : `injuries_l${target.leagueId}_s${target.afSeason}_${players.length}`;

        const { error: rawErr } = await supabase
          .from("af_injuries_raw")
          .upsert({
            af_league_id: rawLeagueId,
            af_season: rawSeason,
            af_fixture_id: rawFixtureId,
            response_hash: hashKey,
            request_params: { url },
            response_json: json,
            http_status: resp.status,
            players_count: players.length,
            fetched_at: new Date().toISOString(),
            transform_status: "pending",
          }, { onConflict: "response_hash" });

        if (rawErr) {
          errors.push(`injuries_raw: ${rawErr.message}`);
          continue;
        }

        // Normalize
        for (const entry of players) {
          try {
            const player = entry.player ?? {};
            const team = entry.team ?? {};
            const fix = entry.fixture ?? {};
            const leagueObj = entry.league ?? {};

            const afTeamId: number | null = team.id ?? null;
            const afPlayerId: number | null = player.id ?? null;
            const afFixtureIdNorm: number | null = rawFixtureId ?? fix.id ?? null;
            const afLeagueIdNorm: number | null = rawLeagueId ?? leagueObj.id ?? null;
            const afSeasonNorm: number | null = rawSeason ?? leagueObj.season ?? null;

            const rowPayload = {
              af_league_id: afLeagueIdNorm,
              af_season: afSeasonNorm,
              af_fixture_id: afFixtureIdNorm,
              af_team_id: afTeamId,
              team_name: team.name ?? null,
              af_player_id: afPlayerId,
              player_name: player.name ?? null,
              player_photo: player.photo ?? null,
              player_type: player.type ?? null,
              player_reason: player.reason ?? null,
              player_age: player.age ?? null,
              player_position: player.position ?? null,
              raw_payload: entry,
              fetched_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };

            if (afFixtureIdNorm && afTeamId && afPlayerId) {
              // Fixture-scoped upsert
              const { data: ex } = await supabase
                .from("af_injuries_normalized")
                .select("id")
                .eq("af_fixture_id", afFixtureIdNorm)
                .eq("af_team_id", afTeamId)
                .eq("af_player_id", afPlayerId)
                .maybeSingle();
              if (ex) {
                await supabase.from("af_injuries_normalized").update(rowPayload)
                  .eq("af_fixture_id", afFixtureIdNorm)
                  .eq("af_team_id", afTeamId)
                  .eq("af_player_id", afPlayerId);
                rowsUpdated++;
              } else {
                await supabase.from("af_injuries_normalized").insert(rowPayload);
                rowsInserted++;
              }
            } else if (afLeagueIdNorm && afSeasonNorm && afTeamId && afPlayerId) {
              // League-scoped upsert
              const { data: ex } = await supabase
                .from("af_injuries_normalized")
                .select("id")
                .eq("af_league_id", afLeagueIdNorm)
                .eq("af_season", afSeasonNorm)
                .eq("af_team_id", afTeamId)
                .eq("af_player_id", afPlayerId)
                .is("af_fixture_id", null)
                .maybeSingle();
              if (ex) {
                await supabase.from("af_injuries_normalized").update(rowPayload)
                  .eq("id", ex.id);
                rowsUpdated++;
              } else {
                await supabase.from("af_injuries_normalized").insert(rowPayload);
                rowsInserted++;
              }
            }
          } catch (rowErr: unknown) {
            const msg = rowErr instanceof Error ? rowErr.message : String(rowErr);
            errors.push(`injury_norm player ${entry?.player?.id}: ${msg}`);
          }
        }

        await supabase
          .from("af_injuries_raw")
          .update({ transform_status: "transformed" })
          .eq("response_hash", hashKey);

      } catch (targetErr: unknown) {
        const msg = targetErr instanceof Error ? targetErr.message : String(targetErr);
        errors.push(`target error: ${msg}`);
      }

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
          leagues_seen: targets.length,
          rows_inserted: rowsInserted,
          rows_updated: rowsUpdated,
          errors_json: errors.slice(0, 20).map((e) => e.slice(0, 200)),
          duration_ms: durationMs,
        })
        .eq("id", logId);
    }

    return new Response(JSON.stringify({
      sync_type: "injuries",
      targets_processed: targets.length,
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
