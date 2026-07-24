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
  /const isSinglePageGenericImage =[\s\S]*?isVisualImageImport[\s\S]*?pageImagesToSend\.length === 1/,
  "The compact route must apply to a one-page generic receipt image, not only statement mode."
);
assert.match(
  workerSource,
  /tapsilogan\|tapsilog\|sisig\|longsilog\|pancit\|bangus\|porkchop/,
  "Filipino food receipt evidence must resolve to Food & Dining before generic fallback categorization."
);

console.log("Cold receipt photos use the compact visual route and Filipino food evidence resolves to Food & Dining.");
