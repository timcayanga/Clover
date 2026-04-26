import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type FrankfurterResponse = Array<{
  date: string;
  base: string;
  quote: string;
  rate: number;
}>;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const base = String(searchParams.get("base") ?? "").trim().toUpperCase();
  const quote = String(searchParams.get("quote") ?? "").trim().toUpperCase();

  if (!base || !quote) {
    return NextResponse.json({ error: "base and quote are required" }, { status: 400 });
  }

  const url = new URL("https://api.frankfurter.dev/v2/rates");
  url.searchParams.set("base", base);
  url.searchParams.set("quotes", quote);

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) {
    return NextResponse.json({ error: "Unable to load exchange rate." }, { status: 502 });
  }

  const payload = (await response.json()) as FrankfurterResponse;
  const entry = Array.isArray(payload) ? payload[0] : null;
  if (!entry || typeof entry.rate !== "number" || !Number.isFinite(entry.rate)) {
    return NextResponse.json({ error: "No exchange rate found." }, { status: 404 });
  }

  return NextResponse.json({
    base: entry.base,
    quote: entry.quote,
    rate: entry.rate,
    date: entry.date,
  });
}
