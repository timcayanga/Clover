import assert from "node:assert/strict";
import {
  hasActiveServerImport,
  hasVisibleImportData,
  isPasswordUnlockedPdfBatchItem,
} from "@/lib/import-visibility-rules";
import type { UploadInsightsSummary } from "@/components/upload-insights-toast";

const gcryptoOptimisticSummary: UploadInsightsSummary = {
  fileName: "IMG_1427.PNG",
  rowsImported: 4,
  accountId: "optimistic-gcrypto",
  accountName: "GCrypto",
  institution: "GCrypto",
  accountNumber: null,
  accountType: "investment",
  balance: null,
  optimistic: true,
  optimisticAccountId: "optimistic-gcrypto",
  previewTransactions: [
    {
      id: "preview-1",
      importFileId: "import-1",
      accountId: "optimistic-gcrypto",
      accountName: "GCrypto",
      categoryId: null,
      categoryName: "Investments",
      reviewStatus: "pending_review",
      date: "2023-11-20",
      amount: "33791.22",
      currency: "PHP",
      type: "income",
      merchantRaw: "Withdraw - Trading Wallet",
      merchantClean: "Withdraw - Trading Wallet",
      description: "Withdraw - Trading Wallet",
      isTransfer: true,
      isExcluded: false,
      source: "upload",
    },
  ],
  incomeTotal: 33791.22,
  expenseTotal: 0,
  netTotal: 33791.22,
  topCategoryName: "Transfers",
  topCategoryAmount: 33791.22,
  topCategoryShare: 1,
  topMerchantName: "Withdraw - Trading Wallet",
  topMerchantCount: 1,
};

assert.equal(
  hasVisibleImportData(
    {
      id: "queue-1",
      file: { name: "IMG_1427.PNG", type: "image/png" },
      importMode: "statement",
      status: "importing",
      targetAccountId: "optimistic-gcrypto",
      importedRows: 0,
      confirmationState: "staged",
      progress: 99,
      importFileId: "import-1",
    },
    gcryptoOptimisticSummary
  ),
  false,
  "Optimistic screenshot previews should not dismiss the import UI before server-backed visibility exists."
);

assert.equal(
  hasActiveServerImport([
    {
      id: "queue-active",
      file: { name: "statement.pdf", type: "application/pdf" },
      importMode: "statement",
      status: "importing",
      targetAccountId: null,
      importedRows: null,
      confirmationState: "pending",
      progress: 80,
      importFileId: "import-active",
    },
  ]),
  true,
  "An import handed to the server must keep polling after the initial visibility deadline."
);

assert.equal(
  hasActiveServerImport([
    {
      id: "queue-local",
      file: { name: "statement.pdf", type: "application/pdf" },
      importMode: "statement",
      status: "pending",
      targetAccountId: null,
      importedRows: null,
      confirmationState: "none",
      progress: 20,
      importFileId: "import-local",
    },
  ]),
  false,
  "A local pre-scan must not masquerade as an active server import."
);

assert.equal(
  isPasswordUnlockedPdfBatchItem({
    file: { name: "HSBC-statement.pdf", type: "application/pdf" },
    importMode: "statement",
    password: "verified-password",
  }),
  true,
  "A password-validated statement PDF should be eligible for bounded batch concurrency."
);

assert.equal(
  isPasswordUnlockedPdfBatchItem({
    file: { name: "HSBC-statement.pdf", type: "application/pdf" },
    importMode: "statement",
    password: "",
  }),
  false,
  "A locked PDF must not enter the parallel processing path."
);

assert.equal(
  hasVisibleImportData(
    {
      id: "queue-2",
      file: { name: "IMG_1427.PNG", type: "image/png" },
      importMode: "statement",
      status: "done",
      targetAccountId: "acc-gcrypto",
      importedRows: 4,
      confirmationState: "confirmed",
      progress: 100,
      importFileId: "import-1",
    },
    {
      ...gcryptoOptimisticSummary,
      accountId: "acc-gcrypto",
      optimistic: false,
      optimisticAccountId: null,
    }
  ),
  true,
  "Confirmed screenshot imports should count as visible once the settled account and rows are present."
);

assert.equal(
  hasVisibleImportData(
    {
      id: "queue-3",
      file: { name: "account-detail-screen.png", type: "image/png" },
      importMode: "account_detail",
      status: "done",
      targetAccountId: "acc-unionbank",
      importedRows: 0,
      confirmationState: "confirmed",
      progress: 100,
      importFileId: "import-2",
    },
    {
      ...gcryptoOptimisticSummary,
      fileName: "account-detail-screen.png",
      rowsImported: 0,
      accountId: "acc-unionbank",
      accountName: "UnionBank Savings 8037",
      institution: "UnionBank",
      accountNumber: "8037",
      accountType: "bank",
      balance: "116465.28",
      optimistic: false,
      optimisticAccountId: null,
      previewTransactions: [],
      incomeTotal: 0,
      expenseTotal: 0,
      netTotal: 0,
      topCategoryName: null,
      topCategoryAmount: null,
      topCategoryShare: null,
      topMerchantName: null,
      topMerchantCount: null,
    }
  ),
  true,
  "Confirmed account-detail screenshots should still count as visible even without transaction rows."
);

console.log("[PASS] import visibility regression");
