export type MarketAssetType = "equity" | "crypto";

export type MarketRange = "1M" | "3M" | "6M" | "1Y" | "5Y" | "MAX";

export type MarketHistoryPoint = {
  date: string;
  value: number;
};

export const MARKET_RANGES: Array<{ key: MarketRange; label: string }> = [
  { key: "1M", label: "1M" },
  { key: "3M", label: "3M" },
  { key: "6M", label: "6M" },
  { key: "1Y", label: "1Y" },
  { key: "5Y", label: "5Y" },
  { key: "MAX", label: "Max" },
];

const RANGE_TO_DAYS: Record<Exclude<MarketRange, "MAX">, number> = {
  "1M": 31,
  "3M": 92,
  "6M": 183,
  "1Y": 365,
  "5Y": 365 * 5,
};

export const normalizeMarketSymbol = (value: string) => value.trim().toUpperCase();

export const buildMarketLinePath = (
  points: MarketHistoryPoint[],
  chartWidth: number,
  chartHeight: number,
  chartPadding: number
) => {
  if (points.length === 0) {
    return { points: [] as Array<{ x: number; y: number; date: string; value: number }>, linePath: "" };
  }

  const minValue = Math.min(...points.map((point) => point.value));
  const maxValue = Math.max(...points.map((point) => point.value));
  const range = Math.max(maxValue - minValue, 1);
  const xSpan = chartWidth - chartPadding * 2;
  const ySpan = chartHeight - chartPadding * 2;

  const renderedPoints = points.map((point, index) => {
    const x = chartPadding + (index / Math.max(points.length - 1, 1)) * xSpan;
    const normalized = (point.value - minValue) / range;
    const y = chartPadding + (1 - normalized) * ySpan;
    return { ...point, x, y };
  });

  const linePath = renderedPoints.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  return { points: renderedPoints, linePath };
};

export const filterMarketHistoryByRange = (points: MarketHistoryPoint[], range: MarketRange) => {
  if (points.length === 0 || range === "MAX") {
    return points;
  }

  const days = RANGE_TO_DAYS[range];
  const latestDate = new Date(points[points.length - 1].date);
  const cutoff = new Date(latestDate);
  cutoff.setDate(cutoff.getDate() - days);

  const filtered = points.filter((point) => new Date(point.date) >= cutoff);
  return filtered.length > 0 ? filtered : points.slice(-Math.min(points.length, 30));
};

