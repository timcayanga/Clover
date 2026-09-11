import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = join(scriptDir, "..");

const main = async () => {
  const [transactionsPage, eventRoute, transactionsRoute] = await Promise.all([
    readFile(join(webRoot, "app/transactions/page.tsx"), "utf8"),
    readFile(join(webRoot, "app/api/imports/[importId]/events/route.ts"), "utf8"),
    readFile(join(webRoot, "app/api/transactions/route.ts"), "utf8"),
  ]);

  const fullSummaryRequests = transactionsPage.match(/summaryMode:\s*"full"/g) ?? [];
  assert.equal(fullSummaryRequests.length, 1, "Only explicit expanded summary may request full aggregation.");
  assert.match(transactionsPage, /if \(summaryOpen && selectedWorkspaceId\) \{\s*void loadTransactionsPage\(selectedWorkspaceId, \{ background: true, summaryMode: "full" \}\)/);
  assert.match(transactionsPage, /summaryMode: options\?\.summaryMode \?\? "light"/, "Ordinary pagination and refresh default to light summaries.");
  assert.match(transactionsPage, /summaryMode:\s*"light"/);
  assert.match(
    transactionsRoute,
    /if \(summaryMode === "light" && !hasEffectiveCategoryFilters && !hasReviewCandidates\)/,
    "The lightweight transaction path stays database-paginated when no derived category/review normalization is needed."
  );
  assert.match(eventRoute, /const compactImportSnapshot/);
  assert.doesNotMatch(eventRoute, /send\("snapshot", snapshot\)/);

  console.log("[PASS] Interactive Clover flows avoid full-history scans and trace-heavy import streams.");
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
