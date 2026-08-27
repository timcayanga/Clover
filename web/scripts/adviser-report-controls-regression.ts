import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveReportWindow } from "../lib/report-window";

const main = async () => {
  const root = process.cwd();
  const [adviserSource, reportsSource, rangeMenuSource] = await Promise.all([
    readFile(join(root, "app/adviser/page.tsx"), "utf8"),
    readFile(join(root, "app/reports/reports-page-content.tsx"), "utf8"),
    readFile(join(root, "components/reports-range-menu.tsx"), "utf8"),
  ]);

const custom = resolveReportWindow(new Date(2026, 7, 1, 12), {
  from: "2026-05-01",
  to: "2026-07-31",
});
assert.equal(custom.isCustom, true);
assert.equal(custom.currentStart.getFullYear(), 2026);
assert.equal(custom.currentStart.getMonth(), 4);
assert.equal(custom.currentStart.getDate(), 1);
assert.equal(custom.currentEnd.getMonth(), 6);
assert.equal(custom.currentEnd.getDate(), 31);
assert.equal(custom.currentEnd.getHours(), 23);
assert.match(custom.label, /May 1, 2026 to Jul 31, 2026/);

const invalid = resolveReportWindow(new Date(2026, 7, 1, 12), {
  range: "90d",
  from: "2026-07-31",
  to: "2026-05-01",
});
assert.equal(invalid.isCustom, false);
assert.equal(invalid.range, "90d");

assert.match(adviserSource, /href="\/reports">View reports<\/Link>/);
assert.doesNotMatch(adviserSource, /<ReportsStream/);
assert.match(reportsSource, /<ReportsPageStream searchParams=\{searchParams\}/);
assert.match(reportsSource, /href="\/adviser">Ask Adviser<\/Link>/);
assert.match(reportsSource, /currentFrom=\{reportWindow\.from\}/);
assert.match(reportsSource, /reportWindow\.isCustom\s*\? reportCurrentWindowTransactions/);
assert.match(reportsSource, /const isReportSpendingTransaction[\s\S]*return true;/);
assert.doesNotMatch(reportsSource, /for \(const account of workspaceAccountSummaries\)[\s\S]{0,500}reportSankeyAccountIncome\.set/);
assert.match(rangeMenuSource, /type="date"/);
assert.match(rangeMenuSource, /Apply dates/);

  console.log("Adviser report controls regression checks passed.");
};

void main();
