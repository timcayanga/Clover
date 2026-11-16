import { needsReceiptDetailRefresh } from "../lib/pending-receipt-details";
import assert from "node:assert/strict";
import { mergeRefreshedTransactionDetailDraft, type TransactionDetailDraftValue } from "../lib/transaction-detail-draft";

const baseline: TransactionDetailDraftValue = {
  merchantRaw: "Receipt", merchantClean: "Receipt", date: "2026-09-08",
  accountId: "fixture", categoryId: "", amount: "1", currency: "PHP",
  type: "debit", description: "", isExcluded: false, isTransfer: false, receiptLineItems: [],
};
const enriched = { ...baseline, description: "Imported note", merchantClean: "Enriched title" };
assert.deepEqual(mergeRefreshedTransactionDetailDraft(baseline, baseline, enriched), enriched);
const edited = { ...baseline, description: "User note", amount: "2", isExcluded: true };
const merged = mergeRefreshedTransactionDetailDraft(edited, baseline, enriched);
assert.equal(merged.description, "User note");
assert.equal(merged.amount, "2");
assert.equal(merged.isExcluded, true);
assert.equal(merged.merchantClean, "Enriched title");
const withNote = { ...baseline, description: "Old note" };
assert.equal(mergeRefreshedTransactionDetailDraft(baseline, withNote, enriched).description, "");
assert.equal(baseline.description, "");
const line = { description: "Imported item", quantity: "1", currency: "PHP", unitPrice: "1", amount: "1" };
const withLines = { ...baseline, receiptLineItems: [line] };
assert.deepEqual(mergeRefreshedTransactionDetailDraft(edited, baseline, withLines).receiptLineItems, [line]);
// Explicitly removing an existing item must not be undone by enrichment.
assert.deepEqual(mergeRefreshedTransactionDetailDraft(baseline, withLines, withLines).receiptLineItems, []);
const editedLines = { ...withLines, receiptLineItems: [{ ...line, description: "User item" }] };
assert.equal(mergeRefreshedTransactionDetailDraft(editedLines, withLines, baseline).receiptLineItems[0].description, "User item");
console.log("PASS: refresh accepts enrichment and preserves edited/cleared draft fields.");

// Only recent imported receipts with missing items should poll.

const now = Date.parse("2026-09-20T00:00:00Z");
const pending = { id: "receipt", importFileId: "synthetic", createdAt: new Date(now - 1000).toISOString(), rawPayload: { source: "receipt" } };
assert.equal(needsReceiptDetailRefresh(pending, now), true);
assert.equal(needsReceiptDetailRefresh({ ...pending, importFileId: null }, now), false);
assert.equal(needsReceiptDetailRefresh({ ...pending, createdAt: "invalid" }, now), false);
assert.equal(needsReceiptDetailRefresh({ ...pending, createdAt: new Date(now - 121000).toISOString() }, now), false);
assert.equal(needsReceiptDetailRefresh({ ...pending, rawPayload: { source: "statement" } }, now), false);
assert.equal(needsReceiptDetailRefresh({ ...pending, rawPayload: { source: "receipt", receiptLineItems: [{ description: "Item", amount: "25" }] } }, now), false);
