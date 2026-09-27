import assert from "node:assert/strict";
import { enrichFinverseTransactions, finverseUncategorizedBackfillWhere } from "../lib/finverse-enrichment";
import { getTransactionReviewReasons } from "../lib/transaction-review-reasons";

async function main() {
  const descriptions = ["PAYROLL CREDIT", "TAX WITHHELD", "BASE INTEREST", "BILLS PAYMENT MERALCO", "ZXQ 98765", "Bank transaction", "UNKNOWN BANK REFERENCE 98765"];
  const categories = ["Income", "Financial", "Bills & Utilities", "Transfers", "Other"].map((name, i) => ({ id: `cat-${i}`, name, type: name === "Income" ? "income" : name === "Transfers" ? "transfer" : "expense" }));
  const transactions = descriptions.map((description, i) => ({ transaction_id: `tx-${i}`, account_id: "metrobank", posted_date: "2026-09-20", description, amount: { value: i === 0 || i === 2 ? 100 : -100, currency: "PHP" } }));
  const results = await enrichFinverseTransactions({ workspaceId: "synthetic", transactions, institution: "Metrobank", categories, trainingContext: { merchantRules: [], accountRules: [], trainingSignals: [], negativeSignals: [] } });
  for (const i of [0, 1, 2, 3]) {
    const result = results.get(`tx-${i}`)!;
    assert.equal(result.categoryId, ["cat-0", "cat-1", "cat-0", "cat-2"][i], descriptions[i]);
    assert.ok(result.categoryConfidence >= 70, descriptions[i]);
    assert.ok(!getTransactionReviewReasons({ ...result, categoryName: categories.find(c => c.id === result.categoryId)?.name, parserConfidence: 100, accountMatchConfidence: 100, merchantRaw: descriptions[i] }).some(reason => /category/i.test(reason)), descriptions[i]);
  }
  for (const i of [4, 5, 6]) assert.equal(results.get(`tx-${i}`)?.reviewStatus, "pending_review");
  const pending = await enrichFinverseTransactions({ workspaceId: "synthetic", transactions: [{ ...transactions[0], is_pending: true }], categories });
  assert.equal(pending.size, 0);
  assert.deepEqual(finverseUncategorizedBackfillWhere("id"), { id: "id", categoryId: null, categoryConfidence: 0, reviewStatus: "suggested", reviewPriority: "none", duplicateConfidence: 0, isExcluded: false, deletedAt: null, sourceRowKey: { startsWith: "finverse:" } });
  console.log("Finverse enrichment: known Metrobank rows categorized, unknown/pending rows guarded, resync backfill restricted.");
}
void main();
