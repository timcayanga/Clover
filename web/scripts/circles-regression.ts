import assert from "node:assert/strict";
import {
  buildCircleInsights,
  calculateGoalForecast,
  circleTemplates,
  clampPercent,
  type CircleBudgetSummary,
  type CircleGoalSummary,
  type CircleMemberSummary,
} from "../lib/circles";
import { assertTrustedRequestOrigin } from "../lib/request-security";

const logPass = (persona: string, behavior: string) => process.stdout.write(`✓ ${persona}: ${behavior}\n`);

const runBeginnerUat = () => {
  const household = circleTemplates.find((template) => template.type === "household");
  assert.ok(household, "Household setup template must exist");
  assert.match(household.description, /rent|groceries|utilities/i);
  assert.ok(household.starterActions.length >= 3);
  assert.equal(clampPercent(-20), 0);
  assert.equal(clampPercent(140), 100);
  logPass("financial beginner", "gets a guided household setup and bounded progress values");
};

const runExperiencedUat = () => {
  const now = new Date("2026-07-17T00:00:00.000Z");
  const forecast = calculateGoalForecast({
    currentAmount: 60_000,
    targetAmount: 120_000,
    now,
    contributions: [
      { amount: 10_000, contributionDate: new Date("2026-03-25T00:00:00.000Z") },
      { amount: 10_000, contributionDate: new Date("2026-04-25T00:00:00.000Z") },
      { amount: 10_000, contributionDate: new Date("2026-05-25T00:00:00.000Z") },
      { amount: 10_000, contributionDate: new Date("2026-06-25T00:00:00.000Z") },
      { amount: 10_000, contributionDate: new Date("2026-07-10T00:00:00.000Z") },
    ],
  });
  assert.ok(forecast.estimatedCompletionDate);
  assert.equal(forecast.confidence, 75);
  assert.match(forecast.reason ?? "", /5 contributions/);
  assert.ok(forecast.estimatedCompletionDate > now);
  logPass("seasoned financial manager", "receives an explainable, confidence-scored contribution forecast");
};

const runBarkadaUat = () => {
  const travel = circleTemplates.find((template) => template.type === "travel");
  const friends = circleTemplates.find((template) => template.type === "friends");
  assert.ok(travel?.starterActions.some((action) => /split/i.test(action)));
  assert.match(friends?.title ?? "", /barkada/i);
  const sparseForecast = calculateGoalForecast({
    currentAmount: 5_000,
    targetAmount: 50_000,
    contributions: [{ amount: 5_000, contributionDate: new Date() }],
  });
  assert.equal(sparseForecast.estimatedCompletionDate, null, "One payment must not produce a misleading forecast");
  assert.equal(sparseForecast.confidence, null);
  logPass("barkada", "can start from travel or friends and does not receive a guess from sparse activity");
};

const runCoupleUat = () => {
  const members: CircleMemberSummary[] = [
    { id: "a", userId: "a", displayName: "Ana", email: null, role: "organizer", status: "active", contributionTarget: 15_000, contributionCadence: "monthly", contributedThisMonth: 10_000 },
    { id: "b", userId: "b", displayName: "Ben", email: null, role: "member", status: "active", contributionTarget: 15_000, contributionCadence: "monthly", contributedThisMonth: 15_000 },
  ];
  const budgets: CircleBudgetSummary[] = [{ id: "home", name: "Household", targetAmount: 30_000, spentAmount: 31_500, remainingAmount: -1_500, progressPercent: 100, currency: "PHP", cadence: "monthly", categoryName: null, isActive: true }];
  const goals: CircleGoalSummary[] = [{ id: "wedding", name: "Wedding", purpose: null, targetAmount: 300_000, currentAmount: 225_000, remainingAmount: 75_000, progressPercent: 75, currency: "PHP", targetDate: null, status: "active", estimatedCompletionDate: null, estimateConfidence: null, estimateReason: null }];
  const insights = buildCircleInsights({ currency: "PHP", expenseTotalThisMonth: 31_500, contributionTotalThisMonth: 25_000, budgets, goals, members });
  assert.ok(insights.some((insight) => insight.id === "budget:home" && insight.confidence === 100));
  assert.ok(insights.some((insight) => insight.id === "goal:wedding"));
  assert.ok(insights.some((insight) => insight.id === "member:a"));
  assert.ok(insights.every((insight) => !/salary|bank balance|account number/i.test(`${insight.title} ${insight.detail}`)));
  logPass("couple", "gets useful shared insights without exposing salary, account balances, or account numbers");
};

const runRequestSecurityUat = () => {
  assert.doesNotThrow(() =>
    assertTrustedRequestOrigin(
      new Request("http://127.0.0.1:3000/api/circles", {
        headers: { origin: "http://localhost:3000" },
      }),
    ),
  );
  assert.throws(() =>
    assertTrustedRequestOrigin(
      new Request("https://staging.clover.test/api/circles", {
        headers: { origin: "https://attacker.test" },
      }),
    ),
  );
  logPass(
    "security QA",
    "accepts equivalent local test origins while rejecting cross-site writes",
  );
};

runBeginnerUat();
runExperiencedUat();
runBarkadaUat();
runCoupleUat();
runRequestSecurityUat();

process.stdout.write("Circles regression suite passed.\n");
