import { forecastScenario } from "../../shared/reports/scenarios";
import assert from "node:assert/strict";
import { consolidatedAccountSummary } from "../../shared/account-summary";
import { cashForecast } from "../../shared/reports/outlook";
import { buildReportOutlook, buildNetWorthChange } from "../lib/report-outlook";
import type { FinancialCommitmentSummary } from "../lib/commitments";
import { parseRecurringTracking } from "../lib/recurring-tracking";
import { buildReportExport } from "../../shared/reports/export";
import { sampleReportsWorkspace } from "../../shared/reports/sample";
const accounts = [
  { type: "bank", currency: "PHP", balance: 1000 },
  { type: "investment", currency: "USD", balance: 100 },
  { type: "credit_card", currency: "USD", balance: 20 },
  { type: "cash", currency: "PHP", balance: -10 },
];
assert.deepEqual(
  consolidatedAccountSummary(accounts, "PHP", { USD: 50 }).values,
  [5000, 1000, 6000, 1000],
);
assert.deepEqual(
  consolidatedAccountSummary(accounts, "USD", { PHP: 0.02 }).values,
  [100, 20, 120, 20],
);
for (const rate of [undefined, 0, -1, NaN, Infinity])
  assert.ok(
    consolidatedAccountSummary(accounts, "PHP", {
      USD: rate as number,
    }).values.every((v) => v === null),
  );
