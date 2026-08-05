import assert from "node:assert/strict";
import { detectStatementMetadata, parseImportText } from "@/lib/import-parser";

const newestFirstMetrobankStatement = `
METROBANK
Statement of Account
ACCOUNT NAME: TEST USER
ACCOUNT NUMBER: 000000006453
ACCOUNT TYPE: SAVINGS
CURRENCY: PHP
DATE DESCRIPTION DEBIT CREDIT BALANCE
08/05/2026 PYMT - CREDIT CARD 35,439.41 51,539.61
07/24/2026 PAYROLL 46,362.50 86,979.02
07/21/2026 BILLS PAYMENT TO BANKARD/RCBC FOR XXXXXXXXXXXX1014 17,286.75 40,616.52
07/15/2026 BILLS PAYMENT TO BANKARD/RCBC FOR XXXXXXXXXXXX1014 36,875.50 57,903.27
07/10/2026 PAYROLL 94,578.77 94,778.77
07/06/2026 INTERBANK FUND TRANSFER CREDIT RECEIVED FROM OTHER 100.00 200.00
07/06/2026 INTERBANK FUND TRANSFER CREDIT RECEIVED FROM OTHER 100.00 100.00
`;

const rows = parseImportText(newestFirstMetrobankStatement, "new-metrobank-layout.pdf", "application/pdf");
assert.equal(rows.length, 7, "The deterministic Metrobank parser should retain every visible ledger row.");

const payrollRows = rows.filter((row) => /payroll/i.test(row.merchantRaw ?? ""));
assert.equal(payrollRows.length, 2);
assert.ok(payrollRows.every((row) => row.type === "income" && row.categoryName === "Income"));
assert.ok(
  payrollRows.every((row) => row.rawPayload?.directionEvidence === "running_balance_delta"),
  "Reverse-ordered rows should use running-balance evidence for direction."
);

const cardPayment = rows.find((row) => /pymt\s*-\s*credit card/i.test(row.merchantRaw ?? ""));
assert.equal(cardPayment?.type, "expense");
assert.equal(cardPayment?.categoryName, "Transfers");

const metadata = detectStatementMetadata(newestFirstMetrobankStatement, "new-metrobank-layout.pdf");
assert.equal(metadata?.institution, "Metrobank");
assert.equal(metadata?.endingBalance, 51539.61, "The newest dated balance must win for a newest-first ledger.");

console.log("Metrobank newest-first balance and direction regression passed.");
