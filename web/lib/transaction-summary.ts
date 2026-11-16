import { hasTransactionUserEdits } from "./transaction-user-edits";
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
  normalizedPayload?: unknown;
  reviewStatus?: string;
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
  // An explicit durable pair is stronger than merchant-name similarity. Both
  // legs must exist in this authorized Profile, agree on currency/amount and
  // have opposite signed movements; ambiguous/missing pairs stay untouched.
  const pairs = new Map<string, TransactionSummaryCandidate[]>();
  for (const row of transactions) {
    if (hasTransactionUserEdits(row)) continue;
    const payload = readPayload(row.rawPayload);
    const pair = typeof payload?.transferPairId === "string" ? payload.transferPairId.trim() : "";
    if (pair) { const legs=pairs.get(pair); if (!legs) pairs.set(pair,[row]); else if (legs.length<3) legs.push(row); }
    const delta = typeof payload?.amountDelta === "number" ? payload.amountDelta : NaN;
    // A linked reimbursement is a credit, not another purchase. Do not infer
    // this from the Transfers category alone (external payments can be expenses).
    if (/^transfers?$/i.test(row.categoryName ?? "") && typeof payload?.splitBillId === "string" && payload.splitBillId &&
        /\breimbursement\s+from\b/i.test(getTransactionText(row)) && delta > 0 &&
        Math.abs(delta - (readAmount(row.amount) ?? NaN)) < .005 &&
        !["credit_card","loan","mortgage","line_of_credit","payable","bnpl"].includes(row.accountType ?? "")) overrides.set(row.id,"income");
  }
  for (const legs of pairs.values()) {
    if (legs.length !== 2) continue;
    const [left,right] = legs;
    const a=readPayload(left.rawPayload)?.amountDelta,b=readPayload(right.rawPayload)?.amountDelta;
    const leftDate=readDateTime(left.date),rightDate=readDateTime(right.date);
    const leftAmount=readAmount(left.amount),rightAmount=readAmount(right.amount);
    if (leftAmount === null || rightAmount === null || leftAmount === 0 || rightAmount === 0 || left.accountId === right.accountId || left.currency.toUpperCase() !== right.currency.toUpperCase() ||
        typeof a !== "number" || typeof b !== "number" || !Number.isFinite(a) || !Number.isFinite(b) || a*b >= 0 ||
        Math.abs(a+b) >= .005 || Math.abs(Math.abs(a)-(readAmount(left.amount) ?? NaN)) >= .005 ||
        Math.abs(Math.abs(b)-(readAmount(right.amount) ?? NaN)) >= .005 || leftDate === null || rightDate === null ||
        Math.abs(leftDate-rightDate)>3*86400000) continue;
    overrides.set(left.id,"transfer"); overrides.set(right.id,"transfer");
  }

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
