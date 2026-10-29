import assert from "node:assert/strict";
import {
  homeProducts,
  productPages,
  currencyTotals,
  circlePeriodStart,
  suggestCircleDate,
} from "../../shared/circle-experience";
import { displayDate, parseDisplayDate } from "../../shared/localized-date";
import { validateCircleExpenseSplit } from "../lib/circle-expense-split";
import { mobileApiResponse } from "../lib/mobile-api-response";
import { mobileOperation } from "../lib/mobile-api-policy";
import {
  mobileBillEdit,
  mergeMobileBillEdit,
} from "../lib/mobile-split-bill-edit";
import type { SplitBillSerializedBill } from "../lib/split-bill";
assert.deepEqual(
  homeProducts.map((p) => p.label),
  [
    "Accounts",
    "Transactions",
    "Reports",
    "Ask Clover",
    "Recurring",
    "Investments",
    "Split Bills",
    "Circles",
    "Budgeting",
    "Goals",
  ],
);
assert.deepEqual(
  productPages.map((p) => p.length),
  [4, 4, 2],
);
assert.deepEqual(
  currencyTotals([
    { amount: 75440, currency: "IDR" },
    { amount: 1200, currency: "PHP" },
    { amount: 300, currency: "PHP" },
  ]),
  { IDR: 75440, PHP: 1500 },
);
assert.equal(suggestCircleDate("monthly", new Date(2026, 0, 31)), "2026-02-28");
assert.equal(suggestCircleDate("annual", new Date(2024, 1, 29)), "2025-02-28");
assert.equal(
  circlePeriodStart("once", new Date(), new Date("2026-11-01"))
    .toISOString()
    .slice(0, 10),
  "2026-11-01",
);
assert.equal(
  circlePeriodStart("quarterly", new Date(2026, 9, 29)).getMonth(),
  9,
);
for (const format of ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"])
  assert.equal(
    parseDisplayDate(displayDate("2026-10-29", format), format)?.slice(0, 10),
    "2026-10-29",
  );
assert.equal(
  parseDisplayDate("29102026", "DD/MM/YYYY")?.slice(0, 10),
  "2026-10-29",
);
assert.throws(() => parseDisplayDate("02/30/2026", "MM/DD/YYYY"));
assert.equal(displayDate("29/10", "DD/MM/YYYY"), "29/10");
const members = [
  { id: "me", displayName: "Me" },
  { id: "mia", displayName: "Mia" },
  { id: "leo", displayName: "Leo" },
];
const items = [
  { description: "Pasta", amount: "450", participantIds: ["me", "mia", "leo"] },
  { description: "Chicken", amount: "450", participantIds: ["me", "mia"] },
  { description: "Coffee", amount: "300", participantIds: ["leo"] },
];
assert.deepEqual(validateCircleExpenseSplit(members, items, 1200), {
  me: 375,
  mia: 375,
  leo: 450,
});
assert.throws(
  () =>
    validateCircleExpenseSplit(
      members,
      [{ ...items[0], participantIds: ["another-circle-member"] }],
      450,
    ),
  /current Circle members/,
);
assert.throws(
  () =>
    validateCircleExpenseSplit(
      members,
      [
        {
          ...items[0],
          splitMethod: "exact",
          allocations: [{ participantId: "me", value: "450" }],
        },
      ],
      450,
    ),
  /each person/,
);
assert.throws(
  () => validateCircleExpenseSplit(members, items, 1300),
  /match the shared expense/,
);
const original = structuredClone(items);
validateCircleExpenseSplit(members, items, 1200);
assert.deepEqual(
  items,
  original,
  "Split validation must never rewrite financial source values",
);
const view = mobileApiResponse("circle", {
  circles: [
    {
      id: "c",
      members: [
        {
          id: "me",
          isMe: true,
          avatarUrl: "https://example.invalid/me.png",
          userId: "PRIVATE",
        },
      ],
      budgets: [
        {
          id: "b",
          cadence: "once",
          startsAt: "2026-11-01",
          endsAt: "2026-11-10",
        },
      ],
      commitments: [{ id: "r", assignedMemberIds: ["me", "mia"] }],
      expenseCurrencyTotals: { IDR: 75440, PHP: 1500 },
      expenses: [
        {
          id: "e",
          transactionId: "t",
          lineItems: items,
          splitItems: items,
          rawPayload: "PRIVATE",
        },
      ],
    },
  ],
}) as any;
assert.equal(view.circle.members[0].isMe, true);
assert.match(view.circle.members[0].avatarUrl, /me.png/);
assert.deepEqual(view.circle.commitments[0].assignedMemberIds, ["me", "mia"]);
assert.equal(view.circle.budgets[0].startsAt, "2026-11-01");
assert.deepEqual(view.circle.expenseCurrencyTotals, { IDR: 75440, PHP: 1500 });
assert.ok(!JSON.stringify(view).includes("PRIVATE"));
assert.equal(
  mobileOperation("GET", ["transactions", "one", "related"]),
  "transaction-related",
);
assert.equal(mobileOperation("POST", ["transactions", "one", "related"]), null);
const bill = {
  id: "bill",
  title: "Lunch",
  total: "450",
  subtotal: "450",
  participants: [
    { id: "me", name: "Me" },
    { id: "mia", name: "Mia" },
  ],
  items: [
    {
      id: "item",
      description: "Pasta",
      amount: "450",
      participantIds: ["me", "mia"],
      splitMethod: "equal",
      allocations: [],
      sortOrder: 0,
    },
  ],
  payments: [{ id: "paid", participantId: "me", amount: "450" }],
  rawPayload: { immutableReceipt: "original", transactionId: "source" },
} as unknown as SplitBillSerializedBill;
const { sortOrder, ...editableItem } = bill.items[0];
const update = mergeMobileBillEdit(bill, {
  title: "Lunch",
  addedParticipants: [{ id: "leo", name: "Leo" }],
  items: [{ ...editableItem, participantIds: ["me", "mia", "leo"] }],
});
assert.equal(update.participants.length, 3);
assert.deepEqual(update.payments, bill.payments);
assert.equal(update.rawPayload.immutableReceipt, "original");
assert.equal(bill.participants.length, 2);
assert.equal(
  mobileBillEdit.safeParse({
    title: "Lunch",
    addedParticipants: [{ id: "x", name: "Leo", userId: "forged" }],
    items: [],
  }).success,
  false,
);
console.log(
  "PASS Circle experience: products, currencies, one-time periods, localized dates, exact item splits, membership isolation, native photos and payment-preserving edits.",
);
