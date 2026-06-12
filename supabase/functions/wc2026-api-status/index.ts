import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createSyncRun, finishSyncRun } from "../_shared/apiFootballClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const API_BASE = "https://v3.football.api-sports.io";

interface ApiStatusResponse {
  account: {
    firstname: string;
    lastname:  string;
    email:     string;
  };
  subscription: {
    plan:   string;
    end:    string;
    active: boolean;
  };
  requests: {
    current:   number;
    limit_day: number;
  };
}

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

const LOW_THRESHOLD      = 0.20; // warn when < 20% remaining
const CRITICAL_THRESHOLD = 0.05; // critical when < 5% remaining

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const runId = await createSyncRun("wc2026-api-status");

  try {
    const apiKey = Deno.env.get("API_FOOTBALL_KEY");
    if (!apiKey) throw new Error("API_FOOTBALL_KEY not set");

    const response = await fetch(`${API_BASE}/status`, {
      headers: {
        "x-apisports-key": apiKey,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`API-Football /status returned HTTP ${response.status}`);
    }

    const body = await response.json() as { response: ApiStatusResponse; errors: unknown[] };
    const statusData = body.response;

    if (!statusData?.requests) {
      throw new Error("Unexpected API-Football status response shape");
    }

    const limit     = statusData.requests.limit_day;
    const used      = statusData.requests.current;
    const remaining = Math.max(0, limit - used);
    const ratio     = limit > 0 ? remaining / limit : 1;

    const isLow      = ratio < LOW_THRESHOLD;
    const isCritical = ratio < CRITICAL_THRESHOLD;

    const now = new Date().toISOString();
    const supabase = getSupabase();

    await supabase
      .from("wc_api_quota_snapshots")
      .insert({
        checked_at:         now,
        requests_remaining: remaining,
        requests_limit:     limit,
        requests_used:      used,
        is_low:             isLow,
        is_critical:        isCritical,
        meta: {
          plan:          statusData.subscription?.plan ?? null,
          plan_end:      statusData.subscription?.end ?? null,
          plan_active:   statusData.subscription?.active ?? null,
          account_email: statusData.account?.email ?? null,
        },
      });

    if (isCritical) {
      console.error(`[api-status] CRITICAL: Only ${remaining}/${limit} requests remaining (${(ratio * 100).toFixed(1)}%)`);
    } else if (isLow) {
      console.warn(`[api-status] LOW quota: ${remaining}/${limit} requests remaining (${(ratio * 100).toFixed(1)}%)`);
    } else {
      console.log(`[api-status] OK: ${remaining}/${limit} requests remaining (${(ratio * 100).toFixed(1)}%)`);
    }

    // Prune old snapshots — keep last 200
    await supabase.rpc("wc2026_prune_quota_snapshots").maybeSingle();

    await finishSyncRun(runId, "completed", { fixturesProcessed: 0, apiCalls: 1 });

    return new Response(JSON.stringify({
      ok: true,
      requests_remaining: remaining,
      requests_limit:     limit,
      requests_used:      used,
      is_low:             isLow,
      is_critical:        isCritical,
      plan:               statusData.subscription?.plan ?? null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[wc2026-api-status] fatal:", msg);
    await finishSyncRun(runId, "error", { error: msg, fixturesProcessed: 0, apiCalls: 0 });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
