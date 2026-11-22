import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  hasStrongStructuredPdfParse,
  shouldPreferDirectImageStatementVisionPath,
  shouldPreferDirectReceiptVisionPath,
} from "@/workers/import-processor";
import { inferImportModeForFile } from "@/lib/import-statement-identity";

import { importDocumentMediaType } from "../../shared/import-format-policies";

for (const type of ["", "application/octet-stream", "Application/PDF; charset=binary"]) {
  const fileType = importDocumentMediaType("statement.PDF", type);
  assert.equal(fileType, "application/pdf");
  assert.ok(hasStrongStructuredPdfParse({ fileType, imageImport: false, importMode: "statement",
    parsedRowsLength: 8, parsedDateCoverage: 1, metadataConfidence: 90, hasKnownInstitution: true,
    hasAccountNumber: true, hasMultipleAccountNumbers: false }));
}
assert.equal(importDocumentMediaType("IMG_1.JPG", "application/octet-stream"), "image/jpeg");
assert.equal(importDocumentMediaType("unknown.bin", "application/octet-stream"), "application/octet-stream");
assert.equal(importDocumentMediaType("ledger.pdf", "text/csv"), "text/csv");

assert.equal(
  inferImportModeForFile({ name: "clover-qa-receipt-2.jpg", type: "image/jpeg" }, "statement"),
  "receipt",
  "An explicit receipt filename must use the compact receipt parser instead of the statement fallback."
);
assert.equal(
  inferImportModeForFile({ name: "official_invoice_2026.png", type: "image/png" }, "statement"),
  "receipt",
  "An explicit invoice filename must use the compact receipt parser."
);
assert.equal(
  inferImportModeForFile({ name: "bank-transaction-history.png", type: "image/png" }, "statement"),
  "statement",
  "Statement and transaction-history filenames must remain on the statement path."
);

assert.equal(
  shouldPreferDirectImageStatementVisionPath({
    fileName: "1686710083.webp",
    fileType: "image/webp",
    importMode: "statement",
    text: "",
    textCacheInfo: null,
    trainedReceiptDetails: null,
  }),
  true,
  "A cold unfamiliar image should use the direct structured-vision parser."
);

assert.equal(
  shouldPreferDirectReceiptVisionPath({
    fileName: "recu-restaurante.jpg",
    fileType: "image/jpeg",
    importMode: "receipt",
    trainedReceiptDetails: null,
  }),
  true,
  "An unfamiliar receipt photo should go directly to multilingual structured vision."
);
assert.equal(
  shouldPreferDirectReceiptVisionPath({
    fileName: "trained-receipt.jpg",
    fileType: "image/jpeg",
    importMode: "receipt",
    trainedReceiptDetails: { merchantName: "Known merchant" },
  }),
  false,
  "A trained receipt should preserve its deterministic fast path."
);

// Some Android document providers set only the name. A missing or generic
// MIME type must reach the same reader as a library pick of the same bytes.
for (const fileType of ["", "application/octet-stream"]) {
  const file = { fileName: "IMG_0042.JPEG", fileType };
  assert.ok(shouldPreferDirectImageStatementVisionPath({ ...file, importMode: "statement" }));
  assert.ok(shouldPreferDirectReceiptVisionPath({ ...file, importMode: "receipt" }));
  assert.equal(shouldPreferDirectReceiptVisionPath({ ...file, fileName: "report.pdf", importMode: "receipt" }), false);
}

const workerSource = readFileSync(join(process.cwd(), "workers/import-processor.ts"), "utf8");
const parserSource = readFileSync(join(process.cwd(), "lib/openai-import-parser.ts"), "utf8");
assert.match(
  workerSource,
  /if \(likelyScreenshotStatement && !shouldPreferDirectImageStatementVision && !text\.trim\(\) && pageImages\?\.length\)/,
  "The direct image path must skip the redundant OCR pass before structured vision parsing."
);
assert.match(
  workerSource,
  /if \(imageImport && !trainedReceiptDetails && !canReuseCachedStatementParse && !text\.trim\(\)\) \{[\s\S]*?pageImages\s*=\s*eagerReceiptImages\?\.value\s*\?\?\s*\(await readImportedFileImageDataUrls/,
  "Only prepare image input when no usable local text or trained receipt is available, reusing any prepared image."
);
assert.match(
  parserSource,
  /Preserve the original script exactly; do not translate, romanize, or omit unfamiliar words\./,
  "Receipt transcription must preserve non-English text in its original script."
);
assert.match(
  parserSource,
  /transcriptionStrategy === "fast_only"\s*\? \[imageModel\]/,
  "Fast-only receipt recovery must make at most one transcription model attempt."
);
assert.match(
  parserSource,
  /params\.importMode === "receipt"\s*\? 1_800/,
  "One-page receipt transcription must use a bounded output budget."
);
assert.match(
  parserSource,
  /OPENAI_RECEIPT_VISION_MAX_LONGEST_EDGE = 1440/,
  "Receipt photos must use the lower vision resolution budget."
);
assert.match(
  parserSource,
  /OpenAI parser request completed/,
  "OpenAI import requests must log latency and token usage for cost monitoring."
);
assert.match(
  parserSource,
  /const openAIReceiptJsonSchema = \{[\s\S]*?receipt_account_match:[\s\S]*?receipt_details:[\s\S]*?transactions:/,
  "Receipt vision must use a compact response contract without statement and holdings fields."
);
assert.match(
  parserSource,
  /schema: isReceiptMode\s*\? useReceiptCoreOnly\s*\? openAIReceiptCoreJsonSchema\s*:\s*openAIReceiptJsonSchema\s*:\s*openAIJsonSchema/,
  "Only receipt imports should use the compact response contract."
);
assert.match(
  parserSource,
  /const maxOutputTokens = isReceiptMode\s*\? useReceiptCoreOnly\s*\? 850\s*:\s*inferredDifficulty === "hard"\s*\? 2_600\s*:\s*1_600/,
  "Receipt structured extraction must use a difficulty-aware bounded response budget."
);
assert.match(
  parserSource,
  /const receiptReasoningEffort = isReceiptMode[\s\S]*?\? "low"[\s\S]*?: "none"/,
  "Easy receipt extraction must use a reasoning effort supported by every configured model."
);
assert.doesNotMatch(
  parserSource,
  /receiptReasoningEffort[\s\S]{0,180}"minimal"/,
  "Receipt extraction must not send the unsupported minimal reasoning effort."
);
assert.match(
  parserSource,
  /expandReceiptResponseForInternalValidation\(parsedJson, params\.detectedMetadata\)/,
  "Compact receipt responses must be expanded before the shared downstream validator runs."
);
assert.match(
  workerSource,
  /const transcriptParsed = transcriptPreviewDetails\s*\? null\s*:\s*await measureImportTiming\([^\n]+parseWithClassificationCheck\(/,
  "A usable deterministic receipt transcript must skip the extra paid text parse."
);

console.log("Direct image vision path avoids redundant OCR.");
