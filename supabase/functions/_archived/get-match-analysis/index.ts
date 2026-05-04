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

interface PredictionRow {
  id: string;
  match_id: string;
  cassandra_code: string;
  category: string;
  probability: number;
  confidence_label: string;
  model_version: string;
  model_output_raw: Record<string, unknown> | null;
  access_level: string;
  is_current: boolean;
  statement: string;
}

interface MatchRow {
  id: string;
  home_team_id: string;
  away_team_id: string;
  kickoff_at: string;
  stage: string;
  round_name: string;
  matchweek: number;
  status: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = getSupabase();

    const url = new URL(req.url);
    const matchId = url.searchParams.get("match_id");

    if (!matchId) {
      return new Response(
        JSON.stringify({ error: "match_id query parameter is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Fetch match
    const { data: match } = await supabase
      .from("matches")
      .select(
        "id, home_team_id, away_team_id, kickoff_at, stage, round_name, matchweek, status",
      )
      .eq("id", matchId)
      .maybeSingle();

    if (!match) {
      return new Response(
        JSON.stringify({ error: "Match not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Fetch current prediction
    const { data: prediction } = await supabase
      .from("predictions")
      .select(
        "id, match_id, cassandra_code, category, probability, confidence_label, model_version, model_output_raw, access_level, is_current, statement",
      )
      .eq("match_id", matchId)
      .eq("is_current", true)
      .maybeSingle();

    // Fetch team strength ratings for both teams
    const m = match as MatchRow;
    const { data: homeRating } = await supabase
      .from("team_strength_ratings")
      .select(
        "elo_rating, form_score, attack_score, defense_score, match_count, confidence_score",
      )
      .eq("team_id", m.home_team_id)
      .maybeSingle();

    const { data: awayRating } = await supabase
      .from("team_strength_ratings")
      .select(
        "elo_rating, form_score, attack_score, defense_score, match_count, confidence_score",
      )
      .eq("team_id", m.away_team_id)
      .maybeSingle();

    // Auth check (for is_authenticated flag only)
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
    } = await supabase.auth.getUser(token);

    const matchData = {
      id: m.id,
      home_team_id: m.home_team_id,
      away_team_id: m.away_team_id,
      kickoff_at: m.kickoff_at,
      stage: m.stage,
      round_name: m.round_name,
      matchweek: m.matchweek,
      status: m.status,
    };

    const p = prediction as PredictionRow | null;

    return new Response(
      JSON.stringify({
        match: matchData,
        prediction: p
          ? {
              cassandra_code: p.cassandra_code,
              category: p.category,
              confidence_label: p.confidence_label,
              probability: p.probability,
              model_version: p.model_version,
              model_output_raw: p.model_output_raw,
              statement: p.statement,
            }
          : null,
        analysis: {
          available_text: p?.model_output_raw ?? null,
          full_analysis_locked: false,
          upgrade_cta: null,
        },
        elo: {
          home: homeRating ?? null,
          away: awayRating ?? null,
        },
        quota: {
          views_used: 0,
          views_remaining: -1,
          tier: "free",
          quota_enforced: false,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
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
