import { investmentQuoteIdentity, investmentTypeLabel } from "./investment-entry";
import { portfolioAssetKey } from "./investment-portfolio";

export const allocationViews = ["Markets", "Institutions", "Asset Types", "Assets"] as const;
export type AllocationView = typeof allocationViews[number];
export type AllocationHolding = {
  name: string;
  currency: string;
  institution: string | null;
  symbol: string | null;
  subtype: string | null;
  value: number | null;
};

const palette = ["#009CA9", "#8966BC", "#DB923E", "#487DCC", "#BD6489", "#458763"];

export function investmentAllocation(holdings: AllocationHolding[], currency: string, view: AllocationView) {
  const groups = new Map<string, { key: string; name: string; amount: number }>();
  for (const holding of holdings) {
    const value = holding.value;
    if (holding.currency !== currency || value === null || !Number.isFinite(value) || value <= 0) continue;
    let name = holding.name;
    if (view === "Markets") {
      const market = investmentQuoteIdentity(holding)?.market;
      name = market === "us" ? "United States" : market === "ph" ? "Philippines" : market === "crypto" || holding.subtype === "crypto" ? "Crypto" : "Other Markets";
    } else if (view === "Institutions") {
      name = holding.institution?.trim() || "Other Institutions";
    } else if (view === "Asset Types") {
      name = investmentTypeLabel(holding.subtype || "other");
    } else if (holding.subtype === "crypto" && holding.symbol?.toUpperCase() === "BTC") {
      name = "Bitcoin";
    }
    const key = view === "Assets" ? portfolioAssetKey(holding) : view === "Asset Types" ? holding.subtype || "other" : name.toLowerCase();
    const group = groups.get(key);
    if (group) group.amount += value;
    else groups.set(key, {key, name, amount: value});
  }
  const sorted = [...groups.values()].sort((a,b) => b.amount-a.amount || a.name.localeCompare(b.name));
  const total = sorted.reduce((sum, group) => sum + group.amount, 0);
  return {total, slices: sorted.map((group, i) => ({
    ...group, percent: group.amount / total * 100,
    color: palette[i] ?? `hsl(${(i * 137.5) % 360}, 48%, 46%)`,
  }))};
}
