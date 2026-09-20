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
    mergeImportedWorkspaceTransactions,
    accountsWorkspaceCacheKey,
    getCachedTransactionsWorkspace,
    persistTransactionsWorkspaceCache,
    getCachedAccountsWorkspace,
    syncImportedWorkspaceAccountCaches,
    syncImportedWorkspaceTransactionCaches,
  } = await import("@/lib/workspace-cache");
  const { BETA_FULL_ACCESS_ENABLED, hasFullFeatureAccess } = await import("@/lib/beta-access");
  const { getPlanDefaultLimits } = await import("@/lib/user-limits");

  const preview = { id: "optimistic-file-0", importFileId: "file", sourceRowIndex: 1,
    date: "2026-09-01", amount: "25", merchantRaw: "QA Cafe", type: "expense", currency: "PHP" };
  const saved = { ...preview, id: "saved-1", rawPayload: {
    sourceImportFileId: "file", sourceRowIndex: 1, kind: "generic_mobile_screenshot_transaction",
    source: "generic_mobile_screenshot" }, warningReason: "Import needs review" };
  const merged = mergeImportedWorkspaceTransactions([preview], [saved]);
  assert.equal(merged.length, 1, "Saved screenshot replaces its optimistic row despite metadata differences");
  assert.equal(merged[0].id, "saved-1");
  assert.equal(mergeImportedWorkspaceTransactions(merged, [preview])[0].id, "saved-1", "Late preview cannot replace a saved row");
  const repeated = { ...saved, id: "saved-2", sourceRowIndex: 2, rawPayload: { ...saved.rawPayload, sourceRowIndex: 2 } };
  assert.equal(mergeImportedWorkspaceTransactions([saved], [repeated]).length, 2, "Identical purchases on different source rows remain distinct");

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

  persistTransactionsWorkspaceCache("empty-before-import", {accounts: [], categories: [], imports: [], transactions: [], totalCount: 0, summary: {...receiptSummary, totalCount: 0}});
  syncImportedWorkspaceTransactionCaches("empty-before-import", [receiptRow]);
  assert.equal(getCachedTransactionsWorkspace("empty-before-import")?.totalCount, 1, "Imported rows cannot retain an empty list count");
  assert.equal(getCachedTransactionsWorkspace("empty-before-import")?.summary?.totalCount, 1, "Summary count includes the imported row immediately");
  syncImportedWorkspaceAccountCaches("manual-cash", {id: "cash", name: "Cash", type: "cash", currency: "PHP", source: "manual", balance: "1000"});
  syncImportedWorkspaceAccountCaches("manual-cash", {id: "cash", name: "Cash", type: "cash", currency: "PHP", source: "upload", balance: "750"});
  const preservedCash = getCachedAccountsWorkspace("manual-cash")?.accounts.find(a => a.id === "cash");
  assert.equal(preservedCash?.source, "manual", "Receipt preview cannot change an existing manual account source");
  assert.equal(preservedCash?.balance, "1000", "Manual opening balance must not become a reconciled receipt preview");

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
