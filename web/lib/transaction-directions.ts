import type { TransactionType } from "@prisma/client";

export type TransactionDirection = "debit" | "credit";

const normalizeAmount = (value: unknown) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (value && typeof value === "object" && "toString" in value) {
    return normalizeAmount(String((value as { toString?: () => string }).toString?.() ?? ""));
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeDirectionText = (value: unknown) => String(value ?? "").trim().toLowerCase();

const normalizeCategoryTypeText = (value: unknown) => String(value ?? "").trim().toLowerCase();

const normalizeCategoryKey = (value: unknown) => normalizeCategoryTypeText(value).replace(/[^a-z0-9]+/g, " ").trim();

export const inferTransactionTypeFromAmount = (amount: unknown): TransactionType | null => {
  const normalizedAmount = normalizeAmount(amount);

  if (normalizedAmount === null || normalizedAmount === 0) {
    return null;
  }

  return normalizedAmount > 0 ? "income" : "expense";
};

export const isTransferCategoryName = (value: unknown) => {
  const normalized = normalizeCategoryKey(value);
  return normalized === "transfer" || normalized === "transfers";
};

export const coerceTransactionTypeFromCategoryName = (
  categoryName: unknown,
  fallback: TransactionType = "expense",
  amount?: unknown,
  isTransfer?: boolean
): TransactionType => {
  if (isTransfer) {
    return "transfer";
  }

  const normalized = normalizeCategoryKey(categoryName);

  if (!normalized) {
    return fallback;
  }

  if (normalized === "income") {
    return "income";
  }

  if (isTransferCategoryName(categoryName)) {
    // `false` means the caller checked workspace ownership and found no
    // matching account. Preserve the parsed money direction in that case;
    // the category label alone must not turn payments to other people into
    // internal transfers or remove them from spending/income totals.
    if (isTransfer === false) {
      return fallback === "income" ? "income" : "expense";
    }
    return "transfer";
  }

  if (normalized === "gifts donations" && fallback === "income") {
    return "income";
  }

  if (normalized === "cash atm" && fallback === "income") {
    return "income";
  }

  if (normalized === "financial" && fallback === "income") {
    return "income";
  }

  if (normalized === "investments") {
    return fallback;
  }

  return "expense";
};

export const resolveFinancialTransactionType = (transaction: {
  type: TransactionType;
  amount?: unknown;
  isTransfer?: boolean;
  categoryName?: unknown;
  merchantRaw?: string | null;
  merchantClean?: string | null;
  description?: string | null;
  institution?: string | null;
}): TransactionType => {
  const categoryType = coerceTransactionTypeFromCategoryName(
    transaction.categoryName,
    transaction.type,
    transaction.amount,
    transaction.isTransfer
  );

  if (categoryType === "income" || categoryType === "transfer") {
    return categoryType;
  }

  const institution = transaction.institution?.trim().toLowerCase() ?? "";
  if (!/\bbdo\b|\bbanco de oro\b/.test(institution)) {
    return categoryType;
  }

  const description = [transaction.merchantClean, transaction.merchantRaw, transaction.description]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/incoming\s+transfer|interbank\s+deposit|funds?\s+deposited|received\s+a\/c|reciv(?:ed)?\s+a\/c|cash\s+deposit|salary|payroll|interest|intrest|credit\s+movement/.test(description)) {
    return "income";
  }

  if (/bank\s+transfer|pob\s+ibft|ibft\s+bn|fund\s+transfer|transfer\s+to|payment\s+to|debit\s+movement/.test(description)) {
    return "expense";
  }

  if (/internal\s+clearing|internal\s+clearing\s+on-us|on-us\s+transaction|encashment|check\s+issued|check\s+deposit|dm1|icc|ilnsdm1|pdck3|cm1|drt|cd|ck1/.test(description)) {
    return "transfer";
  }

  return categoryType;
};

export const coerceTransactionDirection = (value: unknown, amount?: unknown): TransactionDirection => {
  const normalized = normalizeDirectionText(value);

  if (normalized === "credit" || normalized === "income") {
    return "credit";
  }

  if (normalized === "debit" || normalized === "expense") {
    return "debit";
  }

  if (normalized === "transfer") {
    const numericAmount = normalizeAmount(amount);
    if (numericAmount !== null) {
      return numericAmount < 0 ? "debit" : "credit";
    }

    return "debit";
  }

  return "debit";
};

export const formatTransactionDirectionLabel = (value: unknown, amount?: unknown) =>
  (coerceTransactionDirection(value, amount) === "credit" ? "Credit" : "Debit") as "Credit" | "Debit";

export const toInternalTransactionType = (value: unknown, amount?: unknown): TransactionType =>
  coerceTransactionDirection(value, amount) === "credit" ? "income" : "expense";
