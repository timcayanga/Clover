import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { KOREA_INDONESIA_CORPUS, getRegionalMerchantCategoryHint } from "../lib/korea-indonesia-corpus";
import { getContextCorpusEntries, getContextCorpusQualityReport, resolveTransactionContext } from "../lib/context-corpus";
import { getStrongMerchantCategoryHint, shouldTreatAsTransferDescription } from "../lib/merchant-category-hints";
import { guessCategoryName, parseImportText } from "../lib/import-parser";
import { classifyMerchant, normalizeMerchantText, guessCategoryFallback } from "../lib/data-engine";
import { applyDeterministicMerchantRescue } from "../lib/merchant-enrichment";
import { parseReceiptText } from "../lib/split-bill";
import { decodeSpreadsheetWorkbookBytes } from "../lib/spreadsheet-import.server";

const corpus = getContextCorpusEntries();
let aliasesTested = 0;
for (const entry of KOREA_INDONESIA_CORPUS) {
  assert.ok(new URL(entry.sourceUrl).protocol === "https:");
  assert.equal(entry.reviewedAt, "2026-10-01");
  assert.ok(entry.confidence >= 70 && entry.confidence < 90);
  const stored = corpus.find(item => item.id === entry.id)!;
  assert.ok(stored, entry.id);
  assert.deepEqual(stored.aliases, entry.aliases, "No source-backed alias silently lost during deduplication");
  for (const alias of entry.aliases) {
    const context = resolveTransactionContext({ merchantRaw: alias });
    assert.equal(context.countryCode, entry.countryCode, alias);
    assert.equal(context.purposeHint, entry.purposeHint, alias);
    assert.equal(context.categoryHint, entry.categoryHint, alias);
    assert.equal(context.transactionTypeHint, null, alias);
    assert.equal(context.currency, null, `${alias}: provider identity is not settlement currency`);
  }
  for (const alias of [...entry.aliases, ...entry.categoryAliases]) {
    aliasesTested++;
    assert.equal(getStrongMerchantCategoryHint(alias), entry.categoryHint, alias);
    assert.equal(guessCategoryName(alias, "expense"), entry.categoryHint, alias);
    assert.equal(guessCategoryFallback(alias, "expense"), entry.categoryHint, alias);
    assert.equal(shouldTreatAsTransferDescription(alias), false, alias);
    const classified = classifyMerchant({ merchantText: alias, type: "expense", merchantRules: [], trainingSignals: [] });
    assert.equal(classified.categoryName, entry.categoryHint, alias);
    assert.ok(classified.confidence < 100, alias);
    const rescued = applyDeterministicMerchantRescue({ merchantRaw: alias, categoryName: "Other", type: "income" });
    assert.equal(rescued.categoryName, entry.categoryHint, alias);
    assert.equal(rescued.type, "income", "A merchant refund must stay incoming");
  }
}
assert.equal(getContextCorpusQualityReport().valid, true);

for (const [description, expected] of [
  ["결제 이디야커피강남점", "Food & Dining"],
  ["（주）메가ＭＧＣ커피 강남점", "Food & Dining"],
  ["카드 홈플러스잠실점", "Groceries"],
  ["현대백화점판교점", "Shopping"],
  ["QRIS JANJI JIWA JAKARTA", "Food & Dining"],
  ["BIAYA ADMIN KOPI KENANGAN", "Financial"],
  ["TOP UP GOPAY KOPI KENANGAN", "Other"],
  ["CU 편의점", "Groceries"],
] as const) assert.equal(getStrongMerchantCategoryHint(description), expected, description);
assert.equal(resolveTransactionContext({ merchantRaw: "카드 이디야커피강남점", currency: "USD" }).currency, "USD");
assert.equal(resolveTransactionContext({ merchantRaw: "카드 이디야커피강남점" }).countryCode, "KR");
for (const text of ["CU", "KT", "CBN", "CGV", "WHOOSH", "RANCH MARKET", "FORE COFFEE", "PARIS BAGUETTE", "MUSINSA"]) {
  assert.equal(resolveTransactionContext({ merchantRaw: text }).countryCode, null, `${text}: no country from a short or global brand`);
}
for (const text of ["HOKBENWAREHOUSE", "SAYURBOXES", "MUSINSAKOREAUNKNOWN", "이디야커피회사", "홈플러스연구소", "메가커피할인정책", "BIZNET HOMES"]) {
  assert.equal(getRegionalMerchantCategoryHint(text), null, text);
}
assert.equal(getRegionalMerchantCategoryHint("SAYURBOX / BIZNET HOME"), "Other", "Conflicting merchants cannot depend on array order");
assert.equal(getStrongMerchantCategoryHint("홈플러스 / KOPI KENANGAN"), "Other");
assert.equal(guessCategoryFallback("홈플러스 / KOPI KENANGAN", "expense"), "Other");
assert.equal(getStrongMerchantCategoryHint("BIAYA ADMIN SAYURBOX / BIZNET HOME"), "Financial", "Explicit fee purpose still wins");
assert.equal(resolveTransactionContext({ merchantRaw: "홈플러스 / alfamidi indonesia" }).contextStatus, "ambiguous");
assert.equal(resolveTransactionContext({ merchantRaw: "asiana medical korea" }).countryCode, null);
assert.equal(resolveTransactionContext({ merchantRaw: "korea university tuition" }).categoryHint, "Education");
const conflictRows = parseImportText("Tanggal;Keterangan;Debet;Kredit;Mata uang\n01/10/2026;SAYURBOX / BIZNET HOME;25.000;0;IDR", "conflict.csv", "text/csv");
assert.equal(conflictRows[0].categoryName, "Other");
assert.equal(conflictRows[0].rawPayload?.reviewRequired, true);
assert.match(String(conflictRows[0].rawPayload?.reviewReason), /Multiple merchants/);
const conflictClassification = classifyMerchant({ merchantText: "SAYURBOX / BIZNET HOME", type: "expense", merchantRules: [], trainingSignals: [] });
assert.equal(conflictClassification.categoryName, "Other");
assert.ok(conflictClassification.confidence < 80);

