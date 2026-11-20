"use client";
import { registerPullRefresh } from "@/lib/pull-refresh";

import { MARKET_OPTIONS, POPULAR_TICKERS, marketIcon, toggleTicker, type SelectedTicker, type MarketKey } from "../../shared/market-selection";
import { ReportsComparisonChart } from "./reports-comparison-chart";
import { investmentQuoteIdentity } from "../../shared/investment-entry";
import styles from "./market-selectors.module.css";
import { MarketAssetNews } from "@/components/market-asset-news";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AccountBrandMark } from "@/components/account-brand-mark";
import { getInvestmentAssetBrand } from "@/lib/investment-assets";
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
  currency: string;
  balance: string | null;
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



type BenchmarkOption = {
  key: BenchmarkKey;
  label: string;
  symbol: string;
  market: MarketKey;
  note: string;
};



type InvestmentMarketChartProps = {
  investmentAccounts: InvestmentAccount[];
  onOpenPortfolio?: () => void;
  focusAssetId?: string | null;
};

const MARKET_HISTORY_CLIENT_CACHE_TTL_MS = 60_000;
const MARKET_HISTORY_CLIENT_CACHE_MAX_ENTRIES = 64;
const marketHistoryClientCache = new Map<string, { payload: MarketHistoryResponse; fetchedAt: number; expiresAt: number }>();

const getMarketHistoryCacheKey = (symbol: string, market: MarketKey, range: MarketRange) =>
  `${market}:${normalizeMarketSymbol(symbol)}:${range}`;

const readCachedMarketHistory = (symbol: string, market: MarketKey, range: MarketRange) => {
  const key = getMarketHistoryCacheKey(symbol, market, range);
  const cached = marketHistoryClientCache.get(key);
  if (!cached || cached.expiresAt <= Date.now()) {
    marketHistoryClientCache.delete(key);
    return null;
  }

  return cached;
};

const writeCachedMarketHistory = (payload: MarketHistoryResponse) => {
  if (marketHistoryClientCache.size >= MARKET_HISTORY_CLIENT_CACHE_MAX_ENTRIES) {
    const oldestKey = marketHistoryClientCache.keys().next().value;
    if (oldestKey) marketHistoryClientCache.delete(oldestKey);
  }

  const fetchedAt = Date.now();
  marketHistoryClientCache.set(getMarketHistoryCacheKey(payload.symbol, payload.market, payload.range), {
    payload,
    fetchedAt,
    expiresAt: fetchedAt + MARKET_HISTORY_CLIENT_CACHE_TTL_MS,
  });
};

const isMarketTrackableSubtype = (value: string | null) =>
  value === "stock" || value === "etf" || value === "reit" || value === "crypto";

const getMarketForInvestment = (account: InvestmentAccount): MarketKey => {
  const identity = investmentQuoteIdentity({name:account.name, subtype:account.investmentSubtype, symbol:account.investmentSymbol, currency:account.currency});
  if (identity) return identity.market;
  if (account.investmentSubtype === "crypto") {
    return "crypto";
  }

  return account.currency.trim().toUpperCase() === "PHP" ? "ph" : "us";
};

const chartWidth = 1000;
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

