type RecordAmount = {
  amount: string | number | null | undefined;
  currency: string | null | undefined;
  type: string | null | undefined;
};

export function formatTransactionRecordAmount({ amount, currency, type }: RecordAmount, locale?: string) {
  if (amount === null || amount === undefined || !String(amount).trim() || !Number.isFinite(Number(amount)))
    return "Amount needs review";
  if (!currency || !/^[A-Z]{3}$/i.test(currency)) return "Currency needs review";
  const value = Number(amount);
  const direction = type === "expense" || type === "debit" ? "−"
    : type === "income" || type === "credit" ? "+"
    : type === "transfer" ? (value < 0 ? "−" : "↔")
    : value < 0 ? "−" : "";
  const code = currency.toUpperCase();
  const magnitude = new Intl.NumberFormat(locale, {
    style: "currency", currency: code, currencyDisplay: "code",
    minimumFractionDigits: code === "KRW" ? 0 : 2, maximumFractionDigits: 2,
  }).format(Math.abs(value));
  return `${value === 0 ? "" : direction}${magnitude}`;
}

export function formatTransactionRecordDate(value: string | null | undefined, locale?: string) {
  const match = value?.match(/^\d{4}-\d{2}-\d{2}(?=T|$)/)?.[0];
  if (!match) return "Date needs review";
  const date = new Date(`${match}T12:00:00Z`);
  if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== match) return "Date needs review";
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

export function formatStatementReviewAccount(row: {
  accountName?: string | null;
  accountNumber?: string | null;
  institution?: string | null;
}) {
  const name = row.accountName?.trim() || row.institution?.trim();
  const suffix = row.accountNumber?.trim().match(/\d{4}$/)?.[0];
  if (suffix && !name?.endsWith(suffix)) return name ? `${name} · •••• ${suffix}` : `Account ending in ${suffix}`;
  return name || "Account needs review";
}

export const parseReceiptLineItemNumber = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const numeric = String(value).replace(/[^0-9.-]/g, "");
  if (!/\d/u.test(numeric)) return null;
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : null;
};

export const getReceiptLineItemComputedAmount = (item: { amount?: string | null; unitPrice?: string | null; quantity?: string | null }) => {
  const amount = parseReceiptLineItemNumber(item.amount);
  if (amount !== null) {
    return amount;
  }

  const unitPrice = parseReceiptLineItemNumber(item.unitPrice);
  const quantity = parseReceiptLineItemNumber(item.quantity);
  return unitPrice !== null && quantity !== null ? unitPrice * quantity : null;
};

export function formatReceiptLineItemAmount(
  item: Parameters<typeof getReceiptLineItemComputedAmount>[0] & { currency?: string | null },
  receiptCurrency: string,
  format: (amount: number, currency: string) => string,
) {
  const amount = getReceiptLineItemComputedAmount(item);
  return amount === null ? "Not recorded" : format(amount, item.currency || receiptCurrency);
}
