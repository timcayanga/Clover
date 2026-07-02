import assert from "node:assert/strict";
import {
  VISUAL_IMPORT_RETRY_LIMIT,
  canQueueVisualImportRetry,
  coerceVisualImportAttempt,
  getNextVisualImportAttempt,
  getVisualImportRepairMessage,
  getVisualImportRetryMessage,
  isVisualImportRetryBudgetExhausted,
  shouldStopStaleVisualImportRetry,
} from "@/lib/import-visual-recovery";

const main = () => {
  assert.equal(VISUAL_IMPORT_RETRY_LIMIT, 2, "Expected visual imports to get one local attempt plus two recovery passes.");

  assert.equal(coerceVisualImportAttempt(null), 0);
  assert.equal(coerceVisualImportAttempt("1.9"), 1);
  assert.equal(coerceVisualImportAttempt(-1), 0);
  assert.equal(getNextVisualImportAttempt(undefined), 1);
  assert.equal(getNextVisualImportAttempt(1), 2);

  assert.equal(canQueueVisualImportRetry(0), true, "First visual recovery pass should be queued.");
  assert.equal(canQueueVisualImportRetry(1), true, "Second visual recovery pass should be queued.");
  assert.equal(canQueueVisualImportRetry(2), false, "Third visual recovery pass should be blocked.");

  assert.equal(isVisualImportRetryBudgetExhausted(1), false);
  assert.equal(isVisualImportRetryBudgetExhausted(2), true);

  assert.equal(
    shouldStopStaleVisualImportRetry({ processingAttempt: 2, processingPhase: "queued_retry" }),
    false,
    "Queued final recovery pass should still be allowed to start if the worker is delayed."
  );
  assert.equal(
    shouldStopStaleVisualImportRetry({ processingAttempt: 2, processingPhase: "reading_receipt_vision" }),
    true,
    "Stale in-flight final receipt recovery pass should stop instead of looping."
  );
  assert.equal(
    shouldStopStaleVisualImportRetry({ processingAttempt: 2, processingPhase: "reading_account_details" }),
    true,
    "Stale in-flight final screenshot recovery pass should stop instead of looping."
  );

  assert.match(getVisualImportRetryMessage("receipt", 2), /backup pass 2\/2/i);
  assert.match(getVisualImportRetryMessage("statement", 1), /image-reading issue/i);
  assert.match(getVisualImportRepairMessage("receipt"), /local and backup receipt readers/i);
  assert.match(getVisualImportRepairMessage("statement"), /local and backup image readers/i);

  console.log("Import visual recovery regression passed.");
};

main();
