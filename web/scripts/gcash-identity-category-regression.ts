import assert from "node:assert/strict";
import { detectStatementMetadata, parseImportText } from "@/lib/import-parser";

const statement = `
GCash Transaction History
GCash Mobile Number: +63 917 300 9926
Date and Time Description Reference No. Debit Credit Balance
STARTING BALANCE 5,000.00
2026-07-01 08:00 AM Payment to Foodpanda 1000000000001 450.00 4,550.00
2026-07-01 09:00 AM Payment to Angkas 1000000000002 120.00 4,430.00
2026-07-01 10:00 AM Bills Payment to Meralco 1000000000003 1,000.00 3,430.00
2026-07-01 11:00 AM Sent GCash to Juan Dela Cruz 1000000000004 500.00 2,930.00
2026-07-01 12:00 PM Cash In from BPI 1000000000005 2,000.00 4,930.00
2026-07-01 01:00 PM Transfer from +63 917 300 9926 to 0918-555-1212 1000000000006 100.00 4,830.00
ENDING BALANCE 4,830.00
`.trim();

const metadata = detectStatementMetadata(statement, "gcash-formatted-phone.pdf");
assert.equal(metadata?.institution, "GCash");
assert.equal(metadata?.accountNumber, "09173009926", "A labeled +63 number should become the canonical wallet account number.");
assert.equal(metadata?.accountName, "GCash 9926");

const rows = parseImportText(statement, "gcash-formatted-phone.pdf", "application/pdf");
assert.equal(rows.length, 6, `Expected six GCash rows, received ${rows.length}.`);

const byDescription = (pattern: RegExp) => rows.find((row) => pattern.test(String(row.description ?? row.merchantRaw ?? "")));
assert.equal(byDescription(/Foodpanda/i)?.categoryName, "Food & Dining");
assert.equal(byDescription(/Angkas/i)?.categoryName, "Transport");
assert.equal(byDescription(/Meralco/i)?.categoryName, "Bills & Utilities");

const sent = byDescription(/Sent GCash/i);
assert.equal(sent?.type, "expense");
assert.equal(sent?.categoryName, "Transfers");

const cashIn = byDescription(/Cash In from BPI/i);
assert.equal(cashIn?.categoryName, "Transfers");

const formattedTransfer = byDescription(/Transfer from/i);
assert.equal((formattedTransfer?.rawPayload as Record<string, unknown>)?.transferFromAccountNumber, "09173009926");
assert.equal((formattedTransfer?.rawPayload as Record<string, unknown>)?.transferToAccountNumber, "09185551212");

console.log("[PASS] GCash identity and category routing handles formatted phone numbers and recognizable merchants.");
