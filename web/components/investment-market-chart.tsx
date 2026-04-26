"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  buildMarketLinePath,
  formatMarketSymbolForRegion,
  filterMarketHistoryByRange,
  MARKET_RANGES,
  normalizeMarketSymbol,
  type MarketHistoryPoint,
  type MarketRange,
  type MarketRegion,
} from "@/lib/market-data";
import { isMarketInvestmentSubtype } from "@/lib/investments";

type InvestmentAccount = {
  id: string;
  name: string;
  investmentSubtype: string | null;
  investmentSymbol: string | null;
};

type MarketHistoryResponse = {
  symbol: string;
  market: MarketRegion;
  provider: "alpha-vantage" | "yahoo-finance" | "stockanalysis";
  currency: "USD" | "PHP";
  range: MarketRange;
  points: MarketHistoryPoint[];
  latest: MarketHistoryPoint;
  previous: MarketHistoryPoint;
  change: number;
  changePercent: number;
  error?: string;
};

type CurrencyCode = "USD" | "PHP";

type BenchmarkKey = "none" | "sp500" | "nasdaq" | "bitcoin";

type MarketKey = "us" | "ph" | "crypto";

type BenchmarkOption = {
  key: BenchmarkKey;
  label: string;
  symbol: string;
  market: MarketKey;
  note: string;
};

type TickerSuggestion = {
  symbol: string;
  name: string;
  market: MarketKey;
  popularity: number;
};

type InvestmentMarketChartProps = {
  investmentAccounts: InvestmentAccount[];
};

const chartWidth = 760;
const chartHeight = 220;
const chartPadding = 24;

const currencyFormatters: Record<CurrencyCode, Intl.NumberFormat> = {
  USD: new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }),
  PHP: new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }),
};

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 2,
});

const volumeFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});

const MARKET_OPTIONS: Array<{ key: MarketKey; label: string; description: string }> = [
  { key: "us", label: "US", description: "United States" },
  { key: "ph", label: "PH", description: "Philippines" },
  { key: "crypto", label: "Crypto", description: "Digital assets" },
];

const POPULAR_TICKERS: Record<MarketKey, TickerSuggestion[]> = {
  us: [
    { symbol: "AAPL", name: "Apple", market: "us", popularity: 100 },
    { symbol: "MSFT", name: "Microsoft", market: "us", popularity: 99 },
    { symbol: "NVDA", name: "NVIDIA", market: "us", popularity: 98 },
    { symbol: "AMZN", name: "Amazon", market: "us", popularity: 97 },
    { symbol: "GOOGL", name: "Alphabet", market: "us", popularity: 96 },
    { symbol: "SPY", name: "S&P 500 ETF", market: "us", popularity: 95 },
    { symbol: "QQQ", name: "Nasdaq 100 ETF", market: "us", popularity: 94 },
    { symbol: "TSLA", name: "Tesla", market: "us", popularity: 93 },
  ],
  ph: [
    { symbol: "BPI", name: "Bank of the Philippine Islands", market: "ph", popularity: 100 },
    { symbol: "BDO", name: "BDO Unibank", market: "ph", popularity: 99 },
    { symbol: "ALI", name: "Ayala Land", market: "ph", popularity: 98 },
    { symbol: "SM", name: "SM Investments", market: "ph", popularity: 97 },
    { symbol: "JFC", name: "Jollibee Foods", market: "ph", popularity: 96 },
    { symbol: "FMETF", name: "First Metro ETF", market: "ph", popularity: 95 },
    { symbol: "PSEI", name: "PSEi Index", market: "ph", popularity: 94 },
    { symbol: "ICT", name: "International Container Terminal", market: "ph", popularity: 93 },
  ],
  crypto: [
    { symbol: "BTC", name: "Bitcoin", market: "crypto", popularity: 100 },
    { symbol: "ETH", name: "Ethereum", market: "crypto", popularity: 99 },
    { symbol: "SOL", name: "Solana", market: "crypto", popularity: 98 },
    { symbol: "XRP", name: "XRP", market: "crypto", popularity: 97 },
    { symbol: "BNB", name: "BNB", market: "crypto", popularity: 96 },
    { symbol: "ADA", name: "Cardano", market: "crypto", popularity: 95 },
    { symbol: "DOGE", name: "Dogecoin", market: "crypto", popularity: 94 },
    { symbol: "TON", name: "Toncoin", market: "crypto", popularity: 93 },
  ],
};

