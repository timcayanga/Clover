"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildMarketLinePath,
  findClosestMarketPointIndex,
  MARKET_RANGES,
  type MarketHistoryPoint,
  type MarketRange,
  type MarketRegion,
} from "@/lib/market-data";
import {
  buildPortfolioGrowthSeries,
  type PortfolioGrowthAsset,
  type PortfolioGrowthHistory,
} from "@/lib/investment-portfolio-growth";
import { formatCurrencyAmount, formatCurrencyCode } from "@/lib/currency-format";
import { useExchangeRates } from "@/lib/use-exchange-rates";

type MarketHistoryResponse = {
  currency: string;
  points: MarketHistoryPoint[];
  error?: string;
};

type Props = {
  assets: PortfolioGrowthAsset[];
  currency: string;
};

const chartWidth = 920;
const chartHeight = 250;
const chartPadding = 30;
const historyCache = new Map<string, MarketHistoryResponse>();

const historyKey = (asset: PortfolioGrowthAsset, range: MarketRange) => `${asset.market}:${asset.symbol}:${range}`;

const formatChartDate = (date: string, range: MarketRange) =>
  range === "1D"
    ? new Date(date).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })
    : new Date(`${date}T12:00:00Z`).toLocaleDateString("en-PH", {
        month: "short",
        day: "numeric",
        ...(range === "5Y" || range === "MAX" ? { year: "numeric" } : {}),
      });

const loadAssetHistory = async (asset: PortfolioGrowthAsset, range: MarketRange, signal: AbortSignal) => {
  const key = historyKey(asset, range);
  const cached = historyCache.get(key);
  if (cached) return cached;
  const response = await fetch(
    `/api/market-history?symbol=${encodeURIComponent(asset.symbol)}&market=${encodeURIComponent(asset.market)}&range=${encodeURIComponent(range)}`,
    { signal }
  );
  const payload = (await response.json()) as MarketHistoryResponse;
  if (!response.ok) throw new Error(payload.error ?? `Market history is unavailable for ${asset.name}.`);
  historyCache.set(key, payload);
  return payload;
};

