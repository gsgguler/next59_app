import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const INDEXNOW_KEY = "dde40265-ad0b-43f1-ae49-58be15aa408a";
const HOST = "www.next59.com";
const KEY_LOCATION = `https://${HOST}/${INDEXNOW_KEY}.txt`;

const ENGINES = [
  "https://api.indexnow.org/indexnow",
  "https://www.bing.com/indexnow",
  "https://yandex.com/indexnow",
];

interface SubmitPayload {
  urls: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const payload: SubmitPayload = await req.json();

    if (!payload.urls || !Array.isArray(payload.urls) || payload.urls.length === 0) {
      return new Response(
        JSON.stringify({ error: "urls array is required and must not be empty" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const body = JSON.stringify({
      host: HOST,
      key: INDEXNOW_KEY,
      keyLocation: KEY_LOCATION,
      urlList: payload.urls,
    });

    const results = await Promise.allSettled(
      ENGINES.map(async (engine) => {
        const res = await fetch(engine, {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body,
        });
        const status = res.status;
        const text = await res.text().catch(() => "");
        console.log(`[IndexNow] ${engine} => ${status} ${text.slice(0, 200)}`);
        return { engine, status, ok: status >= 200 && status < 300 };
      }),
    );

    const summary = results.map((r, i) => {
      if (r.status === "fulfilled") {
        return r.value;
      }
      const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
      console.error(`[IndexNow] ${ENGINES[i]} => FAILED: ${reason}`);
      return { engine: ENGINES[i], status: 0, ok: false, error: reason };
    });

    return new Response(
      JSON.stringify({
        submitted_urls: payload.urls.length,
        engines: summary,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
