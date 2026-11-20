export type MarketRange = "1D" | "5D" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "5Y" | "MAX";

export type MarketHistoryPoint = {
  date: string;
  value: number;
  volume?: number | null;
};

const RANGE_TO_MS: Record<Exclude<MarketRange, "MAX">, number> = {
  "1D": 24 * 60 * 60 * 1000,
  "5D": 5 * 24 * 60 * 60 * 1000,
  "1M": 31 * 24 * 60 * 60 * 1000,
  "3M": 92 * 24 * 60 * 60 * 1000,
  "6M": 183 * 24 * 60 * 60 * 1000,
  YTD: 366 * 24 * 60 * 60 * 1000,
  "1Y": 365 * 24 * 60 * 60 * 1000,
  "5Y": 365 * 5 * 24 * 60 * 60 * 1000,
};

export const filterMarketHistoryByRange = (points: MarketHistoryPoint[], range: MarketRange) => {
  if (points.length === 0 || range === "MAX") {
    return points;
  }

  const span = RANGE_TO_MS[range];
  const latestDate = new Date(points[points.length - 1].date);
  const cutoff = new Date(latestDate);
  cutoff.setTime(cutoff.getTime() - span);

  const filtered = points.filter((point) => new Date(point.date) >= cutoff);
  return filtered.length > 0 ? filtered : points.slice(-Math.min(points.length, 30));
};
