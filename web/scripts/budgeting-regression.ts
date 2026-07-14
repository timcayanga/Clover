import assert from "node:assert/strict";
import type { BudgetRecord, BudgetTransaction, BudgetCommitment } from "@/lib/budgeting";
import { buildBudgetOverview, buildBudgetSuggestions } from "@/lib/budgeting";

const now = new Date("2026-07-14T12:00:00.000Z");

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
