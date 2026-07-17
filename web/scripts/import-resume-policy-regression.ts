import assert from "node:assert/strict";
import {
  ACTIVE_IMPORT_STALE_MS,
  AUTO_RESUME_QUEUE_STALE_MS,
  importProcessingLooksActive,
  shouldAutoResumeQueuedImport,
} from "@/lib/import-resume-policy";

const now = Date.parse("2026-07-17T12:00:00.000Z");

assert.equal(
  shouldAutoResumeQueuedImport({
    backgroundOnly: false,
    resumeAttempted: false,
    canResume: true,
    processingPhase: "queued_retry",
    parsedRowsCount: 0,
    confirmedTransactionsCount: 0,
    updatedAt: new Date(now - AUTO_RESUME_QUEUE_STALE_MS + 1).toISOString(),
    now,
  }),
  false,
  "A freshly queued import must not start a competing parser."
);

assert.equal(
  shouldAutoResumeQueuedImport({
    backgroundOnly: false,
    resumeAttempted: false,
    canResume: true,
    processingPhase: "queued_retry",
    parsedRowsCount: 0,
    confirmedTransactionsCount: 0,
    updatedAt: new Date(now - AUTO_RESUME_QUEUE_STALE_MS).toISOString(),
    now,
  }),
  true,
  "A genuinely stale queue may use the inline recovery path."
);

assert.equal(
  shouldAutoResumeQueuedImport({
    backgroundOnly: false,
    resumeAttempted: false,
    canResume: true,
    processingPhase: "identifying_transactions",
    parsedRowsCount: 0,
    confirmedTransactionsCount: 0,
    updatedAt: new Date(now - AUTO_RESUME_QUEUE_STALE_MS * 2).toISOString(),
    now,
  }),
  false,
  "Telemetry from an active parser must not be mistaken for a queued import."
);

assert.equal(
  importProcessingLooksActive({
    status: "processing",
    processingPhase: "identifying_transactions",
    updatedAt: new Date(now - ACTIVE_IMPORT_STALE_MS + 1).toISOString(),
    now,
  }),
  true,
  "The resume endpoint must reject a competing parser while the active worker is fresh."
);

assert.equal(
  importProcessingLooksActive({
    status: "processing",
    processingPhase: "identifying_transactions",
    updatedAt: new Date(now - ACTIVE_IMPORT_STALE_MS).toISOString(),
    now,
  }),
  false,
  "A stale worker remains recoverable after its lease window expires."
);

console.log("Import resume policy regression passed.");
