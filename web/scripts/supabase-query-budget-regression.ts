import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = join(scriptDir, "..");

const main = async () => {
  const [userContext, dataEngine, eventRoute, accountsRoute, accountsPage, dashboardPage, enrichmentJobs] =
    await Promise.all([
      readFile(join(webRoot, "lib/user-context.ts"), "utf8"),
      readFile(join(webRoot, "lib/data-engine.ts"), "utf8"),
      readFile(join(webRoot, "app/api/imports/[importId]/events/route.ts"), "utf8"),
      readFile(join(webRoot, "app/api/accounts/route.ts"), "utf8"),
      readFile(join(webRoot, "app/accounts/page.tsx"), "utf8"),
      readFile(join(webRoot, "components/dashboard-page-content.tsx"), "utf8"),
      readFile(join(webRoot, "lib/import-enrichment-jobs.ts"), "utf8"),
    ]);

  assert.doesNotMatch(userContext, /prisma\.user\.upsert/);
  assert.match(userContext, /await prisma\.user\.update/);
  assert.match(userContext, /await prisma\.user\.create/);

  const importCountStart = dataEngine.indexOf("export const countTransactionsByImportFileCompat");
  const importCountSource = dataEngine.slice(importCountStart, importCountStart + 1_500);
  assert.match(importCountSource, /prisma\.transaction\.count/);
  assert.match(importCountSource, /if \(directCount > 0\)/);
  assert.match(importCountSource, /sourceImportFileId/);
  assert.doesNotMatch(importCountSource, /"importFileId" = \$1\s+OR/);

  assert.match(eventRoute, /fetchImportFileStatusCompat/);
  assert.match(eventRoute, /fullSnapshotLoaded/);
  assert.match(eventRoute, /IMPORT_STATUS_STREAM_POLL_MS\s*=\s*2_500/);

  assert.match(accountsRoute, /sourceRowsByImport/);
  assert.match(accountsRoute, /"accountId" IS DISTINCT FROM/);
  assert.doesNotMatch(
    accountsRoute,
    /for \(const row of importRows\) \{\s*await prisma\.transaction\.updateMany/,
    "Imported account repair must batch transaction relinks instead of writing once per row."
  );

  assert.match(accountsPage, /ACCOUNTS_MAINTENANCE_INTERVAL_MS\s*=\s*24 \* 60 \* 60 \* 1000/);
  assert.match(accountsPage, /shouldRunAccountsMaintenance/);
  assert.match(accountsPage, /markAccountsMaintenanceComplete/);
  assert.match(dashboardPage, /account:\s*\{\s*source:\s*"manual"\s*\}/);
  assert.doesNotMatch(
    enrichmentJobs,
    /CREATE (?:UNIQUE )?INDEX IF NOT EXISTS|CREATE TABLE IF NOT EXISTS|ALTER TABLE/,
    "Runtime requests must not execute schema DDL already owned by Prisma migrations."
  );

  console.log("[PASS] Supabase hot paths stay read-mostly, indexed, batched, and migration-owned.");
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
