import assert from "node:assert/strict";
import { classifyGoTymeTransaction } from "@/lib/import-parser";
import { coerceTransactionTypeFromCategoryName } from "@/lib/transaction-directions";

const expectGoTymeClassification = (
  description: string,
  credit: number,
  debit: number,
  expected: { type: "income" | "expense" | "transfer"; categoryName: string }
) => {
  assert.deepEqual(classifyGoTymeTransaction(description, credit, debit), expected, description);
};

expectGoTymeClassification("Outbound Transfer to Maria Santos", 0, 2500, {
  type: "expense",
  categoryName: "Transfers",
});
expectGoTymeClassification("Inbound Interbank Transfer from Maria Santos", 2500, 0, {
  type: "income",
  categoryName: "Transfers",
});
expectGoTymeClassification("Refund for Card Payment at Grab", 500, 0, {
  type: "income",
  categoryName: "Financial",
});
expectGoTymeClassification("Transfer to Jane Doe GoTyme Bank Account", 0, 800, {
  type: "expense",
  categoryName: "Transfers",
});

// The shared finalization rule is intentionally separate from category labels:
// an external transfer stays in the Transfers category but remains spending or
// income until another user-owned account is identified.
assert.equal(coerceTransactionTypeFromCategoryName("Transfers", "expense", undefined, false), "expense");
assert.equal(coerceTransactionTypeFromCategoryName("Transfers", "income", undefined, false), "income");
assert.equal(coerceTransactionTypeFromCategoryName("Transfers", "expense", undefined, true), "transfer");

console.log("GoTyme transaction direction regression passed.");
