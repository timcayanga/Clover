import { strict as assert } from "node:assert";
import { buildTrainingSignalDedupeKey, normalizeMerchantText } from "@/lib/data-engine";

const baseInput = {
  source: "manual_recategorization" as const,
  transactionId: "txn_123",
  importFileId: null,
  merchantText: "  GrabPay  ",
  categoryId: "cat_food",
  type: "expense" as const,
};

const merchantKey = normalizeMerchantText(baseInput.merchantText);
const firstKey = buildTrainingSignalDedupeKey({
  source: baseInput.source,
  transactionId: baseInput.transactionId,
  importFileId: baseInput.importFileId,
  merchantKey,
  categoryId: baseInput.categoryId,
  type: baseInput.type,
});
const secondKey = buildTrainingSignalDedupeKey({
  source: baseInput.source,
  transactionId: baseInput.transactionId,
  importFileId: baseInput.importFileId,
  merchantKey,
  categoryId: baseInput.categoryId,
  type: baseInput.type,
});
const changedSourceKey = buildTrainingSignalDedupeKey({
  ...baseInput,
  source: "import_confirmation",
  merchantKey,
});
const changedTransactionKey = buildTrainingSignalDedupeKey({
  ...baseInput,
  transactionId: "txn_999",
  merchantKey,
});

assert.equal(firstKey, secondKey, "dedupe key should be stable for identical training signals");
assert.notEqual(firstKey, changedSourceKey, "dedupe key should change when the signal source changes");
assert.notEqual(firstKey, changedTransactionKey, "dedupe key should change when the transaction changes");

console.log("training-signal dedupe regression passed");
