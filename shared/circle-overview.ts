/** Display-only conversion. Never modify recorded amounts or substitute missing FX. */
export function circleConvertedTotal(
  totals: Record<string, number>,
  target: string,
  rates: Record<string, number>,
): number | null {
  let total = 0;
  for (const [source, amount] of Object.entries(totals)) {
    if (!Number.isFinite(amount)) return null;
    if (amount === 0) continue;
    const rate = source === target ? 1 : rates[source];
    if (!Number.isFinite(rate) || rate <= 0) return null;
    total += amount * rate;
  }
  return Number.isFinite(total) ? total : null;
}
export function circleCategoryTotals(
  rows: { amount: number; currency: string; categoryName?: string | null }[],
  target: string,
  rates: Record<string, number>,
): [string, number][] | null {
  const categories = new Map<string, number>();
  for (const row of rows) {
    const value = circleConvertedTotal(
      { [row.currency]: row.amount },
      target,
      rates,
    );
    if (value === null) return null;
    const name = row.categoryName || "Other";
    categories.set(name, (categories.get(name) ?? 0) + value);
  }
  return [...categories.entries()]
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1]);
}
export function circleActivityEmoji(action: string = "") {
  if (/budget/.test(action)) return "👛";
  if (/goal/.test(action)) return "🎯";
  if (/commitment|recurring/.test(action)) return "🔁";
  if (/invit/.test(action)) return "✉️";
  if (/member|join/.test(action)) return "👥";
  if (/contribution|payment/.test(action)) return "💸";
  if (/transaction|expense|bill/.test(action)) return "🧾";
  if (/archive/.test(action)) return "📦";
  return "⭕";
}
