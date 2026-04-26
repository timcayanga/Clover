"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  buildMarketLinePath,
  filterMarketHistoryByRange,
  MARKET_RANGES,
  normalizeMarketSymbol,
  type MarketAssetType,
  type MarketHistoryPoint,
  type MarketRange,
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
  assetType: MarketAssetType;
  provider: "alpha-vantage" | "yahoo-finance";
  points: MarketHistoryPoint[];
  latest: MarketHistoryPoint;
  previous: MarketHistoryPoint;
  change: number;
  changePercent: number;
  error?: string;
};

type CurrencyCode = "USD" | "PHP";

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

const formatAxisDate = (value: string, range: MarketRange) => {
  const date = new Date(value);

  if (range === "5Y" || range === "MAX") {
    return date.toLocaleDateString("en-PH", { year: "numeric" });
  }

  if (range === "1Y") {
    return date.toLocaleDateString("en-PH", { month: "short", year: "2-digit" });
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

const formatShortDate = (value: string) =>
  new Date(value).toLocaleDateString("en-PH", {
    month: "short",
    day: "2-digit",
  });

const inferAssetType = (subtype: string | null | undefined): MarketAssetType => {
  if (subtype && subtype === "crypto") {
    return "crypto";
  }

  return "equity";
};

export function InvestmentMarketChart({ investmentAccounts }: InvestmentMarketChartProps) {
  const tickerSuggestions = useMemo(() => {
    const seen = new Set<string>();
    return investmentAccounts
      .filter((account) => isMarketInvestmentSubtype(account.investmentSubtype) || account.investmentSubtype === "other")
      .map((account) => {
        const symbol = normalizeMarketSymbol(account.investmentSymbol ?? "");
        if (!symbol || seen.has(symbol)) {
          return null;
        }

        seen.add(symbol);
        return {
          id: account.id,
          name: account.name,
          symbol,
          subtype: account.investmentSubtype,
        };
      })
      .filter((entry): entry is { id: string; name: string; symbol: string; subtype: string | null } => entry !== null);
  }, [investmentAccounts]);

  const defaultSuggestion = tickerSuggestions[0] ?? null;
  const [tickerInput, setTickerInput] = useState(defaultSuggestion?.symbol ?? "");
  const [assetType, setAssetType] = useState<MarketAssetType>(inferAssetType(defaultSuggestion?.subtype));
  const [range, setRange] = useState<MarketRange>("1Y");
  const [submittedSymbol, setSubmittedSymbol] = useState(defaultSuggestion?.symbol ?? "");
  const [submittedAssetType, setSubmittedAssetType] = useState<MarketAssetType>(inferAssetType(defaultSuggestion?.subtype));
  const [history, setHistory] = useState<MarketHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>("USD");
  const [exchangeRate, setExchangeRate] = useState(1);
  const [rateError, setRateError] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!submittedSymbol && defaultSuggestion) {
      setTickerInput(defaultSuggestion.symbol);
      setAssetType(inferAssetType(defaultSuggestion.subtype));
      setSubmittedSymbol(defaultSuggestion.symbol);
      setSubmittedAssetType(inferAssetType(defaultSuggestion.subtype));
    }
  }, [defaultSuggestion, submittedSymbol]);

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
          `/api/market-history?symbol=${encodeURIComponent(submittedSymbol)}&assetType=${encodeURIComponent(submittedAssetType)}`,
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
    }, 350);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [refreshTick, submittedAssetType, submittedSymbol]);

  useEffect(() => {
    let cancelled = false;

    const loadExchangeRate = async () => {
      if (displayCurrency === "USD") {
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
  }, [displayCurrency]);

  const visiblePoints = useMemo(() => {
    if (!history) {
      return [];
    }

    return filterMarketHistoryByRange(history.points, range);
  }, [history, range]);

  const displayPoints = useMemo(
    () => visiblePoints.map((point) => ({ ...point, value: point.value * exchangeRate })),
    [exchangeRate, visiblePoints]
  );

  const lineChart = useMemo(() => buildMarketLinePath(displayPoints, chartWidth, chartHeight, chartPadding), [displayPoints]);
  const currentDisplayPoint = displayPoints[displayPoints.length - 1] ?? null;
  const firstDisplayPoint = displayPoints[0] ?? null;
  const priceChange = currentDisplayPoint && firstDisplayPoint ? currentDisplayPoint.value - firstDisplayPoint.value : null;
  const priceChangePercent =
    currentDisplayPoint && firstDisplayPoint && firstDisplayPoint.value !== 0 ? (priceChange ?? 0) / firstDisplayPoint.value : null;
  const minDisplayValue = displayPoints.length > 0 ? Math.min(...displayPoints.map((point) => point.value)) : 0;
  const maxDisplayValue = displayPoints.length > 0 ? Math.max(...displayPoints.map((point) => point.value)) : 0;
  const yTicks = useMemo(() => buildTicks(minDisplayValue, maxDisplayValue), [maxDisplayValue, minDisplayValue]);
  const xTickIndexes = useMemo(() => {
    if (displayPoints.length <= 1) {
      return [0];
    }

    const desiredTicks = Math.min(5, displayPoints.length);
    const indexes = Array.from({ length: desiredTicks }, (_, index) =>
      Math.round((index * (displayPoints.length - 1)) / Math.max(desiredTicks - 1, 1))
    );
    return [...new Set(indexes)];
  }, [displayPoints.length]);

  const hoveredPoint = hoverIndex === null ? null : displayPoints[hoverIndex] ?? null;

  const selectSuggestion = (suggestion: (typeof tickerSuggestions)[number]) => {
    setTickerInput(suggestion.symbol);
    setAssetType(inferAssetType(suggestion.subtype));
    setSubmittedSymbol(suggestion.symbol);
    setSubmittedAssetType(inferAssetType(suggestion.subtype));
  };

  const formatAmount = (value: number) => currencyFormatters[displayCurrency].format(value);
  const chartSubtitle = displayCurrency === "PHP" ? "Converted from USD using the latest FX rate." : "Prices are shown in USD.";
  const chartError = rateError ?? error;
  const sourceLabel = history?.provider === "alpha-vantage" ? "Alpha Vantage" : "Yahoo Finance";

  return (
    <section className="investments-market glass">
      <div className="investments-market__head">
        <div>
          <p className="eyebrow">Market tracker</p>
          <h3>Track a ticker</h3>
        </div>
        <div className="investments-market__controls">
          <label>
            Ticker
            <input
              list="investment-market-symbols"
              value={tickerInput}
              onChange={(event) => setTickerInput(event.target.value.toUpperCase())}
              onBlur={() => {
                const next = normalizeMarketSymbol(tickerInput);
                if (next) {
                  setTickerInput(next);
                }
              }}
              placeholder="AAPL, QQQ, BTC"
            />
          </label>
          <label>
            Asset type
            <select value={assetType} onChange={(event) => setAssetType(event.target.value as MarketAssetType)}>
              <option value="equity">Equity / fund</option>
              <option value="crypto">Crypto</option>
            </select>
          </label>
          <label className="investments-market__currency-select">
            Currency
            <select value={displayCurrency} onChange={(event) => setDisplayCurrency(event.target.value as CurrencyCode)}>
              <option value="USD">USD</option>
              <option value="PHP">PHP</option>
            </select>
          </label>
          <button
            className="button button-primary"
            type="button"
            onClick={() => {
              const next = normalizeMarketSymbol(tickerInput);
              setSubmittedSymbol(next);
              setSubmittedAssetType(assetType);
            }}
            disabled={!normalizeMarketSymbol(tickerInput)}
          >
            Load ticker
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => setRefreshTick((value) => value + 1)}
            disabled={!submittedSymbol || loading}
          >
            Refresh
          </button>
        </div>
      </div>

      <datalist id="investment-market-symbols">
        {tickerSuggestions.map((suggestion) => (
          <option key={suggestion.id} value={suggestion.symbol}>
            {suggestion.name}
          </option>
        ))}
      </datalist>

      <div className="investments-market__chips">
        {tickerSuggestions.length > 0 ? (
          tickerSuggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              className={`button button-small ${suggestion.symbol === submittedSymbol ? "button-primary" : "button-secondary"}`}
              type="button"
              onClick={() => selectSuggestion(suggestion)}
            >
              {suggestion.symbol}
            </button>
          ))
        ) : (
          <p className="panel-muted">Add a symbol to an investment account to make it appear here as a quick tracker.</p>
        )}
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
            <div className="market-chart__y-axis">
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
                    <stop offset="0%" stopColor="rgba(3, 168, 192, 0.24)" />
                    <stop offset="100%" stopColor="rgba(3, 168, 192, 0.03)" />
                  </linearGradient>
                </defs>
                <path
                  d={`${lineChart.linePath} L ${lineChart.points[lineChart.points.length - 1].x.toFixed(1)} ${chartHeight - chartPadding} L ${lineChart.points[0].x.toFixed(1)} ${chartHeight - chartPadding} Z`}
                  fill="url(#market-chart-fill)"
                />
                <path d={lineChart.linePath} fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                {lineChart.points.map((point) => (
                  <circle key={`${point.date}-${point.value}`} cx={point.x} cy={point.y} r="3.5" fill="white" stroke="var(--accent)" strokeWidth="2" />
                ))}
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
                    top: `${clamp(hoverPosition.y - 92, 6, chartHeight - 92)}px`,
                  }}
                >
                  <strong>{formatShortDate(hoveredPoint.date)}</strong>
                  <span>{formatAmount(hoveredPoint.value)}</span>
                  <small>{displayCurrency} equivalent</small>
                </div>
              ) : null}
            </div>

            <div className="market-chart__x-axis">
              {xTickIndexes.map((index) => {
                const point = displayPoints[index];
                if (!point) {
                  return null;
                }

                return (
                  <span key={point.date} style={{ left: `${lineChart.points[index]?.x ?? 0}px` }}>
                    {formatAxisDate(point.date, range)}
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
            <p>Use one of the chips below, or type your own symbol and choose equity or crypto.</p>
          </div>
        )}
      </div>

      <p className="investments-market__disclaimer panel-muted">
        Market prices can differ by broker or exchange. Use Clover as a ballpark estimate and rely on the actual platform price for final decisions.
      </p>

      {history && displayPoints.length > 1 ? (
        <div className="investments-market__footnote">
          <span>
            Source: {sourceLabel}, using {submittedAssetType === "crypto" ? "daily crypto history" : "daily market history"}.
          </span>
          <span>
            {lastUpdatedAt ? `Updated ${formatRelativeTime(lastUpdatedAt)}` : "Waiting for first refresh"}
            {displayCurrency === "PHP" ? ` · FX ${exchangeRate.toFixed(2)} PHP/USD` : ""}
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
