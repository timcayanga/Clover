import assert from "node:assert/strict";
import {
  defaultReportView,
  reportPeriod,
  selectedReportRows,
  type ReportRow,
} from "../../shared/reports/analysis";
import { reportCoverage, reportMerchants } from "../../shared/reports/details";
import { buildReportBudgets } from "../lib/report-budget";
import type { BudgetRecord } from "../lib/budgeting";
import { reportViewSchema, reportViewFromParams } from "../lib/report-view";
import { reportViewParams } from "../../shared/reports/workspace";
import { reportTransactionParams } from "../../shared/reports/drilldown";
import { reportTransactionFilters } from "../../mobile/src/report-drilldown";
import {
  parseTransactionQueryFilters,
  buildTransactionQueryWhere,
} from "../lib/transaction-query";
import {
  buildReportExport,
  reportExportCsv,
  reportExportHtml,
  reportCsvCell,
} from "../../shared/reports/export";
import { sampleReportsWorkspace } from "../../shared/reports/sample";
const view = {
  ...defaultReportView,
  range: "custom" as const,
  from: "2024-02-01",
  to: "2024-02-29",
  currency: "PHP",
};
const period = reportPeriod(view, "2026-10-07");
const row = (extra: Partial<ReportRow>): ReportRow => ({
  id: "r",
  date: "2024-02-15",
  amount: 500,
  type: "expense",
  currency: "PHP",
  category: "Food",
  categoryId: "food",
  merchant: "Cafe, Inc.",
  accountId: "bank",
  account: "Bank",
  reviewStatus: "confirmed",
  tags: ["family"],
  ...extra,
});
const rows = [
  row({}),
  row({ id: "prior", date: "2024-01-20", amount: 250 }),
  row({
    id: "prior-only",
    date: "2024-01-20",
    merchant: "Former merchant",
    amount: 100,
  }),
  row({
    id: "review",
    merchant: "Cafe",
    amount: 75,
    needsReview: true,
    reviewStatus: "pending_review",
    category: "Other",
  }),
  row({ id: "transfer", type: "transfer", amount: 99999 }),
  row({ id: "income", type: "income", amount: 10000 }),
  row({ id: "foreign", currency: "USD", amount: 2500 }),
  row({
    id: "different",
    merchant: "Bus",
    accountId: "cash",
    categoryId: "transport",
    category: "Transport",
    amount: 50,
    tags: ["travel"],
  }),
];
const before = JSON.stringify(rows);
const budget = (
  extra: Partial<BudgetRecord & { createdAt: Date }> = {},
): BudgetRecord & { createdAt: Date } => ({
  id: "b",
  name: "Food budget",
  kind: "spend_limit",
  scope: "category",
  cadence: "monthly",
  targetAmount: 2900,
  currency: "PHP",
  isActive: true,
  accountId: null,
  categoryId: "food",
  category: { name: "Food" },
  createdAt: new Date("2023-01-01T00:00:00Z"),
  ...extra,
});
const make = (b = budget(), v = view, rs = rows) =>
  buildReportBudgets(
    [b],
    rs,
    reportPeriod(v, "2026-10-07"),
    v,
    "PHP",
    "Asia/Manila",
  );
assert.equal(make()[0].target, 2900);
assert.equal(make()[0].actual, 575);
assert.equal(make()[0].remaining, 2325);
assert.equal(make(budget({ targetAmount: 500 }))[0].over, 75);
assert.equal(make(budget({ targetAmount: 500 }))[0].remaining, 0);
assert.equal(
  make(budget(), { ...view, from: "2024-02-15" })[0].target,
  1500,
  "Leap February partial target",
);
assert.equal(
  make(budget({ createdAt: new Date("2024-02-14T16:05:00Z") }))[0].target,
  1500,
  "Profile timezone controls creation day",
);
assert.equal(
  make(budget({ cadence: "daily", targetAmount: 100 }))[0].target,
  2900,
);
assert.equal(
  make(budget({ cadence: "weekly", targetAmount: 700 }))[0].target,
  2900,
);
assert.equal(
  make(budget({ cadence: "biweekly", targetAmount: 1400 }))[0].target,
  2900,
);
assert.equal(
  make(budget({ cadence: "quarterly", targetAmount: 9100 }))[0].target,
  2900,
);
assert.equal(
  make(budget({ cadence: "annual", targetAmount: 36600 }))[0].target,
  2900,
);
for (const b of [
  budget({ isActive: false }),
  budget({ kind: "savings_target" }),
  budget({ currency: "USD" }),
  budget({ createdAt: new Date("2024-03-01T00:00:00Z") }),
])
  assert.deepEqual(make(b), []);
