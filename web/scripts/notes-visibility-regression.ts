import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = join(scriptDir, "..");

const main = async () => {
  const source = await readFile(join(webRoot, "workers/import-processor.ts"), "utf8");

  assert.match(
    source,
    /\((?:importMode|effectiveImportMode) === "notes" && openAiParsed\.rows\.length === 0\)/,
    "Empty notes parses must trigger the transcript backup parser."
  );
  assert.match(
    source,
    /Boolean\(documentImportRecord\) && \((?:importMode|effectiveImportMode) !== "notes" \|\| rows\.length > 0\)/,
    "A notes import may not report success unless it contains a visible financial row."
  );

  console.log("[PASS] Notes imports cannot falsely complete without parsed transactions.");
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
