import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "components/import-files-modal.tsx"), "utf8");
const processRouteSource = readFileSync(join(process.cwd(), "app/api/imports/[importId]/process/route.ts"), "utf8");
const duplicateBlockStart = source.indexOf("if (processPayload?.duplicate) {");
const duplicateBlockEnd = source.indexOf("capturePostHogClientEvent(\"import_parsed_successfully\"", duplicateBlockStart);
const duplicateBlock = source.slice(duplicateBlockStart, duplicateBlockEnd);

assert.ok(duplicateBlockStart >= 0 && duplicateBlockEnd > duplicateBlockStart, "The duplicate import handoff must remain identifiable.");
assert.match(
  duplicateBlock,
  /if \(processPayload\?\.queued\)[\s\S]*?await monitorQueuedImportAndConfirm\(/,
  "An adopted in-flight canonical import must wait for the same visibility monitor as a fresh upload."
);
assert.match(
  duplicateBlock,
  /progressLabel: "Finishing matching import"/,
  "An adopted in-flight import must stay visibly active instead of reporting false completion."
);
assert.doesNotMatch(
  processRouteSource,
  /const completedCounterCandidate = canonicalCandidates\.find/,
  "A stale confirmedTransactionsCount must not make an empty completed import canonical."
);
assert.match(
  processRouteSource,
  /const visibleRows = await countTransactionsByImportFileCompat\(candidate\.id\)/,
  "Completed duplicate imports must be verified against real visible transaction rows."
);

console.log("Canonical duplicate imports wait for visible transactions.");
