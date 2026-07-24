import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseGenericAccountSnapshotCsv,
  parseImportText,
  parseStructuredTransactionCsv,
  parseWideAccountSnapshotCsv,
} from "@/lib/import-parser";
import { decodeStructuredDelimitedBytes } from "@/lib/structured-delimited-decoder";
import { isSupportedImportFile, validateImportFileBytes } from "@/lib/import-file-validation";

const signedCsv = [
  "\uFEFFDate,Description,Amount,Currency,Account Name,Institution,Category",
  "2026-07-20,Coffee Shop,-125.50,PHP,BPI Payroll,BPI,Food & Dining",
  "2026-07-21,Salary,+50000.00,PHP,BPI Payroll,BPI,Income",
  "Total,,49874.50,,,,",
].join("\n");
const signedRows = parseStructuredTransactionCsv(signedCsv, "transactions.csv", "text/csv");
assert.ok(signedRows);
assert.equal(signedRows.length, 2);
assert.equal(signedRows[0]?.type, "expense");
assert.equal(signedRows[0]?.amount, "125.50");
assert.equal(signedRows[0]?.categoryName, "Food & Dining");
assert.equal(signedRows[1]?.type, "income");
assert.equal(signedRows[1]?.amount, "50000.00");
assert.equal(signedRows[1]?.accountName, "BPI Payroll");
assert.equal(signedRows[1]?.institution, "BPI");
assert.equal(parseImportText(signedCsv, "transactions.csv", "text/csv").length, 2);

const semicolonCsv = [
  "sep=;",
  "Downloaded transaction report;;;;;;;",
  "Booking Date;Narrative;Debit Amount;Credit Amount;Currency;Bank;Account Name;Running Balance",
  '24/07/2026;Groceries;"1.234,56";;EUR;HSBC;HSBC Current;"8.000,00"',
  '25/07/2026;Refund;;"45,67";EUR;HSBC;HSBC Current;"8.045,67"',
].join("\n");
const semicolonRows = parseStructuredTransactionCsv(semicolonCsv, "hsbc-export.csv", "text/csv", {
  institution: "HSBC",
});
assert.ok(semicolonRows);
assert.equal(semicolonRows.length, 2);
assert.equal(semicolonRows[0]?.date, "2026-07-24");
assert.equal(semicolonRows[0]?.amount, "1234.56");
assert.equal(semicolonRows[0]?.type, "expense");
assert.equal(semicolonRows[0]?.rawPayload?.balance, 8000);
assert.equal(semicolonRows[1]?.amount, "45.67");
assert.equal(semicolonRows[1]?.type, "income");

const tabSeparated = [
  "Posted Date\tMerchant\tTransaction Amount\tDirection\tCurrency\tAccount",
  '7/22/2026\t"Market stall\nMakati"\t250.00\tDebit\tPHP\tGCash',
  "7/23/2026\tTransfer received\t700.00\tCredit\tPHP\tGCash",
].join("\n");
const tabRows = parseStructuredTransactionCsv(tabSeparated, "wallet.tsv", "text/tab-separated-values");
assert.ok(tabRows);
assert.equal(tabRows.length, 2, "Quoted multiline descriptions should remain one row.");
assert.match(tabRows[0]?.description ?? "", /Market stall Makati/);
assert.equal(tabRows[0]?.type, "expense");
assert.equal(tabRows[1]?.type, "income");
assert.equal(tabRows[0]?.rawPayload?.delimiter, "tab");

const creditCardCsv = [
  "Date,Payee,Amount,Account",
  "2026-07-01,Airline,9500.00,RCBC Credit Card",
].join("\n");
const creditCardRows = parseStructuredTransactionCsv(creditCardCsv, "card.csv", "text/csv");
assert.ok(creditCardRows);
assert.equal(creditCardRows[0]?.type, "expense", "Unsigned credit-card purchases should not become income.");
assert.equal(creditCardRows[0]?.rawPayload?.accountType, "credit_card");

