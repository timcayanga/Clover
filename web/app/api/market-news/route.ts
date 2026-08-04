import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { normalizeMarketSymbol } from "@/lib/market-data";
import { assertRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MARKET_NEWS_TIMEOUT_MS = 8_000;

type AlphaVantageNewsFeed = {
  title?: string;
  summary?: string;
  source?: string;
  time_published?: string;
  overall_sentiment_label?: string;
  url?: string;
};

type AlphaVantageNewsResponse = {
  feed?: AlphaVantageNewsFeed[];
  Information?: string;
  Note?: string;
};

const parsePublishedAt = (value: string | undefined) => {
  if (!value || !/^\d{8}T\d{6}$/.test(value)) {
    return null;
  }

  const parsed = new Date(
    `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const normalizeSentiment = (value: string | undefined): "positive" | "negative" | "neutral" => {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized.includes("bullish") || normalized.includes("positive")) {
    return "positive";
  }
  if (normalized.includes("bearish") || normalized.includes("negative")) {
    return "negative";
  }
  return "neutral";
};

export async function GET(request: Request) {
  let userId: string;
  try {
    ({ userId } = await requireAuth());
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    assertRateLimit(`market-news:${userId}`, 30, 60_000);
  } catch {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Market news is not configured." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const symbol = normalizeMarketSymbol(searchParams.get("symbol") ?? "");
  const name = String(searchParams.get("name") ?? "").trim().slice(0, 120);
  const market = searchParams.get("market") ?? "us";
  if (!symbol && !name) {
    return NextResponse.json({ error: "An asset is required." }, { status: 400 });
  }

  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", "NEWS_SENTIMENT");
  if (symbol) {
    url.searchParams.set("tickers", market === "crypto" ? `CRYPTO:${symbol}` : symbol);
  } else {
    url.searchParams.set("topics", "financial_markets");
  }
  url.searchParams.set("sort", "LATEST");
  url.searchParams.set("limit", "12");
  url.searchParams.set("apikey", apiKey);

  try {
    const response = await fetch(url, {
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(MARKET_NEWS_TIMEOUT_MS),
    });
    if (!response.ok) {
      return NextResponse.json({ error: "Current coverage is unavailable." }, { status: 502 });
    }

    const payload = (await response.json()) as AlphaVantageNewsResponse;
    if (payload.Note || payload.Information) {
      return NextResponse.json({ error: "Current coverage is temporarily unavailable." }, { status: 503 });
    }

    const searchTerms = name.toLowerCase().split(/\s+/).filter((term) => term.length > 3);
    const items = (payload.feed ?? [])
      .filter((item) => item.title && item.summary)
      .filter((item) => {
        if (symbol) {
          return true;
        }
        const text = `${item.title} ${item.summary}`.toLowerCase();
        return searchTerms.length === 0 || searchTerms.some((term) => text.includes(term));
      })
      .slice(0, 6)
      .map((item, index) => ({
        id: item.url || `${symbol || name}:${item.time_published || index}`,
        title: item.title!.trim(),
        summary: item.summary!.trim(),
        source: item.source?.trim() || "Market coverage",
        publishedAt: parsePublishedAt(item.time_published),
        sentiment: normalizeSentiment(item.overall_sentiment_label),
      }));

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: "Current coverage is unavailable." }, { status: 502 });
  }
}
