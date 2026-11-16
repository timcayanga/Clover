import assert from "node:assert/strict";
import { parseGenericBankStatementText, parseImportText } from "../lib/import-parser";

const card = [
  "BPI", "STATEMENT OF ACCOUNT", "STATEMENT DATE JULY 27, 2026",
  "PAYMENT DUE DATE AUGUST 17, 2026", "CREDIT LIMIT 500,000.00",
  "CUSTOMER NUMBER 12349001", "TRANSACTION POST DATE DESCRIPTION AMOUNT",
  "July 1 July 1 Previous Balance 300.00",
  "July 7 July 7 Retail purchase 25.00",
  "July 7 July 7 Retail purchase 25.00",
  "Installment Purchase:", "July 8 July 8 Furniture 600.00",
  "Installment Amortization:", "July 8 July 9 Furniture installment 01/12 50.00",
  "July 8 July 9 Furniture installment 01/12 50.00",
  "Rewards Summary", "July 9 July 9 Points earned 80.00",
  "TRANSACTION POST DATE DESCRIPTION AMOUNT",
  "July 10 July 10 Rewards cashback credit -5.00",
].join("\n");
const cardRows = parseImportText(card, "BE20260728.pdf", "application/pdf");
assert.deepEqual(cardRows.map(row => [row.amount, row.type]), [
  ["25.00", "expense"], ["25.00", "expense"], ["50.00", "expense"], ["50.00", "expense"], ["5.00", "income"],
]);

const bank = [
  "Example Bank", "Account Number: 1234567890", "Currency: USD",
  "Statement Period: 2025-01-01 to 2025-01-31", "Opening Balance 100.00",
  "Date Description Amount Balance",
  "01/01/2025 Balance brought forward 100.00",
  "01/02/2025 Payroll +20.00 CR 120.00",
  "Portfolio Snapshot", "01/03/2025 Example ETF 1,800.00",
  "Transaction History", "Date Description Amount Balance",
  "01/04/2025 Investment contribution 15.00 DR 105.00",
  "Ending Balance 105.00",
].join("\n");
const bankRows = parseGenericBankStatementText(bank, { institution: "Example Bank" })?.rows;
assert.deepEqual(bankRows?.map(row => [row.amount, row.type]), [["20.00", "income"], ["15.00", "expense"]]);

assert.deepEqual(parseImportText(bank, "example-bank.pdf", "application/pdf", { institution: "Example Bank" })
  .map(row => [row.amount, row.type]), [["20.00", "income"], ["15.00", "expense"]]);

const aub = [
  "ASIA UNITED BANK", "STATEMENT OF ACCOUNT", "ACCOUNT NUMBER: 1234567890",
  "PERIOD COVERED: FROM 2025-01-01 TO 2025-01-31",
  "DATE CHECK NO. TRANSACTION CODE DEBIT CREDIT ENDING BALANCE",
  "BEGINNING BALANCE 100.00",
  "2025-01-07 000000 DM1 25.00 0.00 75.00",
  "2025-01-07 000000 DM1 25.00 0.00 50.00",
].join("\n");
const repeated = parseImportText(aub, "aub-savings.pdf", "application/pdf");
assert.deepEqual(repeated.map(row => [row.date, row.amount, row.type, row.rawPayload?.balanceText]), [
  ["2025-01-07", "25.00", "transfer", "75.00"],
  ["2025-01-07", "25.00", "transfer", "50.00"],
]);

console.log("Statement disclosure and posted movement regression passed.");