const pipeDelimited = [
  "Date|Transaction|Amount|Direction|Currency|Reference No",
  "2026-07-20|Dividend|75.25|Credit|USD|00001234",
].join("\n");
const pipeRows = parseStructuredTransactionCsv(pipeDelimited, "broker-export.csv", "text/csv");
assert.ok(pipeRows);
assert.equal(pipeRows.length, 1);
assert.equal(pipeRows[0]?.type, "income");
assert.equal(pipeRows[0]?.currency, "USD");
assert.equal(pipeRows[0]?.rawPayload?.reference, "00001234");

const excelSerialCsv = [
  "Transaction Date,Details,Debit,Credit,Currency",
  "46296,Utility payment,450.00,,PHP",
].join("\n");
const excelSerialRows = parseStructuredTransactionCsv(excelSerialCsv, "excel-export.csv", "text/csv");
assert.ok(excelSerialRows);
assert.match(excelSerialRows[0]?.date ?? "", /^2026-/);

const metadataCsv = [
  "Bank,UnionBank",
  "Account Name,Payroll 3912",
  "Account Number,3912",
  "Currency,PHP",
  "Date,Description,Amount,Reference",
  "2026-07-20,Coffee,-125.00,TX-001",
].join("\n");
const metadataRows = parseStructuredTransactionCsv(metadataCsv, "preamble.csv", "text/csv");
assert.ok(metadataRows);
assert.equal(metadataRows[0]?.institution, "UnionBank");
assert.equal(metadataRows[0]?.accountName, "Payroll 3912");
assert.equal(metadataRows[0]?.accountNumber, "3912");
assert.equal(metadataRows[0]?.currency, "PHP");
assert.deepEqual(metadataRows[0]?.rawPayload?.preambleMetadata, {
  institution: "UnionBank",
  account_name: "Payroll 3912",
  account_number: "3912",
  currency: "PHP",
});

const multiSectionCsv = [
  "Bank,BPI",
  "Date (DD/MM/YYYY),Original Description,Transaction Value,Direction,Status,Fee",
  "Account Name,BPI Payroll",
  "13/07/2026,Salary,50000.00,Credit,Completed,0",
  "14/07/2026,Coffee,125.00,Debit,Pending,5.00",
  "Date (DD/MM/YYYY),Original Description,Transaction Value,Direction,Status,Fee",
  "Account Name,BPI Savings",
  "03/07/2026,Interest,25.00,Credit,Posted,0",
  "14/07/2026,Rejected transfer,1000.00,Debit,Failed,0",
].join("\n");
const multiSectionRows = parseStructuredTransactionCsv(multiSectionCsv, "multi-account.csv", "text/csv");
assert.ok(multiSectionRows);
assert.equal(multiSectionRows.length, 2, "Pending and failed rows must not become settled transactions.");
assert.equal(multiSectionRows[0]?.accountName, "BPI Payroll");
assert.equal(multiSectionRows[1]?.accountName, "BPI Savings");
assert.equal(multiSectionRows[1]?.date, "2026-07-03", "The DD/MM header must resolve ambiguous dates deterministically.");
assert.equal(multiSectionRows[0]?.rawPayload?.status, "Completed");
assert.equal(multiSectionRows[0]?.rawPayload?.sectionMetadata?.account_name, "BPI Payroll");

const inferredDayFirstCsv = [
  "Date,Remarks,Amount,Direction",
  "13/06/2026,Unambiguous date,10.00,Debit",
  "03/07/2026,Ambiguous date,20.00,Debit",
].join("\n");
const inferredDayFirstRows = parseStructuredTransactionCsv(inferredDayFirstCsv, "regional.csv", "text/csv");
assert.ok(inferredDayFirstRows);
assert.equal(inferredDayFirstRows[1]?.date, "2026-07-03");

const enrichedExportCsv = [
  "Completed Date,Activity,Settlement Amount,Flow,Booking Status,Transaction Fee,Foreign Amount,Foreign Currency",
  "2026-07-20,Hotel booking,5000.00,Debit,Settled,125.00,75.00,USD",
].join("\n");
const enrichedExportRows = parseStructuredTransactionCsv(enrichedExportCsv, "fintech-export.csv", "text/csv");
assert.ok(enrichedExportRows);
assert.equal(enrichedExportRows.length, 1);
assert.equal(enrichedExportRows[0]?.rawPayload?.fee, 125);
assert.equal(enrichedExportRows[0]?.rawPayload?.originalAmount, 75);
assert.equal(enrichedExportRows[0]?.rawPayload?.originalCurrency, "USD");

