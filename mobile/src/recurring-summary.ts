/** Sum scheduled payments without combining different currencies or inactive items. */
export function recurringSummaryAmounts(
  items: readonly { id: string; status: string }[],
  occurrences: readonly { id: string; kind: string; amount: number | string | null; currency: string }[],
  includeReceivables: boolean,
) {
  const activeIds = new Set(items.filter(item => item.status === "active").map(item => item.id));
  const totals = new Map<string, number>();
  for (const item of occurrences) {
    if (!activeIds.has(item.id) || (!includeReceivables && item.kind === "receivable") || item.amount === null || !Number.isFinite(Number(item.amount))) continue;
    totals.set(item.currency, (totals.get(item.currency) ?? 0) + Number(item.amount));
  }
  return [...totals];
}
