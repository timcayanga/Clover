import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { BudgetRecord, BudgetTransaction, BudgetCommitment } from "@/lib/budgeting";
import { buildBudgetOverview, buildBudgetSuggestions } from "@/lib/budgeting";
import { budgetIcons, getBudgetAppearance, isBudgetEmoji } from "@/lib/budget-appearance";

const now = new Date("2026-07-14T12:00:00.000Z");

const readSource = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
for (const file of ["app/api/budgets/route.ts", "app/api/budgets/[budgetId]/route.ts"]) {
  const source = readSource(file);
  assert.match(source, /budgetPlan\.findFirst\(\{ where: \{ id: payload\.planId, workspaceId: context\.workspaceId \}/, "plan assignments must be workspace-scoped");
  assert.match(source, /assertTrustedRequestOrigin\(request\)/);
}
assert.match(readSource("app/api/budget-plans/route.ts"), /data: \{ workspaceId: context\.workspaceId, name: parsed\.data\.name \}/, "plan ownership must come from the authenticated context");
const budgetUi = readSource("components/budgeting-workspace.tsx");
const dashboardBudgetPulse = readSource("components/dashboard-budget-pulse.tsx");
assert.match(
  dashboardBudgetPulse,
  /pulse\.activeBudgetCount === 1 \? "budget is" : "budgets are"/,
  "The dashboard budget count must use singular and plural grammar correctly.",
);
assert.match(budgetUi, /useCollectionSelection\("budget"\)/);
assert.match(budgetUi, /budgets\.map\(\(budget\)/, "one card per individual budget, including paused budgets");
assert.doesNotMatch(budgetUi, /AnimatedTabs|selectedPlan|collection-switcher|Your budget plans|Limits on track/);
assert.ok(budgetUi.indexOf('aria-label="Budget overview"') < budgetUi.indexOf('aria-label="Budget reports"'));
assert.ok(budgetUi.indexOf('aria-label="Budget reports"') < budgetUi.indexOf('aria-label="Budget transaction history"'));
assert.match(budgetUi, /controller\.abort\(\)/, "cancel stale history requests when navigating");
assert.match(budgetUi, /mobile \? "budget-editor-page" : "budget-editor__backdrop"/, "mobile creation must be a page, not a modal");
const appearanceRoute = readSource("app/api/budgets/[budgetId]/appearance/route.ts");
assert.match(appearanceRoute, /where: \{ id: budgetId, workspaceId: context.workspaceId \}/);
assert.match(appearanceRoute, /data: \{ name: parsed.data.name, emoji: parsed.data.emoji \}/, "identity edits cannot update financial settings");
assert.match(appearanceRoute, /\.strict\(\)/);
assert.match(appearanceRoute, /assertTrustedRequestOrigin\(request\)/);
assert.equal(getBudgetAppearance({ name: "Weekly Groceries" }).emoji, "🛒");
assert.equal(getBudgetAppearance({ name: "Travel fund" }).emoji, "✈️");
assert.equal(getBudgetAppearance({ name: "Our limit", categoryName: "Food & Dining" }).emoji, "🍔");
assert.equal(getBudgetAppearance({ name: "Groceries", emoji: "🎁" }).emoji, "🎁", "user-selected icons override suggestions");
assert.equal(getBudgetAppearance({ name: "New", kind: "savings_target" }).emoji, "🌱");
assert.equal(isBudgetEmoji("<script>"), false);
for (const icon of budgetIcons) {
  assert.equal(getBudgetAppearance({ name: "Any", emoji: icon.emoji }).color, icon.color);
  assert.match(icon.color, /^#[0-9a-f]{6}$/i);
}
assert.match(readSource("components/collection-navigation.tsx"), /window\.history\.pushState/);

const budget = (overrides: Partial<BudgetRecord> = {}): BudgetRecord => ({
  id: "budget-1",
  name: "Monthly spending",
  kind: "spend_limit",
  scope: "global",
  cadence: "monthly",
  targetAmount: 1000,
  currency: "PHP",
  isActive: true,
  accountId: null,
  categoryId: null,
  ...overrides,
});

const transaction = (overrides: Partial<BudgetTransaction> = {}): BudgetTransaction => ({
  accountId: "account-1",
  categoryId: "category-1",
  type: "expense",
  amount: 100,
  date: new Date("2026-07-10T12:00:00.000Z"),
  isExcluded: false,
  ...overrides,
});

const commitment = (overrides: Partial<BudgetCommitment> = {}): BudgetCommitment => ({
  amount: 250,
  currency: "PHP",
  accountId: null,
  dueDate: new Date("2026-07-20T12:00:00.000Z"),
  nextDueDate: null,
  kind: "planned_payment",
  status: "active",
  ...overrides,
});

const overview = buildBudgetOverview({
  budgets: [budget()],
  transactions: [
    transaction(),
    transaction({ amount: 900, date: new Date("2026-08-01T12:00:00.000Z") }),
    transaction({ amount: 400, date: new Date("2026-07-11T12:00:00.000Z"), isExcluded: true }),
    transaction({ amount: 300, date: new Date("2026-06-30T12:00:00.000Z") }),
  ],
  commitments: [
    commitment(),
    commitment({ amount: 900, dueDate: new Date("2026-08-02T12:00:00.000Z") }),
    commitment({ amount: 400, currency: "USD" }),
  ],
  now,
});

assert.equal(overview.budgets[0]?.actualAmount, 100, "only included transactions in the current period should count");
assert.equal(overview.budgets[0]?.plannedAmount, 250, "only matching planned commitments in the current period should count");
assert.equal(overview.budgets[0]?.plannedCount, 1, "planned commitment count should match the planned amount");
assert.equal(overview.budgets[0]?.projectedAmount, 350, "projected spend should combine actual and planned amounts");
assert.equal(overview.budgets[0]?.projectedProgressPercent, 35, "projected progress should use the budget target");

const planOverview = buildBudgetOverview({
  budgets: [budget({ id: "legacy" }), budget({ id: "travel", planId: "travel-plan" }), budget({ id: "paused", planId: "travel-plan", isActive: false })],
  transactions: [transaction()], commitments: [], now,
});
assert.equal(planOverview.activeBudgetCount, 2, "the dashboard count must reflect every active budget, not the number of plans");
assert.equal(planOverview.budgets.find((row) => row.id === "legacy")?.planId, null, "existing limits remain in Personal budget without rewriting records");
assert.equal(planOverview.budgets.find((row) => row.id === "travel")?.planId, "travel-plan", "named plan membership survives progress calculation");
assert.equal(planOverview.inactiveBudgets[0]?.planId, "travel-plan", "paused limits remain associated with their plan");
assert.equal(planOverview.budgets.find((row) => row.id === "travel")?.actualAmount, 100, "plan grouping must not change transaction matching or totals");
const decorated = buildBudgetOverview({ budgets: [budget({ name: "Groceries", emoji: "🛒" })], transactions: [transaction()], commitments: [], now });
assert.equal(decorated.budgets[0].emoji, "🛒");
assert.equal(decorated.budgets[0].actualAmount, 100, "presentation fields must not affect calculation");

const scopedOverview = buildBudgetOverview({
  budgets: [
    budget({ id: "account-budget", scope: "account", accountId: "account-1" }),
    budget({ id: "category-budget", scope: "category", categoryId: "category-1" }),
  ],
  transactions: [
    transaction({ accountId: "account-1", categoryId: "category-1", amount: 100 }),
    transaction({ accountId: "account-2", categoryId: "category-1", amount: 200 }),
    transaction({ accountId: "account-1", categoryId: "category-2", amount: 300 }),
  ],
  commitments: [commitment({ accountId: "account-1" })],
  now,
});

assert.equal(scopedOverview.budgets.find((item) => item.id === "account-budget")?.actualAmount, 400, "account budgets should include only their account activity");
assert.equal(scopedOverview.budgets.find((item) => item.id === "account-budget")?.plannedCount, 1, "account budgets should include matching planned commitments");
assert.equal(scopedOverview.budgets.find((item) => item.id === "category-budget")?.actualAmount, 300, "category budgets should include only their category activity");
assert.equal(scopedOverview.budgets.find((item) => item.id === "category-budget")?.plannedCount, 0, "category budgets should not claim account-level commitments");

assert.deepEqual(
  buildBudgetSuggestions({
    transactions: [transaction()],
    accounts: [
      { id: "account-1", name: "PHP account", currency: "PHP" },
      { id: "account-2", name: "USD account", currency: "USD" },
    ],
    categories: [{ id: "category-1", name: "Shopping" }],
  }),
  [],
  "mixed-currency workspaces should not receive ambiguous spending suggestions"
);

console.log("Budgeting regression checks passed.");