const ascendingBalanceCsv = [
  "Date,Description,Amount,Running Balance,Account",
  "2026-07-01,Opening credit,100.00,1100.00,Main",
  "2026-07-02,Groceries,25.00,1075.00,Main",
  "2026-07-03,Adjustment,50.00,1125.00,Main",
].join("\n");
const ascendingBalanceRows = parseStructuredTransactionCsv(ascendingBalanceCsv, "ascending.csv", "text/csv");
assert.ok(ascendingBalanceRows);
assert.equal(ascendingBalanceRows[1]?.type, "expense");
assert.equal(ascendingBalanceRows[1]?.rawPayload?.directionEvidence, "running_balance_delta");
assert.equal(ascendingBalanceRows[2]?.type, "income");
assert.equal(ascendingBalanceRows[2]?.rawPayload?.balanceDelta, 50);

const descendingBalanceCsv = [
  "Date,Description,Amount,Running Balance,Account",
  "2026-07-03,Adjustment,50.00,1125.00,Main",
  "2026-07-02,Groceries,25.00,1075.00,Main",
  "2026-07-01,Opening credit,100.00,1100.00,Main",
].join("\n");
const descendingBalanceRows = parseStructuredTransactionCsv(descendingBalanceCsv, "descending.csv", "text/csv");
assert.ok(descendingBalanceRows);
assert.equal(descendingBalanceRows[0]?.type, "income", "Descending exports should compare a row with the older balance below it.");
assert.equal(descendingBalanceRows[1]?.type, "expense");

const explicitDirectionCsv = [
  "Date,Description,Amount,Direction,Running Balance",
  "2026-07-01,Manual correction,25.00,Credit,975.00",
  "2026-07-02,Next row,25.00,Debit,1000.00",
].join("\n");
const explicitDirectionRows = parseStructuredTransactionCsv(explicitDirectionCsv, "explicit.csv", "text/csv");
assert.ok(explicitDirectionRows);
assert.equal(explicitDirectionRows[0]?.type, "income", "Explicit direction must override a conflicting balance delta.");
assert.equal(explicitDirectionRows[0]?.rawPayload?.directionEvidence, "explicit_type");

const duplicateReferenceCsv = [
  "Date,Description,Amount,Direction,Reference,Account",
  "2026-07-01,Coffee,100.00,Debit,ABC-123,Main",
  "2026-07-01,Coffee,100.00,Debit,ABC-123,Main",
  "2026-07-01,Coffee,100.00,Debit,,Main",
  "2026-07-01,Coffee,100.00,Debit,,Main",
].join("\n");
const duplicateReferenceRows = parseStructuredTransactionCsv(duplicateReferenceCsv, "duplicates.csv", "text/csv");
assert.ok(duplicateReferenceRows);
assert.equal(
  duplicateReferenceRows.length,
  3,
  "Only rows sharing a stable transaction reference should be suppressed; legitimate repeated cash-like rows must remain."
);

const accountInventoryCsv = [
  "As of Date,Institution,Account Name,Account Type,Currency,Balance,Account Number",
  "2026-07-24,BPI,Payroll,Savings,PHP,\"12,345.67\",1234",
  "2026-07-24,GCash,Daily Wallet,Wallet,PHP,500.00,",
  "2026-07-24,,Cash USD,Cash,USD,100.00,",
  "2026-07-24,,Accounts Receivable,Receivable,PHP,2500.00,",
  "2026-07-24,,Total,,PHP,15445.67,",
].join("\n");
const accountRows = parseGenericAccountSnapshotCsv(accountInventoryCsv, "accounts.csv", "text/csv");
assert.ok(accountRows);
assert.equal(accountRows.length, 4);
assert.ok(accountRows.every((row) => row.rawPayload?.kind === "account_snapshot_marker"));
assert.equal(accountRows.find((row) => row.accountName === "Daily Wallet")?.rawPayload?.accountType, "wallet");
assert.equal(accountRows.find((row) => row.accountName === "Cash USD")?.currency, "USD");
assert.equal(accountRows.find((row) => row.accountName === "Accounts Receivable")?.rawPayload?.accountType, "receivable");
assert.equal(parseImportText(accountInventoryCsv, "accounts.csv", "text/csv").length, 4);

