import assert from "node:assert/strict";
import { detectStatementMetadata, parseImportText } from "@/lib/import-parser";

const text = [
  "Wise Pilipinas Inc.",
  "WeWork 30th Floor Yuchengco Tower, RCBC Plaza, 6819 Ayala Ave.",
  "GBP statement",
  "1 January 2026 [GMT+08:00] - 30 June 2026 [GMT+08:00]",
  "Account Holder Account number UK sort code",
  "Timothy Cayanga 84168345 23-08-01",
  "GBP on 30 June 2026 [GMT+08:00] 30.96 GBP",
  "Description Incoming Outgoing Amount",
  "Card transaction of 1,032.58 BWP issued by Maun Airport",
  "-55.36 30.96",
  "10 June 2026 Card ending in 6453 Transaction: CARD-3904653901",
  "Card transaction of -43.54 GBP issued by Trainpal London",
  "43.54 103.54",
  "13 April 2026 Card ending in 6453 Transaction: CARD-3666012761",
  "Sent money to EMMANUEL COLLEGE",
  "-111.50 540.63",
  "28 February 2026 Transaction: TRANSFER-1995929409 Reference: HT Cayanga",
  "Received money from EMMANUEL PAYMENTS with reference noref",
  "548.00 652.13",
  "12 January 2026 Transaction: TRANSFER-1915718148 Reference: noref",
  "Converted 7.49 GBP to 8.92 EUR",
  "-7.49 644.64",
  "8 January 2026 Transaction: BALANCE-1915000000",
].join("\n");

const metadata = detectStatementMetadata(text, "statement_85367058_GBP_2026-01-01_2026-06-30.pdf");
assert.equal(metadata?.institution, "Wise");
assert.equal(metadata?.accountNumber, "84168345");
assert.equal(metadata?.accountType, "wallet");
assert.equal(metadata?.currency, "GBP");
assert.equal(metadata?.endingBalance, 30.96);

const rows = parseImportText(text, "statement_85367058_GBP_2026-01-01_2026-06-30.pdf", "application/pdf", {
  institution: metadata?.institution,
  accountName: metadata?.accountName,
  accountNumber: metadata?.accountNumber,
});

assert.equal(rows.length, 5);
assert.deepEqual(rows.map((row) => row.amount), ["55.36", "43.54", "111.5", "548", "7.49"]);
assert.ok(rows.every((row) => row.currency === "GBP"));
assert.ok(rows.every((row) => row.institution === "Wise"));
assert.equal(rows[0]?.merchantClean, "Maun Airport");
assert.equal(rows[0]?.categoryName, "Transport");
assert.equal(rows[1]?.merchantClean, "Trainpal London");
assert.equal(rows[1]?.categoryName, "Transport");
assert.equal(rows[2]?.categoryName, "Transfers");
assert.equal(rows[3]?.categoryName, "Transfers");
assert.equal(rows[4]?.categoryName, "Transfers");

const emptyStatementRows = parseImportText(
  "Wise Pilipinas Inc.\nEUR statement\n1 January 2026 [GMT+08:00] - 30 June 2026 [GMT+08:00]\nEUR on 30 June 2026 [GMT+08:00] 0.00 EUR\nDescription Incoming Outgoing Amount",
  "statement_85367056_EUR_2026-01-01_2026-06-30.pdf",
  "application/pdf"
);
assert.deepEqual(emptyStatementRows, [], "A recognized empty Wise statement must not fall through to generic boilerplate parsing.");

console.log("Wise PDF regression passed.");