assert.deepEqual(
  consolidatedAccountSummary(
    [{ type: "bank", currency: "IDR", balance: 0 }],
    "PHP",
    {},
  ).values,
  [0, 0, 0, 0],
);
assert.ok(
  consolidatedAccountSummary(
    [...accounts, { type: "bank", currency: "PHP", balance: null }],
    "PHP",
    { USD: 50 },
  ).values.every((v) => v === null),
);
const base: FinancialCommitmentSummary = {
  id: "rent",
  workspaceId: "w",
  kind: "planned_payment",
  title: "Rent",
  counterparty: null,
  amount: "100",
  currency: "PHP",
  dueDate: "2026-01-31",
  plannedPaymentDate: null,
  recurrence: "monthly",
  nextDueDate: null,
  tracking: null,
  notes: null,
  accountId: "bank",
  transactionId: null,
  evidenceTransactionIds: [],
  statementCheckpointId: null,
  status: "active",
  source: "manual",
  confidence: 100,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  account: null,
  transaction: null,
};
const bank = { id: "bank", name: "BPI", type: "bank", balance: 500 };
const run = (
  items: FinancialCommitmentSummary[],
  today = "2026-02-01",
  cash = [bank],
) => buildReportOutlook(items, cash, [], today);
let result = run([base]);
assert.equal(result.recurringCosts.outgoing30, 100);
assert.equal(result.recurringCosts.outgoingYear, 1200);
assert.deepEqual(
  result.forecast.movements.map((m) => m.date),
  ["2026-02-28", "2026-03-31", "2026-04-30"],
);
assert.equal(result.forecast.horizons[0].closing, 400);
result = run([{ ...base, completedPaymentDates: ["2026-02-28"] }]);
assert.equal(result.recurringCosts.outgoing30, 0);
assert.equal(result.recurringCosts.outgoingYear, 1100);
result = run([
  {
    ...base,
    plannedPaymentDate: "2026-01-29",
    completedPaymentDates: ["2026-02-28"],
  },
]);
assert.equal(
  result.recurringCosts.outgoing30,
  0,
  "planned date completes contractual occurrence",
);
result = run([
  {
    ...base,
    tracking: parseRecurringTracking({ version: 1, amountType: "variable" }),
  },
]);
assert.equal(result.recurringCosts.outgoingYear, 0);
assert.equal(result.forecast.omittedSchedules.length, 1);
result = run([{ ...base, kind: "debt", amount: "10000" }]);
assert.equal(
  result.recurringCosts.outgoingYear,
  0,
  "legacy debt principal is never a payment",
);
result = run([
  {
    ...base,
    kind: "debt",
    amount: "10000",
    tracking: parseRecurringTracking({
      version: 1,
      paymentAmount: 50,
      totalPayments: 3,
      paymentsMade: 1,
    }),
  },
]);
assert.equal(
  result.recurringCosts.outgoingYear,
  50,
  "only remaining term occurrences count",
);
result = run([
  {
    ...base,
    tracking: parseRecurringTracking({ version: 1, endDate: "2026-03-01" }),
  },
]);
assert.equal(result.recurringCosts.outgoingYear, 100);
result = run([
  {
    ...base,
    kind: "receivable",
    amount: "120",
    tracking: parseRecurringTracking({ version: 1, paymentAmount: 50 }),
  },
]);
assert.equal(result.recurringCosts.incoming30, 50);
assert.equal(
  result.forecast.movements.find((m) => m.date === "2026-03-31")?.amount,
  20,
);
assert.equal(
  run([
    { ...base, status: "paused" },
    { ...base, id: "suggested", source: "recurring_detection" },
  ]).recurringCosts.rows.length,
  0,
);
result = run([{ ...base, recurrence: "once" }]);
assert.equal(result.recurringCosts.outgoing30, 0);
assert.equal(result.recurringCosts.overdueCount, 1);
result = run([{ ...base, dueDate: null }]);
assert.equal(result.recurringCosts.rows[0].excludedReason, "No due date");
result = run([{ ...base, accountId: "card" }], undefined, [
  bank,
  { id: "card", name: "Card", type: "credit_card", balance: -100 },
]);
assert.equal(result.forecast.movements.length, 0);
assert.equal(result.recurringCosts.outgoing30, 100);
result = run([base], undefined, [
  { ...bank, balance: null as unknown as number },
]);
assert.equal(result.forecast.horizons[0].closing, null);
assert.equal(result.forecast.horizons[0].outgoing, 100);
result = run(
  [{ ...base, dueDate: "2024-02-29", recurrence: "annual" }],
  "2024-03-01",
);
assert.equal(
  result.recurringCosts.outgoingYear,
  100,
  "leap-day annual schedule clamps next year",
);
// DST must not skip a weekly occurrence on the first day of a month.
const zone = process.env.TZ;
process.env.TZ = "America/New_York";
result = run(
  [{ ...base, recurrence: "weekly", dueDate: "2026-10-04" }],
  "2026-11-01",
);
assert.equal(result.forecast.movements[0].date, "2026-11-01");
process.env.TZ = zone;
result = run([{ ...base, accountId: "foreign-currency-account" }]);
assert.equal(
  result.forecast.movements.length,
  0,
  "a schedule assigned outside this currency cannot silently become an unassigned cash movement",
);
const forecast = cashForecast("2026-01-01", 100, [
  { id: "x", title: "Bill", date: "2026-01-02", amount: 200, direction: "out" },
  {
    id: "y",
    title: "Repayment",
    date: "2026-01-03",
    amount: 100,
    direction: "in",
  },
  {
    id: "past",
    title: "Past",
    date: "2025-12-31",
    amount: 1000,
    direction: "out",
  },
  {
    id: "boundary",
    title: "Later",
    date: "2026-01-31",
    amount: 500,
    direction: "out",
  },
]);
assert.equal(forecast.horizons[0].closing, 0);
assert.equal(forecast.horizons[0].lowest?.balance, -100);
assert.equal(forecast.horizons[1].closing, -500);
const point = (date: string, balance: number, createdAt = date) => ({
  statementEndDate: date,
  createdAt,
  endingBalance: balance,
  sourceMetadata: { importMode: "statement" },
});
const history = [
  {
    id: "bank",
    name: "Bank",
    type: "bank",
    currency: "PHP",
    statementCheckpoints: [point("2026-09-30", 100), point("2026-10-05", 200)],
  },
  {
    id: "debt",
    name: "Debt",
    type: "loan",
    currency: "PHP",
    statementCheckpoints: [point("2026-09-30", 100), point("2026-10-05", 80)],
  },
];
let change = buildNetWorthChange(history, "2026-10-01", "2026-10-31");
assert.equal(change.change, 120);
assert.equal(change.groups.find((g) => g.name === "Liabilities")?.change, 20);
change = buildNetWorthChange(
  [
    ...history,
    {
      id: "missing",
      name: "New account",
      type: "bank",
      currency: "PHP",
      statementCheckpoints: [],
    },
  ],
  "2026-10-01",
  "2026-10-31",
);
assert.equal(change.change, null);
assert.equal(change.accounts[2].issue, "No dated opening balance");
change = buildNetWorthChange(
  [{ ...history[0], statementCheckpoints: [point("2026-09-30", 100)] }],
  "2026-10-01",
  "2026-10-31",
);
assert.equal(
  change.change,
  null,
  "stale opening evidence is not a closing observation",
);
change = buildNetWorthChange(
  [
    {
      ...history[0],
      statementCheckpoints: [
        point("2026-09-30", 100),
        {
          ...point("2026-10-05", 500),
          sourceMetadata: { importMode: "receipt" },
        },
      ],
    },
  ],
  "2026-10-01",
  "2026-10-31",
);
assert.equal(change.change, null, "receipts cannot become balance snapshots");
change = buildNetWorthChange(
  [
    {
      ...history[0],
      statementCheckpoints: [
        point("2026-09-30", 100),
        point("2026-10-05", 200, "2026-10-07"),
        point("2026-10-05", 150, "2026-10-06"),
      ],
    },
  ],
  "2026-10-01",
  "2026-10-31",
);
assert.equal(change.change, 100, "latest correction wins tied evidence dates");
const linked = buildReportOutlook(
  [{ ...base, evidenceTransactionIds: ["one", "two", "unreviewed"] }],
  [bank],
  [
    {
      id: "one",
      date: "2026-01-01",
      amount: 80,
      type: "expense",
      currency: "PHP",
      category: "Rent",
      merchant: "Rent",
      accountId: "bank",
      account: "BPI",
    },
    {
      id: "two",
      date: "2026-01-15",
      amount: 100,
      type: "expense",
      currency: "PHP",
      category: "Rent",
      merchant: "Rent",
      accountId: "bank",
      account: "BPI",
    },
    {
      id: "unreviewed",
      date: "2026-01-25",
      amount: 999,
      type: "expense",
      currency: "PHP",
      category: "Rent",
      merchant: "Rent",
      accountId: "bank",
      account: "BPI",
      needsReview: true,
    },
  ],
  "2026-02-01",
);
assert.equal(linked.recurringCosts.rows[0].latestPayment?.previous, 80);
assert.equal(linked.recurringCosts.rows[0].latestPayment?.amount, 100);
assert.ok(
  buildReportExport(sampleReportsWorkspace, "advanced").tables.some((t) =>
    t.title.startsWith("Cash-flow forecast"),
  ),
);
assert.ok(
  buildReportExport(sampleReportsWorkspace, "trends").tables.some((t) =>
    t.title.startsWith("Recurring costs"),
  ),
);
assert.equal(
  buildReportExport({ ...sampleReportsWorkspace, paid: false }, "advanced")
    .tables.length,
  0,
);
console.log(
  "Report outlook and consolidated currency summary regressions passed.",
);

