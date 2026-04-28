import type { TransactionType } from "@prisma/client";

export type TransactionDirection = "debit" | "credit";

const normalizeAmount = (value: unknown) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeDirectionText = (value: unknown) => String(value ?? "").trim().toLowerCase();

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
