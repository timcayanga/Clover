import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveEffectiveAccountBalance } from "../lib/account-balance-projection";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = join(scriptDir, "..");

const main = async () => {
  assert.equal(
    resolveEffectiveAccountBalance({
      accountType: "bank",
      liveBalance: "125.50",
      checkpointStatus: "reconciled",
      checkpointBalance: "100.00",
    }),
    "100.00",
    "A reconciled statement checkpoint must remain authoritative for a cash account."
  );
  assert.equal(
    resolveEffectiveAccountBalance({
      accountType: "bank",
      liveBalance: null,
      checkpointStatus: "reconciled",
      checkpointBalance: "100.00",
    }),
    "100.00",
    "A reconciled checkpoint may fill a missing current projection."
  );
  assert.equal(
    resolveEffectiveAccountBalance({
      accountType: "bank",
      liveBalance: null,
      checkpointStatus: "mismatch",
      checkpointBalance: "100.00",
    }),
    null,
    "A mismatched checkpoint must never become a published balance."
  );
  assert.equal(
    resolveEffectiveAccountBalance({
      accountType: "investment",
      liveBalance: null,
      checkpointStatus: "reconciled",
      checkpointBalance: "100.00",
    }),
    null,
    "Investment balances must remain tied to their live holding projection."
  );

  const [listRoute, detailRoute, statusSnapshot, statusRoute, eventRoute, visibility] = await Promise.all([
    readFile(join(webRoot, "app/api/accounts/route.ts"), "utf8"),
    readFile(join(webRoot, "app/api/accounts/[accountId]/route.ts"), "utf8"),
    readFile(join(webRoot, "lib/import-status-snapshot.ts"), "utf8"),
    readFile(join(webRoot, "app/api/imports/[importId]/status/route.ts"), "utf8"),
    readFile(join(webRoot, "app/api/imports/[importId]/events/route.ts"), "utf8"),
    readFile(join(webRoot, "lib/import-settled-visibility.ts"), "utf8"),
  ]);

  for (const source of [listRoute, detailRoute]) {
    assert.match(source, /resolveEffectiveAccountBalance\(/);
  }
  assert.match(statusSnapshot, /const settledImportComplete = visibleImportComplete && settlementIssues\.length === 0/);
  assert.match(statusSnapshot, /transaction_count_not_settled/);
  assert.match(statusSnapshot, /account_not_visible:/);
  assert.match(statusSnapshot, /balance_not_settled:/);
  assert.match(statusSnapshot, /published_balance_not_settled:/);
  assert.match(statusRoute, /loadImportStatusSnapshot\(/);
  assert.match(eventRoute, /const finished = visible \|\| failed/);
  assert.doesNotMatch(eventRoute, /terminalStatus/);
  assert.match(visibility, /statusPayload\?\.settledImportComplete !== true/);
  assert.doesNotMatch(visibility, /if \(params\.importedRows > 0 && params\.importFileId\) \{\s*return true/);

  console.log("[PASS] Account projections are consistent and imports wait for settled visibility.");
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
