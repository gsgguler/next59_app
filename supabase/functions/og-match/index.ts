import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @deno-types="npm:@types/react@18"
import React from "npm:react@18";
import { ImageResponse } from "npm:@vercel/og@0.6.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const homeTeam = url.searchParams.get("homeTeam") ?? "Ev Sahibi";
    const awayTeam = url.searchParams.get("awayTeam") ?? "Konuk";
    const prediction = url.searchParams.get("prediction") ?? "";
    const probability = url.searchParams.get("probability") ?? "";
    const matchDate = url.searchParams.get("matchDate") ?? "";
    const league = url.searchParams.get("league") ?? "";

    const homeTLA = homeTeam.slice(0, 3).toUpperCase();
    const awayTLA = awayTeam.slice(0, 3).toUpperCase();
    const scoreLine = prediction
      ? `${homeTLA} vs ${awayTLA}`
      : `${homeTLA} vs ${awayTLA}`;

    const dateDisplay = matchDate
      ? new Date(matchDate).toLocaleDateString("tr-TR", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "";

    const predictionLine =
      prediction && probability
        ? `next59 tahmini: ${prediction} (%${probability})`
        : "";

    const element = React.createElement(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #060f09 0%, #0a1828 100%)",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "48px 56px",
          position: "relative",
          overflow: "hidden",
        },
      },
      // Decorative grid pattern
      React.createElement("div", {
        style: {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage:
            "radial-gradient(circle at 25% 25%, rgba(200,151,58,0.04) 0%, transparent 50%)",
        },
      }),
      // Top: league badge + date
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "40px",
            position: "relative",
          },
        },
        React.createElement(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: "12px",
            },
          },
          league
            ? React.createElement(
                "span",
                {
                  style: {
                    background: "rgba(200,151,58,0.15)",
                    border: "1px solid rgba(200,151,58,0.3)",
                    color: "#c8973a",
                    padding: "6px 16px",
                    borderRadius: "8px",
                    fontSize: "18px",
                    fontWeight: 600,
                  },
                },
                league
              )
            : null
        ),
        dateDisplay
          ? React.createElement(
              "span",
              {
                style: {
                  color: "rgba(255,255,255,0.5)",
                  fontSize: "18px",
                  fontWeight: 400,
                },
              },
              dateDisplay
            )
          : null
      ),
      // Center: teams row
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "40px",
            flex: 1,
          },
        },
        // Home team
        React.createElement(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
            },
          },
          React.createElement(
            "div",
            {
              style: {
                width: "100px",
                height: "100px",
                borderRadius: "50%",
                background:
                  "linear-gradient(135deg, rgba(200,151,58,0.2), rgba(200,151,58,0.05))",
                border: "2px solid rgba(200,151,58,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              },
            },
            React.createElement(
              "span",
              {
                style: {
                  fontSize: "28px",
                  fontWeight: 800,
                  color: "#c8973a",
                  letterSpacing: "2px",
                },
              },
              homeTLA
            )
          ),
          React.createElement(
            "span",
            {
              style: {
                fontSize: "22px",
                fontWeight: 600,
                color: "#ffffff",
                textAlign: "center",
                maxWidth: "200px",
              },
            },
            homeTeam
          )
        ),
        // VS / scoreline
        React.createElement(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "8px",
            },
          },
          React.createElement(
            "span",
            {
              style: {
                fontSize: "52px",
                fontWeight: 800,
                color: "#ffffff",
                letterSpacing: "4px",
                textTransform: "uppercase",
              },
            },
            "VS"
          )
        ),
        // Away team
        React.createElement(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
            },
          },
          React.createElement(
            "div",
            {
              style: {
                width: "100px",
                height: "100px",
                borderRadius: "50%",
                background:
                  "linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.02))",
                border: "2px solid rgba(255,255,255,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              },
            },
            React.createElement(
              "span",
              {
                style: {
                  fontSize: "28px",
                  fontWeight: 800,
                  color: "rgba(255,255,255,0.8)",
                  letterSpacing: "2px",
                },
              },
              awayTLA
            )
          ),
          React.createElement(
            "span",
            {
              style: {
                fontSize: "22px",
                fontWeight: 600,
                color: "#ffffff",
                textAlign: "center",
                maxWidth: "200px",
              },
            },
            awayTeam
          )
        )
      ),
      // Bottom: prediction line
      predictionLine
        ? React.createElement(
            "div",
            {
              style: {
                display: "flex",
                justifyContent: "center",
                marginBottom: "16px",
              },
            },
            React.createElement(
              "span",
              {
                style: {
                  fontSize: "24px",
                  fontWeight: 700,
                  color: "#c8973a",
                  textAlign: "center",
                },
              },
              "\u{1F52E} " + predictionLine
            )
          )
        : null,
      // Footer: watermark
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            paddingTop: "16px",
          },
        },
        React.createElement(
          "span",
          {
            style: {
              fontSize: "16px",
              fontWeight: 500,
              color: "rgba(255,255,255,0.3)",
              letterSpacing: "3px",
              textTransform: "uppercase",
            },
          },
          "next59.com"
        )
      )
    );

    const response = new ImageResponse(element, {
      width: 1200,
      height: 630,
    });

    const imageBuffer = await response.arrayBuffer();

    return new Response(imageBuffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
