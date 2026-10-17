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
  assert.match(transactionsPage, /searchParams.set\("summaryMode", options\?\.includeAll \|\| summaryOpen \? "full" : options\?\.summaryOnly \? "light" : "rows"\)/, "Visible pages use bounded rows; totals load separately with the light summary.");
  assert.match(transactionsPage, /summaryMode:\s*"light"/);
  const rowStart = transactionsRoute.indexOf('if (searchParams.get("summaryMode") === "rows"');
  const rowPath = transactionsRoute.slice(rowStart, transactionsRoute.indexOf('const [currencyCodes, totalCount]', rowStart));
  assert(rowStart >= 0);
  assert.match(rowPath, /Math.min\(requestedPageSize \?\? 30, 200\)/, "Visible requests are bounded, including 200-row desktop pages.");
  assert.match(rowPath, /skip: \(requestedPage - 1\) \* take/, "A preview retains the selected page's full offset.");
  assert.match(rowPath, /take: previewTake/);
  assert.match(rowPath, /actionableReviewIds\(visibleWhere\)/, "Review pages use the same actionable scope as Home.");
  assert.match(
    transactionsRoute,
    /if \(summaryMode === "light" && filters.reviewFilter !== "pending" && !hasEffectiveCategoryFilters\)/,
    "Unresolved review rows must not force ordinary grouped totals through a full-history projection."
  );
  assert.doesNotMatch(transactionsRoute, /!hasReviewCandidates/);
  assert.match(eventRoute, /const compactImportSnapshot/);
  assert.doesNotMatch(eventRoute, /send\("snapshot", snapshot\)/);

  console.log("[PASS] Interactive Clover flows avoid full-history scans and trace-heavy import streams.");
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
