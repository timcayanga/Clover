/** Compact display only; detailed amounts remain available beside the summary. */
export function compactSummaryMoney(value: number, currency: string) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    notation: "compact",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value);
}
