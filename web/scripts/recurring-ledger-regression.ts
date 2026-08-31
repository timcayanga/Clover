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

assert.match(panelSource, /<th>Category<\/th>/, "Recurring subtabs must expose category data.");
assert.match(panelSource, /CategoryBrandMark/, "Recurring categories must use Clover's transaction-style category marks.");
assert.match(panelSource, /recurring-occurrence-check/, "Recurring status must use occurrence checkboxes.");
assert.match(panelSource, /commitment\.kind === "receivable" \? "received" : "paid"/, "Receivables must distinguish received money from paid obligations.");
assert.match(panelSource, /className="recurring-mobile-row__category"/, "Mobile recurring rows must show transaction-style category marks.");
assert.doesNotMatch(panelSource, />Suggested</, "Recurring rows must not expose inferred-account implementation labels.");
assert.doesNotMatch(panelSource, /recurring-occurrence-check[^>]*>[\s\S]{0,700}<span>[^<]*(?:Pending|Paid|Received)/, "Recurring completion controls must not show redundant status labels.");
assert.match(panelSource, /<tr key=\{commitment\.id\}[\s\S]{0,180}<td className="commitments-table__completion">[\s\S]{0,1500}<td>/, "Desktop recurring rows must lead with the completion checkbox.");
const mobileRowStart = panelSource.indexOf('className="recurring-mobile-row"');
const mobileCompletionIndex = panelSource.indexOf("recurring-occurrence-check--mobile", mobileRowStart);
const mobileAccountIndex = panelSource.indexOf("recurring-mobile-row__account", mobileCompletionIndex);
const mobileCategoryIndex = panelSource.indexOf("recurring-mobile-row__category", mobileAccountIndex);
assert.ok(
  mobileRowStart >= 0 && mobileCompletionIndex > mobileRowStart && mobileAccountIndex > mobileCompletionIndex && mobileCategoryIndex > mobileAccountIndex,
  "Mobile recurring rows must lead with completion, account, and category controls.",
);
assert.doesNotMatch(panelSource, /recurring-mobile-row__open[\s\S]{0,400}<small>/, "Mobile recurring rows must stay single-line like Transactions.");
assert.match(panelSource, /commitment\.account \?\? commitment\.inferredAccount/, "Recurring rows must show reliable inferred accounts.");
assert.match(pageSource, /categoryName: commitment\.categoryName \?\? evidenceTransaction\?\.category\?\.name \?\? inferCommitmentCategory/, "Manual and transaction categories must take precedence over fallback categories.");
assert.match(pageSource, /bestMatch\.score >= runnerUp\.score \+ 2/, "Ambiguous account matches must stay unconfirmed.");
assert.match(stylesSource, /transactions-table\.commitments-table thead th[\s\S]{0,180}position: sticky/, "Recurring table headers must remain sticky.");
assert.match(stylesSource, /\.recurring-mobile-row \{[\s\S]{0,260}grid-template-columns: 18px 20px 20px minmax\(0, 1fr\) auto 24px/, "Mobile recurring rows must match the compact Transactions row rhythm.");
assert.match(panelSource, /<RecurringCalendar[\s\S]{0,180}comprehensive=\{activeTab === "overview"\}/, "Recurring Overview must use the comprehensive payment calendar.");
assert.match(panelSource, /activeTab !== "overview" \? renderRecurringTable\(\) : null/, "Subtab line items must remain below the calendar.");
assert.match(stylesSource, /\.recurring-calendar__grid[\s\S]{0,260}grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/, "The recurring calendar must render a full-width seven-day grid.");
assert.match(stylesSource, /touch-action: pan-y/, "The recurring calendar must preserve vertical scrolling while supporting horizontal month swipes.");
assert.match(clientSource, /aria-label=\{tab\.label\}/, "Recurring icon tabs must retain accessible names on mobile.");
assert.match(calendarSource, />\s*Today\s*</, "The calendar header must offer a compact Today control.");
assert.match(calendarSource, /Previous month[\s\S]{0,1600}Next month/, "The selected month must sit between previous and next arrows.");
assert.match(stylesSource, /height: clamp\(72px, calc\(\(100dvh - 330px\) \/ 6\), 118px\)/, "Desktop calendar rows must fit the available viewport when possible.");
assert.match(stylesSource, /height: clamp\(64px, calc\(\(100dvh - 412px\) \/ 6\), 84px\)/, "Mobile calendar rows must fit the available viewport when possible.");
assert.match(detailSource, /onBlur=\{\(\) => void finishEdit\("title"\)\}/, "Payment names must auto-save when inline editing loses focus.");
assert.match(detailSource, /onBlur=\{\(\) => void finishEdit\("amount"\)\}/, "Payment amounts must auto-save when inline editing loses focus.");
for (const field of ["kind", "recurrence", "status", "accountId", "categoryName", "currency"]) {
  assert.match(detailSource, new RegExp(`renderSelect\\("${field}"`), `${field} must be editable from the calendar details view.`);
}
assert.match(commitmentRouteSource, /categoryName: Object\.hasOwn\(body, "categoryName"\)/, "Recurring category changes must persist through the protected mutation route.");
assert.match(schemaSource, /categoryName\s+String\?/, "Recurring items must retain an explicit editable category override.");
assert.doesNotMatch(panelSource, /Next 30 days/i, "Recurring Overview must not duplicate the calendar with a Next 30 Days card.");
assert.doesNotMatch(panelSource, /Upcoming payments/i, "Recurring Overview must not duplicate commitments in an upcoming-payments card.");
assert.doesNotMatch(panelSource, /Monthly commitments/i, "Recurring Overview must not duplicate commitments in a monthly-summary card.");
assert.match(panelSource, /Every saved recurring item at a glance/, "Recurring Overview must explain that the merged table includes every saved commitment.");
for (const label of ["Planned Payments", "Debts & Loans", "Money Owed", "Installments"]) {
  assert.match(panelSource, new RegExp(label.replace(/[&]/g, "\\&")), `Recurring Overview must include the ${label} legend label.`);
}
assert.match(panelSource, /recurring-overview-commitments-table[\s\S]{0,1600}<th>Status<\/th>/, "The merged commitments table must expose status so inactive items are not silently omitted.");
assert.match(stylesSource, /\.recurring-overview-card--commitments\s*\{[\s\S]{0,100}grid-column: 1 \/ -1/, "The merged commitments table must span the desktop overview.");
assert.match(stylesSource, /\.recurring-overview-commitments__mobile\s*\{[\s\S]{0,50}display: grid/, "The merged commitments table must provide a compact mobile view.");
assert.match(panelSource, /Review suggestions/, "Recurring Overview must identify detected candidates as review suggestions.");
assert.match(stylesSource, /\.recurring-overview-card--review\s*\{[\s\S]{0,100}grid-column: 1 \/ -1/, "Review Suggestions must span the desktop overview.");
assert.match(stylesSource, /@media \(max-width: 700px\)[\s\S]{0,150}\.recurring-overview-grid\s*\{[\s\S]{0,100}grid-template-columns: minmax\(0, 1fr\)/, "Recurring overview cards must stack on mobile.");
assert.match(panelSource, /Detected transactions/, "Suggestion review must show its detected transaction history.");
assert.match(panelSource, /evidenceTransactionIds: patternDraft\.transactionIds/, "Edited suggestion evidence must persist when saved.");
assert.match(panelSource, /Planned payment date/, "Suggestion review must support an earlier planned-payment date.");
assert.match(schemaSource, /plannedPaymentDate\s+DateTime\?/, "Recurring items must persist the optional planned-payment date.");
assert.match(schemaSource, /evidenceTransactionIds\s+Json\?/, "Recurring items must persist all reviewed transaction evidence.");

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
