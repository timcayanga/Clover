import { NextResponse } from "next/server";
import { normalizeMarketSymbol, type MarketAssetType, type MarketHistoryPoint } from "@/lib/market-data";

export const dynamic = "force-dynamic";

type AlphaVantageResponse = Record<string, unknown> & {
  "Time Series (Daily)"?: Record<string, Record<string, string>>;
  "Time Series (Digital Currency Daily)"?: Record<string, Record<string, string>>;
  "Error Message"?: string;
  Note?: string;
};

type YahooFinanceResponse = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
        }>;
        adjclose?: Array<{
          adjclose?: Array<number | null>;
        }>;
      };
    }>;
    error?: {
      description?: string;
    };
  };
};

const parseAssetType = (value: string | null): MarketAssetType => (value === "crypto" ? "crypto" : "equity");

const parseSeries = (series: Record<string, Record<string, string>>, fieldName: string) => {
  const points: MarketHistoryPoint[] = Object.entries(series)
    .map(([date, values]) => {
      const value = Number(values[fieldName]);
      if (!Number.isFinite(value)) {
        return null;
      }

      return { date, value };
    })
    .filter((point): point is MarketHistoryPoint => point !== null)
    .sort((left, right) => left.date.localeCompare(right.date));

  return points;
};

const parseYahooSeries = (payload: YahooFinanceResponse) => {
  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0]?.close ?? [];
  const adjusted = result?.indicators?.adjclose?.[0]?.adjclose ?? [];
  const values = adjusted.length > 0 ? adjusted : quote;

  return timestamps
    .map((timestamp, index) => {
      const value = values[index];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return null;
      }

      return { date: new Date(timestamp * 1000).toISOString().slice(0, 10), value };
    })
    .filter((point): point is MarketHistoryPoint => point !== null);
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = normalizeMarketSymbol(searchParams.get("symbol") ?? "");
  const assetType = parseAssetType(searchParams.get("assetType"));

  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }

  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  if (apiKey) {
    const url = new URL("https://www.alphavantage.co/query");
    if (assetType === "crypto") {
      url.searchParams.set("function", "DIGITAL_CURRENCY_DAILY");
      url.searchParams.set("symbol", symbol);
      url.searchParams.set("market", "USD");
    } else {
      url.searchParams.set("function", "TIME_SERIES_DAILY_ADJUSTED");
      url.searchParams.set("symbol", symbol);
      url.searchParams.set("outputsize", "full");
    }
    url.searchParams.set("apikey", apiKey);

    const response = await fetch(url.toString(), { cache: "no-store" });
    if (!response.ok) {
      return NextResponse.json({ error: "Unable to load market data." }, { status: 502 });
    }

    const payload = (await response.json()) as AlphaVantageResponse;
    if (payload.Note) {
      return NextResponse.json({ error: payload.Note }, { status: 429 });
    }
    if (payload["Error Message"]) {
      return NextResponse.json({ error: payload["Error Message"] }, { status: 404 });
    }

    const points =
      assetType === "crypto"
        ? parseSeries(payload["Time Series (Digital Currency Daily)"] ?? {}, "4b. close (USD)")
        : parseSeries(payload["Time Series (Daily)"] ?? {}, "5. adjusted close");

    if (points.length === 0) {
      return NextResponse.json({ error: "No market history found for that ticker." }, { status: 404 });
    }

    const latest = points[points.length - 1];
    const previous = points[points.length - 2] ?? latest;
    const change = latest.value - previous.value;
    const changePercent = previous.value === 0 ? 0 : (change / previous.value) * 100;

    return NextResponse.json({
      symbol,
      assetType,
      provider: "alpha-vantage",
      market: "USD",
      points,
      latest,
      previous,
      change,
      changePercent,
    });
  }

  const yahooSymbol = assetType === "crypto" ? `${symbol}-USD` : symbol;
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}`);
  url.searchParams.set("range", "max");
  url.searchParams.set("interval", "1d");
  url.searchParams.set("includePrePost", "false");
  url.searchParams.set("events", "div,splits");

  const response = await fetch(url.toString(), {
    cache: "no-store",
    headers: {
      "user-agent": "Mozilla/5.0",
      accept: "application/json,text/plain,*/*",
    },
  });
  if (!response.ok) {
    return NextResponse.json({ error: "Unable to load market data." }, { status: 502 });
  }

  const payload = (await response.json()) as YahooFinanceResponse;
  if (payload.chart?.error?.description) {
    return NextResponse.json({ error: payload.chart.error.description }, { status: 404 });
  }

  const points = parseYahooSeries(payload);

  if (points.length === 0) {
    return NextResponse.json({ error: "No market history found for that ticker." }, { status: 404 });
  }

  const latest = points[points.length - 1];
  const previous = points[points.length - 2] ?? latest;
  const change = latest.value - previous.value;
  const changePercent = previous.value === 0 ? 0 : (change / previous.value) * 100;

  return NextResponse.json({
    symbol,
    assetType,
    provider: "yahoo-finance",
    market: "USD",
    points,
    latest,
    previous,
    change,
    changePercent,
  });
}
