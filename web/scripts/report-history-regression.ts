import assert from "node:assert/strict";
import {
  buildReportBudgets,
  type ReportBudgetRevision,
} from "../lib/report-budget";
import {
  buildRecoveryReport,
  recoveryIssue,
} from "../../shared/reports/recoveries";
import {
  accountImportCoverage,
  isStatementPeriodSource,
} from "../../shared/reports/import-coverage";
import {
  defaultReportView,
  reportPeriod,
  type ReportRow,
} from "../../shared/reports/analysis";
import { buildReportExport } from "../../shared/reports/export";
import { sampleReportsWorkspace } from "../../shared/reports/sample";
const view = {
  ...defaultReportView,
  range: "custom" as const,
  from: "2026-10-01",
  to: "2026-10-31",
  currency: "PHP",
};
const period = reportPeriod(view, "2026-10-31", "2026-09-01");
const base = {
  id: "budget",
  name: "Dining",
  kind: "spend_limit" as const,
  scope: "global" as const,
  cadence: "monthly" as const,
  targetAmount: 3100,
  currency: "PHP",
  isActive: true,
  accountId: null,
  categoryId: null,
  createdAt: new Date("2026-09-01T00:00:00Z"),
};
const rev = (
  sequence: number,
  date: string,
  targetAmount: number,
  source = "update",
  extra = {},
) =>
  ({
    budgetId: base.id,
    sequence,
    effectiveAt: new Date(date),
    source,
    snapshot: {
      ...base,
      createdAt: base.createdAt.toISOString(),
      targetAmount,
      ...extra,
    },
  }) satisfies ReportBudgetRevision;
const history = [
  rev(1, "2026-10-01T00:00:00Z", 3100, "baseline"),
  rev(2, "2026-10-16T00:00:00Z", 6200),
];
const row = (
  id: string,
  date: string,
  amount: number,
  type: "expense" | "income" = "expense",
  extra: Partial<ReportRow> = {},
): ReportRow => ({
  id,
  date,
  amount,
  type,
  currency: "PHP",
  category: "Dining",
  merchant: id,
  accountId: "a",
  account: "Bank",
  ...extra,
});
const rows = [row("e1", "2026-10-05", 500), row("e2", "2026-10-17", 900)];
const result = buildReportBudgets(
  [base],
  rows,
  period,
  view,
  "PHP",
  "UTC",
  history,
);
assert.deepEqual(
  result.map((r) => [r.from, r.to, r.target, r.actual, r.historyBasis]),
  [
    ["2026-10-01", "2026-10-15", 1500, 500, "recorded"],
    ["2026-10-16", "2026-10-31", 3200, 900, "recorded"],
  ],
);
const ended = [
  ...history,
  rev(3, "2026-10-20T00:00:00Z", 6200, "delete", { isActive: false }),
];
assert.equal(
  buildReportBudgets([], rows, period, view, "PHP", "UTC", ended)[1].to,
  "2026-10-19",
);
const sept = { ...period, from: "2026-09-01", to: "2026-09-30" };
assert.equal(
  buildReportBudgets([], [], sept, view, "PHP", "UTC", ended)[0].historyBasis,
  "estimate",
);
assert.equal(
  buildReportBudgets([], [], sept, view, "PHP", "UTC", ended)[0].target,
  3100,
);
assert.equal(
  buildReportBudgets([], [], period, view, "PHP", "UTC", [
    ...history,
    rev(3, "2026-10-16T12:00:00Z", 9300),
  ])[1].target,
  4800,
);
assert.equal(
  buildReportBudgets([], [], period, view, "PHP", "Asia/Manila", [
    history[0],
    rev(2, "2026-10-15T17:00:00Z", 6200),
  ])[1].from,
  "2026-10-16",
);
assert.equal(
  buildReportBudgets([], [], period, view, "USD", "UTC", history).length,
  0,
);
assert.equal(
  buildReportBudgets([], [], period, view, "PHP", "UTC", [
    rev(1, "2026-10-15T00:00:00Z", 3100, "insert"),
  ])[0].from,
  "2026-10-15",
);
const payments = [
  ...rows,
  row("r1", "2026-10-06", 100, "income"),
  row("r2", "2026-10-07", 150, "income"),
  row("future", "2026-11-01", 50, "income"),
  row("old", "2026-09-30", 100),
  row("old-pay", "2026-10-01", 100, "income"),
];
const links = [
  { id: "l1", expenseId: "e1", incomingId: "r1", kind: "refund", amount: 100 },
  {
    id: "l2",
    expenseId: "e1",
    incomingId: "r2",
    kind: "reimbursement",
    amount: 150,
  },
  {
    id: "l3",
    expenseId: "e1",
    incomingId: "future",
    kind: "refund",
    amount: 50,
  },
  {
    id: "l4",
    expenseId: "old",
    incomingId: "old-pay",
    kind: "reimbursement",
    amount: 100,
  },
];
const snapshot = JSON.stringify(payments),
  recovery = buildRecoveryReport(payments, payments, links, period, "PHP");
