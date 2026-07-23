import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = join(scriptDir, "..");

const main = async () => {
  const source = await readFile(join(webRoot, "components/import-files-modal.tsx"), "utf8");
  const start = source.indexOf("if (isDocumentImport) {");
  const end = source.indexOf("const payloadIdentity", start);
  assert.notEqual(start, -1, "Missing document import branch.");
  assert.notEqual(end, -1, "Missing document import completion boundary.");
  const documentImportBranch = source.slice(start, end);

  assert.match(documentImportBranch, /await monitorQueuedDocumentImport\(itemId, importFileId, itemImportMode, item\.file\.name\)/);
  assert.doesNotMatch(documentImportBranch, /precomputedReceiptSummary/);
  assert.doesNotMatch(documentImportBranch, /inlineReceiptSummary/);

  console.log("[PASS] Queued receipts cannot publish local pre-parse success before visible confirmation.");
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