const longBalanceHistoryCsv = [
  "Snapshot Date,Institution,Account Name,Account Type,Currency,Balance,Account Number",
  "2026-05-31,BPI,Payroll,Savings,PHP,10000.00,1234",
  "2026-06-30,BPI,Payroll,Savings,PHP,12000.00,1234",
  "2026-07-24,BPI,Payroll,Savings,PHP,11500.00,1234",
  "2026-07-24,BPI,Total Assets,,PHP,11500.00,",
].join("\n");
const longBalanceRows = parseGenericAccountSnapshotCsv(longBalanceHistoryCsv, "long-history.csv", "text/csv");
assert.ok(longBalanceRows);
assert.equal(longBalanceRows.length, 1, "Repeated snapshots of one account must consolidate into one account marker.");
assert.equal(longBalanceRows[0]?.rawPayload?.balance, 11500);
assert.equal((longBalanceRows[0]?.rawPayload?.balanceHistory as unknown[])?.length, 3);
assert.deepEqual(longBalanceRows[0]?.rawPayload?.sourceRowIndexes, [2, 3, 4]);
assert.equal(parseImportText(longBalanceHistoryCsv, "long-history.csv", "text/csv").length, 1);

const wideBalanceHistoryCsv = [
  "Institution,Personal Finance Export",
  "Currency,PHP",
  "Snapshot Date,BPI Payroll,GCash Wallet,Total Assets,Monthly Change",
  '2026-05-31,"10,000.00",500.00,"10,500.00",',
  '2026-06-30,"12,000.00",750.00,"12,750.00","2,250.00"',
  '2026-07-24,"11,500.00",900.00,"12,400.00",-350.00',
].join("\n");
const wideBalanceRows = parseWideAccountSnapshotCsv(wideBalanceHistoryCsv, "balance-history.csv", "text/csv");
assert.ok(wideBalanceRows);
assert.equal(wideBalanceRows.length, 2);
assert.deepEqual(wideBalanceRows.map((row) => row.accountName), ["BPI Payroll", "GCash Wallet"]);
assert.equal(wideBalanceRows[0]?.rawPayload?.balance, 11500);
assert.equal((wideBalanceRows[0]?.rawPayload?.balanceHistory as unknown[])?.length, 3);
assert.equal(wideBalanceRows[1]?.rawPayload?.accountType, "wallet");
assert.equal(parseImportText(wideBalanceHistoryCsv, "balance-history.csv", "text/csv").length, 2);

const singleAccountHistoryCsv = [
  "Date,BPI Savings",
  "2026-05-31,10000.00",
  "2026-06-30,12500.00",
  "2026-07-24,11900.00",
].join("\n");
const singleAccountHistoryRows = parseWideAccountSnapshotCsv(
  singleAccountHistoryCsv,
  "single-account-history.csv",
  "text/csv"
);
assert.ok(singleAccountHistoryRows);
assert.equal(singleAccountHistoryRows.length, 1);
assert.equal(singleAccountHistoryRows[0]?.accountName, "BPI Savings");
assert.equal(singleAccountHistoryRows[0]?.rawPayload?.balance, 11900);
assert.equal((singleAccountHistoryRows[0]?.rawPayload?.balanceHistory as unknown[])?.length, 3);

const mixedFinancialTablesCsv = [
  "Institution,BPI",
  "Account Name,Balance,Currency,Account Type,Account Number",
  "BPI Payroll,12500.00,PHP,Savings,1234",
  "BPI Credit Card,3000.00,PHP,Credit Card,5678",
  "",
  "Date,Description,Debit,Credit,Account Name,Reference",
  "2026-07-20,Coffee,125.00,,BPI Payroll,TX-001",
  "2026-07-21,Salary,,50000.00,BPI Payroll,TX-002",
].join("\n");
const mixedFinancialRows = parseImportText(mixedFinancialTablesCsv, "mixed-financial-export.csv", "text/csv");
assert.equal(mixedFinancialRows.length, 4, "Account summaries and transactions in one CSV must both be imported.");
assert.equal(
  mixedFinancialRows.filter((row) => row.rawPayload?.kind === "account_snapshot_marker").length,
  2
);
assert.equal(
  mixedFinancialRows.filter((row) => row.rawPayload?.source === "structured_transaction_csv").length,
  2
);
assert.deepEqual(
  [...new Set(mixedFinancialRows.map((row) => row.rawPayload?.sourceSectionKind))].sort(),
  ["accounts", "transactions"]
);
assert.deepEqual(
  mixedFinancialRows.map((row) => row.rawPayload?.sourceRowIndex),
  [3, 4, 6, 7],
  "Mixed-table rows must retain their original one-based non-empty row provenance."
);

