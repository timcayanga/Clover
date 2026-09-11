/** Accept decimal-point amounts and unambiguous three-digit comma grouping. */
export const normalizeTransactionAmountInput = (value: string): string | null => {
  const trimmed = value.trim();
  if (!/^-?(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{0,2})?|\.\d{1,2})$/.test(trimmed)) return null;
  const normalized = trimmed.replace(/,/g, "");
  return Number.isFinite(Number(normalized)) ? normalized : null;
};

export const transactionAmountFormatMessage = "Use a decimal point for cents, for example 1234.56 or 1,234.56.";

/** Validates a persisted transaction amount without changing its value. */
export const parsePositiveTransactionAmount = (value: string | number): number | null => {
  const normalized = normalizeTransactionAmountInput(String(value));
  if (normalized === null) return null;

  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
};
