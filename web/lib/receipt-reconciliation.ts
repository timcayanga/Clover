type ReceiptSummary = {
  subtotal: number | null;
  total: number | null;
  tax: number | null;
  service_charge: number | null;
  tip: number | null;
  discount: number | null;
  rounding?: number | null;
  currency?: string | null;
};

type ReceiptItem = {
  complimentary?: boolean;
  quantity?: number | null;
  unit_price?: number | null;
  amount?: number | null;
  currency?: string | null;
};

const readable = (value?: number | null): value is number => typeof value === "number" && Number.isFinite(value);
const cents = (amount: number) => Math.sign(amount) * Math.round((Math.abs(amount) + Number.EPSILON) * 100);
const formatDifference = (difference: number, currency?: string | null) =>
  `${(Math.abs(difference) / 100).toFixed(2)}${currency && /^[A-Z]{3}$/.test(currency) && currency !== "XXX" ? ` ${currency}` : ""}`;

const summaryDifference = (summary: ReceiptSummary) => {
  if (!readable(summary.subtotal) || !readable(summary.total)) return 0;
  const adjustments = cents(summary.service_charge ?? 0) + cents(summary.tip ?? 0) +
    cents(summary.rounding ?? 0) - Math.abs(cents(summary.discount ?? 0));
  const beforeTax = cents(summary.total) - (cents(summary.subtotal) + adjustments);
  const afterTax = beforeTax - cents(summary.tax ?? 0);
  // Some receipts show tax for information because subtotal already includes it.
  return Math.abs(beforeTax) <= Math.abs(afterTax) ? beforeTax : afterTax;
};

export const receiptSummaryReconciles = (summary: ReceiptSummary) => summaryDifference(summary) === 0;

export function receiptReconciliationIssues(summary: ReceiptSummary, items: readonly ReceiptItem[]) {
  const issues: string[] = [];
  const summaryGap = summaryDifference(summary);
  if (summaryGap) issues.push(`Receipt total differs from the subtotal and adjustments by ${formatDifference(summaryGap, summary.currency)}.`);
  for (const [index, item] of items.entries()) {
    if (!readable(item.quantity) || !readable(item.unit_price) || !readable(item.amount)) continue;
    const gap = cents(item.amount) - cents(item.quantity * item.unit_price);
    if (gap) issues.push(`Receipt line item ${index + 1} differs from quantity × unit price by ${formatDifference(gap, item.currency ?? summary.currency)}.`);
  }
  const itemCurrencies = new Set(items.map(item => item.currency ?? summary.currency).filter(Boolean));
  if (items.length && readable(summary.subtotal) && itemCurrencies.size <= 1 &&
      (!summary.currency || !itemCurrencies.size || itemCurrencies.has(summary.currency)) &&
      items.every(item => readable(item.amount) || item.complimentary === true)) {
    const gap = cents(summary.subtotal) - items.reduce((sum, item) => sum + cents(item.amount ?? 0), 0);
    if (gap) issues.push(`Receipt line items differ from the subtotal by ${formatDifference(gap, summary.currency)}.`);
  }
  return issues;
}
