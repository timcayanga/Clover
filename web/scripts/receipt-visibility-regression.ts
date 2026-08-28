import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = join(scriptDir, "..");

const main = async () => {
  const [visibilitySource, modalSource] = await Promise.all([
    readFile(join(webRoot, "lib/import-settled-visibility.ts"), "utf8"),
    readFile(join(webRoot, "components/import-files-modal.tsx"), "utf8"),
  ]);

  assert.doesNotMatch(
    visibilitySource,
    /if \(params\.importedRows > 0 && params\.importFileId\) \{\s*return true;\s*\}/,
    "A receipt with rows must wait for committed visibility rather than returning true immediately."
  );
  assert.match(visibilitySource, /const statusResponsePromise =/);
  assert.match(visibilitySource, /const confirmedTransactionsCount = Number\(statusPayload\?\.confirmedTransactionsCount \?\? 0\)/);
  assert.match(
    modalSource,
    /const receiptImportedRows = Math\.max\([\s\S]{0,900}await waitForSettledVisibility\(/,
    "Receipt completion must wait before publishing 100%."
  );
  assert.match(
    modalSource,
    /window\.setTimeout\(closeVisibleImportModalIfPrimaryDataReady, 0\);/,
    "A completed receipt batch must close only after its primary data is visible."
  );

  console.log("[PASS] Receipt success waits for visible transactions and schedules dismissal.");
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
