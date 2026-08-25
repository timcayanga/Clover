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

console.log("Receipt camera import regression checks passed.");
