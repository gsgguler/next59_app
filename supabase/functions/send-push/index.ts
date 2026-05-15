import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const VAPID_PUBLIC_KEY =
  "BAmipKrppSBGBUAvN9se9iuHdzblFR_eqaZnTS4yPpKRbGmudz6nEnyIU8v9-ywummaE0cfLEic1q5RhrZYapiQ";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = "mailto:info@next59.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const MAX_TITLE_LEN = 100;
const MAX_BODY_LEN = 300;
const MAX_URL_LEN = 500;

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  user_id?: string;
}

async function requireAdmin(req: Request): Promise<Response | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const verifier = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: { user }, error } = await verifier.auth.getUser(token);
  if (error || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (user.app_metadata?.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authError = await requireAdmin(req);
    if (authError) return authError;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const payload: PushPayload = await req.json();

    if (!payload.title || !payload.body) {
      return new Response(
        JSON.stringify({ error: "title and body are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (
      typeof payload.title !== "string" ||
      typeof payload.body !== "string" ||
      payload.title.length > MAX_TITLE_LEN ||
      payload.body.length > MAX_BODY_LEN ||
      (payload.url && (typeof payload.url !== "string" || payload.url.length > MAX_URL_LEN)) ||
      (payload.user_id && typeof payload.user_id !== "string")
    ) {
      return new Response(
        JSON.stringify({ error: "Invalid payload: field type or length violation" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let query = supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth_key")
      .eq("active", true)
      .limit(500);

    if (payload.user_id) {
      query = query.eq("user_id", payload.user_id);
    }

    const { data: subscriptions, error: fetchError } = await query;

    if (fetchError) {
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, failed: 0, deactivated: 0 }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const pushPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url ?? "/",
    });

    let sent = 0;
    let failed = 0;
    const deactivatedIds: string[] = [];

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth_key,
          },
        };

        try {
          await webpush.sendNotification(pushSubscription, pushPayload);
          sent++;
        } catch (err: unknown) {
          const statusCode =
            err && typeof err === "object" && "statusCode" in err
              ? (err as { statusCode: number }).statusCode
              : 0;

          if (statusCode === 410 || statusCode === 404) {
            deactivatedIds.push(sub.id);
          }
          failed++;
        }
      })
    );

    if (deactivatedIds.length > 0) {
      await supabase
        .from("push_subscriptions")
        .update({ active: false, updated_at: new Date().toISOString() })
        .in("id", deactivatedIds);
    }

    return new Response(
      JSON.stringify({
        sent,
        failed,
        deactivated: deactivatedIds.length,
        total: subscriptions.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