const formatAxisDate = (value: string, range: MarketRange, isDailySource = false) => {
  const date = new Date(value);

  if (isDailySource) {
    if (range === "5Y" || range === "MAX") {
      return date.toLocaleDateString("en-PH", { year: "numeric" });
    }

    if (range === "1D" || range === "5D") {
      return date.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "2-digit" });
    }

    return date.toLocaleDateString("en-PH", { month: "short", day: "2-digit" });
  }

  if (range === "1D") {
    return date.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
  }

  if (range === "5D") {
    return date.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "2-digit" });
  }

  if (range === "5Y" || range === "MAX") {
    return date.toLocaleDateString("en-PH", { year: "numeric" });
  }

  return date.toLocaleDateString("en-PH", { month: "short", day: "2-digit" });
};

const buildTicks = (minValue: number, maxValue: number, count = 4) => {
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue) || count <= 1) {
    return [maxValue];
  }

  const span = Math.max(maxValue - minValue, 1);
  return Array.from({ length: count }, (_, index) => minValue + (span * index) / (count - 1));
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getDisplayConversionRate = (
  originCurrency: "USD" | "PHP",
  targetCurrency: CurrencyCode,
  exchangeRate: number
) => {
  if (originCurrency === targetCurrency) {
    return 1;
  }

  if (originCurrency === "USD" && targetCurrency === "PHP") {
    return exchangeRate;
  }

  if (originCurrency === "PHP" && targetCurrency === "USD") {
    return exchangeRate > 0 ? 1 / exchangeRate : 1;
  }

  return 1;
};

const BENCHMARK_OPTIONS: BenchmarkOption[] = [
  { key: "none", label: "None", symbol: "", market: "us", note: "No benchmark comparison" },
  { key: "sp500", label: "S&P 500", symbol: "SPY", market: "us", note: "US large-cap market proxy" },
  { key: "nasdaq", label: "Nasdaq 100", symbol: "QQQ", market: "us", note: "US tech-heavy benchmark" },
  { key: "bitcoin", label: "Bitcoin", symbol: "BTC", market: "crypto", note: "Crypto market reference" },
];

const formatRelativeTime = (timestamp: number) => {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

  if (elapsedSeconds < 30) {
    return "just now";
  }
  if (elapsedSeconds < 90) {
    return "1m ago";
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours}h ago`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${elapsedDays}d ago`;
};