// Batch 5: scenario arithmetic, immutability, boundaries and evidence-backed findings.

const beforeScenario = JSON.stringify(forecast);
let scenario = forecastScenario(forecast, [
  {
    id: "preview",
    kind: "expense",
    title: "Appliance",
    date: "2026-01-01",
    amount: 50,
  },
]);
assert.equal(scenario.error, null);
assert.equal(scenario.forecast.horizons[0].closing, -50);
assert.equal(scenario.forecast.horizons[0].lowest?.balance, -150);
scenario = forecastScenario(forecast, [
  { id: "skip", kind: "replace", movementId: "x", amount: 0 },
]);
assert.equal(scenario.forecast.horizons[0].closing, 200);
assert.equal(scenario.forecast.horizons[1].closing, -300);
assert.equal(
  JSON.stringify(forecast),
  beforeScenario,
  "Scenario must never mutate actual movements or the baseline",
);
for (const amount of [-1, NaN, Infinity, 1e13])
  assert.ok(
    forecastScenario(forecast, [
      { id: "bad", kind: "income", title: "Extra", date: "2026-01-02", amount },
    ]).error,
  );
for (const date of ["2025-12-31", "2026-02-30", "2026-04-01", ""])
  assert.ok(
    forecastScenario(forecast, [
      { id: "bad", kind: "income", title: "Extra", date, amount: 1 },
    ]).error,
  );
