import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  analyzeReport,
  defaultReportView,
  reportDay,
  reportPeriod,
  savingsRate,
  selectedReportRows,
  type ReportRow,
} from "../../shared/reports/analysis";
import { reportViewSchema, reportViewFromParams } from "../lib/report-view";
import { reportTransactionParams } from "../../shared/reports/drilldown";
import { reportTransactionFilters } from "../../mobile/src/report-drilldown";
const view = {
  ...defaultReportView,
  range: "custom" as const,
  from: "2026-07-01",
  to: "2026-09-30",
  currency: "PHP",
};
const period = reportPeriod(view, "2026-10-07");
let n = 0;
const row = (
  date: string,
  amount: number,
  type: ReportRow["type"] = "expense",
  category = "Food",
  accountId = "bank",
): ReportRow => ({
  id: String(++n),
  date,
  amount,
  type,
  category,
  currency: "PHP",
  accountId,
  account: accountId,
  merchant: category,
  reviewStatus: "confirmed",
});
const rows = [
  row("2026-07-10", 1000, "income", "Salary"),
  row("2026-07-10", 400),
  row("2026-09-10", 1200),
  row("2026-08-10", 5000, "transfer"),
  row("2026-06-01", 600),
  row("2026-06-02", 300, "expense", "Travel"),
  row("2026-10-01", 9999),
];
const before = JSON.stringify(rows),
  a = analyzeReport(rows, period);
assert.deepEqual(a.current, { income: 1000, expense: 1600 });
assert.deepEqual(
  a.monthly.map((m) => [m.month, m.income, m.expense]),
  [
    ["2026-07", 1000, 400],
    ["2026-08", 0, 0],
    ["2026-09", 0, 1200],
  ],
);
assert.deepEqual(
  a.statement.find((r) => r.name === "Food")?.values,
  [400, 0, 1200],
);
assert.equal(a.statement.find((r) => r.name === "Food")?.average, 1600 / 3);
assert.equal(
  a.trends.find((r) => r.name === "Travel")?.change,
  -100,
  "A category disappearing this period is still a trend",
);
assert.equal(a.pace.at(-1)?.current, 1600);
assert.equal(a.pace.at(-1)?.previous, 900);
assert.equal(a.transferActivity.count, 1);
assert.equal(savingsRate(1000, 1600), -60);
assert.equal(savingsRate(0, 100), null);
assert.equal(
  JSON.stringify(rows),
  before,
  "Reports must not change financial rows",
);
assert.equal(analyzeReport([], period).monthly.length, 3);
assert.deepEqual(analyzeReport([], period).current, { income: 0, expense: 0 });
assert.equal(
  reportDay(new Date("2026-10-06T16:30:00Z"), "Asia/Manila"),
  "2026-10-07",
);
assert.equal(
  reportDay(new Date("2026-10-06T16:30:00Z"), "America/Los_Angeles"),
  "2026-10-06",
);
assert.deepEqual(
  reportPeriod(
    { ...view, from: "2024-02-29", to: "2024-02-29", compare: "year" },
    "2026-10-07",
  ),
  {
    from: "2024-02-29",
    to: "2024-02-29",
    previousFrom: "2023-02-28",
    previousTo: "2023-02-28",
    comparison: "year",
  },
);
for (const [from, to] of [
  ["2026-02-30", "2026-03-01"],
  ["2026-09-10", "2026-09-01"],
  ["2026-10-01", "2027-01-01"],
])
  assert.throws(() => reportPeriod({ ...view, from, to }, "2026-10-07"));
