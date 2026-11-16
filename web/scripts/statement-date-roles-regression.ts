import assert from "node:assert/strict";
import { parseGenericBankStatementText, parseGenericStatementMetadata, parseImportText } from "../lib/import-parser";
import { hasPrintedStatementRowYear, resolveStatementRowYear } from "../lib/statement-date-roles";

const day = (value: string) => new Date(`${value}T12:00:00Z`);
const iso = (value: Date) => value.toISOString().slice(0, 10);
assert(!hasPrintedStatementRowYear("Dec 31"));
assert(!hasPrintedStatementRowYear("31 December"));
assert(hasPrintedStatementRowYear("Dec 31, 2024"));
assert.equal(iso(resolveStatementRowYear(day("2025-12-31"), false, null, day("2025-01-15"))), "2024-12-31");
assert.equal(iso(resolveStatementRowYear(day("2025-12-31"), true, null, day("2025-01-15"))), "2025-12-31");
assert.equal(iso(resolveStatementRowYear(day("2025-01-02"), false, day("2024-12-15"), day("2025-01-15"))), "2025-01-02");

const source = [
  "Example Bank Statement of Account",
  "Account Number: 1234567890",
  "Currency: PHP",
  "Statement Period: 2024-12-15 to 2025-01-15",
  "Statement Date: January 15, 2025",
  "Transaction Date Posting Date Description Amount Balance",
  "Dec 31 Jan 02 Grocery purchase -25.00 975.00",
  "Jan 04 Jan 05 Book purchase -30.00 945.00",
  "Page 1 of 2",
  "Posting Date Transaction Date Description Amount Balance",
  "Jan 08 Jan 07 Bus ticket -20.00 925.00",
  "Jan 10, 2025 Jan 09, 2025 Taxi fare -15.00 910.00",
].join("\n");
const result = parseGenericBankStatementText(source, { institution: "Example Bank" });
assert(result);
assert.deepEqual(result.rows.map(row => [row.date, row.rawPayload?.transactionDate, row.rawPayload?.postingDate]), [
  ["2024-12-31", "2024-12-31", "2025-01-02"],
  ["2025-01-04", "2025-01-04", "2025-01-05"],
  ["2025-01-07", "2025-01-07", "2025-01-08"],
  ["2025-01-09", "2025-01-09", "2025-01-10"],
]);
assert(!result.rows.some(row => /Jan 02|Jan 08/i.test(row.description ?? "")));
assert.equal(result.metadata.statementDate?.slice(0, 10), "2025-01-15");
const withDueDate = parseGenericStatementMetadata(source.replace("Statement Date: January 15, 2025", "Statement Date: January 15, 2025\nPayment Due Date: February 5, 2025"));
assert.equal(withDueDate?.paymentDueDate?.slice(0, 10), "2025-02-05");
assert.equal(withDueDate?.statementDate?.slice(0, 10), "2025-01-15");
const metrobank = [
  "Metrobank Credit Card Statement",
  "CREDIT CARD ACCOUNT NUMBER: 1234",
  "STATEMENT DATE: January 15, 2025",
  "PAYMENT DUE DATE: February 5, 2025",
  "TOTAL AMOUNT DUE: 125.00",
  "Transaction Date Posting Date Description Amount",
  "12/31 01/02 Grocery purchase 125.00",
].join("\n");
const metroRows = parseImportText(metrobank, "metrobank.pdf", "application/pdf");
assert.equal(metroRows.length, 1);
assert.equal(metroRows[0].date, "2025-01-02");
assert.equal(metroRows[0].rawPayload?.saleDate, "2024-12-31");
assert.equal(metroRows[0].rawPayload?.postDate, "2025-01-02");

console.log("Statement date roles and year rollover regression passed.");
