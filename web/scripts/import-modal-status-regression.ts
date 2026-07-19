import assert from "node:assert/strict";
import { getLocalPreparseProgressPatch, resolveImportModalStatusDecision } from "@/lib/import-modal-status";

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
  assert.equal(queuedReceipt.progressLabel, "Clover hit a temporary receipt-reading issue and queued backup pass 3/3.");
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

  console.log("Import modal status regression passed.");
};

main();
