import type { MarketHistoryPoint, MarketRegion } from "@/lib/market-data";

export type PortfolioGrowthAsset = {
  id: string;
  name: string;
  symbol: string;
  market: MarketRegion;
  units: number;
  currency: string;
};

export type PortfolioGrowthHistory = {
  assetId: string;
  currency: string;
  points: MarketHistoryPoint[];
};

export const getPortfolioGrowthMarket = (subtype: string | null, currency: string): MarketRegion => {
  if (subtype === "crypto") return "crypto";
  return currency.trim().toUpperCase() === "PHP" ? "ph" : "us";
};

const toPriceMap = (points: MarketHistoryPoint[], granularity: "daily" | "timestamp") => {
  const prices = new Map<string, number>();
  for (const point of points) {
    const timestamp = new Date(point.date).getTime();
    if (!Number.isFinite(timestamp) || !Number.isFinite(point.value) || point.value < 0) continue;
    const iso = new Date(timestamp).toISOString();
    prices.set(granularity === "timestamp" ? iso : iso.slice(0, 10), point.value);
  }
  return prices;
};

export const buildPortfolioGrowthSeries = ({
  assets,
  histories,
  exchangeRates,
  granularity = "daily",
}: {
  assets: PortfolioGrowthAsset[];
  histories: PortfolioGrowthHistory[];
  exchangeRates: Record<string, number>;
  granularity?: "daily" | "timestamp";
}) => {
  const historyByAsset = new Map(histories.map((history) => [history.assetId, history]));
  const usable = assets
    .map((asset) => {
      const history = historyByAsset.get(asset.id);
      const rate = exchangeRates[history?.currency.trim().toUpperCase() ?? ""];
      const daily = history ? toPriceMap(history.points, granularity) : new Map<string, number>();
      const dates = [...daily.keys()].sort();
      if (!history || daily.size === 0 || !Number.isFinite(rate) || rate <= 0 || asset.units <= 0) return null;
      return { asset, daily, dates, rate };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  if (usable.length === 0) return [];

  // Start only once every selected holding has a price so totals never mix partial portfolios.
  const firstSharedDate = usable.reduce(
    (latest, entry) => (entry.dates[0] > latest ? entry.dates[0] : latest),
    usable[0].dates[0]
  );
  const lastSharedDate = usable.reduce(
    (earliest, entry) => (entry.dates[entry.dates.length - 1] < earliest ? entry.dates[entry.dates.length - 1] : earliest),
    usable[0].dates[usable[0].dates.length - 1]
  );
  if (firstSharedDate > lastSharedDate) return [];

  const dates = Array.from(
    new Set(usable.flatMap((entry) => entry.dates.filter((date) => date >= firstSharedDate && date <= lastSharedDate)))
  ).sort();
  const latestPriceByAsset = new Map<string, number>();
  for (const entry of usable) {
    const seedDates = entry.dates.filter((date) => date <= firstSharedDate);
    const seedDate = seedDates[seedDates.length - 1];
    const seedPrice = seedDate ? entry.daily.get(seedDate) : undefined;
    if (seedPrice !== undefined) latestPriceByAsset.set(entry.asset.id, seedPrice);
  }

  // Carry the last daily close through weekends and exchange-specific holidays.
  return dates.flatMap((date) => {
    let value = 0;
    for (const entry of usable) {
      const price = entry.daily.get(date);
      if (price !== undefined) latestPriceByAsset.set(entry.asset.id, price);
      const latestPrice = latestPriceByAsset.get(entry.asset.id);
      if (latestPrice === undefined) return [];
      value += latestPrice * entry.asset.units * entry.rate;
    }
    return [{ date, value }];
  });
};
