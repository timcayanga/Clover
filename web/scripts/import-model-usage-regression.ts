import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractOpenAIImportUsage } from "@/lib/openai-import-parser";

const usage = extractOpenAIImportUsage({
  usage: {
    input_tokens: 6_000,
    input_tokens_details: { cached_tokens: 2_500 },
    output_tokens: 900,
    output_tokens_details: { reasoning_tokens: 120 },
    total_tokens: 6_900,
  },
});

assert.deepEqual(usage, {
  inputTokens: 6_000,
  cachedInputTokens: 2_500,
  outputTokens: 900,
  reasoningTokens: 120,
  totalTokens: 6_900,
});
assert.equal(extractOpenAIImportUsage({ usage: {} }).totalTokens, 0);

const parserSource = readFileSync(new URL("../lib/openai-import-parser.ts", import.meta.url), "utf8");
const workerSource = readFileSync(new URL("../workers/import-processor.ts", import.meta.url), "utf8");
const splitBillReceiptRouteSource = readFileSync(
  new URL("../app/api/split-bill-receipts/preview/route.ts", import.meta.url),
  "utf8"
);
assert.match(parserSource, /params\.onUsage\?\.\(usage\)/);
assert.match(parserSource, /stage: "image_transcription"/);
assert.match(parserSource, /stage: "structured_split_bill_repair"/);
assert.match(workerSource, /action: "import\.openai_model_call"/);
assert.match(workerSource, /onUsage: recordOpenAIImportUsage/);
assert.match(splitBillReceiptRouteSource, /action: "import\.openai_model_call"/);
assert.match(splitBillReceiptRouteSource, /onUsage: recordUsage/);

console.log("Import exact model usage regression passed.");