assert.equal(
  analyzeReport(
    rows,
    reportPeriod({ ...view, from: "2026-07-15" }, "2026-10-07"),
  ).monthly[0].partial,
  true,
);
const testRows = [
  ...rows,
  {
    ...row("2026-08-02", 25),
    reviewStatus: "pending_review",
    accountId: "cash",
  },
];
assert.equal(
  selectedReportRows(testRows, {
    ...view,
    accounts: ["cash"],
    review: "pending",
  }).length,
  1,
);
assert.equal(
  selectedReportRows(testRows, { ...view, accounts: ["__none__"] }).length,
  0,
);
assert.equal(
  selectedReportRows(testRows, { ...view, categories: ["Travel"] }).length,
  1,
);
assert.equal(
  analyzeReport(
    selectedReportRows(testRows, { ...view, transfers: "only" }),
    period,
  ).current.expense,
  0,
);
const saved = {
  ...view,
  section: "trends" as const,
  accounts: ["bank"],
  categories: ["Food"],
  compare: "year" as const,
  trendCategories: ["Food"],
  chart: "Table" as const,
};
assert.deepEqual(reportViewSchema.parse(saved), saved);
assert.equal(
  reportViewSchema.safeParse({ ...saved, section: "admin" }).success,
  false,
);
assert.equal(
  reportViewSchema.safeParse({ ...saved, accounts: Array(101).fill("bank") })
    .success,
  false,
);
assert.deepEqual(
  reportViewFromParams(new URLSearchParams("accountId=bank")).accounts,
  ["bank"],
);
const drilldown = reportTransactionParams(
  saved,
  "PHP",
  "2026-07-01",
  "2026-07-31",
  [{ id: "food-id", name: "Food" }],
  { category: "Food", type: "expense" },
);
assert.equal(drilldown.get("categories"), "food-id");
assert.equal(drilldown.get("types"), "debit");
const native = reportTransactionFilters(drilldown.toString());
assert(native);
assert.deepEqual(native.filters.accounts, ["bank"]);
assert.deepEqual(native.filters.categories, ["food-id"]);
assert.equal(native.filters.customEnd, "2026-07-31");
assert.equal(reportTransactionFilters("customStart=bad"), null);
const drift = reportTransactionParams(view, "PHP", view.from, view.to, [], {
  merchant: "Acme",
  type: "income",
});
assert.equal(drift.get("types"), "credit");
assert.equal(
  reportTransactionFilters(drift.toString())?.filters.merchants?.[0],
  "Acme",
);
const schema = readFileSync("prisma/schema.prisma", "utf8");
assert.match(schema, /model SavedReport[\s\S]*?onDelete: Cascade/);
const load = readFileSync("lib/reports-workspace.ts", "utf8");
assert.match(load, /buildActiveWorkspaceTransactionWhere\(workspaceId\)/);
assert.match(load, /if \(!paid\)[\s\S]*analysis.statement = \[\]/);
assert.match(load, /analysis.trends = \[\]/);
const api = readFileSync("app/api/reports/saved/route.ts", "utf8");
assert.match(api, /assertTrustedRequestOrigin\(request\)/);
assert.match(api, /authorizeReports\(request\)/);
assert.match(api, /FOR UPDATE/);
assert.match(api, /id: input.id, workspaceId, revision: input.revision/);
const many = Array.from({ length: 20000 }, (_, i) => ({
  ...row(
    `2026-${i % 2 ? "07" : "09"}-${String((i % 28) + 1).padStart(2, "0")}`,
    (i % 100) + 1,
  ),
  category: `Category ${i % 20}`,
}));
const start = performance.now();
const big = analyzeReport(many, period);
assert.equal(
  big.current.expense,
  many.reduce((n, r) => n + r.amount, 0),
);
console.log(
  `Reports regression passed: arithmetic, missing months, decreases, leap dates, timezones, relative presets, immutable records, access boundary, drilldowns, and 20,000 rows in ${Math.round(performance.now() - start)}ms.`,
);

assert.equal(selectedReportRows([{...row('2026-08-03',50), reviewStatus:'pending_review',needsReview:false}],{...view,review:'pending'}).length,0,'A pending parser status alone must not create a warning filter match');
assert.equal(analyzeReport([{...row('2026-08-03',50), reviewStatus:'pending_review',needsReview:false}],period).reviewCount,0);
assert.equal(selectedReportRows([{...row('2026-08-03',50), reviewStatus:'edited'}],{...view,review:'confirmed'}).length,1);
