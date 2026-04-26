import { NextResponse } from "next/server";
import {
  formatMarketSymbolForRegion,
  normalizeMarketSymbol,
  type MarketHistoryPoint,
  type MarketRange,
  type MarketRegion,
} from "@/lib/market-data";

export const dynamic = "force-dynamic";

type YahooFinanceResponse = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
          volume?: Array<number | null>;
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

type AlphaVantageResponse = Record<string, unknown> & {
  "Time Series (Daily)"?: Record<string, Record<string, string>>;
  "Time Series (Digital Currency Daily)"?: Record<string, Record<string, string>>;
  "Error Message"?: string;
  Note?: string;
};

type YahooRangeConfig = {
  range: string;
  interval: string;
};

const YAHOO_RANGE_CONFIG: Record<MarketRange, YahooRangeConfig> = {
  "1D": { range: "1d", interval: "5m" },
  "5D": { range: "5d", interval: "15m" },
  "1M": { range: "1mo", interval: "1h" },
  "3M": { range: "3mo", interval: "1d" },
  "6M": { range: "6mo", interval: "1d" },
  YTD: { range: "ytd", interval: "1d" },
  "1Y": { range: "1y", interval: "1d" },
  "5Y": { range: "5y", interval: "1wk" },
  MAX: { range: "max", interval: "1wk" },
};

const parseMarket = (value: string | null): MarketRegion => {
  if (value === "ph" || value === "crypto") {
    return value;
  }

  return "us";
};

const parseRange = (value: string | null): MarketRange => {
  if (
    value === "1D" ||
    value === "5D" ||
    value === "1M" ||
    value === "3M" ||
    value === "6M" ||
    value === "YTD" ||
    value === "1Y" ||
    value === "5Y" ||
    value === "MAX"
  ) {
    return value;
  }

  return "1Y";
};

const parseSeries = (series: Record<string, Record<string, string>>, priceField: string, volumeField: string) => {
  const points: MarketHistoryPoint[] = [];

  for (const [date, values] of Object.entries(series)) {
    const value = Number(values[priceField]);
    if (!Number.isFinite(value)) {
      continue;
    }

    const volume = volumeField ? Number(values[volumeField]) : null;
    points.push({
      date,
      value,
      volume: Number.isFinite(volume) ? volume : null,
    });
  }

  points.sort((left, right) => left.date.localeCompare(right.date));
  return points;
};

const parseYahooSeries = (payload: YahooFinanceResponse) => {
  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0] ?? {};
  const adjusted = result?.indicators?.adjclose?.[0]?.adjclose ?? [];
  const closes = adjusted.length > 0 ? adjusted : quote.close ?? [];
  const volumes = quote.volume ?? [];

  const points: MarketHistoryPoint[] = [];

  for (const [index, timestamp] of timestamps.entries()) {
    const value = closes[index];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      continue;
    }

    const volume = volumes[index];
    points.push({
      date: new Date(timestamp * 1000).toISOString(),
      value,
      volume: typeof volume === "number" && Number.isFinite(volume) ? volume : null,
    });
  }

  return points;
};

const fetchYahooHistory = async (symbol: string, market: MarketRegion, range: MarketRange) => {
  const yahooSymbol = formatMarketSymbolForRegion(symbol, market);
  const config = YAHOO_RANGE_CONFIG[range];
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}`);
  url.searchParams.set("range", config.range);
  url.searchParams.set("interval", config.interval);
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
    return { error: "Unable to load market data." as const };
  }

  const payload = (await response.json()) as YahooFinanceResponse;
  if (payload.chart?.error?.description) {
    return { error: payload.chart.error.description as string };
  }

  const points = parseYahooSeries(payload);
  if (points.length === 0) {
    return { error: "No market history found for that ticker." as const };
  }

  const latest = points[points.length - 1];
  const previous = points[points.length - 2] ?? latest;
  const change = latest.value - previous.value;
  const changePercent = previous.value === 0 ? 0 : (change / previous.value) * 100;

  return {
    symbol: normalizeMarketSymbol(symbol),
    market,
    provider: "yahoo-finance" as const,
    range,
    points,
    latest,
    previous,
    change,
    changePercent,
  };
};

const fetchAlphaFallback = async (symbol: string, market: MarketRegion) => {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    return { error: "Unable to load market data." as const };
  }

  const url = new URL("https://www.alphavantage.co/query");
  const isCrypto = market === "crypto";
  if (isCrypto) {
    url.searchParams.set("function", "DIGITAL_CURRENCY_DAILY");
    url.searchParams.set("symbol", normalizeMarketSymbol(symbol));
    url.searchParams.set("market", "USD");
  } else {
    url.searchParams.set("function", "TIME_SERIES_DAILY_ADJUSTED");
    url.searchParams.set("symbol", normalizeMarketSymbol(symbol));
    url.searchParams.set("outputsize", "full");
  }
  url.searchParams.set("apikey", apiKey);

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) {
    return { error: "Unable to load market data." as const };
  }

  const payload = (await response.json()) as AlphaVantageResponse;
  if (payload.Note) {
    return { error: payload.Note as string };
  }
  if (payload["Error Message"]) {
    return { error: payload["Error Message"] as string };
  }

  const points =
    market === "crypto"
      ? parseSeries(payload["Time Series (Digital Currency Daily)"] ?? {}, "4b. close (USD)", "5. volume")
      : parseSeries(payload["Time Series (Daily)"] ?? {}, "5. adjusted close", "6. volume");

  if (points.length === 0) {
    return { error: "No market history found for that ticker." as const };
  }

  const latest = points[points.length - 1];
  const previous = points[points.length - 2] ?? latest;
  const change = latest.value - previous.value;
  const changePercent = previous.value === 0 ? 0 : (change / previous.value) * 100;

  return {
    symbol: normalizeMarketSymbol(symbol),
    market,
    provider: "alpha-vantage" as const,
    range: "MAX" as const,
    points,
    latest,
    previous,
    change,
    changePercent,
  };
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = normalizeMarketSymbol(searchParams.get("symbol") ?? "");
  const market = parseMarket(searchParams.get("market"));
  const range = parseRange(searchParams.get("range"));

  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }

  const yahooResult = await fetchYahooHistory(symbol, market, range);
  if (!("error" in yahooResult)) {
    return NextResponse.json(yahooResult);
  }

  const fallbackResult = await fetchAlphaFallback(symbol, market);
  if (!("error" in fallbackResult)) {
    return NextResponse.json(fallbackResult);
  }

  return NextResponse.json({ error: yahooResult.error ?? fallbackResult.error }, { status: 502 });
}
