import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BudgetRecord, BudgetTransaction } from "../lib/budgeting";

// Inject before importing the real loaders: no network or financial writes.
let budgets: BudgetRecord[] = [];
let transactions: BudgetTransaction[] = [];
let parsedRows: any[] = [];
let calls: Array<{ name: string; args: any; rows: number }> = [];
let active = 0, maxActive = 0;
const read = (name: string, result: (args: any) => any) => async (args: any) => {
  active++; maxActive = Math.max(active, maxActive);
  await Promise.resolve();
  const value = result(args);
  calls.push({ name, args, rows: Array.isArray(value) ? value.length : value ? 1 : 0 });
  active--;
  return value;
};
const categories = [{ id: "food", name: "Food", isArchived: false }];
let circleRecord: any;
const fakePrisma = {
  budget: { findMany: read("budgets", () => budgets) },
  transaction: {
    findMany: read("transactions", (args) => transactions.filter((row) => !args.where.date || row.date >= args.where.date.gte)),
    findFirst: read("normalized-exists", (args) => transactions.some((row) => row.date >= args.where.date.gte) ? { id: "existing" } : null),
  },
  parsedTransaction: { findMany: read("parsed", (args) => parsedRows.filter((row) => row.date >= args.where.date.gte)) },
  category: { findMany: read("categories", () => categories) },
  account: { findMany: read("accounts", () => []) },
  financialCommitment: { findMany: read("commitments", () => []) },
  budgetPlan: { findMany: read("plans", () => []) },
  circle: { findMany: read("circles", (args) => {
    assert.equal(args.where.archivedAt, null);
    assert.deepEqual(args.where.OR, [{ ownerUserId: "owner" }, { memberships: { some: { userId: "owner", status: "active" } } }]);
    return args.where.id && args.where.id !== circleRecord.id ? [] : [circleRecord];
  }) },
};
(globalThis as any).prisma = fakePrisma;

