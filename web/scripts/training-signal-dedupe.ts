import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildTrainingSignalDedupeKey, classifyMerchant, normalizeMerchantText } from "@/lib/data-engine";

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

const manualOverride = classifyMerchant({
  merchantText: "STARBUCKS STORE 0143 CARD PURCHASE",
  categoryText: "STARBUCKS STORE 0143 CARD PURCHASE",
  institution: "HSBC",
  type: "expense",
  categoryName: "Food & Dining",
  merchantRules: [
    {
      merchantKey: "starbucks store 0143 card purchase",
      merchantPattern: "STARBUCKS STORE 0143 CARD PURCHASE",
      normalizedName: "Starbucks",
      categoryId: "cat_shopping",
      categoryName: "Shopping",
      source: "manual_recategorization",
      confidence: 100,
      timesConfirmed: 1,
    },
  ],
  trainingSignals: [],
});
assert.equal(manualOverride.categoryName, "Shopping", "an exact workspace correction should outrank a shared merchant default");
assert.equal(manualOverride.categorySource, "manual_recategorization");

const importedSuggestion = classifyMerchant({
  merchantText: "STARBUCKS STORE 0143 CARD PURCHASE",
  categoryText: "STARBUCKS STORE 0143 CARD PURCHASE",
  institution: "HSBC",
  type: "expense",
  categoryName: "Food & Dining",
  merchantRules: [
    {
      merchantKey: "starbucks store 0143 card purchase",
      merchantPattern: "STARBUCKS STORE 0143 CARD PURCHASE",
      normalizedName: "Starbucks",
      categoryId: "cat_shopping",
      categoryName: "Shopping",
      source: "import_confirmation",
      confidence: 100,
      timesConfirmed: 1,
    },
  ],
  trainingSignals: [],
});
assert.equal(importedSuggestion.categoryName, "Food & Dining", "an unconfirmed import signal must not outrank deterministic merchant evidence");

const transactionRouteSource = readFileSync(
  join(process.cwd(), "app/api/transactions/[transactionId]/route.ts"),
  "utf8"
);
assert.match(transactionRouteSource, /await recordTrainingSignal\(\{/);
assert.doesNotMatch(transactionRouteSource, /void recordTrainingSignal\(\{/);
assert.match(transactionRouteSource, /const merchantText = rawMerchantText \|\| normalizedMerchantName/);
assert.match(transactionRouteSource, /transactionId: transaction\.id,\s+merchantText,/);
assert.match(transactionRouteSource, /normalizedName:\s*normalizedMerchantName/);

console.log("training-signal dedupe regression passed");
