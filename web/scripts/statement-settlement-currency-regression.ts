import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseImportText, parseStructuredTransactionCsv } from "../lib/import-parser";

const original = readFileSync(new URL("./fixtures/bpi-checkpoint/signed-payment.txt", import.meta.url), "utf8");
const rows = parseImportText(original, "BE20260329.pdf", "application/pdf");
assert.deepEqual(rows.map(row => [row.currency, row.amount, row.rawPayload?.originalCurrency, row.rawPayload?.originalAmount]), [
  ["PHP", "200.00", null, null], ["PHP", "50.25", "THB", 25],
  ["PHP", "50.25", "THB", 25], ["PHP", "24.75", "USD", 0.4],
]);
assert.deepEqual(rows.slice(1).map(row => row.rawPayload?.fxNote), ["Baht 25.00", "Baht 25.00", "U.S. Dollar 0.40"]);
for (const printed of ["PHP 24.75 USD 0.40", "24.75 PHP 0.40 USD", "USD 0.40 24.75 PHP"]) {
  const mixed = parseImportText(original.replace("U.S. Dollar 0.40 24.75", printed), "BE20260329.pdf", "application/pdf");
  assert.equal(mixed.at(-1)?.rawPayload?.settlementAmount, 24.75);
  assert.equal(mixed.at(-1)?.rawPayload?.originalAmount, 0.4);
  assert.equal(mixed.at(-1)?.rawPayload?.originalCurrency, "USD");
}
assert.throws(() => parseImportText(original.replace("U.S. Dollar 0.40 24.75", "USD 0.40 HKD 24.75"), "BE20260329.pdf", "application/pdf"), /could not match/);
assert.throws(() => parseImportText(original.replace("U.S. Dollar 0.40 24.75", "USD 0.40"), "BE20260329.pdf", "application/pdf"), /could not match/);

const header = "Date,Description,Original Amount (USD),Settlement Amount (PHP),Settlement Currency,Original Currency";
const csv = (data: string) => parseStructuredTransactionCsv(`${header}\n${data}`, "fx.csv", "text/csv");
const correct = csv("2026-03-24,Digital purchase,USD 0.40,PHP -24.75,PHP,USD")?.[0];
assert.equal(correct?.currency, "PHP");
assert.equal(correct?.amount, "24.75");
assert.equal(correct?.rawPayload?.originalCurrency, "USD");
assert.equal(correct?.rawPayload?.originalAmount, 0.4);
const conflict = csv("2026-03-24,Digital purchase,EUR 0.40,PHP -24.75,PHP,USD")?.[0];
assert.equal(conflict?.rawPayload?.reviewRequired, true);
const wrongSettlement = csv("2026-03-24,Digital purchase,USD 0.40,EUR -24.75,PHP,USD")?.[0];
assert.equal(wrongSettlement?.rawPayload?.reviewRequired, true);
console.log("Statement settlement and original currency regression passed.");
