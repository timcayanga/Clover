import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "lib/openai-import-parser.ts"), "utf8");

assert.match(
  source,
  /const isSinglePageGenericImage =[\s\S]*?inferredDocumentFamily === "generic_document"[\s\S]*?pageImagesToSend\.length === 1/,
  "Single-page generic images must receive the dedicated fast output budget."
);
assert.match(
  source,
  /const maxOutputTokens = isSinglePageGenericImage\s*\? 2_400\s*:/,
  "The fast generic-image budget must remain bounded at 2,400 output tokens."
);
assert.match(source, /max_output_tokens: maxOutputTokens/, "The model request must use the calibrated output budget.");

console.log("Single-page generic image output budget is calibrated for speed.");