export function InvestmentMarketChart({ investmentAccounts }: InvestmentMarketChartProps) {
  const [tickerInput, setTickerInput] = useState("");
  const [selectedMarket, setSelectedMarket] = useState<MarketKey>("us");
  const [submittedSymbol, setSubmittedSymbol] = useState("");
  const [submittedMarket, setSubmittedMarket] = useState<MarketKey>("us");
  const [queryRevision, setQueryRevision] = useState(0);
  const [isTickerFocused, setTickerFocused] = useState(false);
  const [range, setRange] = useState<MarketRange>("1D");
  const [history, setHistory] = useState<MarketHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>("USD");
  const [exchangeRate, setExchangeRate] = useState(1);
  const [rateError, setRateError] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);
  const [benchmarkKey, setBenchmarkKey] = useState<BenchmarkKey>("none");
  const [benchmarkHistory, setBenchmarkHistory] = useState<MarketHistoryResponse | null>(null);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);

  const tickerSuggestions = useMemo(() => {
    const query = normalizeMarketSymbol(tickerInput);
    const pool = POPULAR_TICKERS[selectedMarket];

    return pool
      .filter((suggestion) => {
        if (!query) {
          return true;
        }

        return (
          suggestion.symbol.includes(query) ||
          suggestion.name.toUpperCase().includes(query) ||
          formatMarketSymbolForRegion(suggestion.symbol, suggestion.market).includes(query)
        );
      })
      .sort((left, right) => {
        const leftScore =
          query.length === 0
            ? 0
            : left.symbol.startsWith(query)
              ? 0
              : left.name.toUpperCase().startsWith(query)
                ? 1
                : 2;
        const rightScore =
          query.length === 0
            ? 0
            : right.symbol.startsWith(query)
              ? 0
              : right.name.toUpperCase().startsWith(query)
                ? 1
                : 2;
        return leftScore - rightScore || right.popularity - left.popularity;
      })
      .slice(0, 8);
  }, [selectedMarket, tickerInput]);

  const submitTicker = (symbolValue = tickerInput, marketValue: MarketKey = selectedMarket) => {
    const next = normalizeMarketSymbol(symbolValue);
    if (!next) {
      return;
    }

    setTickerInput(next);
    setSelectedMarket(marketValue);
    setSubmittedSymbol(next);
    setSubmittedMarket(marketValue);
    setDisplayCurrency(marketValue === "ph" ? "PHP" : "USD");
    setQueryRevision((value) => value + 1);
    setTickerFocused(false);
  };

  useEffect(() => {
    if (!submittedSymbol) {
      setHistory(null);
      setLastUpdatedAt(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      setHistory(null);
      try {
        const response = await fetch(
          `/api/market-history?symbol=${encodeURIComponent(submittedSymbol)}&market=${encodeURIComponent(submittedMarket)}&range=${encodeURIComponent(range)}`,
          { signal: controller.signal }
        );
        const payload = (await response.json()) as MarketHistoryResponse;
        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setHistory(null);
          setError(payload.error ?? "Unable to load market data.");
          return;
        }

        setHistory(payload);
        setLastUpdatedAt(Date.now());
      } catch (fetchError) {
        if (!cancelled) {
          setHistory(null);
          setError(fetchError instanceof Error ? fetchError.message : "Unable to load market data.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [queryRevision, range, submittedMarket, submittedSymbol]);

  useEffect(() => {
    let cancelled = false;

    const benchmark = BENCHMARK_OPTIONS.find((option) => option.key === benchmarkKey);
    if (!benchmark || benchmark.key === "none") {
      setBenchmarkHistory(null);
      setBenchmarkError(null);
      return;
    }

    const loadBenchmark = async () => {
      try {
        setBenchmarkHistory(null);
        setBenchmarkError(null);
        const response = await fetch(
          `/api/market-history?symbol=${encodeURIComponent(benchmark.symbol)}&market=${encodeURIComponent(benchmark.market)}&range=${encodeURIComponent(range)}`
        );
        const payload = (await response.json()) as MarketHistoryResponse;
        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setBenchmarkHistory(null);
          setBenchmarkError(payload.error ?? `Unable to load ${benchmark.label}.`);
          return;
        }

        setBenchmarkHistory(payload);
        setBenchmarkError(null);
      } catch (fetchError) {
        if (!cancelled) {
          setBenchmarkHistory(null);
          setBenchmarkError(fetchError instanceof Error ? fetchError.message : `Unable to load ${benchmark.label}.`);
        }
      }
    };

    void loadBenchmark();

    return () => {
      cancelled = true;
    };
  }, [benchmarkKey, range]);

  const needsFxRate =
    (history?.currency === "USD" && displayCurrency === "PHP") || (history?.currency === "PHP" && displayCurrency === "USD");

  useEffect(() => {
    let cancelled = false;

    const loadExchangeRate = async () => {
      if (!needsFxRate) {
        setExchangeRate(1);
        setRateError(null);
        return;
      }

      try {
        const response = await fetch("/api/fx-rate?base=USD&quote=PHP");
        const payload = (await response.json()) as { rate?: number; error?: string };
        if (cancelled) {
          return;
        }

        if (!response.ok || typeof payload.rate !== "number" || !Number.isFinite(payload.rate)) {
          setExchangeRate(1);
          setRateError(payload.error ?? "Unable to load PHP conversion rate.");
          return;
        }

        setExchangeRate(payload.rate);
        setRateError(null);
      } catch (fetchError) {
        if (!cancelled) {
          setExchangeRate(1);
          setRateError(fetchError instanceof Error ? fetchError.message : "Unable to load PHP conversion rate.");
        }
      }
    };

    void loadExchangeRate();

    return () => {
      cancelled = true;
    };
  }, [displayCurrency, history?.currency, needsFxRate]);

  const visiblePoints = useMemo(() => {
    if (!history) {
      return [];
    }

    const filtered = filterMarketHistoryByRange(history.points, range);
    if (history.market === "ph" && filtered.length < 2) {
      return history.points.slice(-Math.min(history.points.length, 30));
    }

    return filtered;
  }, [history, range]);

  const sourceCurrency = history?.currency ?? "USD";
  const primaryDisplayRate = getDisplayConversionRate(sourceCurrency, displayCurrency, exchangeRate);
  const displayPoints = useMemo(
    () => visiblePoints.map((point) => ({ ...point, value: point.value * primaryDisplayRate, volume: point.volume })),
    [primaryDisplayRate, visiblePoints]
  );

  const currentDisplayPoint = displayPoints[displayPoints.length - 1] ?? null;
  const firstDisplayPoint = displayPoints[0] ?? null;
  const priceChange = currentDisplayPoint && firstDisplayPoint ? currentDisplayPoint.value - firstDisplayPoint.value : null;
  const priceChangePercent =
    currentDisplayPoint && firstDisplayPoint && firstDisplayPoint.value !== 0 ? (priceChange ?? 0) / firstDisplayPoint.value : null;
  const xTickIndexes = useMemo(() => {
    if (displayPoints.length <= 1) {
      return [0];
    }

    const desiredTicks = Math.min(
      displayPoints.length,
      range === "1D" || range === "5D" ? 6 : range === "5Y" || range === "MAX" ? 8 : 7
    );
    const indexes = Array.from({ length: desiredTicks }, (_, index) =>
      Math.round((index * (displayPoints.length - 1)) / Math.max(desiredTicks - 1, 1))
    );
    return [...new Set(indexes)];
  }, [displayPoints.length, range]);

  const hoveredPoint = hoverIndex === null ? null : displayPoints[hoverIndex] ?? null;
  const benchmarkOption = BENCHMARK_OPTIONS.find((option) => option.key === benchmarkKey) ?? BENCHMARK_OPTIONS[0];
  const benchmarkSourceCurrency = benchmarkHistory?.currency ?? "USD";
  const benchmarkVisiblePoints = useMemo(() => {
    if (!benchmarkHistory) {
      return [];
    }

    return filterMarketHistoryByRange(benchmarkHistory.points, range);
  }, [benchmarkHistory, range]);
  const benchmarkScale = useMemo(() => {
    const benchmarkFirst = benchmarkVisiblePoints[0]?.value;
    const primaryFirst = displayPoints[0]?.value;

    if (!benchmarkFirst || !primaryFirst) {
      return 1;
    }

    return primaryFirst / benchmarkFirst;
  }, [benchmarkVisiblePoints, displayPoints]);
  const benchmarkDisplayPoints = useMemo(
    () =>
      benchmarkVisiblePoints.map((point) => ({
        ...point,
        value: point.value * benchmarkScale * getDisplayConversionRate(benchmarkSourceCurrency, displayCurrency, exchangeRate),
        volume: point.volume,
      })),
    [benchmarkScale, benchmarkVisiblePoints, benchmarkSourceCurrency, displayCurrency, exchangeRate]
  );
  const benchmarkIsActive = benchmarkKey !== "none" && benchmarkDisplayPoints.length > 1 && !benchmarkError;
  const chartPoints = benchmarkIsActive ? [...displayPoints, ...benchmarkDisplayPoints] : displayPoints;
  const chartBounds = useMemo(() => {
    if (chartPoints.length === 0) {
      return null;
    }

    return {
      minValue: Math.min(...chartPoints.map((point) => point.value)),
      maxValue: Math.max(...chartPoints.map((point) => point.value)),
    };
  }, [chartPoints]);
  const yTicks = useMemo(() => buildTicks(chartBounds?.minValue ?? 0, chartBounds?.maxValue ?? 0, 5), [chartBounds]);
  const lineChart = useMemo(
    () => buildMarketLinePath(displayPoints, chartWidth, chartHeight, chartPadding, chartBounds ?? undefined),
    [chartBounds, displayPoints]
  );
  const benchmarkLineChart = useMemo(
    () => buildMarketLinePath(benchmarkDisplayPoints, chartWidth, chartHeight, chartPadding, chartBounds ?? undefined),
    [benchmarkDisplayPoints, chartBounds]
  );
  const chartInnerHeight = chartHeight - chartPadding * 2;
  const chartRange = Math.max((chartBounds?.maxValue ?? 0) - (chartBounds?.minValue ?? 0), 1);
  const valueToY = (value: number) => chartPadding + (1 - ((value - (chartBounds?.minValue ?? 0)) / chartRange)) * chartInnerHeight;

  const formatAmount = (value: number) => currencyFormatters[displayCurrency].format(value);
  const formatVolume = (value: number | null | undefined) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return "Volume not available";
    }

    return volumeFormatter.format(value);
  };
  const chartSubtitle =
    sourceCurrency === displayCurrency
      ? `Prices are shown in ${displayCurrency}.`
      : `Converted from ${sourceCurrency} using the latest FX rate.`;
  const chartError = rateError ?? error;
  const sourceLabel =
    history?.provider === "stockanalysis"
      ? "StockAnalysis.com"
      : history?.provider === "alpha-vantage"
        ? "Alpha Vantage"
        : "Yahoo Finance";
  const submittedMarketLabel = MARKET_OPTIONS.find((option) => option.key === submittedMarket)?.description ?? "United States";
  const isDailySource = history?.provider === "stockanalysis";
  const trendIsPositive = priceChange === null ? true : priceChange >= 0;
  const trendColor = trendIsPositive ? "var(--good)" : "var(--bad)";
  const trendFillTop = trendIsPositive ? "rgba(34, 197, 94, 0.24)" : "rgba(239, 68, 68, 0.24)";
  const trendFillBottom = trendIsPositive ? "rgba(34, 197, 94, 0.03)" : "rgba(239, 68, 68, 0.03)";

  return (
    <section className="investments-market glass">
      <div className="investments-market__head">
        <div>
          <p className="eyebrow">Market tracker</p>
          <h3>Track a ticker</h3>
        </div>
        <form
          className="investments-market__controls"
          onSubmit={(event) => {
            event.preventDefault();
            submitTicker();
          }}
        >
          <div className="investments-market__ticker-field">
            <label>
              Ticker
              <input
                value={tickerInput}
                onChange={(event) => {
                  setTickerInput(event.target.value.toUpperCase());
                  setTickerFocused(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitTicker();
                  }
                }}
                onFocus={() => setTickerFocused(true)}
                onBlur={() => {
                  window.setTimeout(() => setTickerFocused(false), 120);
                  setTickerInput((current) => normalizeMarketSymbol(current));
                }}
                placeholder="AAPL, BPI, BTC"
              />
            </label>

            {isTickerFocused && tickerSuggestions.length > 0 ? (
              <div className="investments-market__suggestions" role="listbox" aria-label="Ticker suggestions">
                {tickerSuggestions.map((suggestion) => (
                  <button
                    key={`${suggestion.market}:${suggestion.symbol}`}
                    className="investments-market__suggestion"
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setTickerInput(suggestion.symbol);
                    setSelectedMarket(suggestion.market);
                    setDisplayCurrency(suggestion.market === "ph" ? "PHP" : "USD");
                    submitTicker(suggestion.symbol, suggestion.market);
                  }}
                >
                    <strong>{suggestion.symbol}</strong>
                    <span>{suggestion.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <label>
            Market
            <select
              value={selectedMarket}
              onChange={(event) => {
                const nextMarket = event.target.value as MarketKey;
                setSelectedMarket(nextMarket);
              }}
            >
              {MARKET_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="investments-market__currency-select">
            Currency
            <select value={displayCurrency} onChange={(event) => setDisplayCurrency(event.target.value as CurrencyCode)}>
              <option value="USD">USD</option>
              <option value="PHP">PHP</option>
            </select>
          </label>

          <label className="investments-market__currency-select">
            Benchmark
            <select value={benchmarkKey} onChange={(event) => setBenchmarkKey(event.target.value as BenchmarkKey)}>
              {BENCHMARK_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </form>
      </div>

      <div className="investments-market__range">
        {MARKET_RANGES.map((option) => (
          <button
            key={option.key}
            className={`button button-small ${range === option.key ? "button-primary" : "button-secondary"}`}
            type="button"
            onClick={() => setRange(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {benchmarkError ? <p className="panel-muted">Benchmark unavailable: {benchmarkError}</p> : null}

      <div className="insight-chart">
        {loading ? (
          <div className="empty-state">Loading market data...</div>
        ) : chartError ? (
          <div className="empty-state">
            <strong>Unable to load market data.</strong>
            <p>{chartError}</p>
          </div>
        ) : displayPoints.length > 1 ? (
          <>
            <div className="market-chart__canvas">
              <div className="market-chart__y-axis" aria-hidden="true">
                {yTicks
                  .slice()
                  .reverse()
                  .map((tick) => (
                    <span key={tick}>{formatAmount(tick)}</span>
                  ))}
              </div>

              <div className="market-chart__plot">
                <svg
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  role="img"
                  aria-label={`${submittedSymbol} price history`}
                >
                  <defs>
                    <linearGradient id="market-chart-fill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor={trendFillTop} />
                      <stop offset="100%" stopColor={trendFillBottom} />
                    </linearGradient>
                  </defs>

                  {yTicks.map((tick) => {
                    const y = valueToY(tick);
                    return <line key={tick} x1={chartPadding} x2={chartWidth - chartPadding} y1={y} y2={y} stroke="rgba(148, 163, 184, 0.18)" strokeWidth="1" />;
                  })}

                  {benchmarkIsActive ? (
                    <path
                      d={benchmarkLineChart.linePath}
                      fill="none"
                      stroke="rgba(59, 130, 246, 0.95)"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray="8 7"
                    />
                  ) : null}

                  <path
                    d={`${lineChart.linePath} L ${lineChart.points[lineChart.points.length - 1].x.toFixed(1)} ${chartHeight - chartPadding} L ${lineChart.points[0].x.toFixed(1)} ${chartHeight - chartPadding} Z`}
                    fill="url(#market-chart-fill)"
                  />
                  <path d={lineChart.linePath} fill="none" stroke={trendColor} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />

                  {hoverPosition && hoveredPoint ? (
                    <>
                      <line
                        x1={hoverPosition.x}
                        x2={hoverPosition.x}
                        y1={chartPadding}
                        y2={chartHeight - chartPadding}
                        stroke="rgba(15, 23, 42, 0.15)"
                        strokeDasharray="4 6"
                      />
                    </>
                  ) : null}

                  <rect
                    x="0"
                    y="0"
                    width={chartWidth}
                    height={chartHeight}
                    fill="transparent"
                    onMouseMove={(event) => {
                      const bounds = event.currentTarget.getBoundingClientRect();
                      const x = ((event.clientX - bounds.left) / bounds.width) * chartWidth;
                      const nearestIndex = lineChart.points.reduce(
                        (nearest, point, index) =>
                          Math.abs(point.x - x) < Math.abs(lineChart.points[nearest].x - x) ? index : nearest,
                        0
                      );
                      const point = lineChart.points[nearestIndex];
                      if (!point) {
                        return;
                      }

                      setHoverIndex(nearestIndex);
                      setHoverPosition({ x: point.x, y: point.y });
                    }}
                    onMouseLeave={() => {
                      setHoverIndex(null);
                      setHoverPosition(null);
                    }}
                  />
                </svg>

                {hoverPosition && hoveredPoint ? (
                  <div
                    className="market-chart__tooltip"
                    style={{
                      left: `${clamp(hoverPosition.x - 80, 6, chartWidth - 166)}px`,
                      top: `${clamp(hoverPosition.y - 116, 6, chartHeight - 100)}px`,
                    }}
                  >
                    <strong>
                      {isDailySource
                        ? new Date(hoveredPoint.date).toLocaleDateString("en-PH", {
                            month: "short",
                            day: "2-digit",
                            year: "numeric",
                          })
                        : new Date(hoveredPoint.date).toLocaleString("en-PH", {
                            month: "short",
                            day: "2-digit",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                    </strong>
                    <span>{formatAmount(hoveredPoint.value)}</span>
                    <small>Volume: {formatVolume(hoveredPoint.volume)}</small>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="investments-market__comparison">
              <span>
                {benchmarkIsActive ? `${benchmarkOption.label} scaled to the same starting value.` : `${submittedMarketLabel} market`}
              </span>
              <span>{benchmarkIsActive ? benchmarkOption.note : chartSubtitle}</span>
            </div>

            <div className="market-chart__x-axis">
              {xTickIndexes.map((index) => {
                const point = displayPoints[index];
                if (!point) {
                  return null;
                }

                return (
                  <span key={point.date} style={{ left: `${lineChart.points[index]?.x ?? 0}px` }}>
                    {formatAxisDate(point.date, range, isDailySource)}
                  </span>
                );
              })}
            </div>

            <div className="insight-chart__labels">
              <div className="insight-chart__label">
                <span>Latest</span>
                <strong>{formatAmount(currentDisplayPoint?.value ?? 0)}</strong>
              </div>
              <div className="insight-chart__label">
                <span>Change</span>
                <strong className={priceChange !== null && priceChange >= 0 ? "is-positive" : "is-negative"}>
                  {priceChange === null ? "Not enough data" : `${priceChange >= 0 ? "+" : "-"}${formatAmount(Math.abs(priceChange))}`}
                </strong>
              </div>
              <div className="insight-chart__label">
                <span>Range change</span>
                <strong className={priceChangePercent !== null && priceChangePercent >= 0 ? "is-positive" : "is-negative"}>
                  {priceChangePercent === null ? "Not enough data" : `${priceChangePercent >= 0 ? "+" : "-"}${percentFormatter.format(Math.abs(priceChangePercent))}`}
                </strong>
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <strong>Pick a ticker to see its movement.</strong>
            <p>Choose a market, type a ticker, and press Enter to load it.</p>
          </div>
        )}
      </div>

      <p className="investments-market__disclaimer panel-muted">
        Market prices can differ by broker or exchange. Use Clover as a ballpark estimate and rely on the actual platform price for final decisions.
      </p>

      {history && displayPoints.length > 1 ? (
        <div className="investments-market__footnote">
          <span>
            Source: {sourceLabel}, {submittedMarketLabel}, using {history.provider === "stockanalysis" ? "daily history" : `${range} history`}.
          </span>
          <span>
            {lastUpdatedAt ? `Updated ${formatRelativeTime(lastUpdatedAt)}` : "Waiting for first refresh"}
            {sourceCurrency !== displayCurrency && displayCurrency === "PHP" && sourceCurrency === "USD"
              ? ` · FX ${exchangeRate.toFixed(2)} PHP/USD`
              : ""}
            {sourceCurrency !== displayCurrency && displayCurrency === "USD" && sourceCurrency === "PHP"
              ? ` · FX ${(exchangeRate > 0 ? 1 / exchangeRate : 1).toFixed(4)} USD/PHP`
              : ""}
          </span>
          <span>{chartSubtitle}</span>
          {isMarketInvestmentSubtype(
            investmentAccounts.find((account) => normalizeMarketSymbol(account.investmentSymbol ?? "") === submittedSymbol)?.investmentSubtype
          ) ? (
            <Link href="/accounts" className="pill-link pill-link--inline">
              Open the account
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
