import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

const dataEngineSource = readFileSync(join(process.cwd(), "lib/data-engine.ts"), "utf8");
assert.match(
  dataEngineSource,
  /const parserCategoryName = resolveParsedTransactionCategoryName\(\{[\s\S]*?const parserCategoryWasCorrected =/,
  "The corrected parsed category must be propagated through enrichment before final transactions are created."
);
assert.match(
  dataEngineSource,
  /parserCategoryWasCorrected \|\|\s*protectedParserCategory/,
  "A food correction must take precedence over a conflicting learned Shopping category."
);

assert.equal(
  resolveParsedTransactionCategoryName({
    categoryName: "Shopping",
    type: "expense",
    merchantRaw: "Handwritten lunch",
    description: "Lunch with adobo, rice, and lemonade",
    rawPayload: { notes: "adobo rice lemonade" },
  }),
  "Food & Dining",
  "Specific food evidence must override a generic Shopping label for unconfirmed handwritten notes."
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