assert.ok(
  forecastScenario(forecast, [
    { id: "bad", kind: "replace", movementId: "not-found", amount: 1 },
  ]).error,
);
assert.ok(
  forecastScenario(forecast, [
    { id: "one", kind: "replace", movementId: "x", amount: 1 },
    { id: "two", kind: "replace", movementId: "x", amount: 2 },
  ]).error,
);
assert.equal(
  forecastScenario(cashForecast("2026-01-01", null, []), [
    {
      id: "test",
      kind: "income",
      title: "Income",
      date: "2026-01-02",
      amount: 500,
    },
  ]).forecast.horizons[0].closing,
  null,
  "Scenarios cannot invent missing opening balances",
);
assert.equal(
  forecastScenario(forecast, [
    {
      id: "late",
      kind: "income",
      title: "Last day",
      date: "2026-03-31",
      amount: 50,
    },
  ]).forecast.horizons[1].closing,
  -450,
);
assert.ok(
  forecastScenario(
    forecast,
    Array.from({ length: 11 }, (_, i) => ({
      id: String(i),
      kind: "income" as const,
      title: "Extra",
      date: "2026-01-02",
      amount: 1,
    })),
  ).error,
);
let flagged = run([base, { ...base, id: "rent-two", title: "  RENT  " }]);
assert.equal(
  flagged.recurringCosts.findings.filter((f) => f.kind === "possible_duplicate")
    .length,
  1,
);
assert.equal(
  flagged.recurringCosts.outgoing30,
  200,
  "Suspected duplicates are not silently removed from totals",
);
for (const alternate of [
  { accountId: "other" },
  { amount: "101" },
  { recurrence: "weekly" },
  { title: "Rent other flat" },
  { status: "inactive" },
]) {
  flagged = run([base, { ...base, id: "different", ...alternate }]);
  assert.equal(
    flagged.recurringCosts.findings.filter(
      (f) => f.kind === "possible_duplicate",
    ).length,
    0,
  );
}
flagged = run([{ ...base, completedPaymentDates: ["2026-01-31"] }]);
assert.equal(
  flagged.recurringCosts.findings.filter((f) => f.kind === "uncompleted")
    .length,
  0,
);
const evidenceRows = [
  {
    id: "prior",
    date: "2026-01-01",
    amount: 100,
    type: "expense" as const,
    currency: "PHP",
    accountId: "bank",
    account: "Bank",
    category: "Housing",
    merchant: "Rent",
  },
  {
    id: "latest",
    date: "2026-01-31",
    amount: 120,
    type: "expense" as const,
    currency: "PHP",
    accountId: "bank",
    account: "Bank",
    category: "Housing",
    merchant: "Rent",
  },
];
flagged = buildReportOutlook(
  [{ ...base, evidenceTransactionIds: ["prior", "latest"] }],
  [bank],
  evidenceRows,
  "2026-02-01",
);
assert.equal(
  flagged.recurringCosts.findings.filter((f) => f.kind === "higher_payment")
    .length,
  1,
);
assert.deepEqual(
  flagged.recurringCosts.findings
    .find((f) => f.kind === "higher_payment")
    ?.transactions.map((t) => t.id),
  ["prior", "latest"],
);
flagged = buildReportOutlook(
  [{ ...base, evidenceTransactionIds: ["prior", "latest"] }],
  [bank],
  evidenceRows.map((r) => ({ ...r, needsReview: true })),
  "2026-02-01",
);
assert.equal(
  flagged.recurringCosts.findings.filter((f) => f.kind === "higher_payment")
    .length,
  0,
);
flagged = buildReportOutlook(
  [{ ...base, evidenceTransactionIds: ["prior", "latest"] }],
  [bank],
  evidenceRows,
  "2026-06-01",
);
assert.equal(
  flagged.recurringCosts.findings.filter((f) => f.kind === "higher_payment")
    .length,
  0,
  "Old comparisons do not produce current findings",
);
console.log(
  "Forecast scenarios and recurring evidence: boundaries, missing data, duplicate safeguards, exclusions and immutability passed.",
);
const findingsExport = buildReportExport(sampleReportsWorkspace, "trends");
assert.ok(
  findingsExport.tables.some((t) =>
    t.title.includes("Recurring findings to check"),
  ),
  "Exports retain finding evidence",
);
const workload = Array.from({ length: 500 }, (_, i) => ({
  ...base,
  id: `schedule-${i}`,
  title: `Schedule ${i}`,
}));
const started = performance.now();
const manySchedules = buildReportOutlook(
  workload,
  [bank],
  Array.from({ length: 20000 }, (_, i) => ({
    ...evidenceRows[0],
    id: `t-${i}`,
  })),
  "2026-02-01",
);
assert.equal(manySchedules.recurringCosts.rows.length, 500);
assert.equal(
  manySchedules.recurringCosts.findings.filter(
    (f) => f.kind === "possible_duplicate",
  ).length,
  0,
);
console.log(
  `Report outlook workload: 500 schedules and 20,000 transactions in ${Math.round(performance.now() - started)}ms.`,
);
