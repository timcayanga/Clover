import assert from "node:assert/strict";
import { parseImportText } from "@/lib/import-parser";

// OCR transcript captured from IMG_1365.PNG. The paired Send Money entries
// share a date and amount but differ by visible time and direction; both are
// separate financial records and must survive mobile-parser routing.
const image1365Text = `
10:08
Transaction History
As of May 2, 2026
Apr 17, 2026
2:45 PM
Send Money                       +15,000.00
12:49 PM
Send Money                       -15,000.00
Apr 12, 2026
12:35 PM
Pay via Scanned QR                    -50.00
Apr 9, 2026
4:56 PM
Pay via Scanned QR                    -50.00
Apr 3, 2026
8:13 PM
Pay via Scanned QR                  -230.48
Mar 31, 2026
3:00 PM
DOTr-MRT3                                    +4.00
2:45 PM
DOTr-MRT3                                   -14.00
`.trim();

const rows = parseImportText(image1365Text, "IMG_1365.PNG", "image/png");

assert.equal(rows.length, 7, `Expected 7 visible GCash transactions, received ${rows.length}.`);
assert.ok(
  rows.every((row) => row.institution === "GCash" && row.accountName === "GCash"),
  "GCash mobile-history rows must stay on the canonical GCash wallet."
);

const sendMoneyRows = rows.filter((row) => /^send money$/i.test(String(row.description ?? row.merchantRaw ?? "")));
assert.equal(sendMoneyRows.length, 2, "Both visible Send Money records must be retained.");
assert.deepEqual(
  sendMoneyRows.map((row) => ({
    amount: row.amount,
    type: row.type,
    categoryName: row.categoryName,
    timeText: (row.rawPayload as Record<string, unknown>).timeText,
  })),
  [
    { amount: "15000.00", type: "income", categoryName: "Transfers", timeText: "2:45 PM" },
    { amount: "15000.00", type: "expense", categoryName: "Transfers", timeText: "12:49 PM" },
  ],
  "Opposite-direction Send Money entries must retain their signed direction and time."
);

const uniqueKeys = new Set(
  rows.map(
    (row) =>
      `${row.date}|${row.amount}|${row.type}|${String((row.rawPayload as Record<string, unknown>).timeText ?? "")}|${row.description}`
  )
);
assert.equal(uniqueKeys.size, 7, "The mobile parser must not duplicate split screenshot rows.");

console.log("[PASS] GCash mobile screenshot parser retains each visible row exactly once.");
