import type { TransactionType } from "@prisma/client";

export type TransactionSummaryCandidate = {
  id: string;
  accountId: string;
  accountType?: string | null;
  date: Date | string;
  amount: unknown;
  currency: string;
  type: TransactionType;
  isTransfer?: boolean;
  categoryName?: string | null;
  merchantRaw?: string | null;
  merchantClean?: string | null;
  description?: string | null;
  rawPayload?: unknown;
};

const readPayload = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const readAmount = (value: unknown) => {
  const amount = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? Math.abs(amount) : null;
};

const readDateTime = (value: Date | string) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
};

const getTransactionText = (transaction: TransactionSummaryCandidate) =>
  [transaction.merchantRaw, transaction.merchantClean, transaction.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const hasStatementCreditMarker = (transaction: TransactionSummaryCandidate) => {
  const payload = readPayload(transaction.rawPayload);
  return /-\s*$/.test(String(payload?.amountText ?? payload?.line ?? "").trim());
};

export const isCreditCardPaymentCredit = (transaction: TransactionSummaryCandidate) => {
  if (transaction.accountType !== "credit_card" || !hasStatementCreditMarker(transaction)) {
    return false;
  }

  return /\b(?:cash\s+payment|card\s+payment|payment\s+(?:received|thank\s+you)|payment\s+to\s+card|repayment)\b/.test(
    getTransactionText(transaction)
  );
};

const isLikelyPaymentDebit = (transaction: TransactionSummaryCandidate) => {
  if (transaction.accountType === "credit_card" || transaction.type === "income") {
    return false;
  }

  return /\b(?:bills?\s+payment|credit\s+card\s+payment|card\s+payment|payment\s+to\s+(?:card|rcbc))\b/.test(
    getTransactionText(transaction)
  );
};

/**
 * Credit-card repayments move money between owned accounts; they are not new
 * consumption. This returns presentation-only overrides so confirmed source
 * transactions and their audit history remain untouched.
 */
export const getTransactionSummaryTypeOverrides = (
  transactions: TransactionSummaryCandidate[]
) => {
  const overrides = new Map<string, TransactionType>();
  const settlements = transactions
    .filter(isCreditCardPaymentCredit)
    .map((transaction) => ({
      transaction,
      amount: readAmount(transaction.amount),
      dateTime: readDateTime(transaction.date),
    }))
    .filter(
      (entry): entry is typeof entry & { amount: number; dateTime: number } =>
        entry.amount !== null && entry.dateTime !== null
    );
  const paymentDebits = transactions
    .filter(isLikelyPaymentDebit)
    .map((transaction) => ({
      transaction,
      amount: readAmount(transaction.amount),
      dateTime: readDateTime(transaction.date),
    }))
    .filter(
      (entry): entry is typeof entry & { amount: number; dateTime: number } =>
        entry.amount !== null && entry.dateTime !== null
    );
  const usedDebitIds = new Set<string>();
  const maxDateDifferenceMs = 3 * 24 * 60 * 60 * 1000;

  for (const settlement of settlements) {
    overrides.set(settlement.transaction.id, "transfer");

    const counterpart = paymentDebits
      .filter(
        (candidate) =>
          !usedDebitIds.has(candidate.transaction.id) &&
          candidate.transaction.accountId !== settlement.transaction.accountId &&
          candidate.transaction.currency.toUpperCase() === settlement.transaction.currency.toUpperCase() &&
          Math.abs(candidate.amount - settlement.amount) < 0.005 &&
          Math.abs(candidate.dateTime - settlement.dateTime) <= maxDateDifferenceMs
      )
      .sort(
        (left, right) =>
          Math.abs(left.dateTime - settlement.dateTime) - Math.abs(right.dateTime - settlement.dateTime)
      )[0];

    if (counterpart) {
      overrides.set(counterpart.transaction.id, "transfer");
      usedDebitIds.add(counterpart.transaction.id);
    }
  }

  return overrides;
};
