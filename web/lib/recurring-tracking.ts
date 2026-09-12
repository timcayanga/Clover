import type { FinancialCommitmentSummary } from "@/lib/commitments";

export type RecurringTracking = {
  version: 1;
  amountType: "fixed" | "variable";
  paymentAmount: number | null;
  totalPayments: number | null;
  paymentsMade: number;
  endDate: string | null;
  debtType: string;
  balanceDate: string | null;
  liabilityAccountId: string | null;
  interestRate: number | null;
  reminderDays: number | null;
  reference: string;
  monthEnd: boolean;
};

export function parseRecurringTracking(value: unknown): RecurringTracking | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.version !== 1) return null;
  const number = (key: string) => v[key] === null || v[key] === "" || v[key] === undefined ? null : Number(v[key]);
  const text = (key: string) => typeof v[key] === "string" ? String(v[key]).trim().slice(0,200) : "";
  const result: RecurringTracking = {
    version: 1, amountType: v.amountType === "variable" ? "variable" : "fixed",
    paymentAmount: number("paymentAmount"), totalPayments: number("totalPayments"),
    paymentsMade: number("paymentsMade") ?? 0, endDate: text("endDate") || null,
    debtType: text("debtType"), balanceDate: text("balanceDate") || null,
    liabilityAccountId: text("liabilityAccountId") || null, interestRate: number("interestRate"),
    reminderDays: number("reminderDays"), reference: text("reference"), monthEnd: v.monthEnd === true,
  };
  for (const n of [result.paymentAmount,result.totalPayments,result.paymentsMade,result.interestRate,result.reminderDays]) {
    if (n !== null && (!Number.isFinite(n) || n < 0)) throw new Error("Enter valid, non-negative tracking amounts.");
  }
  if ((result.totalPayments !== null && (!Number.isInteger(result.totalPayments) || result.totalPayments < 1 || result.totalPayments > 1200)) || !Number.isInteger(result.paymentsMade)) throw new Error("Payment counts must be whole numbers between 1 and 1200.");
  if (result.totalPayments !== null && result.paymentsMade > result.totalPayments) throw new Error(`Payments already made cannot exceed the total of ${result.totalPayments}.`);
  for (const date of [result.endDate,result.balanceDate]) if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)))) throw new Error("Enter a valid tracking date.");
  if (result.reminderDays !== null && ![0,1,3].includes(result.reminderDays)) throw new Error("Choose a supported reminder time.");
  return result;
}

export const recurringPaymentAmount = (item: FinancialCommitmentSummary, occurrenceDate?: string): number | null => {
  const tracking = item.tracking;
  if (tracking && item.kind === "debt") return tracking.paymentAmount;
  if (tracking && item.kind === "receivable" && item.recurrence !== "once") {
    if (tracking.paymentAmount === null || item.amount === null) return tracking.paymentAmount;
    const anchorKey = item.plannedPaymentDate ?? item.dueDate ?? item.nextDueDate;
    let index = 0;
    if (occurrenceDate && anchorKey) {
      const anchor = new Date(anchorKey.slice(0,10)); const date = new Date(occurrenceDate.slice(0,10));
      index = item.recurrence === "weekly" || item.recurrence === "biweekly"
        ? Math.round((date.getTime()-anchor.getTime())/86400000)/(item.recurrence === "weekly" ? 7 : 14)
        : ((date.getUTCFullYear()-anchor.getUTCFullYear())*12+date.getUTCMonth()-anchor.getUTCMonth())/(item.recurrence === "monthly"?1:item.recurrence === "quarterly"?3:12);
    }
    return Math.min(tracking.paymentAmount, Math.max(0, Number(item.amount)-tracking.paymentAmount*Math.max(0,Math.floor(index))));
  }
  return item.amount === null ? null : Number(item.amount);
};

/** Applies only to explicitly configured new schedules; legacy records keep their existing cadence. */
export function isWithinRecurringTerm(item: Pick<FinancialCommitmentSummary, "tracking" | "recurrence">, date: Date, anchor: Date) {
  const tracking = item.tracking;
  if (!tracking) return true;
  const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  if (tracking.endDate && key > tracking.endDate) return false;
  if (tracking.totalPayments === null) return true;
  const remaining = tracking.totalPayments - tracking.paymentsMade;
  if (remaining <= 0) return false;
  const months = (date.getFullYear()-anchor.getFullYear())*12 + date.getMonth()-anchor.getMonth();
  const index = item.recurrence === "weekly" || item.recurrence === "biweekly"
    ? Math.round((Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())-Date.UTC(anchor.getFullYear(),anchor.getMonth(),anchor.getDate()))/86400000)/(item.recurrence === "weekly" ? 7 : 14)
    : months/(item.recurrence === "monthly" ? 1 : item.recurrence === "quarterly" ? 3 : 12);
  return index < remaining;
}

/** Completion belongs to the contractual due date, even when the calendar shows an earlier planned date. */
export function recurringCompletionDate(item: Pick<FinancialCommitmentSummary, "dueDate" | "plannedPaymentDate" | "recurrence">, displayDate: string) {
  if (!item.plannedPaymentDate || !item.dueDate) return displayDate.slice(0,10);
  const due = new Date(item.dueDate.slice(0,10));
  if (item.recurrence === "once") return item.dueDate.slice(0,10);
  const planned = new Date(item.plannedPaymentDate.slice(0,10));
  const display = new Date(displayDate.slice(0,10));
  if (item.recurrence === "weekly" || item.recurrence === "biweekly") return new Date(display.getTime()+due.getTime()-planned.getTime()).toISOString().slice(0,10);
  const months = (display.getUTCFullYear()-planned.getUTCFullYear())*12+display.getUTCMonth()-planned.getUTCMonth();
  const target = new Date(Date.UTC(due.getUTCFullYear(),due.getUTCMonth()+months,1));
  const last = new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
  target.setUTCDate(Math.min(due.getUTCDate(),last));
  return target.toISOString().slice(0,10);
}
