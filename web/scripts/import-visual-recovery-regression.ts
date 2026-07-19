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
  shouldUseReceiptPreviewFastPath,
  shouldStopStaleVisualImportRetry,
} from "@/lib/import-visual-recovery";
import { assessReceiptPreviewQuality, parseReceiptText } from "@/lib/split-bill";

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
    shouldUseReceiptPreviewFastPath({
      receiptPreviewIsUsable: true,
      transactionDate: null,
      total: 2201,
      merchant: "Ever Gotesco Comm",
    }),
    false,
    "A receipt OCR guess without a transaction date must use the backup parser."
  );
  assert.equal(
    shouldUseReceiptPreviewFastPath({
      receiptPreviewIsUsable: true,
      transactionDate: "2025-12-22",
      total: 7782.95,
      merchant: "Jarandjam Inc.",
    }),
    true,
    "Complete high-quality receipt previews may stay on the local fast path."
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

  const restaurantReceipt = parseReceiptText(
    [
      "10/02/2023 13:31:13",
      "Qty Description Amount",
      "2.00 YAKIJAKE BENTO 1100.00",
      "2.00 SALMON POKE 1240.00",
      "2.00 CHOCO PLATE 180.00",
      "5.00 BLUE PLATE 750.00",
      "SUB-TOTAL 3270.00",
      "AMOUNT DUE 3270.00",
      "TOTAL NO OF ITEMS: 17.00",
      "TEMPORARY BILL",
    ].join("\n")
  );
  assert.equal(restaurantReceipt.total, "3270.00", "Item counts must never replace an explicit amount due.");
  assert.equal(restaurantReceipt.items.length, 4);
  assert.equal(
    assessReceiptPreviewQuality(restaurantReceipt).issues.includes("looks like a split allocation worksheet, not a receipt"),
    false,
    "Dense restaurant receipt rows must not be mistaken for a split worksheet when receipt totals are explicit."
  );

  const handwrittenReceipt = parseReceiptText(
    [
      "Bayan Telecommunications, Inc.",
      "RECEIVED from Rey Nimfa",
      "Sum of one hundred P 100",
      "VATable Sales 89.29",
      "Value-Added Tax 10.71",
      "OFFICIAL RECEIPT",
    ].join("\n")
  );
  assert.equal(
    shouldUseReceiptPreviewFastPath({
      receiptPreviewIsUsable: true,
      transactionDate: handwrittenReceipt.billDate,
      total: handwrittenReceipt.total,
      merchant: handwrittenReceipt.merchantName,
    }),
    false,
    "Untrained handwritten receipts with a missing OCR date must use the backup parser."
  );

  console.log("Import visual recovery regression passed.");
};

main();
