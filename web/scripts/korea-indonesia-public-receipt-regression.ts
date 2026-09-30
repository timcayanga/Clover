import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseReceiptText, assessReceiptPreviewQuality } from "../lib/split-bill";
import { parseUnlocalizedReceiptText } from "../lib/unlocalized-receipt";
import { parseIndonesianAmount } from "../lib/indonesian-financial-text";

type Case = {
  id: string; country: string; file: string; family: string; source: string;
  sourceSha256: string; textSha256: string; transformation: string; limits: string[];
  expected: { printedTotal: string; extractedTotal: string | null; requiresReview: boolean; currency: string };
};
const root = fileURLToPath(new URL("./fixtures/korea-indonesia-public/", import.meta.url));
const manifest = JSON.parse(readFileSync(`${root}manifest.json`, "utf8")) as {
  sources: Array<{id: string; license: string; revision: string; attribution: string}>; cases: Case[];
};
assert.equal(manifest.cases.length, 33);
assert.equal(manifest.cases.filter(c => c.country === "KR").length, 7);
assert.equal(manifest.cases.filter(c => c.country === "ID").length, 26);
assert.equal(new Set(manifest.cases.map(c => c.id)).size, manifest.cases.length);
assert.equal(new Set(manifest.cases.map(c => c.family)).size, 32, "same-purchase views must stay in one family");
assert.deepEqual(readdirSync(root).filter(f => f.endsWith(".txt")).sort(), manifest.cases.map(c => c.file).sort());
for (const source of manifest.sources) {
  assert.equal(source.license, "CC-BY-4.0");
  assert.match(source.revision, /^[a-f0-9]{40}$/);
  assert.ok(source.attribution);
}
let correctTotals = 0, unresolvedTotals = 0;
for (const sample of manifest.cases) {
  assert.ok(manifest.sources.some(s => s.id === sample.source));
  assert.match(sample.sourceSha256, /^[a-f0-9]{64}$/);
  assert.ok(sample.transformation && sample.limits.length);
  const text = readFileSync(`${root}${sample.file}`, "utf8");
  assert.equal(createHash("sha256").update(text).digest("hex"), sample.textSha256, `${sample.id}: provenance changed`);
  const parsed = parseReceiptText(text);
  assert.equal(parsed.receiptText, text, `${sample.id}: preserve source text`);
  assert.equal(parsed.total, sample.expected.extractedTotal, `${sample.id}: total regression`);
  assert.equal(parsed.currency, sample.expected.currency, `${sample.id}: no currency inferred from dataset country`);
  assert.equal(parsed.requiresReview, true, `${sample.id}: incomplete excerpts require review`);
  assert.equal(assessReceiptPreviewQuality(parsed).reliableForFastPath, false, `${sample.id}: unsafe fast path`);
  assert.ok(parsed.confidence <= 45, `${sample.id}: uncertainty must lower confidence`);
  if (parsed.total === null) {
    unresolvedTotals++;
    assert.ok(sample.limits.some(reason => reason.startsWith("Known unresolved total:")));
  } else {
    correctTotals++;
    assert.equal(parsed.total, sample.expected.printedTotal, `${sample.id}: incorrect extracted amount`);
  }
  if (sample.country === "ID") {
    assert.equal(parsed.billDate, null, `${sample.id}: date is absent in released excerpt`);
    assert.equal(parsed.merchantName, null, `${sample.id}: do not turn first menu item into merchant`);
    assert.equal(parsed.items.length, 0, `${sample.id}: unsupported headers stay unresolved`);
  }
  if (sample.id === "kr-humyn-03") assert.equal(parsed.billDate, null, "do not guess century from a two-digit year");
  if (sample.id === "kr-humyn-10") assert.equal(parsed.total, "3120.00", "use payment amount, not pre-discount gross");
}
assert.equal(correctTotals, 31);
assert.equal(unresolvedTotals, 2);

// Clover-authored adversarial controls, separate from the public corpus.
for (const text of [
  "Meal 30,000\nTOTAL 30,000\nTOTAL 31,000",
  "Meal 30,000\nGRAND TOTAL 30,000\nGRAND TOTAL 31,000",
  "Meal 30,000\nTOTAL 30,000\nTOTAL unreadable",
  "Meal 30,000\nTOTAL 12,34,000",
  "Meal 30,000\nTOTAL 9007199254740992",
  "Meal 30,000\nTOTAL 0.250",
]) {
  const preview = parseUnlocalizedReceiptText(text);
  assert.ok(preview);
  assert.equal(preview.total, null, text);
  assert.equal(preview.requiresReview, true);
}
assert.equal(parseUnlocalizedReceiptText("Item 30,000\nTotal Item 5\nTotal Qty 16\nCash 35,000"), null);
assert.equal(parseUnlocalizedReceiptText("Item 30,000\nDuration 1000\nCash 35,000"), null);
for (const currency of ["PHP", "USD", "KRW", "EUR"]) {
  assert.equal(parseUnlocalizedReceiptText(`Currency: ${currency}\nItem 30,000\nTOTAL 30,000`), null);
}
const dated = parseReceiptText("2026-10-01\nMeal 30,000\nTOTAL 30,000\nCASH 50,000\nCHANGE 20,000");
assert.equal(dated.total, "30000.00");
assert.equal(dated.currency, "MIXED");
assert.equal(dated.requiresReview, true);
const explicitRupiah = parseReceiptText("Meal Rp 30.000\nTOTAL Rp 30.000\nCASH Rp 50.000");
assert.equal(explicitRupiah.total, "30000.00");
assert.equal(explicitRupiah.currency, "IDR");
assert.equal(explicitRupiah.requiresReview, true);
assert.equal(parseIndonesianAmount("30,000"), null, "do not relax global locale parsing to fit the receipt corpus");
console.log(`Public Korean/Indonesian receipt corpus passed: ${manifest.cases.length} cases, ${correctTotals} exact totals, ${unresolvedTotals} explicitly unresolved; all require review. Adversarial controls passed.`);