export function InvestmentPortfolioGrowthChart({ assets, currency }: Props) {
  const currencyCode = formatCurrencyCode(currency) || "PHP";
  const [range, setRange] = useState<MarketRange>("MAX");
  const [selectedIds, setSelectedIds] = useState<string[]>(() => assets.map((asset) => asset.id));
  const [histories, setHistories] = useState<PortfolioGrowthHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const chartRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    setSelectedIds((current) => {
      const valid = current.filter((id) => assets.some((asset) => asset.id === id));
      return valid.length > 0 ? valid : assets.map((asset) => asset.id);
    });
  }, [assets]);

  const selectedAssets = useMemo(
    () => assets.filter((asset) => selectedIds.includes(asset.id)),
    [assets, selectedIds]
  );

  useEffect(() => {
    if (selectedAssets.length === 0) {
      setHistories([]);
      setError("");
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError("");
    void Promise.allSettled(selectedAssets.map((asset) => loadAssetHistory(asset, range, controller.signal)))
      .then((results) => {
        if (cancelled) return;
        const loaded: PortfolioGrowthHistory[] = [];
        const unavailable: string[] = [];
        results.forEach((result, index) => {
          const asset = selectedAssets[index];
          if (result.status === "fulfilled") {
            loaded.push({ assetId: asset.id, currency: result.value.currency, points: result.value.points });
          } else if (result.reason?.name !== "AbortError") {
            unavailable.push(asset.name);
          }
        });
        setHistories(loaded);
        setError(unavailable.length > 0 ? `No market history yet for ${unavailable.join(", ")}.` : "");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [range, selectedAssets]);

  const sourceCurrencies = useMemo(() => histories.map((history) => history.currency), [histories]);
  const exchangeRates = useExchangeRates(sourceCurrencies, currencyCode, histories.length > 0);
  const points = useMemo(
    () => histories.length === selectedAssets.length && exchangeRates.unavailable.length === 0
      ?
      buildPortfolioGrowthSeries({
        assets: selectedAssets,
        histories,
        exchangeRates: exchangeRates.rates,
        granularity: range === "1D" ? "timestamp" : "daily",
      })
      : [],
    [exchangeRates.rates, exchangeRates.unavailable.length, histories, range, selectedAssets]
  );
  const firstPoint = points[0] ?? null;
  const latestPoint = points[points.length - 1] ?? null;
  const change = firstPoint && latestPoint ? latestPoint.value - firstPoint.value : 0;
  const positive = change >= 0;
  const tone = positive ? "positive" : "negative";
  const minValue = points.length > 0 ? Math.min(...points.map((point) => point.value)) : 0;
  const maxValue = points.length > 0 ? Math.max(...points.map((point) => point.value)) : 0;
  const pad = Math.max((maxValue - minValue) * 0.08, maxValue * 0.005, 1);
  const chart = useMemo(
    () =>
      buildMarketLinePath(points, chartWidth, chartHeight, chartPadding, {
        minValue: Math.max(0, minValue - pad),
        maxValue: maxValue + pad,
      }),
    [maxValue, minValue, pad, points]
  );
  const hovered = hoverIndex === null ? null : chart.points[hoverIndex] ?? null;
  const tickIndexes = useMemo(() => {
    if (points.length <= 1) return [0];
    return [...new Set(Array.from({ length: Math.min(points.length, 6) }, (_, index) =>
      Math.round((index * (points.length - 1)) / Math.max(Math.min(points.length, 6) - 1, 1))
    ))];
  }, [points.length]);

  const toggleAsset = (id: string) => {
    setSelectedIds((current) => {
      if (current.includes(id)) {
        return current.length === 1 ? current : current.filter((value) => value !== id);
      }
      return [...current, id];
    });
    setHoverIndex(null);
  };

  const handlePointerMove = (clientX: number) => {
    const rect = chartRef.current?.getBoundingClientRect();
    if (!rect || chart.points.length === 0) return;
    const chartX = Math.min(Math.max(((clientX - rect.left) / rect.width) * chartWidth, 0), chartWidth);
    setHoverIndex(findClosestMarketPointIndex(chart.points, chartX));
  };

  if (assets.length === 0) {
    return (
      <div className="investments-growth-chart__empty">
        <strong>Add ticker symbols and units to track investment growth.</strong>
        <span>Clover only charts holdings that have enough recorded data for a reliable market valuation.</span>
      </div>
    );
  }

  return (
    <div className={`portfolio-growth portfolio-growth--${tone}`}>
      <div className="portfolio-growth__controls">
        <details className="portfolio-growth__asset-picker">
          <summary aria-label="Choose investments for the growth chart">
            <span>Investments</span>
            <span>{selectedIds.length} selected</span>
          </summary>
          <div className="portfolio-growth__asset-options" role="group" aria-label="Investments included in growth chart">
            {assets.map((asset) => (
              <label key={asset.id} className="portfolio-growth__asset-option">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(asset.id)}
                  onChange={() => toggleAsset(asset.id)}
                />
                <span>{asset.symbol}</span>
                <small>{asset.name}</small>
              </label>
            ))}
          </div>
        </details>
        <div className="portfolio-growth__ranges" aria-label="Investment growth period">
          {MARKET_RANGES.map((option) => (
            <button
              key={option.key}
              type="button"
              className={range === option.key ? "is-active" : ""}
              aria-pressed={range === option.key}
              onClick={() => {
                setRange(option.key);
                setHoverIndex(null);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="portfolio-growth__summary" aria-live="polite">
        <span>{hovered ? formatChartDate(hovered.date, range) : "Selected portfolio"}</span>
        <strong>{hovered || latestPoint ? formatCurrencyAmount((hovered ?? latestPoint)?.value ?? 0, currencyCode) : "—"}</strong>
        {points.length > 1 ? (
          <em className={positive ? "is-good" : "is-danger"}>
            {change >= 0 ? "+" : ""}{formatCurrencyAmount(change, currencyCode)}
          </em>
        ) : null}
      </div>

      {loading || exchangeRates.loading ? (
        <div className="portfolio-growth__state">Loading daily market prices...</div>
      ) : points.length < 2 ? (
        <div className="portfolio-growth__state">
          <strong>More price history is needed for this selection.</strong>
          <span>Try a longer period or select another holding.</span>
        </div>
      ) : (
        <div className="portfolio-growth__plot">
          <svg
            ref={chartRef}
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`${range} portfolio value chart`}
            onPointerMove={(event) => handlePointerMove(event.clientX)}
            onPointerLeave={() => setHoverIndex(null)}
            onTouchMove={(event) => handlePointerMove(event.touches[0]?.clientX ?? 0)}
          >
            <defs>
              <linearGradient id={`portfolio-growth-fill-${tone}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={positive ? "rgba(34, 197, 94, 0.22)" : "rgba(239, 68, 68, 0.2)"} />
                <stop offset="100%" stopColor={positive ? "rgba(34, 197, 94, 0.01)" : "rgba(239, 68, 68, 0.01)"} />
              </linearGradient>
            </defs>
            {chart.linePath ? (
              <path
                d={`${chart.linePath} L ${chart.points[chart.points.length - 1].x} ${chartHeight - chartPadding} L ${chart.points[0].x} ${chartHeight - chartPadding} Z`}
                fill={`url(#portfolio-growth-fill-${tone})`}
              />
            ) : null}
            <path className="portfolio-growth__line" d={chart.linePath} fill="none" />
            {hovered ? (
              <>
                <line className="portfolio-growth__hover-line" x1={hovered.x} x2={hovered.x} y1={chartPadding} y2={chartHeight - chartPadding} />
                <circle className="portfolio-growth__hover-dot" cx={hovered.x} cy={hovered.y} r="5" />
              </>
            ) : null}
          </svg>
          <div className="portfolio-growth__axis" aria-hidden="true">
            {tickIndexes.map((index) => <span key={points[index]?.date}>{formatChartDate(points[index]?.date ?? "", range)}</span>)}
          </div>
        </div>
      )}
      {error ? <p className="portfolio-growth__notice">{error}</p> : null}
      {exchangeRates.unavailable.length > 0 ? (
        <p className="portfolio-growth__notice">Currency conversion is unavailable for part of this chart.</p>
      ) : null}
      <p className="portfolio-growth__method">Daily closing prices × recorded units. Historical values use the latest recorded units for each selected holding.</p>
    </div>
  );
}
