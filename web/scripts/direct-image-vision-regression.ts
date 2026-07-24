import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shouldPreferDirectImageStatementVisionPath } from "@/workers/import-processor";

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

const workerSource = readFileSync(join(process.cwd(), "workers/import-processor.ts"), "utf8");
assert.match(
  workerSource,
  /if \(likelyScreenshotStatement && !shouldPreferDirectImageStatementVision && !text\.trim\(\) && pageImages\?\.length\)/,
  "The direct image path must skip the redundant OCR pass before structured vision parsing."
);

console.log("Direct image vision path avoids redundant OCR.");
