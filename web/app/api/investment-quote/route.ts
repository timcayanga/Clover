import { NextResponse } from "next/server";
import { GET as marketHistory } from "@/app/api/market-history/route";

/** A single authenticated valuation quote. Full market charts/news retain their plan gate. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol")?.trim().toUpperCase() ?? "";
  const market = url.searchParams.get("market") ?? "";
  if (!/^[A-Z0-9][A-Z0-9.\-]{0,29}$/.test(symbol) || !["us", "ph", "crypto"].includes(market)) {
    return NextResponse.json({ error: "Choose a valid ticker and market." }, { status: 400 });
  }
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("range", "5D");
  // Authentication, throttling and provider timeouts are shared with market history.
  const response = await marketHistory(new Request(url, { headers: request.headers }));
  const payload = await response.json();
  if (!response.ok) return NextResponse.json({ error: "A current quote is unavailable." }, { status: response.status });
  // Alpha Vantage daily equity history has no verified quote currency.
  if (market !== "crypto" && payload.provider === "alpha-vantage") return NextResponse.json({ error: "A verified quote currency is unavailable." }, { status: 503 });
  return NextResponse.json({ symbol: payload.symbol, currency: payload.currency, latest: payload.latest, provider: payload.provider },
    { headers: { "Cache-Control": "private, no-store" } });
}
