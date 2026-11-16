import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCimbConsolidatedStatement, parseGenericBankStatementText, parseImportText } from "../lib/import-parser";

const generic = [
  "Example Global Bank", "Statement Period: 01/01/2026 - 01/31/2026",
  "Account Number:", "000011112222", "Currency: PHP", "Opening Balance 100.00",
  "Date Description Debit Credit Balance", "01/05/2026 Cash Deposit 0.00 50.00 150.00",
  "Account Number: 000033334444", "Currency: USD", "Opening Balance 200.00",
  "Date Description Debit Credit Balance", "01/10/2026 ATM Withdrawal 30.00 0.00 170.00",
  "Account Number: 000055556666", "Currency: PHP", "Opening Balance 90.00", "Closing Balance 90.00",
  "Account Number: 000011112222", "Currency: PHP",
  "Date Description Debit Credit Balance", "01/25/2026 Incoming Transfer 0.00 10.00 160.00",
].join("\n");
const parsed = parseGenericBankStatementText(generic, { institution: "Example Global Bank" });
assert(parsed);
assert.deepEqual(parsed.rows.map(row => [row.accountNumber, row.currency, row.amount]), [
  ["000011112222", "PHP", "50.00"], ["000011112222", "PHP", "10.00"], ["000033334444", "USD", "30.00"],
]);
assert.equal(parsed.metadata.endingBalance, null);
const oneActive = parseGenericBankStatementText(generic.replace("01/10/2026 ATM Withdrawal 30.00 0.00 170.00", "No transactions"), { institution: "Example Global Bank" });
assert.deepEqual(oneActive?.rows.map(row => row.accountNumber), ["000011112222", "000011112222"]);

const bpi = [
  "BPI", "STATEMENT OF ACCOUNT", "STATEMENT DATE JULY 27, 2026",
  "PAYMENT DUE DATE AUGUST 17, 2026", "CREDIT LIMIT 500,000.00",
  "CUSTOMER NUMBER 12349001", "TRANSACTION POST DATE DESCRIPTION AMOUNT",
  "Primary Card ending 1234", "July 8 July 9 Grocery 125.00",
  "Supplementary Card", "Card Number", "XXXX XXXX XXXX 5678",
  "July 10 July 11 Restaurant 125.00",
  "TRANSACTION POST DATE DESCRIPTION AMOUNT", "July 11 July 11 Grocery 125.00",
  "Primary Card ending 1234", "July 14 July 15 Groceries 125.00",
].join("\n");
const bpiRows = parseImportText(bpi, "BE20260728.pdf", "application/pdf");
assert.deepEqual(bpiRows.map(row => [row.rawPayload?.statementCardRole, row.rawPayload?.statementCardLast4]), [
  ["primary", "1234"], ["supplementary", "5678"], ["supplementary", "5678"], ["primary", "1234"],
]);
assert.equal(new Set(bpiRows.map(row => row.accountNumber)).size, 1);
assert.throws(() => parseImportText(bpi.replace("Primary Card ending 1234\nJuly 14", "Primary Card ending 9999\nJuly 14"), "BE20260728.pdf", "application/pdf"), /more than one primary card/);
const incomplete = parseImportText(bpi.replace("Card Number\nXXXX XXXX XXXX 5678\n", ""), "BE20260728.pdf", "application/pdf");
assert.equal(incomplete[1]?.rawPayload?.reviewRequired, true);

const rcbc = [
  "RCBC BANKARD", "STATEMENT OF ACCOUNT", "VISA PLATINUM", "CARD NUMBER",
  "4279 3411 3868 1014", "STATEMENT DATE PAYMENT DUE DATE", "JAN 23 2025 FEB 21 2025",
  "SALE DATE POST DATE DESCRIPTION AMOUNT", "Primary Card ending 1014",
  "01/02/25 01/03/25 EXAMPLE SHOP 12.50", "Supplementary Card **** 5678",
  "01/04/25 01/05/25 EXAMPLE SHOP 12.50",
].join("\n");
const rcbcRows = parseImportText(rcbc, "rcbc.pdf", "application/pdf");
assert.deepEqual(rcbcRows.map(row => row.rawPayload?.statementCardLast4), ["1014", "5678"]);
assert.equal(new Set(rcbcRows.map(row => row.accountNumber)).size, 1);

const cimb = readFileSync(new URL("./fixtures/reviewed-parser-corpus/cimb-consolidated-zero-account.txt", import.meta.url), "utf8");
const cimbRows = parseCimbConsolidatedStatement(cimb)?.rows;
assert(cimbRows?.length);
assert.equal(new Set(cimbRows.map(row => row.accountNumber)).size, 2);
assert.equal(cimbRows.filter(row => row.rawPayload?.kind === "account_snapshot_marker").length, 1);
console.log("Supplementary card and consolidated account boundary regression passed.");
