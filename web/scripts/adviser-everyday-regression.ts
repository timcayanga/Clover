import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildInvestmentReview,
  calculateDailySpendingPlan,
  calculatePurchaseSavingsPlan,
  classifyEverydayQuestion,
  extractEverydayMoneyAmount,
  getEverydayRoutingHint,
} from "@/lib/adviser-everyday";

const intentCases = [
  ["How much should I budget today?", "daily_spending"],
  ["How much can I spend today?", "daily_spending"],
  ["How much should I save to buy a phone?", "purchase_savings"],
  ["What should I invest in?", "investment_selection"],
  ["What investment should I stop?", "investment_review"],
  ["What credit card can I get?", "credit_card"],
  ["What bank should I open an account in?", "bank_account"],
  ["How to save?", "saving"],
  ["How to grow my money?", "money_growth"],
  ["How to make more money?", "income_growth"],
  ["What kind of food should I buy today?", "food_choice"],
] as const;

for (const [question, expected] of intentCases) {
  assert.equal(classifyEverydayQuestion(question), expected, question);
  assert.ok(getEverydayRoutingHint(expected), `Missing routing hint for ${expected}`);
}

assert.equal(extractEverydayMoneyAmount("Save ₱25,000 for a phone"), 25_000);
assert.equal(extractEverydayMoneyAmount("I need 30k for a laptop"), 30_000);
assert.equal(extractEverydayMoneyAmount("Save for an iPhone 16"), null);
assert.equal(extractEverydayMoneyAmount("Save for a phone in 6 months"), null);

const groundedDailyPlan = calculateDailySpendingPlan({
  safeToSpend: 14_000,
  horizonDays: 14,
  baselineMonthlySpend: 18_000,
  todaySpend: 150,
  activeBudgetRemaining: 4_000,
  activeBudgetDaysRemaining: 10,
  accountCount: 2,
  transactionCount: 120,
});
assert.equal(groundedDailyPlan.coverage, "grounded");
assert.equal(groundedDailyPlan.safeDailyCeiling, 1_000);
assert.equal(groundedDailyPlan.recommendedToday, 400);
assert.equal(groundedDailyPlan.remainingToday, 250);

const partialDailyPlan = calculateDailySpendingPlan({
  safeToSpend: 7_000,
  horizonDays: 14,
  baselineMonthlySpend: 0,
  todaySpend: 0,
  accountCount: 1,
  transactionCount: 0,
});
assert.equal(partialDailyPlan.coverage, "partial");
assert.equal(partialDailyPlan.recommendedToday, 400);

const protectedCashPlan = calculateDailySpendingPlan({
  safeToSpend: 0,
  horizonDays: 14,
  baselineMonthlySpend: 18_000,
  todaySpend: 0,
  accountCount: 1,
  transactionCount: 60,
});
assert.equal(protectedCashPlan.recommendedToday, 0);
assert.equal(protectedCashPlan.safeDailyCeiling, 0);

const missingDailyPlan = calculateDailySpendingPlan({
  safeToSpend: 0,
  horizonDays: 14,
  baselineMonthlySpend: 0,
  todaySpend: 0,
  accountCount: 0,
  transactionCount: 0,
});
assert.equal(missingDailyPlan.coverage, "missing");
assert.equal(missingDailyPlan.recommendedToday, 0);

const purchasePlan = calculatePurchaseSavingsPlan({
  targetAmount: 30_000,
  monthlySavingsCapacity: 6_000,
  accountCount: 2,
  transactionCount: 100,
});
assert.deepEqual(
  purchasePlan.scenarios.map((scenario) => [scenario.months, scenario.monthlyAmount, scenario.fitsEstimatedCapacity]),
  [
    [3, 10_000, false],
    [6, 5_000, true],
    [12, 2_500, true],
  ]
);

const missingDataPurchasePlan = calculatePurchaseSavingsPlan({
  targetAmount: 24_000,
  accountCount: 0,
  transactionCount: 0,
});
assert.equal(missingDataPurchasePlan.coverage, "missing");
assert.equal(missingDataPurchasePlan.scenarios[1]?.monthlyAmount, 4_000);
assert.equal(missingDataPurchasePlan.scenarios[1]?.fitsEstimatedCapacity, null);

const review = buildInvestmentReview([
  { name: "Large holding", value: 80_000, costBasis: 100_000 },
  { name: "Small holding", value: 20_000, costBasis: 18_000 },
]);
assert.equal(review[0]?.name, "Large holding");
assert.equal(review[0]?.concentration, 0.8);
assert.ok(review[0]?.flags.includes("high_concentration"));
assert.ok(review[0]?.flags.includes("large_unrealized_loss"));

const chatRouteSource = readFileSync(new URL("../app/api/adviser/chat/route.ts", import.meta.url), "utf8");
for (const toolName of [
  "plan_daily_spending",
  "build_purchase_savings_plan",
  "build_saving_plan",
  "build_money_growth_plan",
  "build_income_growth_plan",
  "evaluate_financial_product_fit",
  "plan_food_spending",
  "review_investments",
]) {
  assert.match(chatRouteSource, new RegExp(`name: "${toolName}"`), `Missing ${toolName} tool definition`);
  assert.match(chatRouteSource, new RegExp(`call\\.name === "${toolName}"`), `Missing ${toolName} tool handler`);
}
assert.match(chatRouteSource, /ask at most one focused follow-up/i);
assert.match(chatRouteSource, /never promise approval/i);
assert.match(chatRouteSource, /A loss by itself is not a reason to sell/i);

console.log("Adviser everyday regression passed.");
