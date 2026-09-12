import { mobileHomePayments } from "../lib/mobile-home-payments";
import type { FinancialCommitmentSummary } from "../lib/commitments";
import assert from "node:assert/strict";
import {
  mobileAccountPatch,
  mobileRecurringCreate,
  mobileRecurringPatch,
  mobileRecurringCompletion,
} from "../lib/mobile-organize-input";
import { mobileAccountCreateSchema } from "../lib/mobile-edit-schema";
import { mobileOperation } from "../lib/mobile-api-policy";
import { mobileApiResponse } from "../lib/mobile-api-response";
import { mobileHomePeriods, homeDateKey } from "../lib/mobile-home-periods";
let checks = 0;
const check = (name: string, fn: () => void) => {
  fn();
  checks++;
  console.log(`PASS ${name}`);
};
check("Account detail and mutation routes are explicit", () => {
  for (const method of ["GET", "PATCH", "DELETE"])
    assert.equal(mobileOperation(method, ["accounts", "owned"]), "account");
  assert.equal(mobileOperation("POST", ["accounts", "owned"]), null);
});
check(
  "Investment creation cannot append history or change an existing identifier",
  () => {
    const input = {
      name: "Fund",
      type: "investment",
      currency: "PHP",
      balance: "100",
    };
    assert.ok(mobileAccountCreateSchema.safeParse(input).success);
    for (const extra of [
      { accountNumber: "1234" },
      { investmentPurchaseDate: "2026-09-01" },
      { investmentDividendAmount: "100" },
    ])
      assert.ok(
        !mobileAccountCreateSchema.safeParse({ ...input, ...extra }).success,
      );
  },
);
check("Partial account edit preserves omitted financial values", () =>
  assert.deepEqual(mobileAccountPatch.parse({ name: "Renamed" }), {
    name: "Renamed",
  }),
);
check(
  "Account edits reject raw data, Profile spoofing and invalid numbers",
  () => {
    for (const input of [
      {},
      { workspaceId: "foreign", name: "x" },
      { source: "import", name: "x" },
      { balance: "NaN" },
      { creditLimit: "-1" },
      { investmentStartDate: "2026-02-30" },
    ])
      assert.ok(!mobileAccountPatch.safeParse(input).success);
  },
);
check(
  "Account response conceals raw payloads and complete account number",
  () => {
    const response = mobileApiResponse("account", {
      account: {
        id: "a",
        name: "Cash",
        accountNumber: "123456789",
        rawPayload: "secret",
        workspaceId: "private",
        balance: "100",
        creditLimit: "500",
      },
    });
    assert.equal(JSON.stringify(response).includes("secret"), false);
    assert.equal(JSON.stringify(response).includes("123456789"), false);
    assert.equal((response as any).account.lastFour, "6789");
  },
);
const item = {
  title: "Rent",
  kind: "planned_payment",
  amount: "5000",
  currency: "PHP",
  dueDate: "2026-09-30",
  recurrence: "monthly",
  accountId: null,
};
check("Recurring create accepts all four kinds", () => {
  for (const kind of ["planned_payment", "debt", "receivable", "reminder"])
    assert.ok(mobileRecurringCreate.safeParse({ ...item, kind }).success);
});
check("Recurring edits preserve omitted schedule and tracking", () =>
  assert.deepEqual(mobileRecurringPatch.parse({ title: "New rent" }), {
    title: "New rent",
  }),
);
check("Recurring input rejects malformed dates, amounts and metadata", () => {
  for (const extra of [
    { dueDate: "2026-02-30" },
    { amount: "-3" },
    { currency: "PHP,USD" },
    { workspaceId: "foreign" },
    { source: "confirmed" },
    { tracking: { version: 1, paymentsMade: 99 } },
  ])
    assert.ok(!mobileRecurringCreate.safeParse({ ...item, ...extra }).success);
});
check("Payment completion requires a real date and boolean", () => {
  assert.ok(
    mobileRecurringCompletion.safeParse({
      dueDate: "2028-02-29",
      completed: true,
    }).success,
  );
  for (const input of [
    { dueDate: "2026-02-29", completed: true },
    { dueDate: "2026-09-01", completed: "false" },
  ])
    assert.ok(!mobileRecurringCompletion.safeParse(input).success);
});
check("Recurring responses disclose only mutation results", () =>
  assert.deepEqual(
    mobileApiResponse("recurring-create", {
      commitment: { id: "one", rawPayload: "secret", workspaceId: "private" },
    }),
    { commitment: { id: "one" } },
  ),
);
check("Manila rolls over before UTC", () => {
  const p = mobileHomePeriods(new Date("2026-09-30T16:01:00Z"));
  assert.equal(p.day.toISOString(), "2026-09-30T16:00:00.000Z");
  assert.equal(p.month.toISOString(), p.day.toISOString());
  assert.equal(homeDateKey(p.day), "2026-10-01");
});
check("Rolling comparisons are equal, adjacent and non-overlapping", () => {
  const p = mobileHomePeriods(new Date("2026-01-01T00:00:00Z"));
  for (const days of [7, 30]) {
    const r = p.rolling(days);
    assert.equal(+r.to - +r.from, days * 86400000);
    assert.equal(+r.previousTo - +r.previousFrom, days * 86400000);
    assert.equal(+r.previousTo, +r.from);
  }
});
check("Previous calendar month includes leap day and year transition", () => {
  const leap = mobileHomePeriods(new Date("2028-03-01T00:00:00Z"));
  assert.equal((+leap.month - +leap.previousMonth) / 86400000, 29);
  const jan = mobileHomePeriods(new Date("2026-01-01T00:00:00Z"));
  assert.equal(homeDateKey(jan.previousMonth), "2025-12-01");
});
check(
  "Home advances old recurring anchors and excludes completed occurrences",
  () => {
    const c = {
      id: "bill",
      title: "Bill",
      kind: "planned_payment",
      amount: "20",
      currency: "PHP",
      status: "active",
      recurrence: "monthly",
      dueDate: "2026-01-15",
      plannedPaymentDate: null,
      nextDueDate: null,
      tracking: null,
    } as FinancialCommitmentSummary;
    const r = mobileHomePayments(
      [c],
      new Map([["bill", new Set(["2026-09-15"])]]),
      "2026-09-12",
    );
    assert.equal(r.upcoming.length, 0);
    assert.ok(r.overdue.some((p) => p.date === "2026-08-15"));
  },
);
check("Home thirty-day horizon can cross two month boundaries", () => {
  const c = {
    id: "bill",
    title: "Bill",
    kind: "planned_payment",
    amount: "20",
    currency: "PHP",
    status: "active",
    recurrence: "once",
    dueDate: "2026-03-01",
    plannedPaymentDate: null,
    nextDueDate: null,
    tracking: null,
  } as FinancialCommitmentSummary;
  assert.equal(
    mobileHomePayments([c], new Map(), "2026-01-31").upcoming[0]?.date,
    "2026-03-01",
  );
});
check("Old unresolved one-time bills remain visible as overdue", () => {
  const c = {
    id: "old",
    title: "Old",
    kind: "planned_payment",
    amount: "20",
    currency: "PHP",
    status: "active",
    recurrence: "once",
    dueDate: "2024-01-01",
    plannedPaymentDate: null,
    nextDueDate: null,
    tracking: null,
  } as FinancialCommitmentSummary;
  assert.equal(
    mobileHomePayments([c], new Map(), "2026-09-12").overdue[0]?.date,
    "2024-01-01",
  );
});
console.log(`${checks}/${checks} mobile Organize regression checks passed.`);
