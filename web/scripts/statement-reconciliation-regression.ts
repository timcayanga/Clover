import assert from "node:assert/strict";
import { assessBpiStatementReconciliation } from "../lib/bpi-statement-reconciliation";
import { detectStatementMetadata, parseGenericBankStatementText, parseImportText } from "../lib/import-parser";

const bank = [
  "Example Bank", "Account Number: 1234567890", "Currency: USD",
  "Statement Period: 2025-01-01 to 2025-01-31", "Opening Balance 100.00",
  "Date Description Amount Balance",
  "01/02/2025 Payroll +20.00 CR 120.00",
  "01/03/2025 Service fee 5.00 DR 115.00",
  "Ending Balance 115.00", "Total Debits 5.00", "Total Credits 20.00",
].join("\n");
const parseBank = (text: string) => parseGenericBankStatementText(text, { institution: "Example Bank" })!;
const clean = parseBank(bank);
assert.equal(clean.metadata.openingBalance, 100);
assert.equal(clean.metadata.endingBalance, 115);
assert(clean.rows.every(row => row.rawPayload?.reviewRequired !== true));
const unknown = parseBank(bank.replace("Opening Balance 100.00\n", "").replace("Ending Balance 115.00\n", ""));
assert.equal(unknown.metadata.openingBalance, null);
assert.equal(unknown.metadata.endingBalance, null);
assert.equal(unknown.rows.length, 2);
const closingMismatch = parseBank(bank.replace("Ending Balance 115.00", "Ending Balance 115.01"));
assert.equal(closingMismatch.metadata.endingBalance, 115.01);
assert(closingMismatch.rows.every(row => row.rawPayload?.reviewRequired === true));
const debitMismatch = parseBank(bank.replace("Total Debits 5.00", "Total Debits 4.99"));
assert(debitMismatch.rows.every(row => row.rawPayload?.reviewRequired === true));

const card = [
  "BPI", "STATEMENT OF ACCOUNT", "STATEMENT DATE JULY 27, 2026",
  "PAYMENT DUE DATE AUGUST 17, 2026", "CREDIT LIMIT 500,000.00",
  "CUSTOMER NUMBER 12349001", "Previous Balance 100.00", "Total Amount Due PHP 110.00",
  "TRANSACTION POST DATE DESCRIPTION AMOUNT",
  "July 7 July 7 Payment -20.00", "July 8 July 8 Merchant refund -5.00",
  "July 9 July 9 Purchase 30.00", "July 10 July 10 Service fee 5.00",
  "Total Payments 20.00", "Total Other Credits 5.00", "Total Payments and Credits 25.00", "Total Fees 5.00",
].join("\n");
const assess = (text: string) => assessBpiStatementReconciliation(text,
  detectStatementMetadata(text, "BE20260728.pdf"),
  parseImportText(text, "BE20260728.pdf", "application/pdf"));
const cardTotals = assess(card);
assert.equal(cardTotals.status, "reconciled");
assert.equal(cardTotals.printedMovementChecks.length, 4);
assert.equal(assess(card.replace("Total Fees 5.00", "Total Fees 5.01")).code, "MOVEMENT_TOTAL_MISMATCH");
const cardUnknown = assess(card.replace("Previous Balance 100.00\n", ""));
assert.equal(cardUnknown.openingBalance, null);
assert.equal(cardUnknown.expectedEndingBalance, null);
assert.equal(cardUnknown.code, "MISSING_OPENING_BALANCE");
console.log("Printed statement reconciliation regression passed.");
