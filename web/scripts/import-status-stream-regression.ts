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
  const workerSource = await readFile(join(webRoot, "workers/imports-worker.ts"), "utf8");
  assert.match(
    workerSource,
    /isMissingImportFileError[\s\S]{0,900}?job\.discard\(\);[\s\S]{0,120}?reason: "import_deleted"/,
    "a deleted queued import should settle as a cancellation instead of retrying a missing source"
  );

  assert.match(routeSource, /IMPORT_STATUS_STREAM_POLL_MS\s*=\s*2_500/);
  assert.match(routeSource, /fetchImportFileStatusCompat/);
  assert.doesNotMatch(routeSource, /setInterval\([^)]*poll/);
  assert.doesNotMatch(
    routeSource,
    /loadImportStatusSnapshot\(importId,\s*\{\s*importFile,/,
    "The status stream must reload the import record instead of polling a stale upload snapshot."
  );
  assert.match(routeSource, /progress\.status\s*===\s*"failed"/);
  assert.match(
    routeSource,
    /lastFullSnapshotStatus\s*!==\s*"done"\s*\|\|\s*Date\.now\(\)\s*>=\s*nextFinalizationCheckAt/,
    "The stream must recheck settlement immediately when processing first reaches done instead of waiting for the retry throttle."
  );
  assert.match(routeSource, /snapshot\.settledImportComplete/);
  assert.match(routeSource, /const compactImportSnapshot/);
  assert.match(routeSource, /send\("snapshot", progressSnapshot\)/);
  assert.doesNotMatch(
    routeSource,
    /send\("snapshot", snapshot\)/,
    "The import stream must not repeatedly serialize trace-rich status payloads."
  );
  assert.doesNotMatch(
    routeSource,
    /snapshot\.importFile\.status\s*===\s*"done"\s*\|\|\s*snapshot\.importFile\.status\s*===\s*"failed"/,
    "A done write status must not close the stream before the read projection settles."
  );
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

  console.log("[PASS] Import status reads stay bounded and close only after settled visibility.");
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
