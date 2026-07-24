import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "lib/openai-import-parser.ts"), "utf8");

assert.match(
  source,
  /const buildCompactGenericImageInputPayload = \(params:[\s\S]*?Parse this one-page financial image for Clover\./,
  "Cold generic images need a compact, document-aware prompt."
);
assert.match(
  source,
  /const userPrompt = isSinglePageGenericImage && inputText\.trim\(\)\.length === 0[\s\S]*?buildCompactGenericImageInputPayload/,
  "Only textless, single-page generic images may use the compact prompt."
);
assert.match(
  source,
  /text:\s*\{[\s\S]*?schema: openAIJsonSchema/,
  "The compact path must retain the strict full response schema."
);

console.log("Single-page generic image prompts are compact without relaxing validation.");
