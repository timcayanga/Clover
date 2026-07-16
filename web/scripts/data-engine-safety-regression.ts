import assert from "node:assert/strict";
import { buildSourceRowKey, isProtectedTransactionReviewStatus } from "@/lib/data-engine-safety";

assert.equal(isProtectedTransactionReviewStatus("confirmed"), true);
assert.equal(isProtectedTransactionReviewStatus("edited"), true);
assert.equal(isProtectedTransactionReviewStatus("rejected"), true);
assert.equal(isProtectedTransactionReviewStatus("suggested"), false);
assert.equal(
  buildSourceRowKey({ fileFingerprint: "file", statementFingerprint: "statement", page: 2, rowIndex: 4, sourceText: "  ATM   WDL  " }),
  "file|statement|2|4|atm wdl"
);
assert.equal(buildSourceRowKey({}), null);
console.log("Data Engine safety regression passed.");
