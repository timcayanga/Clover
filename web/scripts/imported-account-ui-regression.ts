import { strict as assert } from "node:assert";
import type { UploadInsightsSummary } from "@/components/upload-insights-toast";
import {
  mergeFetchedTransactionsPreservingImported,
  mergeAccountsWithOptimisticImports,
  mergeOptimisticImportedAccount,
  isTransientUploadedAccountPlaceholder,
  uploadSummaryCanDismissImportUi,
  uploadSummaryMatchesImportedAccount,
  type ImportedAccountLike,
} from "@/lib/imported-account-ui";
import { combineUploadInsightsSummaries, getUploadSummaryCurrencies } from "@/lib/import-upload-summary";
import {
  findBestImportedAccountMatch,
  matchesImportedAccountIdentity,
  pruneImportedAccountPlaceholders,
} from "@/lib/workspace-cache";

type TestAccount = ImportedAccountLike & {
  updatedAt?: string;
  createdAt?: string;
};

type TestTransaction = {
  id: string;
  accountId: string;
  accountName: string;
  institution: string | null;
  accountNumber: string | null;
  currency: string;
  type: "income" | "expense" | "transfer";
  date: string;
  amount: string;
  merchantRaw: string;
  merchantClean: string | null;
  description: string | null;
  source: string;
  importFileId?: string | null;
  rawPayload?: Record<string, unknown> | null;
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

  assert.deepEqual(
    getUploadSummaryCurrencies({
      ...summary,
      currency: null,
      accountSummaries: [
        {
          accountId: "hsbc-account",
          accountName: "HSBC",
          institution: "HSBC",
          accountNumber: "12345678",
          accountType: "bank",
          currency: "gbp",
          balance: "1250.75",
          rowsImported: 1,
        },
      ],
    }),
    ["GBP"],
    "Accounts should expose a newly imported currency from the completion summary before the server refresh settles."
  );
  assert.deepEqual(
    getUploadSummaryCurrencies({
      ...summary,
      currency: null,
      accountSummaries: undefined,
      previewTransactions: summary.previewTransactions?.map((transaction) => ({
        ...transaction,
        currency: "gbp",
      })),
    }),
    ["GBP"],
    "Preview rows should provide the imported currency when account metadata has not settled yet."
  );

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

  assert.equal(
    isTransientUploadedAccountPlaceholder({
      ...genericPlaceholder,
      publishedImportInventory: true,
    }),
    false,
    "Published account-inventory rows must survive client placeholder cleanup even with no transactions or balance."
  );
  assert.deepEqual(
    mergeAccountsWithOptimisticImports([], [genericPlaceholder], {
      preserveCurrentInventory: true,
    }).map((account) => account.id),
    [genericPlaceholder.id],
    "A temporarily incomplete post-import read must preserve the visible account inventory until the server publication settles."
  );
  assert.deepEqual(
    mergeAccountsWithOptimisticImports([], [genericPlaceholder]).map((account) => account.id),
    [],
    "Transient placeholders must still be removed outside the post-import settlement window."
  );
  assert.deepEqual(
    mergeAccountsWithOptimisticImports(
      [
        {
          ...numberedUploadAccount,
          balance: "100.00",
        },
      ],
      [
        {
          ...numberedUploadAccount,
          balance: "250.00",
        },
      ],
      {
        preserveCurrentInventory: true,
        preferCurrentImportedSnapshot: true,
      }
    ).map((account) => ({ id: account.id, currency: account.currency, balance: account.balance })),
    [{ id: numberedUploadAccount.id, currency: "PHP", balance: "250.00" }],
    "A lagging completion read must not replace the confirmed import balance while Accounts is settling."
  );
  assert.deepEqual(
    mergeAccountsWithOptimisticImports(
      [{ ...numberedUploadAccount, balance: "300.00" }],
      [{ ...numberedUploadAccount, balance: "250.00" }],
      { preserveCurrentInventory: true }
    ).map((account) => ({ id: account.id, balance: account.balance })),
    [{ id: numberedUploadAccount.id, balance: "300.00" }],
    "A force-fresh completion read must replace the optimistic balance with the authoritative server balance."
  );
  const phpAccount: TestAccount = {
    ...numberedUploadAccount,
    id: "php-account",
    name: "BPI 3012",
    institution: "BPI",
    accountNumber: "3012",
    currency: "PHP",
  };
  const gbpAccount: TestAccount = {
    ...numberedUploadAccount,
    id: "gbp-account",
    name: "HSBC 5678",
    institution: "HSBC",
    accountNumber: "5678",
    currency: "GBP",
    balance: "840.25",
  };
  assert.deepEqual(
    mergeAccountsWithOptimisticImports([phpAccount], [phpAccount, gbpAccount], {
      preserveCurrentInventory: true,
      preferCurrentImportedSnapshot: true,
    }).map((account) => account.id),
    [gbpAccount.id, phpAccount.id],
    "A PHP-only completion response must not temporarily remove the newly confirmed GBP account."
  );
  assert.deepEqual(
    pruneImportedAccountPlaceholders([
      {
        ...genericPlaceholder,
        id: "persisted-account",
        name: "QA Audit Bank",
        institution: "QA Bank",
        transactionCount: 0,
        balance: null,
      },
    ]).map((account) => account.id),
    ["persisted-account"],
    "A server-persisted account must remain cached after its final transaction is deleted."
  );

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

  const settledScreenshotSummary: UploadInsightsSummary = {
    ...summary,
    optimistic: false,
    optimisticAccountId: numberedUploadAccount.id,
    previewTransactions: [],
    accountSummaries: [
      {
        accountId: numberedUploadAccount.id,
        accountName: numberedUploadAccount.name,
        institution: numberedUploadAccount.institution,
        accountNumber: numberedUploadAccount.accountNumber ?? null,
        accountType: numberedUploadAccount.type,
        balance: numberedUploadAccount.balance ?? null,
        rowsImported: 0,
      },
    ],
  };

  assert.equal(
    uploadSummaryCanDismissImportUi(
      settledScreenshotSummary,
      [numberedUploadAccount],
      "bank",
      true
    ),
    true,
    "Screenshot imports with visible account summaries should dismiss the foreground import UI even before rows are confirmed."
  );

  const combinedMultiAccountSummary = combineUploadInsightsSummaries([
    {
      ...settledScreenshotSummary,
      fileName: "unionbank-1.png",
      accountName: "UnionBank Savings 8037",
      accountNumber: "8037",
      balance: "116465.28",
      accountSummaries: [
        {
          accountId: "acc-savings",
          accountName: "UnionBank Savings 8037",
          institution: "UnionBank",
          accountNumber: "8037",
          accountType: "bank",
          balance: "116465.28",
          rowsImported: 12,
        },
      ],
    },
    {
      ...settledScreenshotSummary,
      fileName: "unionbank-2.png",
      accountName: "UnionBank Wallet 8037",
      accountNumber: "8037",
      balance: "116465.28",
      accountType: "ewallet",
      accountSummaries: [
        {
          accountId: "acc-wallet",
          accountName: "UnionBank Wallet 8037",
          institution: "UnionBank",
          accountNumber: "8037",
          accountType: "ewallet",
          balance: "116465.28",
          rowsImported: 8,
        },
      ],
    },
  ]);

  assert.equal(
    combinedMultiAccountSummary?.accountName ?? null,
    null,
    "Combined summaries should not inherit a single account name when multiple accounts from the same institution are present."
  );
  assert.equal(
    combinedMultiAccountSummary?.balance ?? null,
    null,
    "Combined summaries should not advertise a single account balance when multiple account identities were imported together."
  );

  assert.equal(
    matchesImportedAccountIdentity(
      {
        name: "BPI",
        institution: "BPI",
        accountNumber: null,
        type: "credit_card",
        currency: "PHP",
        source: "upload",
      },
      {
        name: "BPI Platinum Rewards",
        institution: "Bank of the Philippine Islands",
        accountNumber: "4000123412349012",
        type: "credit_card",
        currency: "PHP",
        source: "upload",
      }
    ),
    true,
    "Generic uploaded card placeholders should reconcile to the same explicit card when institution and card family match."
  );

  assert.equal(
    matchesImportedAccountIdentity(
      {
        name: "GSave #UNOboost 1330",
        institution: "GSave",
        accountNumber: "1330",
        type: "investment",
        currency: "PHP",
      },
      {
        name: "GSave #UNOboost 1330",
        institution: "GSave",
        accountNumber: "40001000551330",
        type: "investment",
        currency: "PHP",
      }
    ),
    true,
    "Masked GSave #UNOboost identities should reconcile against the full UNO time-deposit account number."
  );

  assert.equal(
    matchesImportedAccountIdentity(
      {
        name: "GSave #UNOboost 1330",
        institution: "GSave",
        accountNumber: "1330",
        type: "investment",
        currency: "PHP",
      },
      {
        name: "GSave #UNOboost 2023",
        institution: "GSave",
        accountNumber: "40007384712023",
        type: "investment",
        currency: "PHP",
      }
    ),
    false,
    "Different GSave #UNOboost deposits should remain distinct even when they share the same institution and product family."
  );

  assert.equal(
    matchesImportedAccountIdentity(
      {
        name: "GSave #UNOready 4132",
        institution: "GSave",
        accountNumber: "4132",
        type: "bank",
        currency: "PHP",
      },
      {
        name: "GSave #UNOboost 1330",
        institution: "GSave",
        accountNumber: "40001000551330",
        type: "investment",
        currency: "PHP",
      }
    ),
    false,
    "GSave savings and GSave time-deposit identities must not collapse into a single imported account."
  );

  const bestGsaveMatch = findBestImportedAccountMatch(
    [
      {
        name: "GSave #UNOboost 2023",
        institution: "GSave",
        accountNumber: "40007384712023",
        type: "investment",
        currency: "PHP",
      },
      {
        name: "GSave #UNOboost 1330",
        institution: "GSave",
        accountNumber: "40001000551330",
        type: "investment",
        currency: "PHP",
      },
      {
        name: "GSave #UNOboost 4217",
        institution: "GSave",
        accountNumber: "40007366884217",
        type: "investment",
        currency: "PHP",
      },
    ],
    {
      name: "GSave #UNOboost 1330",
      institution: "GSave",
      accountNumber: "1330",
      type: "investment",
      currency: "PHP",
    }
  );

  assert.equal(
    bestGsaveMatch?.accountNumber ?? null,
    "40001000551330",
    "Best-match resolution should attach the masked GSave #UNOboost upload account to the correct full-number UNO time deposit."
  );

  assert.equal(
    matchesImportedAccountIdentity(
      {
        name: "BPI Platinum Rewards 9012",
        institution: "BPI",
        accountNumber: "1234-5678-9012",
        type: "credit_card",
        currency: "PHP",
      },
      {
        name: "BPI 9012",
        institution: "Bank of the Philippine Islands",
        accountNumber: "9012",
        type: "bank",
        currency: "PHP",
      }
    ),
    true,
    "Untrained same-card uploads should reconcile full, formatted card numbers against suffix-only statement identities."
  );

  assert.equal(
    matchesImportedAccountIdentity(
      {
        name: "BPI Platinum Rewards 9012",
        institution: "BPI",
        accountNumber: "1234-5678-9012",
        type: "credit_card",
        currency: "PHP",
      },
      {
        name: "BPI 3488",
        institution: "Bank of the Philippine Islands",
        accountNumber: "3488",
        type: "bank",
        currency: "PHP",
      }
    ),
    false,
    "Untrained card matching must not collapse different visible card suffixes from the same institution."
  );

  const optimisticImportedTransactions: TestTransaction[] = [
    {
      id: "optimistic-1",
      importFileId: "unionbank-screenshots",
      rawPayload: { sourceImportFileId: "unionbank-screenshots", sourceRowIndex: 1 },
      accountId: "optimistic-acc-1",
      accountName: "UnionBank Savings 8037",
      institution: "UnionBank",
      accountNumber: "8037",
      currency: "PHP",
      type: "income",
      date: "2026-04-13",
      amount: "92627.65",
      merchantRaw: "ONLINE PAYROLL",
      merchantClean: "Online Payroll",
      description: "ONLINE PAYROLL",
      source: "upload",
    },
    {
      id: "optimistic-2",
      importFileId: "unionbank-screenshots",
      rawPayload: { sourceImportFileId: "unionbank-screenshots", sourceRowIndex: 2 },
      accountId: "optimistic-acc-1",
      accountName: "UnionBank Savings 8037",
      institution: "UnionBank",
      accountNumber: "8037",
      currency: "PHP",
      type: "expense",
      date: "2026-04-08",
      amount: "6286.77",
      merchantRaw: "BILLS PAYMENT BANKARD VISA",
      merchantClean: "Bills Payment",
      description: "BILLS PAYMENT BANKARD VISA",
      source: "upload",
    },
  ];
  const partiallySettledServerTransactions: TestTransaction[] = [
    {
      id: "persisted-1",
      importFileId: "unionbank-screenshots",
      rawPayload: { sourceImportFileId: "unionbank-screenshots", sourceRowIndex: 1 },
      accountId: "acc-1",
      accountName: "UnionBank Savings 8037",
      institution: "UnionBank",
      accountNumber: "8037",
      currency: "PHP",
      type: "income",
      date: "2026-04-13T00:00:00.000Z",
      amount: "92627.65",
      merchantRaw: "ONLINE PAYROLL",
      merchantClean: "Online Payroll",
      description: "ONLINE PAYROLL",
      source: "upload",
    },
  ];

  const mergedPartiallySettledTransactions = mergeFetchedTransactionsPreservingImported(
    partiallySettledServerTransactions,
    optimisticImportedTransactions,
    {
      exactServerTotalCount: 2,
    }
  );

  assert.deepEqual(
    mergedPartiallySettledTransactions.map((transaction) => transaction.amount),
    ["92627.65", "6286.77"],
    "A partial same-import server refresh should retain unmatched optimistic rows until the full import settles."
  );

  console.log("[PASS] imported-account-ui regression");
};

main();
