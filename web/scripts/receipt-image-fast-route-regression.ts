import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const parserSource = readFileSync(join(process.cwd(), "lib/openai-import-parser.ts"), "utf8");
const workerSource = readFileSync(join(process.cwd(), "workers/import-processor.ts"), "utf8");

assert.match(
  parserSource,
  /if \(params\.importMode === "receipt"\) \{[\s\S]*?return "generic_document" satisfies OpenAIDocumentFamily;/,
  "Cold receipt images must stay on the compact generic route rather than being promoted by incidental OCR text."
);
assert.match(
  parserSource,
  /genericImageFileName = \/[\s\S]*?\\d\{9,13\}[\s\S]*?webp/,
  "Unix-timestamp camera filenames such as 1686710083.webp must use the generic visual route."
);
assert.match(
  parserSource,
  /const isSinglePageGenericImage =[\s\S]*?isVisualImageImport[\s\S]*?pageImagesToSend\.length === 1/,
  "The compact route must apply to a one-page generic receipt image, not only statement mode."
);
assert.match(
  parserSource,
  /const maxOutputTokens = isReceiptMode[\s\S]*?\? 2_600[\s\S]*?: 1_600/,
  "Ordinary receipts must use the compact response budget while hard receipts retain headroom."
);
assert.match(
  parserSource,
  /const receiptReasoningEffort = isReceiptMode[\s\S]*?"minimal"/,
  "Ordinary receipt extraction must use minimal reasoning."
);
assert.match(
  parserSource,
  /reasoning:\s*\{\s*effort:\s*receiptReasoningEffort\s*\}/,
  "Receipt requests must send the reduced reasoning budget to OpenAI."
);
assert.match(
  workerSource,
  /tapsilogan\|tapsilog\|sisig\|longsilog\|pancit\|bangus\|porkchop/,
  "Filipino food receipt evidence must resolve to Food & Dining before generic fallback categorization."
);
assert.match(
  workerSource,
  /priorExactReceiptCachePromise[\s\S]*?importMode: "receipt"/,
  "Exact receipt retries must look up the workspace-scoped receipt extraction cache."
);
assert.match(
  workerSource,
  /cachedReceiptExtractionCandidate\.validationScore >= 65/,
  "Only validated receipt extractions may bypass another vision request."
);
assert.match(
  workerSource,
  /trainedReceiptDetails =[\s\S]*?cachedReceiptExtraction\?\.receiptDetails \?\?/,
  "A safe exact-cache hit must be selected before the AI receipt parser runs."
);
assert.match(
  workerSource,
  /receiptExtraction: \{[\s\S]*?receiptDetails,[\s\S]*?receiptAccountMatch,[\s\S]*?validation: openAiReceiptValidation/,
  "Successful receipts must persist their normalized details, account hint, and validation result."
);
assert.match(
  workerSource,
  /import_receipt_cache_reused[\s\S]*?openai_call_avoided: true/,
  "Receipt cache reuse must remain measurable as an avoided OpenAI call."
);

console.log(
  "Cold receipt photos use the compact visual route, preserve local categorization, and safely reuse validated exact extractions."
);
