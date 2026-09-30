import assert from "node:assert/strict";
import { parseImportText, guessCategoryName } from "../lib/import-parser";
import { classifyMerchant, normalizeMerchantText, guessCategoryFallback } from "../lib/data-engine";
import { applyDeterministicMerchantRescue, hasConfirmedMerchantCategoryRule } from "../lib/merchant-enrichment";
import { summarizeMerchantText } from "../lib/merchant-labels";
import { getStrongMerchantCategoryHint, shouldTreatAsTransferDescription } from "../lib/merchant-category-hints";
import { resolveTransactionContext } from "../lib/context-corpus";

const examples = [
  ["GOFOOD INDONESIA", "Food & Dining"],
  ["SHOPEEFOOD WARUNG MAKAN CONTOH", "Food & Dining"],
  ["QRIS WARUNG MAKAN SEDERHANA", "Food & Dining"],
  ["QRIS KEDAI KOPI CONTOH", "Food & Dining"],
  ["INDOMARET JAKARTA", "Groceries"],
  ["ALFAMART INDONESIA", "Groceries"],
  ["SUPER INDO", "Groceries"],
  ["GORIDE INDONESIA", "Transport"],
  ["PERTAMINA DEX", "Transport"],
  ["MRT JAKARTA", "Transport"],
  ["RUANGGURU INDONESIA", "Education"],
  ["PEMBAYARAN SPP", "Education"],
  ["APOTEK CONTOH", "Health & Wellness"],
  ["PEMBAYARAN PLN LISTRIK", "Bills & Utilities"],
  ["TAGIHAN PDAM", "Bills & Utilities"],
  ["BIAYA ADMIN BI-FAST", "Financial"],
  ["BIAYA ADM BCA", "Financial"],
  ["BUNGA PINJAMAN", "Financial"],
  ["BIAYA ADMIN GOFOOD", "Financial"],
  ["GOFOOD WARUNG CONTOH BIAYA LAYANAN TERMASUK", "Food & Dining"],
  ["BIAYA TARIK TUNAI ATM", "Financial"],
  ["PAJAK BUNGA TABUNGAN", "Financial"],
  ["TARIK TUNAI ATM BCA", "Cash & ATM"],
  ["TRAVELOKA INDONESIA", "Travel & Lifestyle"],
  ["TOKOPEDIA", "Shopping"],
] as const;

const csv = (description: string, credit = false, extra = "") =>
  `Mata uang;IDR\nTanggal;Keterangan;Debet;Kredit${extra ? ";Kategori" : ""}\n01/10/2026;${description};${credit ? "0;125.000,50" : "125.000,50;0"}${extra ? `;${extra}` : ""}`;
const parse = (text: string) => parseImportText(text, "mutasi-uji.csv", "text/csv")[0]!;
for (const [description, category] of examples) {
  assert.equal(guessCategoryName(description, "expense"), category, description);
  assert.equal(guessCategoryFallback(description, "expense"), category, description);
  const row = parse(csv(description));
  assert.equal(row.categoryName, category, description);
  assert.equal(row.amount, "125000.50");
  assert.equal(row.currency, "IDR");
  assert.equal(row.type, "expense");
  assert.equal(row.description, description);
  assert.ok((row.rawPayload?.sourceCells as string[]).includes(description));
  const rescued = applyDeterministicMerchantRescue({ merchantRaw: description, categoryName: "Other", type: "expense" });
  assert.equal(rescued.categoryName, category, description);
  assert.equal(rescued.type, "expense");
}

for (const description of ["QRIS TOKO CONTOH", "BI-FAST BUDI SANTOSO", "ISI SALDO GOPAY", "TOP UP SHOPEEPAY", "OVO INDONESIA", "DANA WALLET", "SETOR TUNAI", "XENDIT", "PEMBAYARAN CONTOH"]) {
  assert.equal(shouldTreatAsTransferDescription(description), false, description);
  const row = parse(csv(description));
  assert.equal(row.categoryName, "Other", description);
  assert.equal(row.type, "expense"); // debit stays debit until the user confirms ownership/category
  assert.equal(row.rawPayload?.reviewRequired, true, description);
  assert.match(String(row.rawPayload?.reviewReason), /own accounts/);
  assert.ok((row.confidence ?? 100) < 80);
  assert.ok((row.categoryConfidence ?? 100) < 80);
  const classified = classifyMerchant({ merchantText: description, type: "expense", merchantRules: [], trainingSignals: [] });
  assert.equal(classified.categoryName, "Other", `${description} remains uncertain after enrichment`);
  assert.ok(classified.confidence < 80);
}
for (const description of ["GAJI SEPTEMBER", "BUNGA TABUNGAN", "GAJI TOKOPEDIA"]) {
  const row = parse(csv(description, true));
  assert.equal(row.categoryName, "Income");
  assert.equal(row.type, "income");
  assert.equal(parse(csv(description)).type, "expense", "A salary word cannot reverse a printed debit");
  assert.equal(applyDeterministicMerchantRescue({merchantRaw: description, type: "income"}).categoryName, "Income");
  assert.equal(classifyMerchant({merchantText: description, type: "income", merchantRules: [], trainingSignals: []}).categoryName, "Income");
}

