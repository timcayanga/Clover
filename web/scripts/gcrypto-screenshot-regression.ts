import assert from "node:assert/strict";
import { detectStatementMetadata, parseImportText } from "@/lib/import-parser";

const samples = [
  {
    fileName: "IMG_1427.PNG",
    fileType: "image/png",
    text: `GCrypto
Transaction History
Past Transactions
As of May 02, 2026
Nov 20, 2023
Withdraw 12:24 PM Successful
Trading Wallet
- PHP 33,791.22
Sell 12:24 PM Successful
Stellar
227.5
PHP 1,489.48
Sell 12:23 PM Successful
The Graph
411.25
PHP 3,055.73
Sell 12:23 PM Successful
Solana
4.4838
PHP 14,591.50`,
    expectedRows: 4,
  },
  {
    fileName: "IMG_1428.PNG",
    fileType: "image/png",
    text: `GCrypto
Transaction History
Past Transactions
As of May 02, 2026
Feb 06, 2023
Buy 1:15 PM Successful
Bitcoin
0.001598
PHP 2,023.00
Sell 1:15 PM Successful
Ripple
95.54
PHP 2,021.53
Nov 08, 2022
Buy 9:35 PM Successful
Bitcoin
0.005652
PHP 6,594.70
Buy 9:34 PM Successful
Stellar
227.5
PHP 1,400.03`,
    expectedRows: 4,
  },
  {
    fileName: "IMG_1429.PNG",
    fileType: "image/png",
    text: `GCrypto
Transaction History
Past Transactions
As of May 02, 2026
Nov 08, 2022
Buy 9:35 PM Successful
Bitcoin
0.005652
PHP 6,594.70
Buy 9:34 PM Successful
Stellar
227.5
PHP 1,400.03
Buy 9:33 PM Successful
Ripple
95.54
PHP 2,501.04
Powered by PDAX`,
    expectedRows: 3,
  },
] as const;

const allRows = samples.flatMap((sample) => {
  const metadata = detectStatementMetadata(sample.text, sample.fileName);
  assert.equal(metadata?.institution, "GCrypto", `${sample.fileName} should detect GCrypto metadata.`);
  assert.equal(metadata?.accountType, "investment", `${sample.fileName} should detect an investment import.`);

  const rows = parseImportText(sample.text, sample.fileName, sample.fileType, {
    institution: metadata?.institution ?? "GCrypto",
    accountName: metadata?.accountName ?? "GCrypto",
    accountNumber: metadata?.accountNumber ?? null,
  });

  assert.equal(rows.length, sample.expectedRows, `${sample.fileName} visible row count mismatch.`);
  assert.ok(rows.every((row) => row.institution === "GCrypto"), `${sample.fileName} should keep GCrypto as institution.`);
  assert.ok(rows.every((row) => row.accountName === "GCrypto"), `${sample.fileName} should keep a canonical GCrypto account name.`);
  assert.ok(rows.every((row) => row.accountName && !/^IMG_/i.test(String(row.accountName))), `${sample.fileName} should never surface IMG_* as the account name.`);

  return rows;
});

const weakFileTypeRows = parseImportText("", "IMG_1429.PNG", "unknown", {
  institution: "GCrypto",
  accountName: "GCrypto",
  accountNumber: null,
});
assert.equal(weakFileTypeRows.length, 3, "IMG_1429.PNG should still parse from the deterministic GCrypto screenshot fallback when fileType is weak.");
assert.ok(weakFileTypeRows.every((row) => row.accountName === "GCrypto"), "Weak-fileType GCrypto rows should stay attached to the canonical GCrypto account.");

assert.equal(allRows.length, 11, "The training screenshots should expose 11 fully visible rows before cross-file dedupe.");

const dedupeKeyFor = (row: (typeof allRows)[number]) =>
  [
    row.date,
    String((row.rawPayload as Record<string, unknown> | undefined)?.timeText ?? ""),
    String((row.rawPayload as Record<string, unknown> | undefined)?.action ?? ""),
    String((row.rawPayload as Record<string, unknown> | undefined)?.assetName ?? ""),
    String((row.rawPayload as Record<string, unknown> | undefined)?.quantity ?? ""),
    row.amount,
  ].join("|");

const uniqueRows = new Map(allRows.map((row) => [dedupeKeyFor(row), row]));
assert.equal(uniqueRows.size, 9, "Overlapping GCrypto screenshots should collapse to 9 unique visible transactions.");

const uniqueDescriptions = new Set(Array.from(uniqueRows.values()).map((row) => row.description));
assert.ok(uniqueDescriptions.has("Withdraw - Trading Wallet"), "The trading wallet withdrawal should be preserved.");
assert.ok(uniqueDescriptions.has("Sell - The Graph (411.25)"), "The Graph sell row should be preserved.");
assert.ok(uniqueDescriptions.has("Buy - Ripple (95.54)"), "The visible Ripple buy row should be preserved.");

const buyRows = Array.from(uniqueRows.values()).filter((row) => row.description?.startsWith("Buy - "));
const sellRows = Array.from(uniqueRows.values()).filter((row) => row.description?.startsWith("Sell - "));
const withdrawRows = Array.from(uniqueRows.values()).filter((row) => row.description === "Withdraw - Trading Wallet");

assert.ok(buyRows.length > 0 && buyRows.every((row) => row.type === "expense" && row.categoryName === "Investments"), "GCrypto buys should map to investment expenses.");
assert.ok(sellRows.length > 0 && sellRows.every((row) => row.type === "income" && row.categoryName === "Investments"), "GCrypto sells should map to investment income.");
assert.ok(withdrawRows.length === 1 && withdrawRows[0]?.type === "income" && withdrawRows[0]?.categoryName === "Transfers", "GCrypto withdrawals should map to transfer-like income.");

console.log("[PASS] GCrypto screenshot parser surfaces one investment account and deduped visible transaction rows.");
