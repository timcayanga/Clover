import assert from "node:assert/strict";
import { resolveParsedTransactionCategoryName } from "@/lib/data-engine";

assert.equal(
  resolveParsedTransactionCategoryName({
    categoryName: "Bills & Utilities",
    type: "expense",
    merchantRaw: "Food bill",
    description: "Lunch order",
    rawPayload: { notes: "adobo rice lemonade" },
  }),
  "Food & Dining",
  "Specific food evidence must override a generic Bills & Utilities label for unconfirmed parsed notes."
);

assert.equal(
  resolveParsedTransactionCategoryName({
    categoryName: "Bills & Utilities",
    type: "expense",
    merchantRaw: "Electricity bill",
    rawPayload: { notes: "monthly meter payment" },
  }),
  "Bills & Utilities",
  "Actual utility evidence must retain its original category."
);

console.log("Parsed notes category regression passed.");
