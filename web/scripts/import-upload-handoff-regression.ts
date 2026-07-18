import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = join(scriptDir, "..");

const section = (source: string, start: string, end: string) => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Missing section start: ${start}`);
  assert.notEqual(endIndex, -1, `Missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
};

const main = async () => {
  const [modalSource, processRouteSource, workerSource, importProcessorSource] = await Promise.all([
    readFile(join(webRoot, "components/import-files-modal.tsx"), "utf8"),
    readFile(join(webRoot, "app/api/imports/[importId]/process/route.ts"), "utf8"),
    readFile(join(webRoot, "workers/imports-worker.ts"), "utf8"),
    readFile(join(webRoot, "workers/import-processor.ts"), "utf8"),
  ]);
  const localPreparseSource = section(
    modalSource,
    "async function preparsePendingItemLocally",
    "const removeItem"
  );
  const uploadHandoffSource = section(modalSource, "const processFile", "const processResponse = await");

  assert.match(modalSource, /autoStartRef\.current = true;[\s\S]{0,500}scheduleQueuedImport\(\);/);
  assert.match(modalSource, /const scheduleQueuedImport = \(delayMs = 0\) =>/);
  assert.match(modalSource, /void handleStartImportRef\.current\(\)/);
  assert.match(modalSource, /uploadRunnerActiveRef\.current = true/);
  assert.match(modalSource, /scheduleQueuedImport\(150\)/);
  assert.match(modalSource, /canonical_import_adopted/);
  assert.match(modalSource, /startedImportMonitorKeys\.has\(monitorKey\)/);
  assert.doesNotMatch(modalSource, /if \(busy \|\| !workspaceId \|\| !autoStartRef\.current\)/);
  assert.match(modalSource, /const incomingKeys = new Set\(nextFiles\.map\(fileKey\)\)/);
  assert.match(modalSource, /const serverImportStillActive = hasActiveServerImport\(itemsRef\.current\)/);
  assert.match(modalSource, /reportImportClientStage\("file_input_changed"/);
  assert.doesNotMatch(
    localPreparseSource,
    /requestPasswordForItem/,
    "Advisory local parsing must not block upload by opening the password flow."
  );
  assert.match(uploadHandoffSource, /postFileWithProgress\(/);
  assert.match(processRouteSource, /sourceFingerprint: fileFingerprint/);
  assert.match(processRouteSource, /reusableRawImport[\s\S]{0,900}storageKey: rawStorageKey/);
  assert.match(processRouteSource, /canonicalImportFileId: canonicalImport\.id/);
  assert.match(processRouteSource, /countTransactionsByImportFileCompat\(candidate\.id\)/);
  assert.match(processRouteSource, /isPdfUpload\(effectiveFileName, effectiveFileType\)[\s\S]{0,180}shouldQueueDocumentUpload/);
  assert.match(processRouteSource, /await uploadPromise;[\s\S]{0,500}processingMessage: canonicalStillProcessing/);
  assert.match(importProcessorSource, /sourceFingerprint: importFile\.sourceFingerprint/);
  assert.match(importProcessorSource, /countTransactionsByImportFileCompat\(sourceMatch\.id\)/);
  assert.match(importProcessorSource, /already imported and skipped the duplicate/);
  assert.match(importProcessorSource, /textCacheInfo\?\.fileFingerprint[\s\S]{0,180}importFile\.sourceFingerprint/);
  assert.doesNotMatch(
    uploadHandoffSource,
    /await extractTextFromFile/,
    "The original file must reach the server without waiting for browser-side parsing."
  );
  assert.ok(
    (processRouteSource.match(/if \(isImportPasswordError\(error, errorMessage\)\) \{\s*throw error;/g) ?? []).length >= 2,
    "Both server PDF preflight paths must return password errors to the API boundary."
  );
  assert.match(workerSource, /if \(isPdfPasswordError\(error\)\) \{\s*job\.discard\(\);/);
  assert.match(workerSource, /processingPhase: "password_required"/);

  console.log("[PASS] Uploads start immediately, while encrypted files prompt once instead of entering parser retries.");
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
