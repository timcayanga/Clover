import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseReceiptText, assessReceiptPreviewQuality } from "../lib/split-bill";
import { parseUnlocalizedReceiptText } from "../lib/unlocalized-receipt";
import { parseIndonesianAmount } from "../lib/indonesian-financial-text";
import { shouldRetryImageOcrBestEffort, pickBestReceiptTextCandidate } from "../lib/import-file-text.server";

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
assert.equal(correctTotals, 33);
assert.equal(unresolvedTotals, 0);

// Final totals may include tax on an earlier TOTAL, but an unreadable or
// contradictory final amount must never be replaced by the smaller subtotal.
for (const text of [
  "TOTAL 43.636\nGRAND TOTAL 48.000\nGRAND TOTAL 49.000\nTUNAI 50.000",
  "TOTAL 43.636\nGRAND TOTAL unreadable\nTUNAI 50.000",
  "TOTAL 43.636\nGRAND TOTAL 48.000\nGRAND TOTAL unreadable\nTUNAI 50.000",
  "TOTAL 43.636\nGRAND TOTAL 48.000\nTUNAI 50.000\nStatus dibatalkan",
  "TOTAL 43.636\nGRAND TOTAL 48.000\nTUNAI 50.000\nStatus refund",
]) {
  const preview = parseReceiptText(text);
  assert.equal(preview.total, null, text);
  assert.equal(preview.requiresReview, true);
}
for (const [text, expected] of [
  ["TOTAL 10.000\nTAX 1.000\nGRAND TOTAL 11.000\nTUNAI 20.000\nKEMBALI 9.000", "11000.00"],
  ["10,000 TOTAL\n1,000 TAX\n11,000 GRAND TOTAL\n20,000 TUNAI\n9,000 KEMBALI", "11000.00"],
] as const) {
  const preview = parseReceiptText(text);
  assert.equal(preview.total, expected);
  assert.equal(preview.currency, "MIXED");
  assert.equal(preview.requiresReview, true);
  assert.equal(preview.items.length, 0);
}

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

// A damaged photo may lose every locale hint, even while resembling a receipt.
// An apparently clean subtotal/item sum must not supply a missing currency.
const unknownCurrency = parseReceiptText("Sample Cafe\n2026-10-01\nCoffee 25.00\nTOTAL 25.00\nCASH 25.00");
assert.equal(unknownCurrency.currency, "MIXED");
assert.equal(unknownCurrency.requiresReview, true);
assert.ok(unknownCurrency.confidence <= 45);
assert.equal(assessReceiptPreviewQuality(unknownCurrency).reliableForFastPath, false);
assert.equal(assessReceiptPreviewQuality({ ...unknownCurrency, requiresReview: false }).reliableForFastPath, false);
assert.equal(shouldRetryImageOcrBestEffort({ firstPassText: unknownCurrency.receiptText, importMode: "receipt" }), true);
const explicitPeso = parseReceiptText("Sample Cafe\n2026-10-01\nCoffee PHP 25.00\nTOTAL PHP 25.00\nCASH PHP 25.00");
assert.equal(explicitPeso.currency, "PHP", "retain explicit Philippine currency evidence");
const croppedMenu = "Sample Cafe\n2026-10-01\nCoffee PHP 25.00\nTea PHP 30.00\nCake PHP 40.00\nCashier";
const fullSummary = "TOTAL 95.000\nGRAND TOTAL 104.500\nTUNAI 110.000\nKEMBALI 5.500";
assert.equal(pickBestReceiptTextCandidate([{ label: "crop", text: croppedMenu }, { label: "full", text: fullSummary }], "receipt"), fullSummary,
  "inferred menu sums must not outrank a printed final total");
for (const damagedTotal of ["합계 읽을수없음", "결제금액 9,00원", "합계 10000원"]) {
  const korean = parseReceiptText(`영수증\n상호: 테스트카페\n거래일시: 2026-10-01\n통화: KRW\n상품명 수량 금액\n커피 2 9,000\n합계 9,000원\n${damagedTotal}`);
  assert.equal(korean.total, null, "do not discard contradictory or unreadable Korean totals");
  assert.equal(korean.requiresReview, true);
  assert.equal(assessReceiptPreviewQuality(korean).reliableForFastPath, false);
}
for (const [table, total] of [
  ["합계 9,000원\n과세금액 부가세(VAT) 합계금액\n합계 8,000원 1,000원 9,000원", "9000.00"],
  ["합계 9,000원\n과세금액 부가세(VAT) 합계금액\n합계 8,000원 1,000원 10,000원", null],
  ["합계 9,000원\n과세금액 부가세(VAT) 합계금액\n합계 9,000원 1,000원 10,000원", null],
] as const) {
  assert.equal(parseReceiptText(`영수증\n통화: KRW\n${table}`).total, total);
}
console.log(`Public Korean/Indonesian receipt corpus passed: ${manifest.cases.length} cases, ${correctTotals} exact totals, ${unresolvedTotals} explicitly unresolved; all require review. Adversarial controls passed.`);
