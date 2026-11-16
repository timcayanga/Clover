import assert from "node:assert/strict";
import { matchesReportSelection, reportFilterSelection } from "../lib/report-filter-policy";
import { resolveReportWindow } from "../lib/report-window";

const rows = [
  { account: { id: "bank" }, reviewStatus: "confirmed", category: "Food, drinks", type: "expense", amount: 120 },
  { account: { id: "bank" }, reviewStatus: "edited", category: "Income", type: "income", amount: 500 },
  { account: { id: "cash" }, reviewStatus: "suggested", category: "Food, drinks", type: "expense", amount: 30 },
  { account: { id: "bank" }, reviewStatus: "pending_review", category: "Transfer", type: "transfer", amount: 90 },
];
const select = (params: Parameters<typeof reportFilterSelection>[0]) => rows.filter(row => matchesReportSelection(row, row.category, row.type, reportFilterSelection(params)));
assert.equal(select({}).length, 3, "Transfers are excluded by default.");
assert.deepEqual(select({ accounts: "bank", categories: JSON.stringify(["Food, drinks"]) }).map(r => r.amount), [120]);
assert.deepEqual(select({ review: "confirmed" }).map(r => r.amount), [120, 500]);
assert.deepEqual(select({ review: "pending", transfers: "include" }).map(r => r.amount), [30, 90]);
assert.deepEqual(select({ transfers: "only" }).map(r => r.amount), [90]);
assert.equal(select({ accounts: "not-this-workspace" }).length, 0);
assert.equal(select({ accounts: "bank,bank", review: "unknown" }).length, 2);
assert.equal(select({ categories: "missing" }).length, 0);
assert.equal(matchesReportSelection({ account: { id: "bank" }, reviewStatus: "rejected" }, "Food", "expense", reportFilterSelection({ review: "pending" })), false);
const year = resolveReportWindow(new Date(2024, 2, 2), { from: "2024-02-29", to: "2024-03-01", compare: "year" });
assert.equal(year.previousStart.getFullYear(), 2023);
assert.equal(year.previousStart.getMonth(), 1);
assert.equal(year.previousStart.getDate(), 28, "Leap-day comparison must clamp to February, not roll into March.");
assert.equal(year.previousEnd.getMonth(), 2);
assert.equal(year.previousEnd.getDate(), 1);
assert.equal(year.previousEnd.getHours(), 23);
const previous = resolveReportWindow(new Date(2026, 8, 19), { from: "2026-09-01", to: "2026-09-07" });
assert.equal(previous.previousEnd.getTime() + 1, previous.currentStart.getTime());
assert.equal(previous.previousEnd.getTime() - previous.previousStart.getTime(), previous.currentEnd.getTime() - previous.currentStart.getTime());
console.log("Report filter policy and comparison regression checks passed.");
