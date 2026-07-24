import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseGenericAccountSnapshotCsv,
  parseImportText,
  parseStructuredTransactionCsv,
} from "@/lib/import-parser";

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

console.log("[PASS] Structured CSV parser covers delimiters, schemas, directions, dates, accounts, and fail-closed behavior.");