async function main() {
  const { loadBudgetWorkspaceData, getBudgetDirectoryStart } = await import("../lib/budgeting-data");
  const { loadCirclesDirectoryData } = await import("../lib/circle-directory");
  const { loadCirclesWorkspaceData } = await import("../lib/circle-loaders");
  const cadences = ["daily", "weekly", "biweekly", "monthly", "quarterly", "annual"] as const;
  for (const now of [new Date(2026, 8, 3, 12), new Date(2027, 0, 1, 12), new Date(2028, 1, 29, 12)]) {
    transactions = Array.from({ length: 4000 }, (_, index) => ({
      accountId: "cash", categoryId: index % 4 ? "food" : null, type: index % 5 ? "expense" : "income",
      amount: index + 1, date: new Date(now.getTime() - Math.floor(index / 10) * 86400000), isExcluded: false,
      isTransfer: index % 7 === 0, category: { name: index % 7 === 0 ? "Transfers" : "Food" },
    }));
    for (const cadence of cadences) {
      budgets = [{ id: "budget", name: "Food", kind: "spend_limit", scope: "category", cadence, targetAmount: 500, currency: "PHP", isActive: true, accountId: null, categoryId: "food" },
        { id: "paused", name: "Savings", kind: "savings_target", scope: "global", cadence, targetAmount: 1000, currency: "PHP", isActive: false, accountId: null, categoryId: null }];
      calls = [];
      const baseline = await loadBudgetWorkspaceData("workspace", now);
      const baselineReads = calls.length;
      calls = [];
      const improved = await loadBudgetWorkspaceData("workspace", now, { directory: true });
      assert.deepEqual(improved.overview, baseline.overview, `${cadence}: totals/alerts/paused budgets must be unchanged`);
      assert.equal(calls.length, 3, "normal directory reads only budgets, current-period transactions and commitments");
      assert.equal(baselineReads, 6);
      assert.ok(!calls.some((call) => ["accounts", "categories", "plans", "parsed"].includes(call.name)));
      assert.ok(improved.transactions.length <= baseline.transactions.length);
      if (cadence === "monthly" && now.getFullYear() === 2026) console.log(`Fixture monthly transactions: ${baseline.transactions.length} → ${improved.transactions.length}; loader reads: ${baselineReads} → ${calls.length}`);
    }
    assert.ok(getBudgetDirectoryStart([{ cadence: "daily" }], now) <= new Date(now.getFullYear(), now.getMonth(), 1));
  }
  const now = new Date(2026, 8, 3, 12);
  budgets = [budgets[0]];
  parsedRows = [{ date: now, amount: 20, type: "expense", categoryName: "Food", importFile: { accountId: "cash" } }];
  transactions = [{ accountId: "cash", categoryId: "food", type: "expense", amount: 100, date: new Date(2026, 1, 1), isExcluded: false }];
  budgets[0] = { ...budgets[0], cadence: "monthly" };
  calls = [];
  assert.equal((await loadBudgetWorkspaceData("workspace", now, { directory: true })).overview.budgets[0].actualAmount, 0);
  assert.ok(!calls.some((call) => call.name === "parsed"), "older normalized data must not resurrect parsed fallback");
  transactions = [];
  assert.equal((await loadBudgetWorkspaceData("workspace", now, { directory: true })).overview.budgets[0].actualAmount, 20, "still-importing category fallback remains available");
  budgets = []; calls = [];
  await loadBudgetWorkspaceData("workspace", now, { directory: true });
  assert.deepEqual(calls.map((call) => call.name), ["budgets"], "empty directory must not scan transaction history");

  const today = new Date();
  circleRecord = {
    id: "circle", name: "QA", type: "custom", description: null, avatarUrl: null, color: "teal", currency: "PHP", ownerUserId: "owner", updatedAt: today,
    memberships: [{ id: "member", userId: "owner", role: "organizer", status: "active", displayName: "Owner", email: "owner@example.test", contributionTarget: null }],
    _count: { memberships: 1 }, budgets: [], goals: [], commitments: [], contributions: [], investmentShares: [], invitations: [], activities: [],
    splitBillGroup: { id: "group", bills: [{ id: "bill", title: "Meal", total: 90, currency: "PHP", billDate: today, transactionId: "duplicate" }] },
    sharedTransactions: [
      { id: "shared", transactionId: "duplicate", sharedAmount: null, visibility: "summary", transaction: { date: today, amount: -90, merchantRaw: "Private", currency: "PHP" } },
      { id: "other", transactionId: "other", sharedAmount: 25, visibility: "summary", transaction: { date: today, amount: -60, merchantRaw: "Private", currency: "PHP" } },
    ],
  };
  const user = { id: "owner", firstName: "Owner", lastName: "QA", email: "owner@example.test" } as any;
  calls = [];
  const directory = await loadCirclesDirectoryData(user);
  assert.equal(calls.length, 1);
  const select = calls[0].args.select;
  for (const relation of ["goals", "budgets", "activities", "invitations", "contributions", "investmentShares"]) assert.equal(select[relation], undefined);
  const detail = await loadCirclesWorkspaceData(user, "circle");
  assert.equal(directory.circles[0].expenseTotalThisMonth, 115);
  assert.equal(directory.circles[0].expenseTotalThisMonth, detail.circles[0].expenseTotalThisMonth);
  assert.equal(directory.circles[0].memberCount, detail.circles[0].memberCount);
  assert.equal(directory.circles[0].detailsLoaded, false);
  assert.equal(detail.circles[0].detailsLoaded, true);
  assert.equal((await loadCirclesWorkspaceData(user, "inaccessible")).circles.length, 0);
  assert.ok(maxActive <= 2, "respect the two-connection database pool");
  const ui = readFileSync("components/circles-workspace.tsx", "utf8");
  assert.match(ui, /needsDetails \? \(/);
  assert.match(ui, /controller\.abort\(\)/);
  assert.match(ui, /refresh\(null\)/, "deleting a Circle must refresh the directory, not request deleted details");
  assert.match(readFileSync("app/api/budgets/options/route.ts", "utf8"), /resolveBudgetingWorkspace\(\)/);
  console.log("Collection loading regression passed: period parity, fallback safety, access scoping, bounded reads and detail loading guards.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
