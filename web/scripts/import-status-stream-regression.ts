import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = join(scriptDir, "..");

const main = async () => {
  const [routeSource, statusRouteSource, visibilitySource, modalSource] = await Promise.all([
    readFile(join(webRoot, "app/api/imports/[importId]/events/route.ts"), "utf8"),
    readFile(join(webRoot, "app/api/imports/[importId]/status/route.ts"), "utf8"),
    readFile(join(webRoot, "lib/import-settled-visibility.ts"), "utf8"),
    readFile(join(webRoot, "components/import-files-modal.tsx"), "utf8"),
  ]);

  assert.match(routeSource, /IMPORT_STATUS_STREAM_POLL_MS\s*=\s*1_500/);
  assert.doesNotMatch(routeSource, /setInterval\([^)]*poll/);
  assert.doesNotMatch(
    routeSource,
    /loadImportStatusSnapshot\(importId,\s*\{\s*importFile,/,
    "The status stream must reload the import record instead of polling a stale upload snapshot."
  );
  assert.match(routeSource, /snapshot\.importFile\.status\s*===\s*"failed"/);
  assert.match(routeSource, /consecutiveErrors\s*>=\s*IMPORT_STATUS_STREAM_MAX_ERRORS/);
  assert.match(visibilitySource, /const pollDelayMs\s*=\s*1_500/);
  assert.match(modalSource, /const statusPollDelayMs\s*=\s*1_500/);
  assert.match(
    statusRouteSource,
    /if \(shouldSelfHealEnrichment\) \{\s*after\(async \(\) => \{/,
    "Status reads must return visible transactions before enrichment self-healing runs."
  );
  assert.match(
    statusRouteSource,
    /if \(shouldPersistPublishedAccountSummaries\(snapshot\)\) \{\s*after\(async \(\) => \{/,
    "Publishing derived account summaries must not delay a visibility response."
  );
  assert.match(modalSource, /const queuedImportPollDelayMs = \(\) => Math\.min\(1_000, 500/);

  console.log("[PASS] Import status reads stay bounded and return visibility before deferred cleanup work.");
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
