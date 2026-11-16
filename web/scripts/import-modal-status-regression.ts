import assert from "node:assert/strict";
import { getLocalPreparseProgressPatch, resolveImportModalStatusDecision } from "@/lib/import-modal-status";
import { parsePlanLimitMessage } from "@/lib/plan-limit-nudges";
import { coerceTransactionTypeFromCategoryName } from "@/lib/transaction-directions";

const main = () => {
  const localPreparsePatch = getLocalPreparseProgressPatch(0);
  assert.equal(
    "status" in localPreparsePatch,
    false,
    "Local pre-scan must leave queued files pending so the upload auto-start effect can run."
  );

  const queuedReceipt = resolveImportModalStatusDecision({
    importMode: "receipt",
    status: "processing",
    processingPhase: "queued_retry",
    processingAttempt: 3,
    processingMessage: "Clover hit a temporary receipt-reading issue and queued backup pass 3/3.",
  });
  assert.equal(queuedReceipt.kind, "waiting");
  assert.equal(queuedReceipt.progressLabel, "Trying backup receipt reader");
  assert.match(queuedReceipt.detail, /queued backup pass 3\/3/i, "The stable stage should keep the helpful retry detail.");
  assert.ok(queuedReceipt.progress >= 4, "Expected queued retry to remain visibly active in the modal.");

  const exhaustedReceipt = resolveImportModalStatusDecision({
    importMode: "receipt",
    status: "failed",
    processingPhase: "repair_needed",
    processingAttempt: 3,
    processingMessage:
      "Clover tried the local and backup receipt readers but still could not extract enough reliable details. Please retry with a clearer photo or a different angle.",
  });
  assert.equal(exhaustedReceipt.kind, "repair_needed");
  assert.equal(exhaustedReceipt.errorCode, "I-104");
  assert.equal(exhaustedReceipt.progressLabel, "Review needed");
  assert.match(exhaustedReceipt.message, /local and backup receipt readers/i);

  const parsedRowsAreNotVisible = resolveImportModalStatusDecision({
    importMode: "statement",
    status: "failed",
    processingPhase: "repair_needed",
    parsedRowsCount: 12,
    confirmedTransactionsCount: 0,
    processingMessage: "Clover could not finish enrichment.",
  });
  assert.equal(
    parsedRowsAreNotVisible.kind,
    "repair_needed",
    "Parsed staging rows must not be reported as visible transactions."
  );

  const confirmedRowsWin = resolveImportModalStatusDecision({
    importMode: "statement",
    status: "processing",
    parsedRowsCount: 12,
    confirmedTransactionsCount: 12,
  });
  assert.equal(confirmedRowsWin.kind, "visible");
  assert.equal(confirmedRowsWin.progress, 100);
  assert.equal(confirmedRowsWin.progressLabel, "Visible in Clover");

  const receiptDocumentWin = resolveImportModalStatusDecision({
    importMode: "receipt",
    status: "processing",
    processingPhase: "reading_receipt_vision",
    hasStructuredReceiptVisibility: true,
  });
  assert.equal(receiptDocumentWin.kind, "visible", "A persisted receipt transaction should settle the modal.");

  const genericWaiting = resolveImportModalStatusDecision({
    importMode: "statement",
    status: "processing",
    processingPhase: "reading_account_details",
    processingAttempt: 1,
  });
  assert.equal(genericWaiting.kind, "waiting");
  assert.equal(genericWaiting.progressLabel, "Reading file details");
  assert.equal(genericWaiting.progress, 40, "Reading file details should occupy its own 40% stage.");

  const identifyingTransactions = resolveImportModalStatusDecision({
    importMode: "statement",
    status: "processing",
    processingPhase: "identifying_transactions",
    telemetryLabel: "Parser detail that must not replace the durable stage",
  });
  assert.equal(identifyingTransactions.progress, 70);
  assert.equal(identifyingTransactions.progressLabel, "Identifying transactions");

  const savingTransactions = resolveImportModalStatusDecision({
    importMode: "statement",
    status: "processing",
    processingPhase: "finalizing",
  });
  assert.equal(savingTransactions.progress, 90);
  assert.equal(savingTransactions.progressLabel, "Saving transactions");

  const laterWaitingAttempt = resolveImportModalStatusDecision({
    importMode: "statement",
    status: "processing",
    processingPhase: "reading_account_details",
    processingAttempt: 50,
  });
  assert.equal(
    laterWaitingAttempt.progress,
    genericWaiting.progress,
    "Poll attempts must not fabricate percentage progress."
  );

  assert.equal(
    parsePlanLimitMessage("Clover could not read enough visible transaction rows from this screenshot.", "pro"),
    null,
    "A parser quality message must never be shown as a billing limit."
  );
  assert.equal(
    parsePlanLimitMessage("Free includes up to 1,000 transaction rows. Upgrade to Pro.", "free")?.limitType,
    "transaction_limit"
  );
  assert.equal(
    coerceTransactionTypeFromCategoryName("Transfers", "expense", "50000", false),
    "expense",
    "An outgoing payment without an owned-account match must remain spending."
  );
  assert.equal(
    coerceTransactionTypeFromCategoryName("Transfers", "income", "3494.94", false),
    "income",
    "Incoming money without an owned-account match must remain income."
  );
  assert.equal(coerceTransactionTypeFromCategoryName("Transfers", "expense", "50000", true), "transfer");

  console.log("Import modal status regression passed.");
};

main();
