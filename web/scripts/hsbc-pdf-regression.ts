import assert from "node:assert/strict";
import { detectStatementMetadata, parseImportText } from "@/lib/import-parser";

const statementText = [
  "Your Statement",
  "Account Summary",
  "Ope ning Balance £284.83",
  "Paym e nts In £0.00",
  "Paym e nts Out £10.94",
  "Clos ing Balance £273.89",
  "21 December 2024 to 20 January 2025",
  "Account Nam e S ortcode Account Num ber S he e t Num be r",
  "Mr Timothy Gunther Cayanga 40-16-08 84795067 8",
  "Your Bank Account details",
  "Date Pay m e nt t y pe and de t ails £ Paid out £ Paid in £ Balance",
  "20 Dec 24 BALANCE BROUGHT FORWARD 284.83",
  "27 Dec 24 VIS INT'L 0044839917",
  "APPLE.COM/BILL",
  "APPLE.COM/BIL 1.99 282.84",
  "20 Jan 25 ))) Wasabi_KingsCrossS",
  "London 8.95 273.89",
  "20 Jan 25 BALANCE CARRIED FORWARD 273.89",
  "HSBC UK Bank plc, registered in England and Wales number 09928412.",
].join("\n");

const metadata = detectStatementMetadata(statementText, "2025-01-20_Statement.pdf");
assert.equal(metadata?.institution, "HSBC");
assert.equal(metadata?.accountNumber, "84795067");
assert.equal(metadata?.currency, "GBP");
assert.equal(metadata?.openingBalance, 284.83);
assert.equal(metadata?.endingBalance, 273.89);

const rows = parseImportText(statementText, "2025-01-20_Statement.pdf", "application/pdf", {
  institution: metadata?.institution,
  accountName: metadata?.accountName,
  accountNumber: metadata?.accountNumber,
});

assert.equal(rows.length, 2);
assert.deepEqual(rows.map((row) => row.date), ["2024-12-27", "2025-01-20"]);
assert.deepEqual(rows.map((row) => row.amount), ["1.99", "8.95"]);
assert.ok(rows.every((row) => row.type === "expense"));
assert.equal(rows[0]?.merchantClean, "Apple.com/Bill");
assert.match(rows[1]?.merchantClean ?? "", /Wasabi/i);
assert.deepEqual(rows.map((row) => row.runningBalance), [282.84, 273.89]);
assert.ok(rows.every((row) => row.rawPayload?.kind === "hsbc_uk_pdf_statement_transaction"));

const emptyRows = parseImportText(
  [
    "Your Statement",
    "21 September 2025 to 15 January 2026",
    "Mr Timothy Gunther Cayanga 40-16-08 84795067 25",
    "Your Bank Account details",
    "20 Sep 25 BALANCE BROUGHT FORWARD 0.00",
    "15 Jan 26 BALANCE CARRIED FORWARD 0.00",
    "HSBC UK Bank plc, registered in England and Wales number 09928412.",
  ].join("\n"),
  "2026-01-15_Statement.pdf",
  "application/pdf"
);
assert.equal(emptyRows.length, 1, "A recognized zero-activity statement should retain its account snapshot.");
assert.equal(emptyRows[0]?.rawPayload?.kind, "account_snapshot_marker");
assert.equal(emptyRows[0]?.rawPayload?.zeroActivityStatement, true);
assert.equal(emptyRows[0]?.runningBalance, 0);

const sameDateRows = parseImportText(
  [
    "Your Statement",
    "20 May 2026 to 20 June 2026",
    "Mr Timothy Gunther Cayanga 40-16-08 84795067 27",
    "Your Bank Account details",
    "20 May 26 BALANCE BROUGHT FORWARD 50.00",
    "21 May 26 ))) SP KINGS COLLEGE V",
    "CAMBRIDGE 9.90",
    "VIS Jack s Gelato Camb",
    "Cambridge 3.30 36.80",
    "20 Jun 26 BALANCE CARRIED FORWARD 36.80",
    "HSBC UK Bank plc, registered in England and Wales number 09928412.",
  ].join("\n"),
  "2026-06-20_Statement.pdf",
  "application/pdf"
);
assert.equal(sameDateRows.length, 2, "HSBC must carry a visible date across same-day transaction-code rows.");
assert.deepEqual(sameDateRows.map((row) => row.date), ["2026-05-21", "2026-05-21"]);
assert.deepEqual(sameDateRows.map((row) => row.amount), ["9.90", "3.30"]);
assert.equal(sameDateRows[1]?.merchantClean, "Jack's Gelato");

const transferGuardRows = parseImportText(
  [
    "Your Statement",
    "20 January 2025 to 20 February 2025",
    "Mr Timothy Gunther Cayanga 40-16-08 84795067 9",
    "Your Bank Account details",
    "20 Jan 25 BALANCE BROUGHT FORWARD 100.00",
    "21 Jan 25 ))) PERSON LIKE SHOP",
    "CAMBRIDGE 3.00 97.00",
    "22 Jan 25 BP Jane Doe",
    "Dinner 17.00 80.00",
    "20 Feb 25 BALANCE CARRIED FORWARD 80.00",
    "HSBC UK Bank plc, registered in England and Wales number 09928412.",
  ].join("\n"),
  "2025-02-20_Statement.pdf",
  "application/pdf"
);
assert.equal(transferGuardRows.length, 2);
assert.notEqual(
  transferGuardRows[0]?.categoryName,
  "Transfers",
  "An unknown card merchant must not become a transfer because its descriptor resembles a name."
);
assert.equal(transferGuardRows[0]?.type, "expense");
assert.equal(transferGuardRows[1]?.categoryName, "Transfers", "An HSBC BP row should retain transfer semantics.");
assert.equal(
  transferGuardRows[1]?.type,
  "expense",
  "An HSBC BP row is an expense until another Clover account contains its matching incoming movement."
);

console.log("[PASS] HSBC UK PDF rows survive OCR-spaced headers and reconcile through running balances.");
