import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getRollingWeekBuckets } from "../lib/report-week-buckets";
import { goalActivityTotals } from "../lib/goal-activity-totals";
import { mobileHomePeriods } from "../lib/mobile-home-periods";
import { getGoalProgressSnapshot, normalizeGoalPlan } from "../lib/goals";

const weeks = getRollingWeekBuckets(new Date(2026, 8, 19, 23, 59, 59, 999));
const latest = weeks.at(-1)!;
assert.equal(latest.start.getDate(), 13);
assert.equal(latest.start.getHours(), 0);
assert.equal(weeks.at(-2)!.end.getTime() + 1, latest.start.getTime());
const firstDayExpense = new Date(2026, 8, 13, 10);
assert.ok(firstDayExpense >= latest.start && firstDayExpense <= latest.end, "The first day's expense must appear in both the summary and chart.");
const yearBoundary = getRollingWeekBuckets(new Date(2027, 0, 2, 23, 59, 59, 999)).at(-1)!;
assert.equal(yearBoundary.start.getFullYear(), 2026);
assert.equal(yearBoundary.start.getDate(), 27);

const period = mobileHomePeriods(new Date("2026-09-19T12:00:00Z")).rolling(30);
assert.equal(period.from.toISOString(), "2026-08-20T16:00:00.000Z");
assert.equal(period.to.toISOString(), "2026-09-19T16:00:00.000Z");
const expense = { type: "expense" as const, amount: -2, isTransfer: false, category: null, account: { type: "bank" } };
const totals = goalActivityTotals([
  { ...expense, type: "income", amount: 1000 },
  ...Array.from({ length: 250 }, () => expense),
  { ...expense, amount: -900, isTransfer: true },
]);
assert.equal(totals.income, 1000);
assert.equal(totals.spending, 500, "Negative expenses are magnitudes and the full ledger, not a 180-row preview, drives progress.");
const investment = goalActivityTotals([{ ...expense, amount: -30, account: { type: "investment" } }]);
assert.equal(investment.investmentFlow, 30);
const plan = normalizeGoalPlan({ goalKey: "save_more", targetMode: "amount", targetAmount: 12000, targetPercent: null, cadence: "annual", purpose: "Buffer" }, "save_more", 12000);
const progress = getGoalProgressSnapshot({ goalKey: "save_more", targetAmount: null, goalPlan: plan, currentNet: totals.income - totals.spending, currentSpend: totals.spending, monthlyIncome: totals.income, currentSavingsRate: .5, previousSavingsRate: null, spendDelta: null, recurringShare: 0 }, "PHP");
assert.equal(progress.targetAmount, 1000);
assert.equal(progress.currentAmount, 500);
assert.equal(progress.progressPercent, 50);
const goals = readFileSync("app/goals/page.tsx", "utf8");
assert.match(goals, /loadGoalActivity\(resolvedWorkspace.id, goalCurrency, goalPeriod\)/);
assert.match(goals, /const investmentFlow = currentActivity.investmentFlow/);
assert.match(goals, /lt: goalPeriod.to/);
assert.doesNotMatch(goals, /currentSummaryRows\.reduce/);
const reports = readFileSync("app/reports/reports-page-content.tsx", "utf8");
assert.match(reports, /const weeklySummary = weeklyTrendBuckets\[weeklyTrendBuckets.length - 1\]/);
console.log("Displayed figures regression passed: week boundaries, signed amounts, transfers, complete goal activity and annual monthly pace.");