assert.deepEqual(
  [
    recovery.gross,
    recovery.refunds,
    recovery.reimbursements,
    recovery.personalCost,
    recovery.receivedForEarlierExpenses,
  ],
  [1400, 100, 150, 1150, 100],
);
assert.match(
  recovery.links.find((l) => l.id === "l3")!.issue!,
  /after this period/,
);
assert.equal(
  buildRecoveryReport(payments, [rows[0]], links, period, "PHP").personalCost,
  250,
);
const edited = payments.map((r) => (r.id === "e1" ? { ...r, amount: 200 } : r));
assert.equal(
  buildRecoveryReport(edited, edited, links, period, "PHP").refunds,
  0,
);
assert.match(
  recoveryIssue(links[0], rows[0], { ...payments[2], currency: "USD" })!,
  /currencies/,
);
assert.match(
  recoveryIssue(links[0], rows[0], { ...payments[2], date: "2026-09-01" })!,
  /before/,
);
assert.equal(JSON.stringify(payments), snapshot);
const account = {
  id: "a",
  name: "BPI",
  type: "bank",
  createdDay: "2026-10-07",
};
const evidence = (from: string | null, to: string | null, extra = {}) => ({
  from,
  to,
  status: "reconciled",
  done: true,
  statement: true,
  ...extra,
});
const coverage = accountImportCoverage(
  account,
  [
    evidence("2026-10-01", "2026-10-10"),
    evidence("2026-10-05", "2026-10-15"),
    evidence("2026-10-21", "2026-10-31"),
    evidence("2026-10-16", "2026-10-20", { statement: false }),
    evidence(null, null),
    evidence("2026-10-16", "2026-10-20", { status: "pending" }),
  ],
  [{ lastSyncedAt: "2026-10-28T12:00:00Z", status: "ready", error: false }],
  period,
  new Date("2026-10-31T12:00:00Z"),
);
assert.deepEqual(coverage.gaps, [{ from: "2026-10-16", to: "2026-10-20" }]);
assert.equal(coverage.connectionState, "stale");
assert.equal(coverage.undatedStatements, 1);
assert.equal(coverage.pendingStatements, 1);
assert.deepEqual(
  accountImportCoverage(
    { ...account, type: "cash" },
    [],
    [],
    period,
    new Date(),
  ).gaps,
  [],
);
assert.equal(
  accountImportCoverage(
    account,
    [],
    [{ lastSyncedAt: "2026-10-31T12:00:00Z", status: "ready", error: true }],
    period,
    new Date("2026-10-31T12:01:00Z"),
  ).connectionState,
  "attention",
);
assert.equal(
  accountImportCoverage(
    account,
    [evidence("2026-10-31", "2026-10-01")],
    [],
    period,
    new Date(),
  ).undatedStatements,
  1,
);
const sample = structuredClone(sampleReportsWorkspace);
sample.reports[0].recoveries = recovery;
sample.reports[0].importCoverage = [coverage];
sample.reports[0].budgets = result;
const exported = buildReportExport(sample, "spending");
assert(exported.tables.some((t) => t.title.startsWith("Personal cost")));
assert(exported.tables.some((t) => t.title.startsWith("Statement coverage")));
assert(
  exported.tables
    .find((t) => t.title.startsWith("Budget versus actual"))!
    .headers.includes("History basis"),
);
console.log(
  "Report history passed: revisions, local dates, partial recoveries, edited limits, period gaps and exports.",
);

assert.equal(isStatementPeriodSource(null, { importMode: "statement" }), true);
assert.equal(
  isStatementPeriodSource("receipt", { importMode: "statement" }),
  false,
);
assert.equal(isStatementPeriodSource(null, {}), false);
const ignoredExpense = payments.filter((r) => r.id !== "e1");
assert(
  buildRecoveryReport(
    ignoredExpense,
    ignoredExpense,
    links,
    period,
    "PHP",
  ).links.some((l) => l.id === "l1" && l.issue?.includes("unavailable")),
);

const renamedCategory = buildReportBudgets([], [row("renamed", "2026-10-05", 500, "expense", {categoryId: "dining", category: "Eating out"})], period, {...view, categories: ["Eating out"]}, "PHP", "Asia/Manila", [rev(1, "2026-10-01T00:00:00Z", 3100, "insert", {scope: "category", categoryId: "dining", categoryName: "Dining"})], new Map([["dining", "Eating out"]]));
assert.equal(renamedCategory.length, 1);
assert.equal(renamedCategory[0].categoryName, "Dining");
assert.equal(renamedCategory[0].actual, 500);
