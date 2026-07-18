import assert from "node:assert/strict";
import {
  VISUAL_IMPORT_RETRY_LIMIT,
  canQueueVisualImportRetry,
  coerceVisualImportAttempt,
  getNextVisualImportAttempt,
  getVisualImportRepairMessage,
  getVisualImportRetryMessage,
  isVisualImportRetryBudgetExhausted,
  shouldQueueDifficultVisualImportInsteadOfFailing,
  shouldKeepFailedVisualImportRecoverable,
  shouldLoadReceiptVisionAssets,
  shouldProcessReceiptInline,
  shouldStopStaleVisualImportRetry,
} from "@/lib/import-visual-recovery";

const main = () => {
  assert.equal(VISUAL_IMPORT_RETRY_LIMIT, 3, "Expected visual imports to get one local attempt plus three recovery passes.");

  assert.equal(coerceVisualImportAttempt(null), 0);
  assert.equal(coerceVisualImportAttempt("1.9"), 1);
  assert.equal(coerceVisualImportAttempt(-1), 0);
  assert.equal(getNextVisualImportAttempt(undefined), 1);
  assert.equal(getNextVisualImportAttempt(1), 2);

  assert.equal(canQueueVisualImportRetry(0), true, "First visual recovery pass should be queued.");
  assert.equal(canQueueVisualImportRetry(1), true, "Second visual recovery pass should be queued.");
  assert.equal(canQueueVisualImportRetry(2), true, "Third visual recovery pass should be queued.");
  assert.equal(canQueueVisualImportRetry(3), false, "Fourth visual recovery pass should be blocked.");

  assert.equal(isVisualImportRetryBudgetExhausted(1), false);
  assert.equal(isVisualImportRetryBudgetExhausted(2), false);
  assert.equal(isVisualImportRetryBudgetExhausted(3), true);

  assert.equal(
    shouldStopStaleVisualImportRetry({ processingAttempt: 3, processingPhase: "queued_retry" }),
    false,
    "Queued final recovery pass should still be allowed to start if the worker is delayed."
  );
  assert.equal(
    shouldStopStaleVisualImportRetry({ processingAttempt: 3, processingPhase: "reading_receipt_vision" }),
    true,
    "Stale in-flight final receipt recovery pass should stop instead of looping."
  );
  assert.equal(
    shouldStopStaleVisualImportRetry({ processingAttempt: 3, processingPhase: "reading_account_details" }),
    true,
    "Stale in-flight final screenshot recovery pass should stop instead of looping."
  );

  assert.match(getVisualImportRetryMessage("receipt", 3), /backup pass 3\/3/i);
  assert.match(getVisualImportRetryMessage("statement", 1), /image-reading issue/i);
  assert.match(getVisualImportRepairMessage("receipt"), /local and backup receipt readers/i);
  assert.match(getVisualImportRepairMessage("statement"), /local and backup image readers/i);
  assert.equal(
    shouldQueueDifficultVisualImportInsteadOfFailing({
      knownDifficultVisualImport: true,
      forceInlineProcessing: false,
      canReuseCachedParseSnapshot: false,
    }),
    true,
    "Known difficult visual imports should queue backup parsing instead of immediately returning I-104."
  );
  assert.equal(
    shouldQueueDifficultVisualImportInsteadOfFailing({
      knownDifficultVisualImport: true,
      forceInlineProcessing: true,
      canReuseCachedParseSnapshot: false,
    }),
    false,
    "Forced inline processing should still honor the caller's explicit processing path."
  );
  assert.equal(
    shouldQueueDifficultVisualImportInsteadOfFailing({
      knownDifficultVisualImport: true,
      forceInlineProcessing: false,
      canReuseCachedParseSnapshot: true,
    }),
    false,
    "Reusable cached parses should not be sent through unnecessary visual recovery."
  );
  assert.equal(
    shouldKeepFailedVisualImportRecoverable({
      importMode: "receipt",
      isVisualImport: true,
      processingAttempt: 2,
    }),
    true,
    "Visual receipt imports should remain recoverable while retry budget remains."
  );
  assert.equal(
    shouldKeepFailedVisualImportRecoverable({
      importMode: "statement",
      isVisualImport: true,
      processingAttempt: 3,
    }),
    false,
    "Visual statement imports should fail closed once retry budget is exhausted."
  );
  assert.equal(
    shouldKeepFailedVisualImportRecoverable({
      importMode: "receipt",
      isVisualImport: false,
      processingAttempt: 1,
    }),
    false,
    "Non-visual imports should not be held in visual recovery."
  );
  assert.equal(
    shouldProcessReceiptInline({ forceInlineProcessing: false }),
    false,
    "Normal receipt uploads should return promptly and continue parsing after the response."
  );
  assert.equal(
    shouldProcessReceiptInline({ forceInlineProcessing: true }),
    true,
    "Explicit QA runs should retain forced inline receipt processing."
  );
  assert.equal(
    shouldLoadReceiptVisionAssets({
      imageImport: true,
      importMode: "receipt",
      hasTrainedReceiptDetails: false,
      receiptPreviewIsUsable: false,
      skipVisualBackupParser: false,
    }),
    true,
    "Untrained receipts with weak local OCR must send the source image to the vision backup parser."
  );
  assert.equal(
    shouldLoadReceiptVisionAssets({
      imageImport: true,
      importMode: "receipt",
      hasTrainedReceiptDetails: false,
      receiptPreviewIsUsable: true,
      skipVisualBackupParser: false,
    }),
    false,
    "Reliable local receipt parses should keep the fast path."
  );
  assert.equal(
    shouldLoadReceiptVisionAssets({
      imageImport: true,
      importMode: "receipt",
      hasTrainedReceiptDetails: true,
      receiptPreviewIsUsable: false,
      skipVisualBackupParser: false,
    }),
    false,
    "Trained receipt fixtures should not pay the vision fallback cost."
  );

  console.log("Import visual recovery regression passed.");
};

main();
