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
