import assert from "node:assert/strict";

class QuotaStorage implements Storage {
  private readonly values = new Map<string, string>();

  constructor(private readonly maxValueLength: number) {}

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    if (value.length > this.maxValueLength) {
      throw new DOMException("Storage quota exceeded", "QuotaExceededError");
    }

    this.values.set(key, value);
  }
}

const localStorage = new QuotaStorage(35_000);
const sessionStorage = new QuotaStorage(35_000);
const dispatchedEvents: Event[] = [];

Object.assign(globalThis, {
  window: {
    localStorage,
    sessionStorage,
    dispatchEvent: (event: Event) => {
      dispatchedEvents.push(event);
      return true;
    },
  },
  CustomEvent:
    globalThis.CustomEvent ??
    class CustomEvent<T = unknown> extends Event {
      detail: T;

      constructor(type: string, init?: CustomEventInit<T>) {
        super(type);
        this.detail = init?.detail as T;
      }
    },
});

const previewTransactions = Array.from({ length: 844 }, (_, index) => ({
  id: `transaction-${index}`,
  importFileId: "large-workbook",
  sourceRowIndex: index,
  accountId: `account-${index % 18}`,
  accountName: `Workbook account ${index % 18}`,
  categoryId: null,
  categoryName: "Food & Dining",
  reviewStatus: "pending_review" as const,
  date: "2026-07-25",
  amount: "1234.56",
  currency: "PHP",
  type: "expense" as const,
  merchantRaw: `Large workbook merchant ${index} ${"x".repeat(200)}`,
  merchantClean: `Merchant ${index}`,
  description: `Imported workbook row ${index} ${"y".repeat(200)}`,
  isTransfer: false,
  isExcluded: false,
  source: "upload" as const,
}));

const main = async () => {
  const {
    importActivityStorageKey,
    readImportActivity,
    setImportActivity,
  } = await import("../lib/import-activity");

  assert.doesNotThrow(() => {
    setImportActivity({
    workspaceId: "workspace-1",
    surface: "modal",
    status: "done",
    importFileId: "large-workbook",
    fileName: "large-multi-sheet-workbook.xlsx",
    fileIndex: 1,
    fileTotal: 1,
    completedFiles: 1,
    progress: 100,
    detail: "Import complete",
    summary: {
      fileName: "large-multi-sheet-workbook.xlsx",
      rowsImported: previewTransactions.length,
      accountId: "account-0",
      accountName: "Workbook account 0",
      institution: "Workbook",
      balance: "1234.56",
      accountSummaries: Array.from({ length: 18 }, (_, index) => ({
        accountId: `account-${index}`,
        accountName: `Workbook account ${index}`,
        institution: "Workbook",
        accountNumber: `${index}`,
        accountType: "bank" as const,
        currency: "PHP",
        balance: "1234.56",
        rowsImported: 40,
      })),
      previewTransactions,
      incomeTotal: 0,
      expenseTotal: 1_041_968.64,
      netTotal: -1_041_968.64,
      topCategoryName: "Food & Dining",
      topCategoryAmount: 1_041_968.64,
      topCategoryShare: 1,
      topMerchantName: "Merchant",
      topMerchantCount: 844,
    },
    errorCode: null,
    errorMessage: null,
    });
  });

  const liveSnapshot = readImportActivity();
  assert.equal(liveSnapshot?.summary?.previewTransactions?.length, 844);

  const persistedRaw = localStorage.getItem(importActivityStorageKey);
  assert.ok(persistedRaw);
  const persistedSnapshot = JSON.parse(persistedRaw);
  assert.ok(
    !persistedSnapshot.summary.previewTransactions ||
      persistedSnapshot.summary.previewTransactions.length <= 25
  );
  assert.ok(persistedRaw.length <= 35_000);
  assert.ok(dispatchedEvents.length > 0);

  console.log("Import activity storage quota regression passed.");
};

void main();