const mixedLedgerSchemasCsv = [
  "Date,Description,Amount,Account",
  "2026-07-20,Coffee,-125.00,BPI Payroll",
  "Posted Date,Merchant,Debit,Credit,Account",
  "2026-07-21,Airline,5000.00,,BPI Card",
].join("\n");
const mixedLedgerRows = parseImportText(mixedLedgerSchemasCsv, "mixed-ledgers.csv", "text/csv");
assert.equal(mixedLedgerRows.length, 2, "Different transaction schemas in one CSV must each be parsed.");
assert.deepEqual(mixedLedgerRows.map((row) => row.accountName), ["BPI Payroll", "BPI Card"]);

const utf16Text = "Date\tDescription\tAmount\n2026-07-20\tCafé\t-125.00";
const utf16Bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(utf16Text, "utf16le")]);
assert.equal(decodeStructuredDelimitedBytes(utf16Bytes), utf16Text);
const windows1252Bytes = Uint8Array.from(Buffer.from("Date,Description,Amount\n2026-07-20,Caf\xe9,-125.00", "latin1"));
assert.match(decodeStructuredDelimitedBytes(windows1252Bytes), /Café/);
const decodedTsvRows = parseStructuredTransactionCsv(
  decodeStructuredDelimitedBytes(utf16Bytes),
  "legacy-export.tsv",
  "text/tab-separated-values"
);
assert.ok(decodedTsvRows);
assert.equal(decodedTsvRows[0]?.merchantRaw, "Café");
assert.equal(isSupportedImportFile("legacy-export.tsv", "text/tab-separated-values"), true);
assert.equal(
  validateImportFileBytes({
    fileName: "legacy-export.tsv",
    contentType: "text/tab-separated-values",
    bytes: utf16Bytes,
  }),
  null
);

const ambiguousBalanceTable = [
  "Date,Balance",
  "2026-07-01,1000.00",
  "2026-07-02,900.00",
].join("\n");
assert.equal(
  parseStructuredTransactionCsv(ambiguousBalanceTable, "balances.csv", "text/csv"),
  null,
  "A date/balance table without transaction evidence must not fabricate transactions."
);
assert.deepEqual(
  parseImportText(ambiguousBalanceTable, "balances.csv", "text/csv"),
  [],
  "Ambiguous CSV files must fail closed instead of falling through to heuristic line parsing."
);

const invalidRows = [
  "Date,Description,Debit,Credit",
  "2026-07-01,Both sides,10.00,10.00",
  "not-a-date,Missing date,20.00,",
  "2026-07-03,Missing amount,,",
].join("\n");
assert.deepEqual(
  parseStructuredTransactionCsv(invalidRows, "invalid.csv", "text/csv"),
  [],
  "Recognized but invalid transaction tables should fail closed."
);

const workerSource = readFileSync(join(process.cwd(), "workers/import-processor.ts"), "utf8");
assert.match(workerSource, /hasStructuredDelimitedAccountGroups/, "Multi-account CSV exports must retain distinct account groups.");
assert.match(workerSource, /shouldPersistAccountSnapshotCsvGroupBalances/, "Account inventory balances must be persisted per account.");
assert.match(
  workerSource,
  /shouldPersistWideAccountSnapshotCsvGroupBalances/,
  "Wide account-history balances must be persisted per account."
);

console.log(
  "[PASS] Structured CSV parser covers encodings, TSV, mixed tables, histories, sections, statuses, locale dates, reconciliation, and fail-closed behavior."
);
