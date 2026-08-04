import assert from "node:assert/strict";
import {
  deriveReconciledBalance,
  normalizeAccountBalanceSign,
} from "@/lib/account-balance";
import {
  applyOptimisticWorkspaceTransactionDeletion,
  applyOptimisticWorkspaceTransactionUpsert,
  clearWorkspaceCache,
  getCachedAccountsWorkspace,
  persistAccountsWorkspaceCache,
} from "@/lib/workspace-cache";

const expenseBalance = Number(
  deriveReconciledBalance({
    balance: 0,
    transactions: [
      {
        amount: 123.45,
        type: "expense",
      },
    ],
  })
);

const manualOpeningBalance = Number(
  deriveReconciledBalance({
    balance: 10_000,
    treatStoredBalanceAsOpening: true,
    transactions: [
      {
        amount: 5_000,
        type: "income",
      },
      {
        amount: 1_300,
        type: "expense",
      },
    ],
  })
);

const importedCurrentBalance = Number(
  deriveReconciledBalance({
    balance: 10_000,
    transactions: [
      {
        amount: 5_000,
        type: "income",
      },
      {
        amount: 1_300,
        type: "expense",
      },
    ],
  })
);

assert.equal(expenseBalance, -123.45);
assert.equal(manualOpeningBalance, 13_700);
assert.equal(importedCurrentBalance, 3_700);
assert.equal(normalizeAccountBalanceSign("cash", expenseBalance), 0);
assert.equal(normalizeAccountBalanceSign("bank", -500), -500);
assert.equal(normalizeAccountBalanceSign("credit_card", 500), -500);

const workspaceId = "balance-adjustment-regression";
persistAccountsWorkspaceCache(workspaceId, {
  accounts: [{ id: "cash-usd", workspaceId, balance: "100.00", source: "manual", type: "cash", currency: "USD" }],
  accountRules: [],
  transactions: [],
  statementCheckpoints: [],
});
applyOptimisticWorkspaceTransactionUpsert(workspaceId, {
  id: "optimistic-adjustment",
  workspaceId,
  accountId: "cash-usd",
  amount: "25.00",
  type: "income",
  isExcluded: false,
});

let cachedSnapshot = getCachedAccountsWorkspace(workspaceId);
assert.equal(cachedSnapshot?.transactions.length, 1, "An optimistic cash adjustment should be cached immediately.");
assert.equal(
  deriveReconciledBalance({
    balance: cachedSnapshot?.accounts[0]?.balance as string,
    transactions: cachedSnapshot?.transactions as Array<{ amount: string; type: string; isExcluded?: boolean }>,
    treatStoredBalanceAsOpening: true,
  }),
  "125.00",
  "The Accounts cache should reflect an added cash adjustment without waiting for a refresh."
);

applyOptimisticWorkspaceTransactionUpsert(
  workspaceId,
  {
    id: "saved-adjustment",
    workspaceId,
    accountId: "cash-usd",
    amount: "25.00",
    type: "income",
    isExcluded: false,
  },
  { replaceTransactionId: "optimistic-adjustment" }
);
cachedSnapshot = getCachedAccountsWorkspace(workspaceId);
assert.deepEqual(cachedSnapshot?.transactions.map((transaction) => transaction.id), ["saved-adjustment"]);

applyOptimisticWorkspaceTransactionDeletion(workspaceId, "saved-adjustment");
assert.equal(getCachedAccountsWorkspace(workspaceId)?.transactions.length, 0, "A failed adjustment should roll back cleanly.");
clearWorkspaceCache(workspaceId);

console.log("Account balance sign regression passed, including instant cash adjustments.");
