import assert from "node:assert/strict";

class QuotaStorage {
  private values = new Map<string, string>();

  constructor(private readonly quota: number) {}

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    if (value.length > this.quota) {
      throw new DOMException("Storage quota exceeded", "QuotaExceededError");
    }
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const localStorage = new QuotaStorage(18_000);
const sessionStorage = new QuotaStorage(18_000);
let cacheEvents = 0;

(globalThis as typeof globalThis & { window: unknown }).window = {
  localStorage,
  sessionStorage,
  dispatchEvent: () => {
    cacheEvents += 1;
    return true;
  },
};
(globalThis as typeof globalThis & { CustomEvent: unknown }).CustomEvent = class {
  constructor(_name: string, _options?: unknown) {}
};

void (async () => {
  const {
    accountsWorkspaceCacheKey,
    getCachedTransactionsWorkspace,
    persistTransactionsWorkspaceCache,
    getCachedAccountsWorkspace,
    syncImportedWorkspaceAccountCaches,
    syncImportedWorkspaceTransactionCaches,
  } = await import("@/lib/workspace-cache");
  const { BETA_FULL_ACCESS_ENABLED, hasFullFeatureAccess } = await import("@/lib/beta-access");
  const { getPlanDefaultLimits } = await import("@/lib/user-limits");

  const transactions = Array.from({ length: 1_200 }, (_, index) => ({
    id: `large-transaction-${index}`,
    accountId: "large-account",
    importFileId: "large-import",
    source: "upload",
    merchantRaw: `Large statement transaction ${index} ${"x".repeat(180)}`,
    date: "2026-08-01",
    amount: String(index + 1),
  }));

  assert.doesNotThrow(() => syncImportedWorkspaceTransactionCaches("large-workspace", transactions));
  assert.doesNotThrow(() =>
    syncImportedWorkspaceAccountCaches("large-workspace", {
      id: "large-account",
      workspaceId: "large-workspace",
      name: "Large statement account",
      institution: "Test Bank",
      currency: "PHP",
      type: "bank",
      balance: "125000.00",
    })
  );

  const cachedAccount = getCachedAccountsWorkspace("large-workspace")?.accounts.find(
    (account) => account.id === "large-account"
  );
  assert.ok(cachedAccount, "The imported account card must remain available after a quota-constrained cache write.");
  assert.ok(cacheEvents >= 2, "Quota pressure must not suppress workspace refresh events.");
  assert.ok(
    (localStorage.getItem(accountsWorkspaceCacheKey) ?? sessionStorage.getItem(accountsWorkspaceCacheKey))?.length,
    "A bounded account snapshot should remain persisted when the full transaction history exceeds quota."
  );

  const receiptSummary = {totalCount: 1, income: 0, spending: 250, transfers: 0, currencyTotals: {PHP: {income: 0, spending: 250, transfers: 0}}};
  const receiptRow = {id: "receipt-row", accountId: "cash", importFileId: "receipt-import", amount: "250", currency: "PHP", type: "expense", merchantRaw: "QA Cafe", date: "2026-09-19"};
  persistTransactionsWorkspaceCache("receipt-workspace", {accounts: [], categories: [], imports: [], transactions: [receiptRow], totalCount: 1, page: 1, pageSize: 25, summary: receiptSummary});
  syncImportedWorkspaceTransactionCaches("receipt-workspace", [receiptRow]);
  assert.deepEqual(getCachedTransactionsWorkspace("receipt-workspace")?.summary, receiptSummary, "Late receipt detail publication must not erase a persisted spending summary");
  syncImportedWorkspaceAccountCaches("receipt-workspace", {id: "cash", workspaceId: "receipt-workspace", name: "Cash", institution: "Cash", currency: "PHP", type: "cash", balance: "1000"});
  assert.deepEqual(getCachedTransactionsWorkspace("receipt-workspace")?.summary, receiptSummary, "Account publication must retain transaction summary and paging");
  assert.equal(getCachedTransactionsWorkspace("receipt-workspace")?.pageSize, 25);

  assert.equal(BETA_FULL_ACCESS_ENABLED, false, "Beta full access must remain disabled after plan enforcement is restored.");
  assert.deepEqual(getPlanDefaultLimits("free"), {
    accountLimit: 5,
    monthlyUploadLimit: null,
    transactionLimit: null,
  });
  assert.equal(hasFullFeatureAccess("free"), false);
  assert.equal(hasFullFeatureAccess("pro"), true);

  console.log("[PASS] Large imports survive browser quota pressure and Free/Pro plan gates are restored.");
})();
