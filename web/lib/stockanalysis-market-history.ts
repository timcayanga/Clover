import {
  filterMarketHistoryByRange,
  normalizeMarketSymbol,
  type MarketHistoryPoint,
  type MarketRange,
} from "@/lib/market-data";

export const parseStockAnalysisSeries = (html: string, symbol: string, range: MarketRange = "MAX") => {
  const normalized = normalizeMarketSymbol(symbol).replace(/\.PS$/, "");
  const startIndex = html.indexOf(`symbol:"PSE-${normalized}"`);
  if (startIndex < 0) {
    return { error: "No market history found for that ticker." as const };
  }

  const dataStart = html.indexOf("data:[", startIndex);
  // StockAnalysis has changed the property that follows `data` over time
  // (`other`, `created_at`, and others). The history rows themselves are flat
  // objects, so the first closing bracket after `data:[` is the stable bound.
  const dataEnd = html.indexOf("]", dataStart);
  if (dataStart < 0 || dataEnd < 0) {
    return { error: "No market history found for that ticker." as const };
  }

  const dataBlock = html.slice(dataStart + "data:[".length, dataEnd);
  const rows: MarketHistoryPoint[] = [];

  for (const match of dataBlock.matchAll(
    /\{(?:a:([^,}]+),)?c:([^,}]+),h:[^,}]+,l:[^,}]+,o:[^,}]+,t:"([^"]+)",v:([^,}]+),ch:[^}]+\}/g
  )) {
    const adjusted = Number(match[1]);
    const close = Number(match[2]);
    const volume = Number(match[4]);
    const date = match[3];
    const value = Number.isFinite(adjusted) ? adjusted : close;

    if (!Number.isFinite(value) || !date) {
      continue;
    }

    rows.push({
      date: new Date(`${date}T12:00:00+08:00`).toISOString(),
      value,
      volume: Number.isFinite(volume) ? volume : null,
    });
  }

  rows.sort((left, right) => left.date.localeCompare(right.date));
  const rangedRows = filterMarketHistoryByRange(rows, range);
  if (rangedRows.length === 0) {
    return { error: "No market history found for that ticker." as const };
  }

  const latest = rangedRows[rangedRows.length - 1];
  const previous = rangedRows[rangedRows.length - 2] ?? latest;
  const change = latest.value - previous.value;
  const changePercent = previous.value === 0 ? 0 : (change / previous.value) * 100;

  return {
    symbol: normalizeMarketSymbol(symbol),
    market: "ph" as const,
    provider: "stockanalysis" as const,
    currency: "PHP" as const,
    range,
    points: rangedRows,
    latest,
    previous,
    change,
    changePercent,
  };
};
