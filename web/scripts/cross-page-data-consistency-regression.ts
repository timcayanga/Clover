import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildActiveWorkspaceTransactionWhere, buildTransactionQueryWhere } from "../lib/transaction-query";
import {
  classifyWorkspaceMutation,
  getAffectedWorkspaceDataDomains,
} from "../lib/workspace-data-sync";

const workspaceId = "workspace-consistency";
const activeWhere = buildActiveWorkspaceTransactionWhere(workspaceId, { currency: "PHP" });
assert.equal(activeWhere.deletedAt, null);
assert.equal(activeWhere.isExcluded, false);
assert.equal(activeWhere.currency, "PHP");
assert.ok(Array.isArray(activeWhere.AND), "The active ledger must retain the workspace fallback scope.");

const transactionPageWhere = buildTransactionQueryWhere(workspaceId, {});
assert.equal(transactionPageWhere.deletedAt, null);
assert.equal(transactionPageWhere.isExcluded, false);

assert.equal(classifyWorkspaceMutation("/api/transactions", "POST"), "transactions");
assert.equal(classifyWorkspaceMutation("/api/accounts/account-1", "PATCH"), "accounts");
assert.equal(classifyWorkspaceMutation("/api/commitments", "DELETE"), "recurring");
assert.equal(classifyWorkspaceMutation("/api/investment-holdings", "POST"), "investments");
assert.equal(classifyWorkspaceMutation("/api/transactions", "GET"), null);
assert.equal(classifyWorkspaceMutation("/api/analytics/events", "POST"), null);

const transactionDependents = getAffectedWorkspaceDataDomains("transactions");
for (const domain of [
  "accounts",
  "transactions",
  "recurring",
  "circles",
  "split-bills",
  "budgeting",
  "goals",
  "investments",
  "adviser",
  "home",
  "reports",
] as const) {
  assert.ok(transactionDependents.includes(domain), `Transaction changes must invalidate ${domain}.`);
}

const investmentDependents = getAffectedWorkspaceDataDomains("investments");
for (const domain of ["accounts", "investments", "circles", "goals", "adviser", "home", "reports"] as const) {
  assert.ok(investmentDependents.includes(domain), `Investment changes must invalidate ${domain}.`);
}

const source = (relativePath: string) => readFileSync(path.join(process.cwd(), relativePath), "utf8");
for (const file of [
  "app/dashboard/page.tsx",
  "app/adviser/page.tsx",
  "app/reports/page.tsx",
  "lib/budgeting-data.ts",
  "lib/recurring-page.ts",
]) {
  assert.match(source(file), /buildActiveWorkspaceTransactionWhere/, `${file} must use the active ledger scope.`);
}

const goalsSource = source("app/goals/page.tsx");
assert.match(goalsSource, /buildActiveWorkspaceTransactionWhere/);
assert.ok(
  (goalsSource.match(/"deletedAt" IS NULL/g) ?? []).length >= 4,
  "Every raw Goals aggregate must exclude deleted transactions."
);
assert.ok(
  (goalsSource.match(/SELECT "id" FROM "Account" WHERE "workspaceId"/g) ?? []).length >= 4,
  "Every raw Goals aggregate must retain account-linked legacy rows."
);

const dashboardSource = source("app/dashboard/page.tsx");
assert.match(dashboardSource, /account\.source === "manual"/);
assert.match(dashboardSource, /: account\.balance\);/);

const circleSource = source("lib/circle-loaders.ts");
assert.match(circleSource, /isExcluded: false/);

const shellSource = source("components/clover-shell.tsx");
assert.match(shellSource, /installWorkspaceMutationObserver\(\)/);
assert.match(shellSource, /subscribeWorkspaceDataChanges/);
assert.match(shellSource, /router\.refresh\(\)/);

console.log("[PASS] Cross-page reads share one active ledger and successful mutations invalidate every dependent view.");
