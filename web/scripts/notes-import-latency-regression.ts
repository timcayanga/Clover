import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = join(scriptDir, "..");

const main = async () => {
  const source = await readFile(join(webRoot, "lib/openai-import-parser.ts"), "utf8");

  assert.match(
    source,
    /params\.importMode === "notes" \? \[\] : \["Generic few-shot examples:", GENERIC_FEW_SHOT_EXAMPLES\]/,
    "Notes imports must omit irrelevant bank-statement few-shot examples."
  );
  assert.match(
    source,
    /max_output_tokens: params\.importMode === "notes"\s*\? 1_800/,
    "Notes imports need a bounded response budget for fast single-image extraction."
  );

  console.log("[PASS] Notes imports use the reduced-latency vision prompt budget.");
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
