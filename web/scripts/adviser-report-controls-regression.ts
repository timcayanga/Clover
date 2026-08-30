import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getCalendarDayEndInTimeZone, resolveReportWindow } from "../lib/report-window";

const main = async () => {
  const root = process.cwd();
  const [adviserSource, adviserChatSource, reportsSource, rangeMenuSource, currencyFilterSource, moneyChartSource, globalStyles] = await Promise.all([
    readFile(join(root, "app/adviser/page.tsx"), "utf8"),
    readFile(join(root, "app/api/adviser/chat/route.ts"), "utf8"),
    readFile(join(root, "app/reports/reports-page-content.tsx"), "utf8"),
    readFile(join(root, "components/reports-range-menu.tsx"), "utf8"),
    readFile(join(root, "components/reports-currency-filter.tsx"), "utf8"),
    readFile(join(root, "components/reports-money-over-time-chart.tsx"), "utf8"),
    readFile(join(root, "app/globals.css"), "utf8"),
  ]);

const custom = resolveReportWindow(new Date(2026, 7, 1, 12), {
  from: "2026-05-01",
  to: "2026-07-31",
});

const manilaDayEnd = getCalendarDayEndInTimeZone(new Date("2026-08-27T17:00:00.000Z"), "Asia/Manila");
assert.equal(manilaDayEnd.getFullYear(), 2026);
assert.equal(manilaDayEnd.getMonth(), 7);
assert.equal(manilaDayEnd.getDate(), 28, "Report windows must include the user's current local calendar day.");
assert.equal(manilaDayEnd.getHours(), 23);
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
assert.match(adviserSource, /boundedCurrentSavingsRate = currentSavingsRate === null \? null : clamp\(currentSavingsRate, 0, 1\)/);
assert.match(adviserChatSource, /currentSavingsRate: boundedCurrentSavingsRate/);
assert.match(adviserChatSource, /Savings rate: \$\{boundedCurrentSavingsRate/);
assert.doesNotMatch(adviserSource, /<ReportsStream/);
assert.match(reportsSource, /<ReportsPageStream searchParams=\{searchParams\}/);
assert.match(reportsSource, /<AdviserHeaderLink \/>/);
assert.match(reportsSource, /currentFrom=\{reportWindow\.from\}/);
assert.match(reportsSource, /const reportDisplayTransactions = reportCurrentWindowTransactions;/);
assert.doesNotMatch(reportsSource, /latest available activity/i);
assert.match(reportsSource, /resolveFinancialTransactionType\(\{/);
assert.match(reportsSource, /getTransactionSummaryTypeOverrides\(/);
assert.match(reportsSource, /const activeWorkspace = cookieWorkspace \?\? userWorkspaces\[0\] \?\? null;/);
assert.match(reportsSource, /Math\.min\(1, Math\.max\(0, currentNet \/ currentSummary\.income\)\)/);
assert.match(reportsSource, /let runningBalance = totalAccountBalance - currentNet;/);
assert.match(reportsSource, /dailyNetByDate/);
assert.match(reportsSource, /<ReportsMoneyOverTimeChart/);
assert.doesNotMatch(reportsSource, /<span>Current balance<\/span>/);
assert.match(reportsSource, /const currencyScopedTransactions = requestedCurrency/);
assert.match(reportsSource, /formatCurrencyCode\(transaction\.account\.currency\) === requestedCurrency/);
assert.match(reportsSource, /formatCurrencyCode\(account\.currency\) === requestedCurrency/);
assert.match(reportsSource, /buildReportPieSlicePath\(offset, nextOffset\)/);
assert.match(reportsSource, /<CategoryBrandMark categoryName=\{segment\.categoryName\}/);
assert.doesNotMatch(reportsSource, /Beginning balance is estimated from the current account balance/);
assert.doesNotMatch(reportsSource, /for \(const account of workspaceAccountSummaries\)[\s\S]{0,500}reportSankeyAccountIncome\.set/);
assert.match(rangeMenuSource, /type="date"/);
assert.match(rangeMenuSource, /Apply dates/);
assert.match(rangeMenuSource, /window\.location\.replace\(/);
assert.doesNotMatch(rangeMenuSource, /window\.location\.assign/);
assert.match(currencyFilterSource, /Filter reports by currency/);
assert.match(currencyFilterSource, /params\.set\("currency", formatCurrencyCode\(next\)\)/);
assert.match(currencyFilterSource, /params\.delete\("currency"\)/);
assert.match(currencyFilterSource, /window\.location\.replace\(/);
assert.match(moneyChartSource, /onPointerMove=\{\(event\) => handlePointerMove\(event\.clientX\)\}/);
assert.match(moneyChartSource, /onPointerDown=\{\(event\) => handlePointerSelection\(event\.clientX\)\}/);
assert.match(moneyChartSource, /`Balance on \$\{dateFormatter\.format/);
assert.match(moneyChartSource, /`Current balance · \$\{dateFormatter\.format/);
assert.doesNotMatch(moneyChartSource, /reports-money-chart__summary/);
assert.match(moneyChartSource, /reports-money-chart__y-axis/);
assert.match(moneyChartSource, /formatCurrencyAmount\(tick\.value, currency\)/);
assert.match(moneyChartSource, /observedRange \* 0\.14/);
assert.doesNotMatch(moneyChartSource, /Math\.min\(0, \.\.\.values\)/);
assert.match(moneyChartSource, /reports-money-chart__tooltip/);
assert.match(reportsSource, /<strong className="positive">\{formatCurrency\(currentSummary\.income\)\}<\/strong>/);
assert.match(reportsSource, /<strong className="negative">\{formatCurrency\(currentSummary\.expense\)\}<\/strong>/);
assert.match(globalStyles, /\.content--reports \.report-flow-map__bar \{[\s\S]{0,160}height: 36px/);
assert.match(globalStyles, /\.content--reports \.report-sankey__chart-wrap \{[\s\S]{0,180}min-height: 520px/);
assert.doesNotMatch(globalStyles, /\.content--reports \.reports-currency-filter__button \{[\s\S]{0,100}min-height: 40px/);

  console.log("Adviser report controls regression checks passed.");
};

void main();
