import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  shouldPreferDirectImageStatementVisionPath,
  shouldPreferDirectReceiptVisionPath,
} from "@/workers/import-processor";

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

const workerSource = readFileSync(join(process.cwd(), "workers/import-processor.ts"), "utf8");
const parserSource = readFileSync(join(process.cwd(), "lib/openai-import-parser.ts"), "utf8");
assert.match(
  workerSource,
  /if \(likelyScreenshotStatement && !shouldPreferDirectImageStatementVision && !text\.trim\(\) && pageImages\?\.length\)/,
  "The direct image path must skip the redundant OCR pass before structured vision parsing."
);
assert.match(
  workerSource,
  /!shouldPreferDirectReceiptVision\s*&&\s*!trainedReceiptDetails/,
  "Direct multilingual receipt vision must bypass the local OCR fan-out."
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
  /schema: isReceiptMode \? openAIReceiptJsonSchema : openAIJsonSchema/,
  "Only receipt imports should use the compact response contract."
);
assert.match(
  parserSource,
  /const maxOutputTokens = isReceiptMode\s*\? 2_200/,
  "Receipt structured extraction must use a bounded response budget."
);
assert.match(
  parserSource,
  /expandReceiptResponseForInternalValidation\(parsedJson, params\.detectedMetadata\)/,
  "Compact receipt responses must be expanded before the shared downstream validator runs."
);
assert.match(
  workerSource,
  /const transcriptParsed = transcriptPreviewDetails\s*\? null\s*:\s*await parseImportTextWithOpenAIFallback/,
  "A usable deterministic receipt transcript must skip the extra paid text parse."
);

console.log("Direct image vision path avoids redundant OCR.");
