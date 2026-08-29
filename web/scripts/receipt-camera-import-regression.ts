import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveReceiptAccountHintToAccount } from "../lib/receipt-account-resolution";
import { resolveReceiptCategoryWithPaymentEvidence } from "../lib/receipt-transaction-classification";
import { parseReceiptText } from "../lib/split-bill";

const receiptText = [
  "UNKNOWN MERCHANT",
  "08/16/2026",
  "POS PURCHASE APPROVED",
  "Terminal ID 883104",
  "Card No. 1014",
  "TOTAL PHP 1,250.00",
].join("\n");

const preview = parseReceiptText(receiptText);
assert.equal(preview.receiptAccountMatch?.accountName, "Card");
assert.equal(preview.receiptAccountMatch?.accountLast4, "1014");

const account = resolveReceiptAccountHintToAccount(
  preview.receiptAccountMatch,
  [
    {
      id: "rcbc-1014",
      name: "RCBC 1014",
      institution: "RCBC",
      accountNumber: "4297341138681014",
      type: "credit_card",
      currency: "PHP",
    },
    {
      id: "bpi-3012",
      name: "BPI 3012",
      institution: "BPI",
      accountNumber: "3012",
      type: "bank",
      currency: "PHP",
    },
  ]
);
assert.equal(account?.accountId, "rcbc-1014");

assert.equal(
  resolveReceiptCategoryWithPaymentEvidence({
    proposedCategory: "Transfers",
    receiptContext: receiptText,
  }),
  "Shopping"
);
assert.equal(
  resolveReceiptCategoryWithPaymentEvidence({
    proposedCategory: "Transfers",
    receiptContext: "GCash transfer receipt. Sent via GCash to recipient account 09171234567. POS reference 9912.",
  }),
  "Transfers"
);

const root = process.cwd();
const importModalSource = readFileSync(join(root, "components/import-files-modal.tsx"), "utf8");
const imageCompressionSource = readFileSync(join(root, "lib/import-image-compression.ts"), "utf8");
const transactionsPageSource = readFileSync(join(root, "app/transactions/page.tsx"), "utf8");
const cloverShellSource = readFileSync(join(root, "components/clover-shell.tsx"), "utf8");
const uploadDockSource = readFileSync(join(root, "components/import-upload-dock.tsx"), "utf8");
assert.match(
  transactionsPageSource,
  /const handlePhotoCaptureChange =[\s\S]{0,420}?openImportFiles\(files, false, "receipt"\);/,
  "PWA camera and photo-library uploads must route directly to the receipt parser."
);
assert.match(
  cloverShellSource,
  /handleQuickAddPhotoChange[\s\S]{0,420}?setQuickAddImportMode\("receipt"\)[\s\S]{0,120}?setQuickAddModal\("import"\)/,
  "The shared Camera and Receipt Photo entry points must route directly to the receipt parser on every device."
);
assert.match(
  cloverShellSource,
  /handleQuickAddFileChange[\s\S]{0,420}?setQuickAddImportMode\("statement"\)[\s\S]{0,120}?setQuickAddModal\("import"\)/,
  "The mixed-file picker must remain conservative for statement screenshots."
);
assert.match(
  cloverShellSource,
  /defaultImportMode=\{quickAddImportMode\}/,
  "The shared uploader must pass its explicit receipt or statement intent into the import modal."
);
assert.match(
  cloverShellSource,
  /shell-quick-add-popover__item--receipt[\s\S]{0,420}?Receipt Photo/,
  "Desktop and tablet users must have an explicit receipt-photo upload entry point."
);
assert.match(
  transactionsPageSource,
  /defaultImportMode=\{importSeedMode\}/,
  "The selected camera import mode must be handed to the import modal."
);
assert.match(
  importModalSource,
  /defaultImportMode = "statement"[\s\S]{0,1200}?selectedImportMode: ImportImageMode = defaultImportMode/,
  "The import modal must honor an explicit receipt mode while keeping statement uploads as the default."
);
assert.match(
  transactionsPageSource,
  /Boolean\(options\?\.background\)[\s\S]{0,180}?fetchedTransactions\.length < stableBaseTransactions\.length[\s\S]{0,180}?exactServerTotalCount <= stableBaseTransactions\.length/,
  "A settling background response must not temporarily erase already-visible transactions."
);
assert.match(
  transactionsPageSource,
  /Math\.floor\(transactions\.length \/ MOBILE_TRANSACTIONS_BATCH_SIZE\) \+ 1/,
  "Mobile pagination must continue from the 25-row first page without skipping a 12-row batch."
);
assert.match(
  transactionsPageSource,
  /setMobilePaginationExhausted\(fetchedTransactions\.length === 0 \|\| appendedUniqueTransactionCount === 0\)/,
  "Mobile pagination must stop when a server page adds no transactions."
);
assert.match(
  transactionsPageSource,
  /setWorkspaceCurrencyCodes\(\(current\) => Array\.from\(new Set\(\[\.\.\.current, \.\.\.importedCurrencyCodes\]\)\)\.sort\(\)\)/,
  "A newly imported foreign currency must become filterable before a route remount."
);
assert.match(
  importModalSource,
  /file\.size > Math\.min\(IMPORT_IMAGE_TARGET_SIZE, MAX_IMPORT_FILE_SIZE\)/,
  "Large camera photos must be optimized proactively rather than only after exceeding the upload limit."
);
assert.match(
  imageCompressionSource,
  /const targetUploadBytes = Math\.min\(IMPORT_IMAGE_TARGET_SIZE, maxUploadBytes\)/,
  "Camera optimization must use the OCR-safe upload target as its threshold."
);
assert.match(
  uploadDockSource,
  /primaryActionLabel = isComplete \|\| tone === "error" \? "Close import progress" : "Cancel upload"/,
  "The progress X must cancel an active upload and close only after completion."
);
assert.match(
  importModalSource,
  /launchInBackground\s*\|\|\s*showImportProgressDock[\s\S]{0,220}?return;/,
  "progress-only imports must not set the blocking import-modal visibility flag"
);