export function InvestmentMarketChart({ investmentAccounts, onOpenPortfolio, focusAssetId }: InvestmentMarketChartProps) {
  const trackablePortfolioAssets = useMemo(
    () => {
      const seenSymbols = new Set<string>();
      return investmentAccounts
        .filter((account) => isMarketTrackableSubtype(account.investmentSubtype))
        .slice()
        .sort((left, right) => Number(right.balance ?? 0) - Number(left.balance ?? 0))
        .filter((account) => {
          const symbol = normalizeMarketSymbol(account.investmentSymbol ?? "");
          if (!symbol) {
            return true;
          }

          const key = `${getMarketForInvestment(account)}:${symbol}`;
          if (seenSymbols.has(key)) {
            return false;
          }
          seenSymbols.add(key);
          return true;
        });
    },
    [investmentAccounts]
  );
  const defaultMarketAsset = useMemo(
    () =>
      trackablePortfolioAssets.find(
        (account) => account.id === focusAssetId && Boolean(account.investmentSymbol?.trim())
      ) ??
      trackablePortfolioAssets.filter((account) => Boolean(account.investmentSymbol?.trim()))[0] ??
      null,
    [focusAssetId, trackablePortfolioAssets]
  );
  const defaultMarket = defaultMarketAsset ? getMarketForInvestment(defaultMarketAsset) : "us";
  const defaultSymbol = defaultMarketAsset?.investmentSymbol?.trim().toUpperCase() || POPULAR_TICKERS[defaultMarket][0].symbol;
  const [tickerInput, setTickerInput] = useState("");
  const [selectedMarket, setSelectedMarket] = useState<MarketKey>(defaultMarket);
  const [submittedSymbol, setSubmittedSymbol] = useState(defaultSymbol);
  const [submittedMarket, setSubmittedMarket] = useState<MarketKey>(defaultMarket);
  const [menu, setMenu] = useState<"Markets" | "Assets" | null>(null);
  const [selection, setSelection] = useState(() => toggleTicker([], defaultSymbol));
  const [range, setRange] = useState<MarketRange>("1M");
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
  const portfolioAssetsForSelectedMarket = useMemo(
    () => trackablePortfolioAssets.filter((account) => getMarketForInvestment(account) === selectedMarket),
    [selectedMarket, trackablePortfolioAssets]
  );

  const tickerSuggestions = useMemo(() => {
    const query = normalizeMarketSymbol(tickerInput);
    const owned = trackablePortfolioAssets.filter(account => getMarketForInvestment(account) === selectedMarket && account.investmentSymbol).map(account => ({ symbol:normalizeMarketSymbol(account.investmentSymbol!), name:account.name, market:selectedMarket, popularity:100000 }));
    const pool = [...owned, ...POPULAR_TICKERS[selectedMarket].filter(item => !owned.some(account => account.symbol === item.symbol))];

    for (const {symbol} of selection) {
      if (!pool.some(a => a.symbol === symbol)) pool.push({symbol, name:symbol, market:selectedMarket, popularity:0});
    }
    const elsewhere = MARKET_OPTIONS.some(m => m.key !== selectedMarket && POPULAR_TICKERS[m.key].some(a => a.symbol === query))
      || trackablePortfolioAssets.some(a => getMarketForInvestment(a) !== selectedMarket && a.investmentSymbol === query);
    if (!elsewhere && /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(query) && !pool.some(a => a.symbol === query))
      pool.push({symbol:query, name:query, market:selectedMarket, popularity:0});
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
      });
  }, [selectedMarket, tickerInput, trackablePortfolioAssets, selection]);

  const selectMarket = (market: MarketKey) => {
    if (market !== selectedMarket) {
      const owned = trackablePortfolioAssets.find(a => getMarketForInvestment(a) === market && a.investmentSymbol);
      const first = normalizeMarketSymbol(owned?.investmentSymbol || POPULAR_TICKERS[market][0].symbol);
      setSelection(toggleTicker([], first));
      setSelectedMarket(market);
      setSubmittedMarket(market);
      setSubmittedSymbol(first);
      setDisplayCurrency(market === "ph" ? "PHP" : "USD");
      setBenchmarkKey("none");
    }
    setTickerInput("");
    setMenu(null);
  };
  const toggleAsset = (symbol: string) => {
    const next = toggleTicker(selection, symbol);
    setSelection(next);
    setSubmittedSymbol(next.some(s => s.symbol === symbol) ? symbol : next.at(-1)?.symbol ?? "");
  };

  useEffect(() => {
    if (!submittedSymbol) {
      setHistory(null);
      setLastUpdatedAt(null);
      return;
    }

    const cachedHistory = readCachedMarketHistory(submittedSymbol, submittedMarket, range);
    if (cachedHistory) {
      setHistory(cachedHistory.payload);
      setError(null);
      setLoading(false);
      setLastUpdatedAt(cachedHistory.fetchedAt);
    }

    let cancelled = false;
    const controller = new AbortController();
    const loadHistory = async () => {
      setLoading(true);
      setError(null);
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
          setError(payload.error ?? "Unable to load market data.");
          return;
        }

        writeCachedMarketHistory(payload);
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
    };

    if (!cachedHistory) void loadHistory();
    const unregister = registerPullRefresh(loadHistory);
    return () => {
      unregister(); cancelled = true;
      controller.abort();
    };
  }, [range, submittedMarket, submittedSymbol]);

  useEffect(() => {
    let cancelled = false;

    const benchmark = BENCHMARK_OPTIONS.find((option) => option.key === benchmarkKey);
    if (!benchmark || benchmark.key === "none") {
      setBenchmarkHistory(null);
      setBenchmarkError(null);
      return;
    }

    const cachedBenchmark = readCachedMarketHistory(benchmark.symbol, benchmark.market, range);
    if (cachedBenchmark) {
      setBenchmarkHistory(cachedBenchmark.payload);
      setBenchmarkError(null);
      return;
    }

    const loadBenchmark = async () => {
      try {
        setBenchmarkError(null);
        const response = await fetch(
          `/api/market-history?symbol=${encodeURIComponent(benchmark.symbol)}&market=${encodeURIComponent(benchmark.market)}&range=${encodeURIComponent(range)}`
        );
        const payload = (await response.json()) as MarketHistoryResponse;
        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setBenchmarkError(payload.error ?? `Unable to load ${benchmark.label}.`);
          return;
        }

        writeCachedMarketHistory(payload);
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
  const trendColor = selection.find(s => s.symbol === submittedSymbol)?.color ?? "var(--teal)";
  const trendFillTop = trendIsPositive ? "rgba(34, 197, 94, 0.24)" : "rgba(239, 68, 68, 0.24)";
  const trendFillBottom = trendIsPositive ? "rgba(34, 197, 94, 0.03)" : "rgba(239, 68, 68, 0.03)";
  const benchmarkComparisonLabel = benchmarkIsActive
    ? `${benchmarkOption.label} is normalized to the selected start value for relative movement comparison.`
    : chartSubtitle;
  const benchmarkFooterLabel = benchmarkIsActive ? benchmarkOption.note : "Hover the chart to inspect time, price, and volume.";
  const chartIsLoading = loading;
  const selectedPortfolioAsset = trackablePortfolioAssets.find(
    (account) =>
      getMarketForInvestment(account) === submittedMarket &&
      normalizeMarketSymbol(account.investmentSymbol ?? "") === submittedSymbol
  ) ?? null;
  const missingTickerCount = portfolioAssetsForSelectedMarket.filter((account) => !account.investmentSymbol?.trim()).length;
  const rangeHigh = displayPoints.length > 0 ? Math.max(...displayPoints.map((point) => point.value)) : null;
  const rangeLow = displayPoints.length > 0 ? Math.min(...displayPoints.map((point) => point.value)) : null;
  const latestVolume = displayPoints[displayPoints.length - 1]?.volume ?? null;
  const externalMarketUrl = submittedSymbol
    ? submittedMarket === "crypto"
      ? `https://finance.yahoo.com/quote/${encodeURIComponent(`${submittedSymbol}-USD`)}`
      : submittedMarket === "ph"
        ? `https://www.tradingview.com/symbols/PSE-${encodeURIComponent(submittedSymbol)}/`
        : `https://finance.yahoo.com/quote/${encodeURIComponent(submittedSymbol)}`
    : null;

  return (
    <section className="investments-market glass">
      <div className="investments-market__head">
        <div className={styles.controls}>
          <div className={styles.selectors}>
            {(["Markets","Assets"] as const).map(label => <button key={label} type="button" aria-expanded={menu === label}
              onClick={() => {setMenu(menu === label ? null : label); setTickerInput("");}}>
              <small>{label}</small><strong>{label === "Markets" ? marketIcon[selectedMarket]+" "+ selectedMarket.toUpperCase()
                : selection.length === 1 ? selection[0].symbol : selection.length+" selected"} ▾</strong>
            </button>)}
          </div>
          {menu === "Markets" && <div className={styles.rows}>{MARKET_OPTIONS.map(m =>
            <button type="button" aria-pressed={m.key === selectedMarket} key={m.key} onClick={() => selectMarket(m.key)}>
              {marketIcon[m.key]} {m.description} {m.key === selectedMarket && "✓"}
            </button>)}</div>}
          {menu === "Assets" && <div className={styles.rows}>
            <input aria-label="Search assets or ticker" placeholder="Search assets or ticker" value={tickerInput} onChange={e=>setTickerInput(e.target.value)}/>
            {tickerSuggestions.map(a => {
              const picked = selection.find(s => s.symbol === a.symbol);
              return <button key={a.symbol} type="button" aria-pressed={!!picked} onClick={() => toggleAsset(a.symbol)}>
                <AccountBrandMark accountBrand={getInvestmentAssetBrand({name:a.name,symbol:a.symbol,market:selectedMarket,subtype:selectedMarket === "crypto" ? "crypto" : "stock"})} label={a.name}/>
                <span>{a.name} · {a.symbol}</span>{picked && <b style={{color:picked.color}}>● ✓</b>}
              </button>;
            })}
            {!tickerSuggestions.length && <p>No matching assets in this market.</p>}
            <button type="button" onClick={()=>setMenu(null)}>Done</button>
          </div>}
          {selection.length === 1 && <div className={styles.selectors}>
          <label className="investments-market__currency-select">
            <span className="investments-market__field-label">Currency</span>
            <select
              className="investments-market__select investments-market__select--compact"
              value={displayCurrency}
              onChange={(event) => setDisplayCurrency(event.target.value as CurrencyCode)}
            >
              <option value="USD">USD</option>
              <option value="PHP">PHP</option>
            </select>
          </label>

            <label className="investments-market__currency-select">
              <span className="investments-market__field-label">Benchmark</span>
              <select
                className="investments-market__select investments-market__select--compact"
                value={benchmarkKey}
                onChange={(event) => setBenchmarkKey(event.target.value as BenchmarkKey)}
              >
                {BENCHMARK_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          </div>}
        </div>
      </div>

      <div className="investments-market__range investments-market__range--compact">
        {MARKET_RANGES.map((option) => (
          <button
            key={option.key}
            className={`button button-small investments-market__range-button ${range === option.key ? "button-primary" : "button-secondary"}`}
            type="button"
            onClick={() => setRange(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <label className="investments-market__range-select">
        <span>Time period</span>
        <select value={range} onChange={(event) => setRange(event.target.value as MarketRange)}>
          {MARKET_RANGES.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {benchmarkError ? <p className="panel-muted">Benchmark unavailable: {benchmarkError}</p> : null}

      {selection.length > 1
        ? <MarketComparison key={submittedMarket+range} market={submittedMarket} range={range} selection={selection} primarySymbol={submittedSymbol} primaryHistory={history} primaryLoading={loading}/>
        : <div className="insight-chart">
        {chartIsLoading ? (
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
                  preserveAspectRatio="none"
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
                      left: `clamp(6px, ${(hoverPosition.x / chartWidth) * 100}%, calc(100% - 166px))`,
                      top: `clamp(6px, ${(hoverPosition.y / chartHeight) * 100}%, calc(100% - 100px))`,
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
                {benchmarkComparisonLabel}
              </span>
              <span>{benchmarkFooterLabel}</span>
            </div>

            <div className="market-chart__x-axis">
              {xTickIndexes.map((index) => {
                const point = displayPoints[index];
                if (!point) {
                  return null;
                }

                return (
                  <span key={point.date} style={{ left: `${((lineChart.points[index]?.x ?? 0) / chartWidth) * 100}%` }}>
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
            <p>Choose an asset from the Assets dropdown.</p>
          </div>
        )}
      </div>}

      {selection.map(asset => <MarketAssetNews key={submittedMarket+asset.symbol} symbol={asset.symbol} market={submittedMarket}
        name={portfolioAssetsForSelectedMarket.find(a => normalizeMarketSymbol(a.investmentSymbol ?? "") === asset.symbol)?.name ?? POPULAR_TICKERS[submittedMarket].find(a => a.symbol === asset.symbol)?.name ?? asset.symbol} />)}
      <section className="investments-market-insights" aria-label="Market insights">
        <div className="investments-market-insights__head">
          <div>
            <h3 className="reports-subtab-title">Market Insights</h3>
            <div className="investment-market-identity">
              {submittedSymbol ? <AccountBrandMark accountBrand={getInvestmentAssetBrand({ symbol: submittedSymbol, market: submittedMarket, subtype: submittedMarket === "crypto" ? "crypto" : "stock" })} label={submittedSymbol} /> : null}
              {submittedSymbol ? <p>{submittedSymbol} at a glance</p> : null}
            </div>
          </div>
          <div className="investments-market-insights__links">
            {externalMarketUrl ? (
              <a href={externalMarketUrl} target="_blank" rel="noreferrer">
                Open market page
              </a>
            ) : null}
            {onOpenPortfolio ? (
              <button type="button" onClick={onOpenPortfolio}>
                Review portfolio
              </button>
            ) : null}
          </div>
        </div>
        {submittedSymbol && displayPoints.length > 1 ? (
          <div className="investments-market-insights__grid">
            <article>
              <span>Price direction</span>
              <strong className={priceChangePercent !== null && priceChangePercent >= 0 ? "is-positive" : "is-negative"}>
                {priceChangePercent === null ? "Not enough data" : `${priceChangePercent >= 0 ? "+" : "-"}${percentFormatter.format(Math.abs(priceChangePercent))}`}
              </strong>
              <small>Across the selected {range} range</small>
            </article>
            <article>
              <span>Trading range</span>
              <strong>{rangeLow === null || rangeHigh === null ? "—" : `${formatAmount(rangeLow)} – ${formatAmount(rangeHigh)}`}</strong>
              <small>Lowest to highest visible price</small>
            </article>
            <article>
              <span>Latest activity</span>
              <strong>{latestVolume === null ? "Not available" : volumeFormatter.format(latestVolume)}</strong>
              <small>{latestVolume === null ? "Volume is not supplied for this market" : "Latest recorded volume"}</small>
            </article>
            <article>
              <span>Portfolio connection</span>
              <strong>{selectedPortfolioAsset?.name ?? "Watchlist only"}</strong>
              <small>{selectedPortfolioAsset ? "This ticker is in your portfolio" : "Add it to a holding if you own it"}</small>
            </article>
          </div>
        ) : (
          <div className="investments-market-insights__grid">
            <article>
              <span>Largest trackable holding</span>
              <strong>{portfolioAssetsForSelectedMarket[0]?.name ?? "No tracked market assets"}</strong>
              <small>{portfolioAssetsForSelectedMarket[0]?.investmentSymbol?.trim() || "Add a ticker to follow its movement"}</small>
            </article>
            <article>
              <span>Tickers ready</span>
              <strong>{portfolioAssetsForSelectedMarket.length - missingTickerCount}</strong>
              <small>Portfolio assets Clover can compare with market data</small>
            </article>
            <article>
              <span>Needs attention</span>
              <strong>{missingTickerCount}</strong>
              <small>{missingTickerCount === 1 ? "Holding is missing a ticker" : "Holdings are missing tickers"}</small>
            </article>
          </div>
        )}
      </section>

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
            investmentAccounts.find(
              (account) =>
                getMarketForInvestment(account) === submittedMarket &&
                normalizeMarketSymbol(account.investmentSymbol ?? "") === submittedSymbol
            )?.investmentSubtype
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

function MarketComparison({ selection, market, range, primarySymbol, primaryHistory, primaryLoading }: { selection: SelectedTicker[]; market: MarketKey; range: MarketRange; primarySymbol:string; primaryHistory:MarketHistoryResponse | null; primaryLoading:boolean }) {
  const [rows, setRows] = useState<Record<string, MarketHistoryPoint[] | null>>({});
  useEffect(() => {
    const controller = new AbortController();
    async function load(symbol: string, refresh = false) {
      const cached = readCachedMarketHistory(symbol, market, range);
      const currency = market === "ph" ? "PHP" : "USD";
      let points = cached?.payload.currency === currency ? filterMarketHistoryByRange(cached.payload.points, range) : null;
      if (!cached || refresh) {
        try {
          const response = await fetch(`/api/market-history?${new URLSearchParams({symbol, market, range})}`, {signal:controller.signal});
          if (!response.ok) throw new Error();
          const history: MarketHistoryResponse = await response.json();
          points = history.currency === currency ? filterMarketHistoryByRange(history.points, range) : null;
          writeCachedMarketHistory(history);
        } catch { points = null; }
      }
      if (!controller.signal.aborted) setRows(current => ({...current, [symbol]:points}));
    }
    const others = selection.filter(s => s.symbol !== primarySymbol);
    others.forEach(s => void load(s.symbol));
    const unregister = registerPullRefresh(async () => { await Promise.all(others.map(s=>load(s.symbol,true))); });
    return () => {controller.abort(); unregister();};
  }, [market, range, selection, primarySymbol]);
  const primary = primaryHistory?.symbol === primarySymbol && primaryHistory.market === market &&
    primaryHistory.currency === (market === "ph" ? "PHP" : "USD") ? filterMarketHistoryByRange(primaryHistory.points, range) : null;
  const visible = {...rows, [primarySymbol]: primaryLoading ? undefined : primary};
  const series = selection.map(s=>({name:s.symbol, color:s.color, points:visible[s.symbol] ?? []}));
  return <div className="insight-chart">
    <h3>Price history · {market === "ph" ? "PHP" : "USD"}</h3>
    {series.some(s=>s.points.length) && <ReportsComparisonChart series={series} currency={market === "ph" ? "PHP" : "USD"}/>}
    {selection.filter(s=>!visible[s.symbol]?.length).map(s=><p key={s.symbol}>{s.symbol} · {visible[s.symbol] === undefined ? "Loading history…" : "No history available"}</p>)}
  </div>;
}
