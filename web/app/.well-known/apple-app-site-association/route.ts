import { NextResponse } from "next/server";

// Production signing identity verified against the retained distribution profile.
// Limit universal-link routing to public payment requests; never intercept auth.
export function GET() {
  return NextResponse.json({
    applinks: {
      details: [{
        appIDs: ["6XX38GYURG.ph.clover.app"],
        components: [{ "/": "/split-bill/request/*", "?": { browser: "1" }, exclude: true }, { "/": "/split-bill/request/*", comment: "Open a shared payment request in Clover" }],
      }],
    },
  }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