assert.deepEqual(make(budget(), { ...view, categories: ["Transport"] }), []);
assert.deepEqual(
  make(budget({ scope: "account", accountId: "bank" }), {
    ...view,
    accounts: ["cash"],
  }),
  [],
);
assert.equal(
  make(budget({ scope: "account", accountId: "bank" }))[0].actual,
  575,
);
assert.equal(
  make(budget({ scope: "global" }))[0].actual,
  625,
);
const filtered = selectedReportRows(rows, {
  ...view,
  merchants: ["Cafe, Inc."],
  tags: ["family"],
});
assert.equal(
  filtered.some((r) => r.merchant === "Cafe"),
  false,
  "Exact merchant match",
);
assert.equal(
  make(budget(), view, filtered)[0].target,
  2900,
  "Filters do not silently shrink targets",
);
assert.equal(make(budget(), view, filtered)[0].actual, 500);
assert.equal(
  make(budget(), view, [row({ type: "expense", category: "Transfer" })])[0]
    .actual,
  500,
  "Already resolved/confirmed expense direction is preserved",
);
assert.equal(
  selectedReportRows(rows, { ...view, tags: ["missing", "travel"] }).length,
  1,
  "Tags use OR, combined with other filters using AND",
);
assert.equal(JSON.stringify(rows), before);
const details = reportMerchants(
  rows.filter((r) => r.currency === "PHP"),
  period,
);
assert.equal(details.find((r) => r.name === "Former merchant")?.change, -100);
assert.equal(details.find((r) => r.name === "Cafe, Inc.")?.amount, 500);
assert.equal(details.find((r) => r.name === "Cafe, Inc.")?.count, 1);
const coverage = reportCoverage(
  rows.filter((r) => r.currency === "PHP"),
  period,
  view,
  ["Unknown bank"],
  false,
);
assert.equal(coverage.transactionCount, 4);
assert.equal(coverage.reviewCount, 1);
assert.equal(coverage.uncategorizedCount, 1);
assert(coverage.notes.some((n) => n.includes("does not prove")));
assert(coverage.notes.some((n) => n.includes("omitted")));
const old = { ...view };
delete old.tags;
delete old.merchants;
assert.deepEqual(reportViewSchema.parse(old).merchants, []);
const chosen = { ...view, merchants: ["Cafe, Inc."], tags: ["family"] };
assert.deepEqual(reportViewFromParams(reportViewParams(chosen)), chosen);
const params = reportTransactionParams(chosen, "PHP", view.from, view.to, [], {
  type: "expense",
});
assert.equal(params.get("report"), "1");
assert.deepEqual(params.getAll("merchant"), ["Cafe, Inc."]);
const native = reportTransactionFilters(params.toString())!;
assert.deepEqual(native.filters.merchants, ["Cafe, Inc."]);
assert.equal(native.filters.merchantMatch, "exact");
assert.deepEqual(native.filters.tags, ["family"]);
const web = parseTransactionQueryFilters(params);
assert.deepEqual(web.merchantFilters, ["Cafe, Inc."]);
assert.equal(web.merchantMatch, "exact");
assert.deepEqual(web.tagIds, ["family"]);
const where = JSON.stringify(buildTransactionQueryWhere("profile", web));
assert(where.includes('"equals":"Cafe, Inc."'));
assert(!where.includes('"contains":"Cafe, Inc."'));
const report = buildReportExport(
  {
    ...sampleReportsWorkspace,
    profileName: "<script>alert(1)</script>",
    view: { ...sampleReportsWorkspace.view, tags: ["household"] },
  },
  "spending",
);
assert(report.tables.some((t) => t.title.startsWith("Budget versus actual")));
assert(report.metadata.some(([k, v]) => k === "Tags" && v === "Household"));
const free = buildReportExport(
  { ...sampleReportsWorkspace, paid: false },
  "spending",
);
assert(!free.tables.some((t) => t.title.startsWith("Budget")));
assert.equal(
  buildReportExport({ ...sampleReportsWorkspace, paid: false }, "advanced")
    .tables.length,
  0,
);
assert.equal(reportCsvCell('=HYPERLINK("evil")'), '"\'=HYPERLINK(""evil"")"');
assert.equal(reportCsvCell(-50), '"-50"');
assert.equal(reportCsvCell("\t+1"), '"\'\t+1"');
const html = reportExportHtml(report);
assert(!html.includes("<script>"));
assert(html.includes("&lt;script&gt;"));
assert(!html.includes("https://"));
assert(reportExportCsv(report).startsWith("\ufeff"));
assert(reportExportCsv(report).includes('"PHP"'));
const trend = buildReportExport(sampleReportsWorkspace, "trends");
assert(
  trend.tables.some((t) => t.title.startsWith("Category trends by month")),
);
assert(trend.tables.some((t) => t.title.startsWith("Spending pace")));
console.log(
  "Report details passed: leap/DST-safe budget proration, creation date, scope/currency/gating, confirmed directions, exact merchant/tag drilldowns, completeness, safe CSV/PDF exports and immutable financial records.",
);
