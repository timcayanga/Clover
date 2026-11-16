import assert from "node:assert/strict";
import {
  circleConvertedTotal as total,
  circleCategoryTotals as categories,
  circleActivityEmoji as emoji,
} from "../../shared/circle-overview";
const amounts = Object.freeze({ PHP: 1200, IDR: 100000 });
assert.equal(total(amounts, "PHP", { IDR: 0.0033 }), 1530);
assert.equal(total(amounts, "IDR", { PHP: 300 }), 460000);
assert.equal(total({}, "PHP", {}), 0);
assert.equal(total({ PHP: 0, IDR: 0 }, "USD", {}), 0);
assert.equal(
  total(amounts, "PHP", {}),
  null,
  "Never expose the native subtotal as a complete conversion",
);
for (const rate of [0, -1, Infinity, NaN])
  assert.equal(total(amounts, "PHP", { IDR: rate }), null);
assert.equal(total({ PHP: Infinity }, "PHP", {}), null);
const rows = Object.freeze([
  Object.freeze({
    amount: 1200,
    currency: "PHP",
    categoryName: "Food & Dining",
  }),
  Object.freeze({
    amount: 100000,
    currency: "IDR",
    categoryName: "Food & Dining",
  }),
  Object.freeze({ amount: 100, currency: "PHP", categoryName: "Travel" }),
]);
assert.deepEqual(
  categories(rows as unknown as Parameters<typeof categories>[0], "PHP", {
    IDR: 0.0033,
  }),
  [
    ["Food & Dining", 1530],
    ["Travel", 100],
  ],
);
assert.equal(categories([...rows], "EUR", {}), null);
assert.deepEqual(
  categories(
    [{ amount: 3, currency: "PHP", categoryName: "__proto__" }],
    "PHP",
    {},
  ),
  [["__proto__", 3]],
);
assert.deepEqual(amounts, { PHP: 1200, IDR: 100000 });
assert.equal(emoji("budget.created"), "👛");
assert.equal(emoji("goal.created"), "🎯");
assert.equal(emoji("member.joined"), "👥");
assert.equal(emoji("transaction.shared"), "🧾");
assert.equal(emoji("invitation.created"), "✉️");
assert.equal(emoji("contribution.added"), "💸");
assert.equal(emoji("recurring.created"), "🔁");
console.log(
  "PASS Circle overview: shared-currency conversion, zero contributions, missing/invalid rates, categories, input preservation and activity emojis.",
);