const workerSource = readFileSync(join(root, "workers/import-processor.ts"), "utf8");
const openAIParserSource = readFileSync(join(root, "lib/openai-import-parser.ts"), "utf8");
assert.match(
  openAIParserSource,
  /useLowDetailReceiptFastPath[\s\S]{0,12000}?\? "low" : "auto"/,
  "single generic receipt photos should use low image detail for the first structured request"
);
assert.match(
  openAIParserSource,
  /structured_receipt_detail_retry[\s\S]{0,1800}?scoreReceiptExtractionCandidate/,
  "incomplete low-detail receipt reads should be compared against a high-detail retry"
);
assert.match(
  workerSource,
  /const chooseBetterReceiptDetails =[\s\S]{0,1200}?candidateQuality\.score > currentQuality\.score \? candidate : current/,
  "model receipt details must not replace a more complete deterministic receipt preview"
);
assert.match(
  workerSource,
  /effectiveImportMode === "receipt"\s*\? resolvedReceiptAccountId \?\? documentCashAccountId/,
  "receipt documents must prefer the uniquely resolved payment account over Cash"
);
assert.match(
  workerSource,
  /const receiptAccountCurrency =[\s\S]{0,180}?receiptDetails\?\.currency \?\? resolvedMetadata\.currency[\s\S]{0,500}?resolveWorkspaceCashAccountId/,
  "foreign-currency receipts must resolve their Cash account from the receipt currency, not fallback metadata"
);
assert.match(
  workerSource,
  /explicitlyResolvedReceiptAccountId \?\?[\s\S]{0,180}?resolveWorkspaceCashAccountId\(String\(importFile\.workspaceId\), receiptCurrency\)/,
  "receipt confirmation must fall back to a same-currency Cash account when there is no explicit payment-account match"
);
assert.match(
  workerSource,
  /importModeCarriesAccountBalance\(effectiveImportMode\)[\s\S]{0,160}?resolvedMetadata\.endingBalance/,
  "receipt totals must remain transaction evidence and must not be persisted as Cash ending balances"
);
assert.match(
  workerSource,
  /const receiptFileNameDate = parseDateValue\([\s\S]{0,500}?const receiptDateInferredFromFileName = !explicitReceiptDate && Boolean\(receiptFileNameDate\)/,
  "receipts with a missing extracted date should recover an explicit date from the source filename"
);
assert.match(
  workerSource,
  /reviewStatus: receiptNeedsReview \|\| receiptDateInferredFromFileName \? "pending_review" : "confirmed"/,
  "filename-inferred receipt dates must remain review-required"
);
assert.match(
  workerSource,
  /resolveReceiptCategoryWithPaymentEvidence\(\{[\s\S]{0,180}?proposedCategory: trainedCategoryName/,
  "trained receipt categories must still pass through POS-versus-transfer safety"
);
const receiptConfirmationSection = workerSource.slice(
  workerSource.indexOf('if (createdTransactionId) {', workerSource.indexOf('if (importMode === "receipt")')),
  workerSource.indexOf('if (createdTransactionId && documentImport?.id)', workerSource.indexOf('if (importMode === "receipt")'))
);
assert.match(
  receiptConfirmationSection,
  /processingMessage: "Receipt is ready\. Clover is refining names and categories in the background\."[\s\S]{0,180}?confirmedTransactionsCount: 1/,
  "receipt confirmation must publish the core transaction before post-visible detail work"
);
assert.match(
  receiptConfirmationSection,
  /upsertImportEnrichmentJob[\s\S]{0,500}?processImportEnrichmentJobsInBackground/,
  "receipt cleanup must use the durable enrichment job and post-visible scheduler"
);
assert.doesNotMatch(
  receiptConfirmationSection,
  /await processImportEnrichmentJobs\(/,
  "receipt confirmation must not wait for enrichment before becoming visible"
);
const receiptFastHandoffSection = workerSource.slice(
  workerSource.indexOf("const isFastTransactionDocument ="),
  workerSource.indexOf("try {\n    const qaRunResult", workerSource.indexOf("const isFastTransactionDocument ="))
);
assert.match(
  receiptFastHandoffSection,
  /effectiveImportMode === "receipt" \? "fast_receipt" : "fast_notes"[\s\S]{0,2400}?recordImportDataQaInBackground/,
  "receipt QA must start only after the usable transaction handoff"
);
assert.match(
  receiptFastHandoffSection,
  /effectiveImportMode === "notes" && rows\.length > 0/,
  "digital-note transactions must use the same visible-first handoff as receipts"
);
assert.match(
  receiptFastHandoffSection,
  /time_to_usable_ms/,
  "receipt handoff must emit time-to-usable telemetry"
);
assert.match(
  workerSource,
  /loadPersistedDataQaRowsForImport[\s\S]{0,2200}?params\.importMode === "receipt"[\s\S]{0,900}?persistedRows\.length > 0 \? persistedRows : parsedRowsAtHandoff/,
  "receipt QA must score the persisted visible transaction instead of an empty parser-row array"
);
assert.match(
  workerSource,
  /const usableDurationMs = Math\.max\(0, Date\.now\(\) - params\.startedAt\)[\s\S]{0,1800}?timeToUsableMs: usableDurationMs[\s\S]{0,300}?parsingMs: params\.parsingDurationMs \?\? usableDurationMs/,
  "receipt QA timing must be captured before the delayed background callback"
);
assert.doesNotMatch(
  workerSource.slice(
    workerSource.indexOf("const recordImportDataQaInBackground ="),
    workerSource.indexOf("const deleteTransactionsForImportWithTx", workerSource.indexOf("const recordImportDataQaInBackground ="))
  ),
  /totalMs: Date\.now\(\) - params\.startedAt|parsingMs: Date\.now\(\) - params\.startedAt/,
  "the QA scheduler delay must not inflate receipt processing duration"
);

assert.match(
  workerSource,
  /const initialStartIndex = Math\.max\(0, Math\.min\(totalRows, Number\(job\.lastRowIndex \?\? 0\)\)\)/,
  "enrichment retries must resume from the durable row cursor"
);
assert.match(
  workerSource,
  /candidateRows = batchRows[\s\S]{0,500}?eligibleSourceIndices\.has\(sourceRowIndex\)/,
  "enrichment must filter out ineligible rows before loading the rule engine"
);
assert.match(
  workerSource,
  /const appliedUpdates = await applyImportEnrichmentTransactionUpdates\(transactionUpdates\)/,
  "enrichment transaction writes must use one guarded bulk update per batch"
);
assert.match(
  workerSource,
  /normalizedTotalRows <= 25 \? 0 : 1_000/,
  "small-import enrichment should begin immediately and large imports should not wait five seconds"
);

const dataEngineSource = readFileSync(join(root, "lib/data-engine.ts"), "utf8");
assert.match(
  dataEngineSource,
  /loadImportEnrichmentTrainingContext[\s\S]{0,500}?Promise\.all\(\[/,
  "enrichment training inputs must load in parallel"
);
assert.match(
  dataEngineSource,
  /params\.trainingContext \?\? \(await loadImportEnrichmentTrainingContext/,
  "one training snapshot must be reusable across every batch in a job"
);

console.log("Receipt camera import regression checks passed.");