const refund = applyDeterministicMerchantRescue({ merchantRaw: "REFUND SHOPEEFOOD INDONESIA", categoryName: "Other", type: "income" });
assert.equal(refund.categoryName, "Food & Dining");
assert.equal(refund.type, "income");
assert.equal(parse(csv("GOFOOD INDONESIA", false, "Business")).categoryConfidence, 100);
assert.equal(parse(csv("GOFOOD INDONESIA", false, "Business")).categoryName, "Business");
assert.equal(applyDeterministicMerchantRescue({ merchantRaw: "GOFOOD", categoryName: "Transfers", preserveCategory: true, type: "transfer" }).categoryName, "Transfers");

assert.equal(summarizeMerchantText("SHOPEEFOOD WARUNG CONTOH"), "ShopeeFood Warung Contoh");
assert.equal(summarizeMerchantText("GOFOOD WARUNG CONTOH"), "GoFood Warung Contoh");
assert.notEqual(summarizeMerchantText("GOFOOD WARUNG SATU"), summarizeMerchantText("GOFOOD WARUNG DUA"));
assert.equal(getStrongMerchantCategoryHint("CAR WASH PLN 125.00"), null, "Polish currency is not an Indonesian utility");
assert.equal(getStrongMerchantCategoryHint("TOKOPEDIAWAREHOUSE SOFTWARE"), null, "Provider aliases require word boundaries");
assert.equal(parse(csv("GOFOOD INDONESIA").replace("Mata uang;IDR", "Mata uang;USD").replaceAll("125.000,50", "125.50")).currency, "USD");

for (const [description, category, purpose] of [
  ["gofood indonesia", "Food & Dining", "food_delivery"],
  ["shopeefood indonesia", "Food & Dining", "food_delivery"],
  ["ruangguru indonesia", "Education", "education"],
  ["pertamina dex", "Transport", "fuel"],
  ["indomaret", "Groceries", "groceries"],
  ["superindo indonesia", "Groceries", "groceries"],
  ["blibli indonesia", "Shopping", "ecommerce"],
  ["mrt jakarta", "Transport", "transport"],
] as const) {
  const context = resolveTransactionContext({ merchantRaw: description, currency: "IDR" });
  assert.equal(context.categoryHint, category, description);
  assert.equal(context.purposeHint, purpose, description);
  assert.equal(context.transactionTypeHint, null);
  assert.ok(context.fieldConfidence.categoryHint < 100);
}
for (const merchantRaw of ["seabank indonesia", "blu by bca"]) {
  assert.equal(resolveTransactionContext({ merchantRaw, currency: "IDR" }).institutionType, "bank");
}

const manual = classifyMerchant({
  merchantText: "GOFOOD WARUNG CONTOH", type: "expense", merchantRules: [{
    id: "synthetic-rule", merchantKey: normalizeMerchantText("GOFOOD WARUNG CONTOH"),
    merchantPattern: "GOFOOD WARUNG CONTOH", normalizedName: "Team meals", categoryId: "synthetic-business",
    categoryName: "Business", source: "manual", confidence: 99, timesConfirmed: 3,
  }], trainingSignals: [],
});
assert.equal(manual.categoryName, "Business", "User-confirmed merchant rules outrank regional suggestions");
assert.equal(manual.normalizedName, "Team meals");
assert.equal(manual.categorySource, "manual");
const learnedTransfer = { classification: { categorySource: "manual", categoryReason: "rule-exact" } };
assert.equal(hasConfirmedMerchantCategoryRule(learnedTransfer), true);
assert.equal(hasConfirmedMerchantCategoryRule({ classification: { categorySource: "deterministic_heuristic", categoryReason: "heuristic-rule" } }), false);
assert.equal(applyDeterministicMerchantRescue({ merchantRaw: "GOFOOD INDONESIA", categoryName: "Transfers", type: "transfer", preserveCategory: hasConfirmedMerchantCategoryRule(learnedTransfer) }).categoryName, "Transfers");
console.log(`Indonesian enrichment passed: ${examples.length} spending descriptors, ambiguous payments, source preservation, corpus corrections and confirmed learning.`);
