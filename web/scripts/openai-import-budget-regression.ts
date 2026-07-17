import assert from "node:assert/strict";
import { getRemainingOpenAIImportAttemptTimeout } from "@/lib/openai-import-parser";

const nowMs = Date.parse("2026-07-17T12:00:00.000Z");

assert.equal(
  getRemainingOpenAIImportAttemptTimeout({
    deadlineMs: nowMs + 100_000,
    requestedTimeoutMs: 150_000,
    nowMs,
  }),
  100_000,
  "A model attempt must not exceed the shared fallback deadline."
);

assert.equal(
  getRemainingOpenAIImportAttemptTimeout({
    deadlineMs: nowMs + 30_000,
    requestedTimeoutMs: 15_000,
    nowMs,
  }),
  15_000,
  "A shorter per-attempt timeout should remain intact."
);

assert.equal(
  getRemainingOpenAIImportAttemptTimeout({
    deadlineMs: nowMs + 4_999,
    requestedTimeoutMs: 45_000,
    nowMs,
  }),
  null,
  "Fallback retries must stop when too little persistence budget remains."
);

console.log("OpenAI import budget regression passed.");
