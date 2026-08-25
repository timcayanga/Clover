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

console.log("Direct image vision path avoids redundant OCR.");
