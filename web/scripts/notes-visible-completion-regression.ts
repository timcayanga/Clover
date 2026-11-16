import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = join(scriptDir, "..");

const main = async () => {
  const source = await readFile(join(webRoot, "components/import-files-modal.tsx"), "utf8");

  assert.match(
    source,
    /importMode === "receipt" \|\| importMode === "notes" \? 240_000/,
    "Notes imports need enough time for the backup reader and visibility handoff."
  );
  assert.match(
    source,
    /statusDecision\.kind === "visible" && \(importStatus === "done" \|\| importMode === "notes"\)/,
    "Persisted notes transactions must complete the modal before background finalization is done."
  );
  assert.match(
    source,
    /Notes transaction was saved before the import modal completed/,
    "Notes completion must verify transaction visibility before reporting 100%."
  );

  console.log("[PASS] Visible notes transactions complete the import modal.");
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
