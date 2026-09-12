import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveTrackedCommitmentDueDate, toCommitmentOccurrenceKey } from "../lib/commitment-occurrences";
import { buildRecurringCalendarOccurrences } from "../lib/recurring-calendar";
import type { FinancialCommitmentSummary } from "../lib/commitments";

const webRoot = process.cwd();
const panelSource = readFileSync(join(webRoot, "components", "commitments-panel.tsx"), "utf8");
const clientSource = readFileSync(join(webRoot, "components", "recurring-page-client.tsx"), "utf8");
const pageSource = readFileSync(join(webRoot, "lib", "recurring-page.ts"), "utf8");
const stylesSource = readFileSync(join(webRoot, "app", "globals.css"), "utf8");
const calendarSource = readFileSync(join(webRoot, "components", "recurring-calendar.tsx"), "utf8");
const detailSource = readFileSync(join(webRoot, "components", "recurring-calendar-detail.tsx"), "utf8");
const commitmentRouteSource = readFileSync(join(webRoot, "app", "api", "commitments", "[commitmentId]", "route.ts"), "utf8");
const schemaSource = readFileSync(join(webRoot, "prisma", "schema.prisma"), "utf8");

const dashboardSource = readFileSync(join(webRoot, "components", "recurring-dashboard.tsx"), "utf8");
const createSource = readFileSync(join(webRoot, "components", "recurring-create-form.tsx"), "utf8");
assert.match(panelSource, /<RecurringDashboard/, "Saved commitments must render through the redesigned dashboard.");
assert.match(dashboardSource, /<RecurringCalendar commitments=\{items\} comprehensive/, "Overview retains the full calendar.");
assert.match(dashboardSource, /Next 7 days/, "Subtabs have a seven-day payment strip.");
assert.match(dashboardSource, /All saved items/, "Inactive and out-of-range items remain accessible.");
assert.match(dashboardSource, /onOpen\(item,date/, "Every list item opens editable details.");
assert.match(dashboardSource, /Recurring date range/, "Date filtering must have an accessible name.");
assert.match(dashboardSource, /new Map<string,number>/, "Totals must separate currencies.");
assert.match(createSource, /Payments already made/, "Installment creation includes progress.");
assert.match(createSource, /parseRecurringTracking/, "Creation validates schedule data before saving.");
assert.match(createSource, /Tracking only. No money moves when you save./);
assert.match(clientSource, /aria-label=\{tab\.label\}/);
assert.match(calendarSource, /Previous month[\s\S]{0,1600}Next month/);
for (const field of ["kind", "recurrence", "status", "accountId", "categoryName", "currency"]) {
  assert.match(detailSource, new RegExp(`renderSelect\\("${field}"`));
}
assert.match(detailSource, /onComplete/);
assert.match(detailSource, /Delete recurring/);
assert.match(commitmentRouteSource, /categoryName: Object\.hasOwn\(body, "categoryName"\)/);
assert.match(panelSource, /Review suggestions/);
assert.match(panelSource, /Detected transactions/);
assert.match(panelSource, /evidenceTransactionIds: patternDraft\.transactionIds/);
assert.match(schemaSource, /tracking\s+Json\?/);
assert.match(schemaSource, /evidenceTransactionIds\s+Json\?/);

const commitment = (
  overrides: Partial<FinancialCommitmentSummary>,
): FinancialCommitmentSummary => ({
  id: "commitment-1",
  workspaceId: "workspace-1",
  kind: "planned_payment",
  title: "Internet bill",
  counterparty: null,
  amount: "1599",
  currency: "PHP",
  dueDate: "2026-01-31T00:00:00.000Z",
  plannedPaymentDate: null,
  recurrence: "monthly",
  nextDueDate: "2026-01-31T00:00:00.000Z",
  notes: null,
  accountId: null,
  inferredAccountId: null,
  inferredAccountConfidence: null,
  inferredAccountReason: null,
  transactionId: null,
  evidenceTransactionIds: [],
  categoryName: null,
  status: "active",
  confidence: 100,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  account: null,
  inferredAccount: null,
  transaction: null,
  occurrenceDueDate: null,
  occurrenceCompletedAt: null,
  ...overrides,
});

const februaryOccurrences = buildRecurringCalendarOccurrences([commitment({})], 2026, 1);
assert.deepEqual(februaryOccurrences.map((item) => item.dateKey), ["2026-02-28"], "Monthly payments must clamp safely to the last day of shorter months.");

const weeklyOccurrences = buildRecurringCalendarOccurrences([
  commitment({ id: "weekly", dueDate: "2026-08-03T00:00:00.000Z", nextDueDate: "2026-08-03T00:00:00.000Z", recurrence: "weekly" }),
], 2026, 7);
assert.deepEqual(weeklyOccurrences.map((item) => item.dateKey), ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31"], "Weekly payments must appear on every due date in the selected month.");

const mixedOccurrences = buildRecurringCalendarOccurrences([
  commitment({ id: "planned", kind: "planned_payment", dueDate: "2026-08-12T00:00:00.000Z", recurrence: "once" }),
  commitment({ id: "loan", kind: "debt", dueDate: "2026-08-12T00:00:00.000Z", recurrence: "once" }),
  commitment({ id: "owed", kind: "receivable", dueDate: "2026-08-19T00:00:00.000Z", recurrence: "once" }),
  commitment({ id: "paused", status: "paused", dueDate: "2026-08-20T00:00:00.000Z", recurrence: "once" }),
], 2026, 7);
assert.deepEqual(mixedOccurrences.map((item) => item.commitment.id), ["planned", "loan", "owed"], "Overview must combine active payment types and omit paused items.");

const plannedPaymentOccurrences = buildRecurringCalendarOccurrences([
  commitment({ id: "early-reminder", dueDate: "2026-08-20T00:00:00.000Z", plannedPaymentDate: "2026-08-15T00:00:00.000Z", recurrence: "once" }),
], 2026, 7);
assert.deepEqual(plannedPaymentOccurrences.map((item) => item.dateKey), ["2026-08-15"], "An optional planned-payment date must move the calendar reminder without replacing the actual due date.");

const beforeNextWindow = resolveTrackedCommitmentDueDate({
  dueDate: new Date("2026-08-10T00:00:00.000Z"),
  nextDueDate: new Date("2026-08-10T00:00:00.000Z"),
  recurrence: "monthly",
  now: new Date("2026-08-20T00:00:00.000Z"),
});
assert.equal(toCommitmentOccurrenceKey(beforeNextWindow!), "2026-08-10", "A completed month must remain active before the next seven-day window.");

const insideNextWindow = resolveTrackedCommitmentDueDate({
  dueDate: new Date("2026-08-10T00:00:00.000Z"),
  nextDueDate: new Date("2026-08-10T00:00:00.000Z"),
  recurrence: "monthly",
  now: new Date("2026-09-03T00:00:00.000Z"),
});
assert.equal(toCommitmentOccurrenceKey(insideNextWindow!), "2026-09-10", "A new month must become pending inside its seven-day due window.");

const quarterlyWindow = resolveTrackedCommitmentDueDate({
  dueDate: new Date("2026-06-30T00:00:00.000Z"),
  nextDueDate: new Date("2026-06-30T00:00:00.000Z"),
  recurrence: "quarterly",
  now: new Date("2026-09-24T00:00:00.000Z"),
});
assert.equal(toCommitmentOccurrenceKey(quarterlyWindow!), "2026-09-30", "The occurrence window must work for non-monthly recurring items too.");

console.log("Recurring ledger regression passed.");
