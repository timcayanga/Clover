import assert from "node:assert/strict";
import { matchRecurringPayment, sharesRecurringPaymentIdentity } from "../lib/recurring-payment-evidence";

const bill = {
  kind: "planned_payment", status: "active", recurrence: "monthly", title: "Netflix subscription",
  counterparty: null, currency: "PHP", accountId: "card", amount: "549.00",
} as const;
const payment = {
  id: "payment", date: "2026-11-11T00:00:00Z", accountId: "card", amount: "-549.00",
  currency: "PHP", merchantClean: "Netflix", merchantRaw: "Netflix", reviewStatus: "confirmed", reviewPriority: "none",
};
const sync = "2026-11-10T04:00:00Z";
const check = (rows = [payment], due = "2026-11-12") => matchRecurringPayment(bill, due, rows, sync);
assert.equal(check()?.status, "found");
assert.deepEqual(check([payment], "2026-12-12"), { status: "not_found", lastSyncedAt: sync });
assert.equal(check([{ ...payment, currency: "USD" }])?.status, "not_found");
assert.equal(check([{ ...payment, accountId: "other" }])?.status, "not_found");
assert.equal(check([{ ...payment, amount: "-550" }])?.status, "not_found");
assert.equal(check([{ ...payment, merchantClean: null, merchantRaw: "Other" }])?.status, "not_found");
assert.equal(check([{ ...payment, reviewStatus: "pending_review" }])?.status, "possible");
assert.deepEqual(check([payment, { ...payment, id: "second" }]), { status: "possible", payment: null });
assert.equal(matchRecurringPayment({ ...bill, accountId: null }, "2026-11-12", [payment], null)?.status, "possible");
assert.equal(matchRecurringPayment(bill, "2026-11-12", [payment], sync, sharesRecurringPaymentIdentity(bill, bill))?.status, "possible");
assert.equal(check([payment], "2026-02-30"), null);
assert.equal(matchRecurringPayment({ ...bill, kind: "receivable" }, "2026-11-12", [payment], null), null);
console.log("Recurring payment evidence: due date, currency, account, ambiguity and scope passed");
