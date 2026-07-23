import assert from "node:assert/strict";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const localStorage = new MemoryStorage();
const sessionStorage = new MemoryStorage();
(globalThis as typeof globalThis & { window: unknown }).window = {
  localStorage,
  sessionStorage,
  dispatchEvent: () => true,
};
(globalThis as typeof globalThis & { CustomEvent: unknown }).CustomEvent = class {
  constructor(_name: string, _options?: unknown) {}
};

void (async () => {
const { seedImportedWorkspaceCaches } = await import("@/lib/import-optimistic-summary");
const { getCachedAccountsWorkspace } = await import("@/lib/workspace-cache");

seedImportedWorkspaceCaches("pdax-workspace", {
  fileName: "IMG_1377.PNG",
  rowsImported: 0,
  accountId: "btc-account",
  accountName: "BTC",
  institution: "PDAX",
  accountNumber: null,
  accountType: "investment",
  balance: "72000.00",
  accountSummaries: [
    { accountId: "wallet-account", accountName: "Wallet", institution: "PDAX", accountNumber: null, accountType: "wallet", balance: "7969.73", rowsImported: 0 },
    { accountId: "btc-account", accountName: "BTC", institution: "PDAX", accountNumber: null, accountType: "investment", balance: "72000.00", rowsImported: 0 },
    { accountId: "xrp-account", accountName: "XRP", institution: "PDAX", accountNumber: null, accountType: "investment", balance: "8700.00", rowsImported: 0 },
    { accountId: "gold-account", accountName: "Gold", institution: "PDAX", accountNumber: null, accountType: "investment", balance: "22542.46", rowsImported: 0 },
  ],
  optimistic: false,
  optimisticAccountId: null,
  incomeTotal: 0,
  expenseTotal: 0,
  netTotal: 0,
  topCategoryName: null,
  topCategoryAmount: null,
  topCategoryShare: null,
  topMerchantName: null,
  topMerchantCount: null,
  previewTransactions: [],
});

const cachedAccounts = getCachedAccountsWorkspace("pdax-workspace")?.accounts ?? [];
assert.deepEqual(
  cachedAccounts.filter((account) => account.institution === "PDAX").map((account) => account.name).sort(),
  ["BTC", "Gold", "Wallet", "XRP"],
  "A confirmed PDAX portfolio must publish every account card before a network refresh."
);

console.log("[PASS] Multi-account import summaries seed every account card immediately.");
})();
