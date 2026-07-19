import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readImportedFileTextWithCacheInfo } from "@/lib/import-file-text.server";

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
  const [modalSource, processRouteSource, confirmRouteSource, workerSource, importQueueSource, importProcessorSource, importFileTextSource, settledVisibilitySource, filePostSource, visibilityRulesSource, transactionsPageSource] = await Promise.all([
    readFile(join(webRoot, "components/import-files-modal.tsx"), "utf8"),
    readFile(join(webRoot, "app/api/imports/[importId]/process/route.ts"), "utf8"),
    readFile(join(webRoot, "app/api/imports/[importId]/confirm/route.ts"), "utf8"),
    readFile(join(webRoot, "workers/imports-worker.ts"), "utf8"),
    readFile(join(webRoot, "lib/import-queue.ts"), "utf8"),
    readFile(join(webRoot, "workers/import-processor.ts"), "utf8"),
    readFile(join(webRoot, "lib/import-file-text.server.ts"), "utf8"),
    readFile(join(webRoot, "lib/import-settled-visibility.ts"), "utf8"),
    readFile(join(webRoot, "lib/import-file-post.ts"), "utf8"),
    readFile(join(webRoot, "lib/import-visibility-rules.ts"), "utf8"),
    readFile(join(webRoot, "app/transactions/page.tsx"), "utf8"),
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
  assert.match(modalSource, /itemsRef\.current = nextItems;\s*setItems\(nextItems\);/);
  assert.match(filePostSource, /xhr\.upload\.onload = \(\) => \{\s*onProgress\?\.\(100\);/);
  assert.match(visibilityRulesSource, /Boolean\(item\.importFileId\)[\s\S]{0,100}IMPORT_PROGRESS_PREPARING/);
  assert.match(modalSource, /scheduleQueuedImport\(150\)/);
  assert.match(modalSource, /canonical_import_adopted/);
  assert.match(modalSource, /startedImportMonitorKeys\.has\(monitorKey\)/);
  assert.match(modalSource, /const settledVisible = await waitForSettledVisibility\(/);
  assert.match(modalSource, /progressLabel: "Making transactions visible"/);
  assert.doesNotMatch(
    modalSource,
    /hasCompletedBatchNow[\s\S]{0,500}window\.setTimeout\([\s\S]{0,250}onClose\(\)[\s\S]{0,100}, 0\)/,
    "A completed server job must not close the modal before UI visibility is verified."
  );
  assert.doesNotMatch(
    modalSource,
    /primaryVisibilityCompletedRef\.current = true;[\s\S]{0,300}onClose\(\)/,
    "A successful result must remain visible until the user dismisses it."
  );
  assert.doesNotMatch(
    modalSource,
    /if \(\(backgroundOnly \|\| launchInBackground\) && !activePasswordItem\) \{\s*return null;/,
    "A visible import launched in the background must render its progress dock instead of disappearing."
  );
  assert.match(settledVisibilitySource, /transaction\?\.importFileId === params\.importFileId/);
  assert.match(settledVisibilitySource, /params\.importedRows > 0 \? null : expectedBalance/);
  assert.doesNotMatch(
    settledVisibilitySource,
    /parsedRowsCount >= params\.importedRows/,
    "Parsed staging rows must not satisfy the transaction visibility contract."
  );
  assert.match(
    confirmRouteSource,
    /importFile\.status === "done"[\s\S]{0,800}savedTransactionsCount >= recordedConfirmedTransactions/,
    "Repeated confirmation requests should return the already committed import without rerunning confirmation."
  );
  const duplicateSource = section(modalSource, "if (processPayload?.duplicate)", "capturePostHogClientEvent(\"import_parsed_successfully\"");
  assert.doesNotMatch(duplicateSource, /incomeTotal:\s*0/);
  assert.doesNotMatch(duplicateSource, /await Promise\.resolve\(onImported/);
  assert.doesNotMatch(duplicateSource, /router\.refresh\(\)/);
  assert.match(duplicateSource, /return \{ status: "done", importedRows: 0, summary: null \}/);
  assert.doesNotMatch(
    transactionsPageSource,
    /pendingImportSummary\.optimistic[\s\S]{0,500}setImportOpen\(false\)/,
    "The transactions page must not close the modal before its visibility contract completes."
  );
  assert.match(transactionsPageSource, /const importedTransactionsRefreshDelays = \[400\]/);
  assert.match(
    transactionsPageSource,
    /await Promise\.all\(\[\s*loadWorkspaceMetadata[\s\S]{0,500}loadTransactionsPage/,
    "Post-import settlement must avoid sequential database retry bursts."
  );
  assert.match(
    transactionsPageSource,
    /nextIsEmpty && currentHasValue && mergedTransactionsWithImports\.length > 0\)/,
    "Visible transactions must not be paired with an empty cash-flow summary."
  );
  assert.match(
    transactionsPageSource,
    /nextFinancialsAreEmpty && currentFinancialsHaveValue && hasRecentImportEvidence/,
    "A transient empty aggregate response must not erase cash-flow cards during import settlement."
  );
  assert.match(
    transactionsPageSource,
    /nextTransactionsSnapshot[\s\S]{0,1200}buildVisibleTransactionSummary/,
    "Imported preview rows should update transaction cards in the same UI commit."
  );
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
  assert.match(workerSource, /getImportQueueName\(\)/, "The worker and producer must share the environment-scoped queue.");
  assert.match(
    importQueueSource,
    /process\.env\.NODE_ENV === "production" \? "import-processing" : "import-processing-local"/,
    "Local QA must never consume staging or production import jobs."
  );
  assert.match(
    importFileTextSource,
    /if \(!pdfJsBaseUrl \|\| isPdfPasswordError\(error\)\) \{\s*throw error;/,
    "Password failures must not repeat PDF extraction before prompting the user."
  );
  const directBytesText = await readImportedFileTextWithCacheInfo({
    storageKey: "qa/nonexistent/direct-request-bytes.csv",
    fileType: "text/csv",
    fileName: "direct-request-bytes.csv",
    importMode: "statement",
    sourceBytes: new TextEncoder().encode("date,amount,merchant\n2026-07-19,12.34,QA"),
  });
  assert.match(
    directBytesText.text,
    /12\.34,QA/,
    "Request-byte extraction must not download the just-uploaded file from storage."
  );
  assert.match(
    importProcessorSource,
    /if \(options\.rawFileReady\) \{\s*await options\.rawFileReady;/,
    "Normalized import writes must wait for durable raw-file storage."
  );
  assert.match(
    importProcessorSource,
    /cachedRowsMatchCurrentParser &&/,
    "Cached extracted text may be reused only when its parsed rows still match the current deterministic parser."
  );

  console.log("[PASS] Uploads start immediately, while encrypted files prompt once instead of entering parser retries.");
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
