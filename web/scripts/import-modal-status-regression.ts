import assert from "node:assert/strict";
import { resolveImportModalStatusDecision } from "@/lib/import-modal-status";

const main = () => {
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

  const visibleRowsWin = resolveImportModalStatusDecision({
    importMode: "statement",
    status: "failed",
    processingPhase: "repair_needed",
    parsedRowsCount: 12,
    confirmedTransactionsCount: 0,
    processingMessage: "Clover could not finish enrichment.",
  });
  assert.equal(visibleRowsWin.kind, "visible", "Rows already visible should not render as an import failure.");
  assert.equal(visibleRowsWin.progress, 100);
  assert.equal(visibleRowsWin.progressLabel, "Visible in Clover");

  const receiptDocumentWin = resolveImportModalStatusDecision({
    importMode: "receipt",
    status: "processing",
    processingPhase: "reading_receipt_vision",
    hasStructuredReceiptVisibility: true,
  });
  assert.equal(receiptDocumentWin.kind, "visible", "Receipt document visibility should settle the modal.");

  const genericWaiting = resolveImportModalStatusDecision({
    importMode: "statement",
    status: "processing",
    processingPhase: "reading_account_details",
    processingAttempt: 1,
  });
  assert.equal(genericWaiting.kind, "waiting");
  assert.equal(genericWaiting.progressLabel, "Reading file details");

  console.log("Import modal status regression passed.");
};

main();
