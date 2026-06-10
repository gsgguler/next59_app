import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const AF_BASE = "https://v3.football.api-sports.io";
const BUCKETS = [
  "0-5","5-10","10-15","15-20","20-25","25-30",
  "30-35","35-40","40-45","45-50","50-55","55-60",
  "60-65","65-70","70-75","75-80","80-85","85-90",
];

function minuteToBucket(minute: number): string {
  const idx = Math.min(Math.floor(minute / 5), 17);
  return BUCKETS[idx];
}

function emptyBucket() {
  return {
    goal_count: 0,
    assist_count: 0,
    shot_count: 0,
    shot_on_target_count: 0,
    foul_committed_count: 0,
    foul_drawn_count: 0,
    yellow_card_count: 0,
    red_card_count: 0,
    offside_count: 0,
    substitution_in_count: 0,
    substitution_out_count: 0,
    minutes_observed: 0,
    confidence: 0,
  };
}

function buildEmptyProfile() {
  const profile: Record<string, ReturnType<typeof emptyBucket>> = {};
  for (const b of BUCKETS) {
    profile[`bucket_${b.replace("-", "_")}`] = emptyBucket();
  }
  return profile;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const afKey = Deno.env.get("AF_API_KEY") ?? Deno.env.get("API_FOOTBALL_KEY") ?? Deno.env.get("APISPORTS_KEY") ?? "";

  let body: {
    fixture_id?: string;
    team_id?: string;
    provider?: string;
    max_players?: number;
    season_scope?: string;
    recent_match_limit?: number;
    include_club?: boolean;
    include_national?: boolean;
    mode?: "sync" | "build_profiles" | "audit";
  } = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    // no-op
  }

  const mode = body.mode ?? "audit";
  const recentMatchLimit = body.recent_match_limit ?? 20;
  const maxPlayers = body.max_players ?? 50;

  const result = {
    provider: body.provider ?? "api_football",
    players_checked: 0,
    match_logs_inserted: 0,
    profiles_built: 0,
    fields_missing: [] as string[],
    blocker: null as string | null,
  };

  async function afFetch(path: string): Promise<unknown> {
    const res = await fetch(`${AF_BASE}${path}`, {
      headers: { "x-apisports-key": afKey },
    });
    if (!res.ok) throw new Error(`AF ${path} → ${res.status}`);
    return res.json();
  }

  try {
    // ── AUDIT: return current coverage stats ─────────────────────────────
    if (mode === "audit") {
      const [logsRes, profilesRes, squadsRes] = await Promise.all([
        supabase.from("player_recent_match_logs").select("id", { count: "exact", head: true }),
        supabase.from("player_event_minute_profiles").select("id", { count: "exact", head: true }),
        supabase.from("wc2026_team_squads").select("id", { count: "exact", head: true }),
      ]);
      return new Response(
        JSON.stringify({
          mode: "audit",
          player_recent_match_logs: logsRes.count ?? 0,
          player_event_minute_profiles: profilesRes.count ?? 0,
          wc2026_team_squads_source: squadsRes.count ?? 0,
          af_key_configured: afKey.length > 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── SYNC: fetch recent match logs from API-Football ──────────────────
    if (mode === "sync") {
      if (!afKey) {
        result.blocker = "AF_API_KEY not configured";
        return new Response(
          JSON.stringify({ error: result.blocker, result }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get players from wc2026_team_squads (has api_football_player_id + api_football_team_id)
      let playerQuery = supabase
        .from("wc2026_team_squads")
        .select("api_football_player_id, api_football_team_id, player_name, position")
        .not("api_football_player_id", "is", null)
        .limit(maxPlayers);

      if (body.team_id) {
        playerQuery = playerQuery.eq("api_football_team_id", body.team_id);
      }

      const { data: players, error: pErr } = await playerQuery;
      if (pErr) throw pErr;
      if (!players?.length) {
        result.blocker = "No players found in wc2026_team_squads";
        return new Response(
          JSON.stringify({ result }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      result.players_checked = players.length;
      const currentSeason = body.season_scope ?? "2024";

      for (const player of players) {
        try {
          const pid = player.api_football_player_id;
          const tid = player.api_football_team_id;

          // Fetch player fixtures/stats for current season
          const rawClub = await afFetch(
            `/players?id=${pid}&season=${currentSeason}`
          ) as { response?: unknown[] };

          const playerData = rawClub?.response?.[0] as Record<string, unknown> | undefined;
          if (!playerData) continue;

          const statistics = playerData.statistics as Array<Record<string, unknown>> ?? [];

          for (const stat of statistics.slice(0, recentMatchLimit)) {
            const league = stat.league as Record<string, unknown> ?? {};
            const games = stat.games as Record<string, unknown> ?? {};
            const goals = stat.goals as Record<string, unknown> ?? {};
            const shots = stat.shots as Record<string, unknown> ?? {};
            const fouls = stat.fouls as Record<string, unknown> ?? {};
            const cards = stat.cards as Record<string, unknown> ?? {};
            const passes = stat.passes as Record<string, unknown> ?? {};
            const tackles = stat.tackles as Record<string, unknown> ?? {};
            const dribbles = stat.dribbles as Record<string, unknown> ?? {};

            const isNational = (league.type as string) === "International" ||
              (league.name as string)?.toLowerCase().includes("world cup") ||
              (league.name as string)?.toLowerCase().includes("nations");

            if (!body.include_national && isNational) continue;
            if (!body.include_club && !isNational) continue;

            const logRow = {
              provider: "api_football",
              provider_player_id: pid,
              player_name: player.player_name,
              provider_team_id: tid,
              competition_name: league.name as string ?? null,
              season: currentSeason,
              is_national_team_match: isNational,
              is_club_match: !isNational,
              minutes_played: games.minutes as number ?? null,
              started: (games.appearences as number) > 0 && (games.lineups as number) > 0,
              position: games.position as string ?? player.position,
              goals: (goals.total as number) ?? 0,
              assists: (goals.assists as number) ?? 0,
              shots_total: (shots.total as number) ?? 0,
              shots_on_target: (shots.on as number) ?? 0,
              fouls_committed: (fouls.committed as number) ?? 0,
              fouls_drawn: (fouls.drawn as number) ?? 0,
              yellow_cards: (cards.yellow as number) ?? 0,
              red_cards: (cards.red as number) ?? 0,
              tackles_total: (tackles.total as number) ?? null,
              interceptions: (tackles.interceptions as number) ?? null,
              dribbles_success: (dribbles.success as number) ?? null,
              rating: (games.rating as number) ? parseFloat(games.rating as string) : null,
              raw_json: stat,
            };

            // Check for missing critical fields
            if (logRow.minutes_played === null) result.fields_missing.push("minutes_played");
            if ((passes.accuracy as number) === null) result.fields_missing.push("pass_accuracy");

            const { error: logErr } = await supabase
              .from("player_recent_match_logs")
              .upsert(logRow, { onConflict: "provider,provider_player_id,provider_fixture_id", ignoreDuplicates: false });

            if (!logErr) result.match_logs_inserted++;
          }
        } catch (e) {
          // Soft error per player — don't abort whole run
          console.error(`Player ${player.player_name}: ${(e as Error).message}`);
        }
      }
    }

    // ── BUILD_PROFILES: aggregate match logs into 5-min bucket profiles ──
    if (mode === "build_profiles") {
      // Get all players with match logs
      const { data: playerIds } = await supabase
        .from("player_recent_match_logs")
        .select("provider_player_id, player_name, provider_team_id")
        .order("provider_player_id");

      if (!playerIds?.length) {
        result.blocker = "No match logs found — run sync mode first";
        return new Response(
          JSON.stringify({ result }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // De-duplicate by player id
      const uniquePlayers = Array.from(
        new Map(playerIds.map((p) => [p.provider_player_id, p])).values()
      );

      result.players_checked = uniquePlayers.length;

      for (const player of uniquePlayers) {
        try {
          // Fetch all logs for this player
          const { data: logs } = await supabase
            .from("player_recent_match_logs")
            .select("*")
            .eq("provider_player_id", player.provider_player_id)
            .order("match_date", { ascending: false })
            .limit(recentMatchLimit);

          if (!logs?.length) continue;

          const profile = buildEmptyProfile();
          let sampleMatches = 0;

          // Aggregate from raw_json event minutes where available
          for (const log of logs) {
            sampleMatches++;

            // Use raw_json to extract event-level minute data if present
            const raw = log.raw_json as Record<string, unknown> ?? {};
            const goalsData = raw.goals as Record<string, unknown> ?? {};

            // We only have per-match totals, not per-minute from /players endpoint
            // Distribute proportionally using match minutes played
            const mp = log.minutes_played ?? 90;
            if (mp <= 0) continue;

            // For each metric, we apportion to buckets by observed minutes
            const activeBuckets = BUCKETS.filter((b) => {
              const start = parseInt(b.split("-")[0]);
              return start < mp;
            });

            if (!activeBuckets.length) continue;

            const distribPerBucket = (val: number) => val / activeBuckets.length;

            for (const b of activeBuckets) {
              const key = `bucket_${b.replace("-", "_")}`;
              const bucket = profile[key];
              if (!bucket) continue;

              bucket.goal_count += distribPerBucket(log.goals ?? 0);
              bucket.assist_count += distribPerBucket(log.assists ?? 0);
              bucket.shot_count += distribPerBucket(log.shots_total ?? 0);
              bucket.shot_on_target_count += distribPerBucket(log.shots_on_target ?? 0);
              bucket.foul_committed_count += distribPerBucket(log.fouls_committed ?? 0);
              bucket.foul_drawn_count += distribPerBucket(log.fouls_drawn ?? 0);
              bucket.yellow_card_count += distribPerBucket(log.yellow_cards ?? 0);
              bucket.red_card_count += distribPerBucket(log.red_cards ?? 0);
              bucket.minutes_observed += 5;
            }

            // Substitution minutes — typically subs happen in specific buckets
            // Without per-match event minutes, we can't assign precisely
            if (!log.started) {
              const subInBucket = "60-65";
              profile[`bucket_${subInBucket.replace("-", "_")}`].substitution_in_count += 0.3;
            }
          }

          // Compute rate_per_90 and confidence for each bucket
          const totalMinutes = sampleMatches * 90;
          const confidence = Math.min(sampleMatches / 20, 1.0);

          for (const b of BUCKETS) {
            const key = `bucket_${b.replace("-", "_")}`;
            const bucket = profile[key];
            const bucketMins = bucket.minutes_observed;
            const scale = bucketMins > 0 ? 90 / bucketMins : 0;
            (bucket as Record<string, number>).rate_per_90 = scale;
            bucket.confidence = confidence;
            (bucket as Record<string, number>).total_events =
              bucket.goal_count + bucket.shot_count + bucket.foul_committed_count;
          }
          void totalMinutes;

          const profileRow = {
            provider: "api_football",
            provider_player_id: player.provider_player_id,
            player_name: player.player_name,
            sample_matches: sampleMatches,
            data_confidence: confidence,
            provider_sources: [{ provider: "api_football", logs_used: sampleMatches }],
            updated_at: new Date().toISOString(),
            ...profile,
          };

          const { error: profErr } = await supabase
            .from("player_event_minute_profiles")
            .upsert(profileRow, { onConflict: "provider,provider_player_id" });

          if (!profErr) result.profiles_built++;
        } catch (e) {
          console.error(`Profile build ${player.player_name}: ${(e as Error).message}`);
        }
      }

      if (result.fields_missing.length === 0) {
        result.fields_missing.push("per_minute_event_data: API-Football /players endpoint provides season aggregates only, not match-level event minutes — bucket distribution is proportional approximation until /fixtures/events per-player endpoint is used");
      }
    }
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message, result }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ mode, result }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
