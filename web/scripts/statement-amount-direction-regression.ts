import assert from "node:assert/strict";
import { parseGenericBankStatementText, parseImportText } from "../lib/import-parser";

const generic = [
  "Example Bank",
  "Account Number: 1234567890",
  "Currency: USD",
  "Statement Period: 2025-01-01 to 2025-01-31",
  "Opening Balance 1000.00",
  "Date Description Amount Balance",
  "01/02/2025 Chargeback reversal (25.00) 975.00",
  "01/03/2025 Chargeback fee credit 5.00 CR 980.00",
  "01/04/2025 Refund reversal 20.00 DR 960.00",
  "01/05/2025 Chargeback +10.00 970.00",
  "01/06/2025 Dispute adjustment 8.00 978.00",
  "01/07/2025 Dispute adjustment (4.00) CR 974.00",
].join("\n");

const parsed = parseGenericBankStatementText(generic, { institution: "Example Bank" });
assert(parsed);
assert.deepEqual(parsed.rows.slice(0, 5).map(row => [row.type, row.amount]), [
  ["expense", "25.00"], ["income", "5.00"], ["expense", "20.00"],
  ["income", "10.00"], ["income", "8.00"],
]);
assert.equal(parsed.rows.length, 6);
assert.equal(parsed.rows[5]?.amount, "4.00");
assert.equal(parsed.rows[5]?.rawPayload?.reviewRequired, true);
assert.equal(parsed.rows[0]?.rawPayload?.amountDirectionMarker, "debit");

const metrobank = [
  "Metrobank Credit Card Statement", "CREDIT CARD ACCOUNT NUMBER: 1234",
  "STATEMENT DATE: January 15, 2025", "PAYMENT DUE DATE: February 5, 2025",
  "TOTAL AMOUNT DUE: 125.00", "Transaction Date Posting Date Description Amount",
  "01/02 01/03 Dispute credit 12.50C",
  "01/04 01/05 Chargeback reversal 12.50",
  "01/05 01/06 Cash Payment 125.00C",
].join("\n");
const metroRows = parseImportText(metrobank, "metrobank.pdf", "application/pdf");
assert.deepEqual(metroRows.map(row => row.type), ["income", "expense", "transfer"]);
assert.equal(metroRows[0].rawPayload?.amountText, "12.50C");
assert.equal(metroRows[1].rawPayload?.reviewRequired, true);

const rcbc = [
  "RCBC BANKARD", "STATEMENT OF ACCOUNT", "VISA PLATINUM", "CARD NUMBER",
  "4279 3411 3868 1014", "STATEMENT DATE PAYMENT DUE DATE", "JAN 23 2025 FEB 21 2025",
  "SALE DATE POST DATE DESCRIPTION AMOUNT",
  "01/02/25 01/03/25 DISPUTE CREDIT 12.50-",
  "01/04/25 01/05/25 CHARGEBACK REVERSAL 12.50",
  "01/05/25 01/06/25 CASH PAYMENT 125.00-",
].join("\n");
const rcbcRows = parseImportText(rcbc, "rcbc.pdf", "application/pdf");
assert.deepEqual(rcbcRows.map(row => row.type), ["income", "expense", "income"]);
assert.equal(rcbcRows[0].rawPayload?.amountDirectionMarker, "credit");
assert.equal(rcbcRows[1].rawPayload?.reviewRequired, true);

const bpi = [
  "BPI", "STATEMENT OF ACCOUNT", "STATEMENT DATE JULY 27, 2026",
  "PAYMENT DUE DATE AUGUST 17, 2026", "CREDIT LIMIT 500,000.00",
  "CUSTOMER NUMBER 12349001", "TRANSACTION POST DATE DESCRIPTION AMOUNT",
  "July 8 July 9 Dispute credit -125.00",
  "July 10 July 11 Chargeback reversal 125.00",
  "July 14 July 15 Payment -125.00",
].join("\n");
const bpiRows = parseImportText(bpi, "BE20260728.pdf", "application/pdf");
assert.deepEqual(bpiRows.map(row => row.type), ["income", "expense", "expense"]);
assert.equal(bpiRows[2].merchantRaw, "Statement Payment Credit");
assert.equal(bpiRows[2].rawPayload?.amountDirectionMarker, "credit");

console.log("Statement debit, credit, and adjustment direction regression passed.");