const fixture = (name: string) => readFileSync(new URL(`./fixtures/korea-indonesia/${name}`, import.meta.url), "utf8");
const parse = (name: string) => parseImportText(fixture(name), name, "text/csv");
const expected = {
  "kr-ledger.csv": [
    ["4500.00", "Food & Dining"], ["2500.00", "Food & Dining"], ["32000.00", "Groceries"],
    ["18500.00", "Food & Dining"], ["16000.00", "Shopping"], ["1600.00", "Transport"],
    ["4000000.00", "Education"], ["4500.00", "Food & Dining"],
  ],
  "id-ledger.csv": [
    ["25000.00", "Food & Dining"], ["28000.50", "Food & Dining"], ["150000.00", "Groceries"],
    ["32500.00", "Groceries"], ["350000.00", "Bills & Utilities"], ["55000.00", "Entertainment"],
    ["200000.00", "Transport"], ["25000.00", "Food & Dining"],
  ],
};
for (const [name, values] of Object.entries(expected)) {
  const rows = parse(name);
  assert.equal(rows.length, values.length);
  rows.forEach((row, index) => {
    assert.equal(row.amount, values[index][0], `${name} row ${index}`);
    assert.equal(row.categoryName, values[index][1], `${name} row ${index}`);
    assert.equal(row.type, index === 7 ? "income" : "expense");
    assert.equal(row.currency, name.startsWith("kr") ? "KRW" : "IDR");
    assert.ok((row.rawPayload?.sourceCells as string[]).includes(row.description));
    assert.ok((row.categoryConfidence ?? 100) < 100);
  });
}
for (const country of ["kr", "id"]) {
  const rows = parse(`${country}-foreign.csv`);
  assert.deepEqual(rows.map(row => row.currency), ["USD", "USD"]);
  assert.equal(rows[0].categoryName, "Business", "Source category wins");
  assert.equal(rows[0].categoryConfidence, 100);
  assert.throws(() => parse(`${country}-unsafe.csv`), /safely/, "Contradictory debit/credit requires review");
  const holdings = parse(`${country}-holdings.csv`);
  assert.equal(holdings.length, 2);
  assert.ok(holdings.every(row => row.rawPayload?.kind === "account_snapshot_marker" && row.amount === "0.00"));
  assert.deepEqual(holdings.map(row => row.rawPayload?.quantity), country === "kr" ? [42.96436, 20.12345] : [42.96436, 0.125]);
  assert.deepEqual(holdings.map(row => row.rawPayload?.marketValue), country === "kr" ? [230000, 120000] : [1250000.5, 125.5]);
  const receipt = parseReceiptText(fixture(`${country}-receipt.txt`));
  assert.equal(receipt.currency, country === "kr" ? "KRW" : "IDR");
  assert.equal(receipt.total, country === "kr" ? "9000.00" : "50000.00");
  assert.equal(receipt.items.length, 1, "Payment and change are not extra purchases");
}

for (const merchantText of ["이디야커피강남점", "QRIS KOPI KENANGAN"]) {
  const classified = classifyMerchant({ merchantText, type: "expense", merchantRules: [{
    id: "synthetic-regional-rule", merchantKey: normalizeMerchantText(merchantText), merchantPattern: merchantText,
    normalizedName: "Team refreshments", categoryId: "synthetic-business", categoryName: "Business",
    source: "manual", confidence: 99, timesConfirmed: 3,
  }], trainingSignals: [] });
  assert.equal(classified.categoryName, "Business");
  assert.equal(classified.categorySource, "manual");
}
async function checkWorkbooks() {
  for (const country of ["kr", "id"]) {
    const bytes = readFileSync(new URL(`./fixtures/korea-indonesia/${country}-workbook.xlsx`, import.meta.url));
    const text = await decodeSpreadsheetWorkbookBytes(bytes);
    const rows = parseImportText(text, `${country}-workbook.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    assert.equal(rows.length, 10, "The ledger and holdings sheets must both survive workbook decoding");
    const investments = rows.filter(row => row.rawPayload?.kind === "account_snapshot_marker");
    assert.deepEqual(investments.map(row => row.rawPayload?.quantity), country === "kr" ? [42.96436, 20.12345] : [42.96436, 0.125]);
    assert.deepEqual(investments.map(row => row.rawPayload?.marketValue), country === "kr" ? [230000, 120000] : [1250000.5, 125.5]);
    const ledger = rows.filter(row => row.rawPayload?.kind !== "account_snapshot_marker");
    assert.equal(ledger[0].accountNumber, country === "kr" ? "00001234" : "00005678");
    assert.deepEqual(ledger.map(row => row.categoryName), expected[`${country}-ledger.csv` as keyof typeof expected].map(row => row[1]));
  }
  console.log(`Regional corpus passed: ${KOREA_INDONESIA_CORPUS.length} sourced providers, ${aliasesTested} aliases, 12 synthetic document files, refunds, collisions, source currency and confirmed categories.`);
}
checkWorkbooks().catch(error => { console.error(error); process.exitCode = 1; });
