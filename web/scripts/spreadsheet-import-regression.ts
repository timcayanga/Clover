import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseImportText } from "../lib/import-parser";
import { validateImportFile, validateImportFileBytes } from "../lib/import-file-validation";
import { buildImportedWorkspaceAccount } from "../lib/import-optimistic-summary";
import { buildOptimisticPreviewTransactions } from "../lib/import-preview-transactions";
import { decodeSpreadsheetWorkbookBytes } from "../lib/spreadsheet-import.server";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const main = async () => {
  const accountRows = [
    ["Account Name", "Institution", "Account Type", "Currency", "Balance", "Snapshot Date"],
    ["BPI Savings", "BPI", "Savings", "PHP", 45_403.94, new Date("2026-03-24T00:00:00.000Z")],
    ["GCash", "GCash", "Wallet", "PHP", 37_176.15, new Date("2026-03-24T00:00:00.000Z")],
    ["GoTrade", "GoTrade", "Investment", "PHP", 107_853.27, new Date("2026-03-24T00:00:00.000Z")],
  ];
  const formats = [
    { extension: "xlsx", bookType: "xlsx", mime: XLSX_MIME },
    { extension: "xls", bookType: "biff8", mime: "application/vnd.ms-excel" },
    { extension: "xlsm", bookType: "xlsm", mime: "application/vnd.ms-excel.sheet.macroEnabled.12" },
    { extension: "xlsb", bookType: "xlsb", mime: "application/vnd.ms-excel.sheet.binary.macroEnabled.12" },
    { extension: "ods", bookType: "ods", mime: "application/vnd.oasis.opendocument.spreadsheet" },
  ] as const;

  for (const format of formats) {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(accountRows), "Accounts");
    const bytes = new Uint8Array(XLSX.write(workbook, { type: "buffer", bookType: format.bookType }));
    const fileName = `Net Worth Calculator.${format.extension}`;
    assert.equal(
      validateImportFile({
        fileName,
        fileSize: bytes.byteLength,
        contentType: format.mime,
        importMode: "statement",
      }),
      null,
      `${format.extension} should pass public upload validation`
    );
    assert.equal(
      validateImportFileBytes({
        fileName,
        contentType: format.mime,
        bytes,
      }),
      null,
      `a real ${format.extension} workbook should pass signature validation`
    );

    const extractedText = await decodeSpreadsheetWorkbookBytes(bytes);
    assert.match(
      extractedText,
      /BPI Savings,BPI,Savings,PHP,45403\.94,2026-03-24/,
      `${format.extension} dates should decode as calendar dates`
    );

    const parsedRows = parseImportText(extractedText, fileName, format.mime);
    assert.equal(parsedRows.length, 3, `all ${format.extension} account rows should be parsed`);
    assert.ok(
      parsedRows.every((row) => row.rawPayload?.kind === "account_snapshot_marker"),
      `${format.extension} account inventory rows must remain snapshots, not transactions`
    );
    assert.deepEqual(
      parsedRows.map((row) => row.accountName),
      ["BPI Savings", "GCash", "GoTrade"]
    );
    assert.deepEqual(
      parsedRows.map((row) => row.rawPayload?.balance),
      [45_403.94, 37_176.15, 107_853.27]
    );
    assert.deepEqual(
      buildOptimisticPreviewTransactions(parsedRows as unknown as Array<Record<string, unknown>>, {
        importFileId: `account-inventory-${format.extension}`,
        accountId: "account-1",
        accountName: "BPI Savings",
        institution: "BPI",
      }),
      [],
      `${format.extension} account snapshots must not become optimistic UI transactions`
    );
  }

  const transactionRows = [
    ["Date", "Description", "Debit", "Credit", "Account Name", "Institution", "Currency"],
    [new Date("2026-03-24T00:00:00.000Z"), "Coffee Shop", 245.5, "", "BPI Savings", "BPI", "PHP"],
    [new Date("2026-03-25T00:00:00.000Z"), "Salary", "", 50_000, "BPI Savings", "BPI", "PHP"],
  ];
  for (const format of formats) {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(transactionRows), "Transactions");
    const bytes = new Uint8Array(XLSX.write(workbook, { type: "buffer", bookType: format.bookType }));
    const parsedRows = parseImportText(
      await decodeSpreadsheetWorkbookBytes(bytes),
      `Bank Export.${format.extension}`,
      format.mime
    );
    assert.equal(parsedRows.length, 2, `${format.extension} transaction ledgers should parse each financial row`);
    assert.deepEqual(
      parsedRows.map((row) => ({ name: row.merchantClean, amount: row.amount, type: row.type })),
      [
        { name: "Coffee Shop", amount: "245.50", type: "expense" },
        { name: "Salary", amount: "50000.00", type: "income" },
      ],
      `${format.extension} debit and credit directions should remain accurate`
    );
  }

  const sideBySideLedgerRows = [
    ["Expenses", "", "", "", "Income"],
    ["Date", "Type", "Purpose", "Name", "Amount", "", "Date", "Type", "Name", "Amount"],
    [
      new Date("2026-07-20T00:00:00.000Z"),
      "Food & Dining",
      "Personal",
      "Coffee Shop",
      245.5,
      "",
      new Date("2026-07-21T00:00:00.000Z"),
      "Salary",
      "Payroll",
      50_000,
    ],
    [
      new Date("2026-07-22T00:00:00.000Z"),
      "Transport",
      "Personal",
      "Train",
      75,
      "",
      new Date("2026-07-23T00:00:00.000Z"),
      "Reimbursement",
      "Taxi refund",
      300,
    ],
  ];
  const receivableRows = [
    [
      "Date Paid",
      "Type",
      "Purpose",
      "Name",
      "Payee",
      "Amount",
      "Date Received",
      "Amount Paid",
      "Amount Pending",
      "Comment",
    ],
    [
      new Date("2026-07-01T00:00:00.000Z"),
      "Travel",
      "Friends",
      "Airline share",
      "Alex",
      10_000,
      "",
      2_500,
      7_500,
      "Awaiting balance",
    ],
    [
      new Date("2026-07-02T00:00:00.000Z"),
      "Entertainment",
      "Friends",
      "Concert ticket",
      "Sam",
      5_000,
      new Date("2026-07-10T00:00:00.000Z"),
      5_000,
      0,
      "",
    ],
  ];
  for (const format of formats) {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(accountRows), "Accounts");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sideBySideLedgerRows), "July 2026");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(receivableRows), "Accounts Receivable");
    const bytes = new Uint8Array(XLSX.write(workbook, { type: "buffer", bookType: format.bookType }));
    const extractedText = await decodeSpreadsheetWorkbookBytes(bytes);
    assert.match(extractedText, /__CLOVER_WORKSHEET__,0,Accounts/);
    assert.match(extractedText, /__CLOVER_WORKSHEET__,1,July 2026/);
    const parsedRows = parseImportText(
      extractedText,
      `Mixed Personal Finance.${format.extension}`,
      format.mime
    );
    const snapshots = parsedRows.filter((row) => row.rawPayload?.kind === "account_snapshot_marker");
    const transactions = parsedRows.filter(
      (row) => row.rawPayload?.source === "structured_transaction_csv"
    );
    const receivables = parsedRows.filter(
      (row) => row.rawPayload?.kind === "receivable_commitment_marker"
    );
    assert.equal(snapshots.length, 3, `${format.extension} should retain every account snapshot`);
    assert.equal(transactions.length, 4, `${format.extension} should parse both horizontal ledgers`);
    assert.equal(receivables.length, 2, `${format.extension} should route itemized receivables`);
    assert.deepEqual(
      transactions.map((row) => ({
        name: row.merchantClean,
        amount: row.amount,
        type: row.type,
        category: row.categoryName,
        account: row.accountName,
      })),
      [
        { name: "Coffee Shop", amount: "245.50", type: "expense", category: "Food & Dining", account: "Cash" },
        { name: "Train", amount: "75.00", type: "expense", category: "Transport", account: "Cash" },
        { name: "Payroll", amount: "50000.00", type: "income", category: "Salary", account: "Cash" },
        { name: "Taxi", amount: "300.00", type: "income", category: "Reimbursement", account: "Cash" },
      ]
    );
    assert.deepEqual(
      receivables.map((row) => ({
        title: row.rawPayload?.title,
        pending: row.rawPayload?.amountPending,
        worksheet: row.rawPayload?.worksheetName,
      })),
      [
        { title: "Airline share", pending: 7_500, worksheet: "Accounts Receivable" },
        { title: "Concert ticket", pending: 0, worksheet: "Accounts Receivable" },
      ]
    );
    assert.ok(
      parsedRows.every(
        (row) =>
          typeof row.rawPayload?.worksheetName === "string" &&
          typeof row.rawPayload?.worksheetIndex === "number"
      ),
      `${format.extension} should preserve worksheet provenance`
    );
    assert.equal(
      buildOptimisticPreviewTransactions(parsedRows as unknown as Array<Record<string, unknown>>, {
        importFileId: `mixed-${format.extension}`,
        accountId: "cash",
        accountName: "Cash",
        institution: "Cash",
      }).length,
      4,
      `${format.extension} optimistic previews must exclude account and receivable markers`
    );
  }

  assert.match(
    validateImportFileBytes({
      fileName: "fake.xlsx",
      contentType: XLSX_MIME,
      bytes: new TextEncoder().encode("not a workbook"),
    }) ?? "",
    /not a valid spreadsheet/i,
    "renamed text must not pass spreadsheet signature validation"
  );
  const inventoryWorkspaceAccount = buildImportedWorkspaceAccount({
    fileName: "Accounts.xlsx",
    rowsImported: 0,
    accountId: "account-1",
    accountName: "Spreadsheet Savings",
    institution: "Spreadsheet Bank",
    accountType: "bank",
    currency: "PHP",
    balance: "4321.09",
    accountSummaries: [
      {
        accountId: "account-1",
        accountName: "Spreadsheet Savings",
        institution: "Spreadsheet Bank",
        accountNumber: null,
        accountType: "bank",
        currency: "PHP",
        balance: "4321.09",
        rowsImported: 0,
      },
    ],
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
  });
  assert.equal(
    inventoryWorkspaceAccount?.publishedImportInventory,
    true,
    "snapshot-only account cache entries must retain their authoritative inventory flag"
  );
  console.log("XLSX, XLS, XLSM, XLSB, and ODS account-inventory regression passed.");
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
