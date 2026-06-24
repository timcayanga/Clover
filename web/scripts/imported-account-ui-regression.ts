import { strict as assert } from "node:assert";
import type { UploadInsightsSummary } from "@/components/upload-insights-toast";
import {
  mergeOptimisticImportedAccount,
  uploadSummaryMatchesImportedAccount,
  type ImportedAccountLike,
} from "@/lib/imported-account-ui";

type TestAccount = ImportedAccountLike & {
  updatedAt?: string;
  createdAt?: string;
};

const main = () => {
  const numberedUploadAccount: TestAccount = {
    id: "acc-1",
    name: "UnionBank Savings 1234",
    institution: "Union Bank of the Philippines",
    accountNumber: "1234",
    type: "bank",
    currency: "PHP",
    source: "upload",
    balance: "1250.75",
    updatedAt: "2026-06-24T10:00:00.000Z",
    createdAt: "2026-06-01T10:00:00.000Z",
  };

  const summary: UploadInsightsSummary = {
    fileName: "unionbank-summary.pdf",
    rowsImported: 1,
    accountId: null,
    optimisticAccountId: "optimistic-acc-1",
    accountName: "UnionBank Savings 1234",
    institution: "UnionBank",
    accountNumber: "1234",
    accountType: "bank",
    balance: "1250.75",
    previewTransactions: [
      {
        id: "preview-1",
        importFileId: "import-1",
        accountId: "optimistic-acc-1",
        accountName: "UnionBank Savings 1234",
        categoryId: null,
        categoryName: null,
        reviewStatus: "pending_review",
        date: "2026-06-24",
        amount: "1250.75",
        currency: "PHP",
        type: "income",
        merchantRaw: "UnionBank opening balance",
        merchantClean: null,
        description: null,
        isTransfer: false,
        isExcluded: false,
        source: "upload",
      },
    ],
    optimistic: true,
    incomeTotal: 1250.75,
    expenseTotal: 0,
    netTotal: 1250.75,
    topCategoryName: null,
    topCategoryAmount: null,
    topCategoryShare: null,
    topMerchantName: null,
    topMerchantCount: null,
  };

  assert.equal(
    uploadSummaryMatchesImportedAccount(summary, numberedUploadAccount),
    true,
    "Upload summaries should keep matching numbered imported accounts across institution label variants."
  );

  const genericPlaceholder: TestAccount = {
    id: "optimistic-generic",
    name: "UnionBank",
    institution: "UnionBank",
    accountNumber: null,
    type: "bank",
    currency: "PHP",
    source: "upload",
    balance: "0",
  };

  const mergedWithoutPlaceholder = mergeOptimisticImportedAccount([genericPlaceholder], numberedUploadAccount);
  assert.equal(
    mergedWithoutPlaceholder.some((account) => account.id === genericPlaceholder.id),
    false,
    "Numbered optimistic imports should replace generic placeholder upload accounts."
  );

  const matchedServerAccount: TestAccount = {
    ...numberedUploadAccount,
    id: "server-1",
    balance: "0",
    updatedAt: "2026-06-10T10:00:00.000Z",
    createdAt: "2026-05-20T10:00:00.000Z",
  };

  const mergedAccountResult = mergeOptimisticImportedAccount([matchedServerAccount], numberedUploadAccount, {
    mergeMatchedAccount: (matchedAccount, optimisticAccount, shouldPreserveExistingBalance) => ({
      ...matchedAccount,
      ...optimisticAccount,
      balance: shouldPreserveExistingBalance ? matchedAccount.balance : optimisticAccount.balance ?? matchedAccount.balance,
      updatedAt: optimisticAccount.updatedAt ?? matchedAccount.updatedAt,
      createdAt: matchedAccount.createdAt ?? optimisticAccount.createdAt,
    }),
  });

  assert.equal(mergedAccountResult.length, 1, "Merging a matching optimistic import should keep one account record.");
  assert.equal(mergedAccountResult[0]?.id, numberedUploadAccount.id, "The optimistic account id should be preserved in the merged record.");
  assert.equal(mergedAccountResult[0]?.balance, numberedUploadAccount.balance, "The non-zero optimistic balance should win when the matched record is empty.");
  assert.equal(
    mergedAccountResult[0]?.createdAt,
    matchedServerAccount.createdAt,
    "Custom merge hooks should preserve existing lifecycle metadata."
  );

  console.log("[PASS] imported-account-ui regression");
};

main();
