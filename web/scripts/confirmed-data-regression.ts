import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const main = async () => {
  const webRoot = path.resolve(process.cwd());
  const accountsSource = await readFile(path.join(webRoot, "app/accounts/page.tsx"), "utf8");
  const transactionsSource = await readFile(path.join(webRoot, "app/transactions/page.tsx"), "utf8");

  const accountsResponseStart = accountsSource.indexOf("if (accountsResponse.ok)");
  const accountsStateUpdate = accountsSource.indexOf("setAccounts((current)", accountsResponseStart);
  const authoritativeCacheWrite = accountsSource.indexOf(
    "persistAccountsWorkspaceCache(workspaceId",
    accountsResponseStart
  );

  assert.ok(accountsResponseStart >= 0, "Accounts must handle a successful authoritative response.");
  assert.ok(authoritativeCacheWrite > accountsResponseStart, "Accounts must publish the authoritative response to cache.");
  assert.ok(
    authoritativeCacheWrite < accountsStateUpdate,
    "Accounts must update cache before state so a stale cache event cannot overwrite the server response."
  );

  const manualSaveStart = transactionsSource.indexOf("const saveManualTransaction");
  const manualSaveEnd = transactionsSource.indexOf("const updateTransaction", manualSaveStart);
  const manualSaveSource = transactionsSource.slice(manualSaveStart, manualSaveEnd);

  assert.ok(manualSaveStart >= 0 && manualSaveEnd > manualSaveStart, "Manual transaction save flow must be present.");
  assert.doesNotMatch(
    manualSaveSource,
    /fetchCategorySuggestion|guessCategoryName/,
    "A confirmed manual transaction must not be silently recategorized after save."
  );

  console.log("Confirmed financial data regression checks passed.");
};

void main();
