import assert from "node:assert/strict";
import {
  splitItemTotals,
  suggestBillCategory,
  paymentRequestMessage,
} from "../../shared/split-bill-experience";
import {
  mobileSplitBillInput,
  mobileSplitBillPayload,
} from "../lib/mobile-together-input";
import { mergeMobileBillEdit } from "../lib/mobile-split-bill-edit";
import { mobileOperation } from "../lib/mobile-api-policy";
const people = [
  { id: "alex", name: "Alex" },
  { id: "jamie", name: "Jamie" },
  { id: "sam", name: "Sam" },
];
const items = [
  {
    id: "1",
    description: "Pasta",
    amount: "450",
    participantIds: people.map((p) => p.id),
  },
  {
    id: "2",
    description: "Chicken",
    amount: "450",
    participantIds: ["alex", "jamie"],
  },
  { id: "3", description: "Coffee", amount: "300", participantIds: ["sam"] },
];
assert.deepEqual(splitItemTotals(people, items), {
  alex: 375,
  jamie: 375,
  sam: 450,
});
assert.deepEqual(
  splitItemTotals(people, [{ ...items[0], participantIds: [] }]),
  { alex: 0, jamie: 0, sam: 0 },
);
assert.deepEqual(
  Object.values(splitItemTotals(people, [{ ...items[0], amount: "1" }])),
  [0.34, 0.33, 0.33],
);
assert.deepEqual(
  splitItemTotals(people, [
    {
      ...items[0],
      splitMethod: "percentage",
      amount: "100",
      allocations: [
        { participantId: "alex", value: "50" },
        { participantId: "jamie", value: "30" },
        { participantId: "sam", value: "20" },
      ],
    },
  ]),
  { alex: 50, jamie: 30, sam: 20 },
);
assert.deepEqual(splitItemTotals(people, items, 120), {
  alex: 412.5,
  jamie: 412.5,
  sam: 495,
});
assert.deepEqual(splitItemTotals(people, items, -120), {
  alex: 337.5,
  jamie: 337.5,
  sam: 405,
});
assert.equal(suggestBillCategory("Food")?.name, "Food & Dining");
assert.equal(suggestBillCategory("Unknown")?.name, undefined);
const message = paymentRequestMessage("Jamie", [
  {
    title: "Lunch",
    amount: "375",
    currency: "PHP",
    date: "2026-10-22",
    url: "https://clover.ph/split-bill/request/one",
  },
  {
    title: "Taxi",
    amount: "100",
    currency: "PHP",
    url: "https://clover.ph/split-bill/request/two",
  },
]);
assert.match(message, /Hi Jamie!/);
assert.match(message, /Lunch \(2026-10-22\)/);
assert.match(message, /Taxi/);
assert.match(message, /no Clover account needed/);
const input = {
  title: "Lunch",
  note: "",
  billDate: "2026-10-22",
  currency: "PHP",
  total: "1200",
  participants: people.map((p) => ({ name: p.name })),
  paidByIndex: 0,
  reviewedItems: items.map((item) => ({
    description: item.description,
    amount: item.amount,
    participantIndexes: item.participantIds.map((id) =>
      people.findIndex((p) => p.id === id),
    ),
    splitMethod: "equal" as const,
    allocations: [],
  })),
};
const payload = mobileSplitBillPayload(mobileSplitBillInput.parse(input));
assert.equal(payload.items.length, 3);
assert.equal(payload.items[1].participantIds.length, 2);
assert.equal(payload.items[2].participantIds.length, 1);
assert(
  !mobileSplitBillInput.safeParse({
    ...input,
    reviewedItems: [{ ...input.reviewedItems[0], participantIndexes: [] }],
  }).success,
);
assert(
  !mobileSplitBillInput.safeParse({
    ...input,
    reviewedItems: [
      { description: "Bad", amount: "1200", participantIndexes: [29] },
    ],
  }).success,
);
assert.equal(
  mobileOperation("GET", ["split-bills", "bill-id", "payment-requests"]),
  "payment-requests",
);
console.log(
  "PASS Split Bills: landing example totals, checkbox deselection, penny reconciliation, manual items and assignments, category suggestions, multi-bill friendly messages and request retrieval.",
);
