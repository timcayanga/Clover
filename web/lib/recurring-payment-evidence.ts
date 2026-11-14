import { parseCommitmentOccurrenceDate } from "./commitment-occurrences";
import type { FinancialCommitmentSummary } from "./commitments";

type Bill = Pick<FinancialCommitmentSummary, "kind" | "status" | "tracking" | "amount" | "recurrence" | "currency" | "title" | "counterparty" | "accountId">;
type Payment = {
  id: string;
  date: string;
  accountId: string;
  amount: string;
  currency: string;
  merchantClean: string | null;
  merchantRaw: string;
  reviewStatus: string;
  reviewPriority: string;
};

export type RecurringPaymentEvidence =
  | { status: "found"; payment: Payment }
  | { status: "possible"; payment: Payment | null }
  | { status: "not_found"; lastSyncedAt: string | null };

const day = 86_400_000;
const daysByCadence = { once: 5, weekly: 2, biweekly: 3, monthly: 5, quarterly: 5, annual: 5 };

function merchantKey(text: string | null) {
  return (text ?? "").normalize("NFKC").toLowerCase()
    .replace(/\b(?:payment|payments|subscription|monthly|annual|bill|bills|recurring)\b/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function recurringPaymentWindow(bill: Bill, dueDate: string) {
  const due = parseCommitmentOccurrenceDate(dueDate);
  if (!due || bill.status !== "active" || bill.kind !== "planned_payment"
    || bill.tracking?.amountType === "variable" || !(Number(bill.amount) > 0)) return null;
  const days = daysByCadence[bill.recurrence];
  return { start: new Date(+due - days * day), end: new Date(+due + (days + 1) * day) };
}

export function matchRecurringPayment(bill: Bill, dueDate: string, payments: readonly Payment[], lastSyncedAt: string | null, competingBill = false): RecurringPaymentEvidence | null {
  const window = recurringPaymentWindow(bill, dueDate);
  if (!window) return null;
  const identities = [merchantKey(bill.title), merchantKey(bill.counterparty)].filter(key => key.length >= 3);
  const candidates = payments.filter(payment => {
    const posted = Date.parse(payment.date);
    return posted >= +window.start && posted < +window.end
      && (!bill.accountId || bill.accountId === payment.accountId)
      && bill.currency === payment.currency && Math.abs(Number(payment.amount)) === Number(bill.amount)
      && [payment.merchantClean, payment.merchantRaw].some(merchant => identities.includes(merchantKey(merchant)));
  });
  if (!candidates.length) return { status: "not_found", lastSyncedAt };
  if (candidates.length !== 1) return { status: "possible", payment: null };
  const [payment] = candidates;
  const strong = bill.accountId && !competingBill && payment.reviewStatus !== "pending_review" && payment.reviewPriority === "none";
  return { status: strong ? "found" : "possible", payment };
}

export function sharesRecurringPaymentIdentity(bill: Bill, other: Bill) {
  const names = [merchantKey(bill.title), merchantKey(bill.counterparty)].filter(key => key.length >= 3);
  return other.status === "active" && other.kind === "planned_payment"
    && other.tracking?.amountType !== "variable"
    && bill.currency === other.currency && Number(bill.amount) === Number(other.amount)
    && (!bill.accountId || !other.accountId || bill.accountId === other.accountId)
    && [merchantKey(other.title), merchantKey(other.counterparty)].some(key => names.includes(key));
}
