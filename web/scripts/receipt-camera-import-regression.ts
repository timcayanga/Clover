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
  /effectiveImportMode === "receipt"\s*\? resolvedReceiptAccountId \?\? documentCashAccountId/,
  "receipt documents must prefer the uniquely resolved payment account over Cash"
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
  /await prisma\.\$transaction\([\s\S]{0,400}?transactionUpdates\.map/,
  "enrichment transaction writes must be batched"
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
