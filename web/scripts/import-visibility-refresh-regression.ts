import assert from "node:assert/strict";
import {
  importActivityHasCompletedRows,
  importActivityIsComplete,
  type ImportActivitySnapshot,
} from "@/lib/import-activity";
import { requiresAccountVisibilityRetry } from "@/lib/import-visibility-refresh";

assert.equal(requiresAccountVisibilityRetry("investment", 0), true);
assert.equal(requiresAccountVisibilityRetry("wallet", 0), true);
assert.equal(requiresAccountVisibilityRetry("bank", 0), true);
assert.equal(requiresAccountVisibilityRetry("investment", 1), false);
assert.equal(requiresAccountVisibilityRetry("cash", 0), false);

const accountInventoryActivity: ImportActivitySnapshot = {
  workspaceId: "workspace-1",
  surface: "modal",
  status: "done",
  importFileId: "import-1",
  fileName: "net-worth.csv",
  fileIndex: 1,
  fileTotal: 1,
  completedFiles: 1,
  progress: 100,
  detail: "All set",
  summary: {
    fileName: "net-worth.csv",
    rowsImported: 0,
    accountId: null,
    accountName: null,
    institution: null,
    balance: null,
    accountSummaries: [
      {
        accountId: "account-1",
        accountName: "BPI",
        institution: "BPI",
        accountNumber: null,
        accountType: "bank",
        currency: "PHP",
        balance: "1000",
        rowsImported: 0,
      },
    ],
    incomeTotal: 0,
    expenseTotal: 0,
    netTotal: 0,
    topCategoryName: null,
    topCategoryAmount: null,
    topCategoryShare: null,
    topMerchantName: null,
    topMerchantCount: null,
  },
  errorCode: null,
  errorMessage: null,
  errorTitle: null,
  errorNextSteps: null,
  timing: null,
  updatedAt: Date.now(),
};

assert.equal(importActivityIsComplete(accountInventoryActivity), true);
assert.equal(importActivityHasCompletedRows(accountInventoryActivity), true);
assert.equal(
  importActivityIsComplete({
    ...accountInventoryActivity,
    summary: null,
  }),
  true
);

console.log("[PASS] Account-only imports wait for persisted account visibility before success.");
