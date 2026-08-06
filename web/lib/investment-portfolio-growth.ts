import type { MarketHistoryPoint, MarketRegion } from "@/lib/market-data";

export type PortfolioGrowthAsset = {
  id: string;
  name: string;
  symbol: string;
  market: MarketRegion;
  units: number;
  currency: string;
  startDate?: string | null;
  unitActivities?: PortfolioGrowthUnitActivity[];
};

export type PortfolioGrowthUnitActivity = {
  date: string;
  unitsDelta: number;
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

const buildDailyDateRange = (start: string, end: string) => {
  const dates: string[] = [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
};

const normalizeActivityDate = (value: string) => {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
};

const buildUnitLedger = (asset: PortfolioGrowthAsset) => {
  const changesByDate = new Map<string, number>();
  for (const activity of asset.unitActivities ?? []) {
    const date = normalizeActivityDate(activity.date);
    if (!date || !Number.isFinite(activity.unitsDelta) || activity.unitsDelta === 0) continue;
    changesByDate.set(date, (changesByDate.get(date) ?? 0) + activity.unitsDelta);
  }
  const totalRecordedChange = [...changesByDate.values()].reduce((sum, change) => sum + change, 0);
  // Reconcile the ledger to the current holding. Any unexplained units become a
  // pre-history baseline rather than being duplicated across dated activity.
  const baselineUnits = Math.max(0, asset.units - totalRecordedChange);
  const activityDates = [...changesByDate.keys()].sort();
  return { baselineUnits, changesByDate, activityDates };
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
      const unitLedger = buildUnitLedger(asset);
      if (
        !history ||
        daily.size === 0 ||
        !Number.isFinite(rate) ||
        rate <= 0 ||
        (asset.units <= 0 && unitLedger.activityDates.length === 0)
      ) return null;
      const parsedStartDate = asset.startDate ? new Date(asset.startDate) : null;
      const startDate = parsedStartDate && Number.isFinite(parsedStartDate.getTime())
        ? parsedStartDate.toISOString().slice(0, granularity === "timestamp" ? undefined : 10)
        : null;
      const firstUnitDate = unitLedger.baselineUnits > 0
        ? startDate
        : unitLedger.activityDates.find((date) => (unitLedger.changesByDate.get(date) ?? 0) > 0) ?? startDate;
      return { asset, daily, dates, rate, startDate: firstUnitDate, unitLedger };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  if (usable.length === 0) return [];

  const recordedStartDates = usable.map((entry) => entry.startDate).filter((date): date is string => Boolean(date));
  const firstRecordedActivity = recordedStartDates.sort()[0] ?? null;
  // Prefer the user's recorded activity period. Market history still bounds the
  // chart when no selected provider has prices as far back as the first trade.
  const earliestMarketDate = usable.reduce(
    (earliest, entry) => entry.dates[0] < earliest ? entry.dates[0] : earliest,
    usable[0].dates[0]
  );
  const firstSharedDate = firstRecordedActivity
    ? (earliestMarketDate > firstRecordedActivity ? earliestMarketDate : firstRecordedActivity)
    : usable.reduce(
        (latest, entry) => (entry.dates[0] > latest ? entry.dates[0] : latest),
        usable[0].dates[0]
      );
  const lastSharedDate = usable.reduce(
    (earliest, entry) => (entry.dates[entry.dates.length - 1] < earliest ? entry.dates[entry.dates.length - 1] : earliest),
    usable[0].dates[usable[0].dates.length - 1]
  );
  if (firstSharedDate > lastSharedDate) return [];

  const dates = granularity === "daily"
    ? buildDailyDateRange(firstSharedDate, lastSharedDate)
    : Array.from(
        new Set(usable.flatMap((entry) => entry.dates.filter((date) => date >= firstSharedDate && date <= lastSharedDate)))
      ).sort();
  const latestPriceByAsset = new Map<string, number>();
  const unitsByAsset = new Map<string, number>();
  const appliedActivityDatesByAsset = new Map<string, Set<string>>();
  for (const entry of usable) {
    let units = entry.unitLedger.baselineUnits;
    const appliedDates = new Set<string>();
    for (const activityDate of entry.unitLedger.activityDates) {
      if (activityDate >= firstSharedDate.slice(0, 10)) continue;
      units = Math.max(0, units + (entry.unitLedger.changesByDate.get(activityDate) ?? 0));
      appliedDates.add(activityDate);
    }
    unitsByAsset.set(entry.asset.id, units);
    appliedActivityDatesByAsset.set(entry.asset.id, appliedDates);
  }
  for (const entry of usable) {
    const seedDates = entry.dates.filter((date) => date <= firstSharedDate);
    const seedDate = seedDates[seedDates.length - 1];
    const seedPrice = seedDate ? entry.daily.get(seedDate) : undefined;
    if (seedPrice !== undefined) latestPriceByAsset.set(entry.asset.id, seedPrice);
  }

  let hasPositionStarted = false;
  // Carry the last daily close through weekends and exchange-specific holidays.
  return dates.flatMap((date) => {
    let value = 0;
    let valuedAssets = 0;
    for (const entry of usable) {
      if (entry.startDate && date < entry.startDate) continue;
      const activityDate = date.slice(0, 10);
      const unitsChange = entry.unitLedger.changesByDate.get(activityDate);
      const appliedActivityDates = appliedActivityDatesByAsset.get(entry.asset.id) ?? new Set<string>();
      if (unitsChange !== undefined && !appliedActivityDates.has(activityDate)) {
        unitsByAsset.set(entry.asset.id, Math.max(0, (unitsByAsset.get(entry.asset.id) ?? 0) + unitsChange));
        appliedActivityDates.add(activityDate);
        appliedActivityDatesByAsset.set(entry.asset.id, appliedActivityDates);
      }
      const price = entry.daily.get(date);
      if (price !== undefined) latestPriceByAsset.set(entry.asset.id, price);
      const latestPrice = latestPriceByAsset.get(entry.asset.id);
      if (latestPrice === undefined) {
        if (firstRecordedActivity) continue;
        return [];
      }
      const units = unitsByAsset.get(entry.asset.id) ?? 0;
      if (units <= 0) continue;
      hasPositionStarted = true;
      value += latestPrice * units * entry.rate;
      valuedAssets += 1;
    }
    // Keep zero-value dates after a full sale so the chart shows the position
    // falling to zero instead of ending immediately before the sale.
    return valuedAssets > 0 || hasPositionStarted ? [{ date, value }] : [];
  });
};
