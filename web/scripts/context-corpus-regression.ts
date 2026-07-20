import assert from "node:assert/strict";
import { CONTEXT_CORPUS_VERSION, deriveTravelEpisodes, getContextCorpusCoverageReport, getContextCorpusEntries, getContextCorpusQualityReport, parseRegionalAmountValue, parseRegionalDateValue, resolveTransactionContext } from "@/lib/context-corpus";

assert.ok(CONTEXT_CORPUS_VERSION);
assert.ok(getContextCorpusEntries().length >= 1000);
assert.ok(getContextCorpusQualityReport().profileCount >= 25);
assert.equal(getContextCorpusQualityReport().valid, true);
const coverage = getContextCorpusCoverageReport();
assert.equal(coverage.corpusVersion, CONTEXT_CORPUS_VERSION);
assert.ok(coverage.canonicalEntryCount >= 100);
assert.ok(coverage.descriptorVariantEntryCount > 1000);
assert.ok(Object.keys(coverage.countryCounts).length >= 25);
assert.ok((coverage.canonicalCountryCounts.PH ?? 0) > 0);
assert.ok(coverage.localizedAliasCount >= 20);
assert.ok((coverage.aliasScriptCounts.japanese ?? 0) > 0);
assert.ok((coverage.aliasScriptCounts.hangul ?? 0) > 0);
assert.ok((coverage.aliasScriptCounts.han ?? 0) > 0);
assert.ok((coverage.countryPurposeCounts.PH?.utilities ?? 0) > 0);
assert.ok((coverage.countryPurposeCounts.SG?.healthcare ?? 0) > 0);
assert.ok((coverage.countryPurposeCounts.AE?.utilities ?? 0) > 0);

const gcash = resolveTransactionContext({ merchantRaw: "GCASH CASH IN", currency: "PHP" });
assert.equal(gcash.countryCode, "PH");
assert.equal(gcash.paymentRail, "gcash");
assert.equal(gcash.transactionTypeHint, "transfer");
assert.equal(gcash.primaryLocale, "en-PH");
assert.equal(gcash.dateOrder, "mdy");
assert.equal(gcash.decimalSeparator, ".");

const compactGcash = resolveTransactionContext({ merchantRaw: "GCASHCASHIN", currency: "PHP" });
assert.equal(compactGcash.paymentRail, "gcash");
assert.equal(compactGcash.coverageTier, "canonical");
assert.equal(compactGcash.matchedAliases.includes("gcash cash in"), true);
assert.equal(compactGcash.evidence.some((value) => value.includes(":compact")), true);

const descriptorVariant = resolveTransactionContext({ merchantRaw: "BANK OF COMMERCE PHILIPPINES PAYMENT", currency: "PHP" });
assert.equal(descriptorVariant.coverageTier, "descriptor_variant");
assert.equal(descriptorVariant.matchedAliases.includes("bank of commerce philippines payment"), true);

const indonesia = resolveTransactionContext({ institution: "Bank Indonesia", description: "QRIS payment", currency: "IDR" });
assert.equal(indonesia.countryCode, "ID");
assert.equal(indonesia.primaryLocale, "id-ID");
assert.equal(indonesia.decimalSeparator, ",");
assert.equal(indonesia.groupingSeparator, ".");
assert.equal(indonesia.legalEntitySuffixes.includes("pt"), true);

const paynow = resolveTransactionContext({ description: "PAYNOW TRANSFER", currency: "SGD" });
assert.equal(paynow.countryCode, "SG");
assert.equal(paynow.categoryHint, "Transfers");

const travel = resolveTransactionContext({ merchantRaw: "SUICA JR EAST", currency: "JPY" });
assert.equal(travel.countryCode, "JP");
assert.equal(travel.categoryHint, "Transport");

const unknown = resolveTransactionContext({ merchantRaw: "A merchant not in the corpus", currency: "USD" });
assert.equal(unknown.countryCode, null);
assert.equal(unknown.currency, "USD");
assert.equal(unknown.confidence, 55);
assert.equal(unknown.contextStatus, "unmatched");
assert.equal(unknown.primaryLocale, null);

const fx = resolveTransactionContext({ description: "Foreign transaction fee", currency: "PHP" });
assert.equal(fx.foreignCurrencyLikely, true);
assert.equal(fx.categoryHint, "Financial");
assert.equal(fx.signals.some((signal) => signal.kind === "fee"), true);

const ambiguous = resolveTransactionContext({ description: "FAST PAYMENTS / FASTER PAYMENTS", currency: "SGD" });
assert.equal(ambiguous.contextStatus, "ambiguous");
assert.equal(ambiguous.countryCode, null);
assert.equal(ambiguous.paymentRail, null);

const lodging = resolveTransactionContext({ merchantRaw: "HOTEL RESERVATION", currency: "JPY" });
assert.equal(lodging.travelLikely, true);
assert.equal(lodging.categoryHint, "Travel & Lifestyle");
assert.equal(lodging.counterpartyType, "travel_provider");

const salary = resolveTransactionContext({ description: "SALARY CREDIT", currency: "PHP" });
assert.equal(salary.categoryHint, "Income");
assert.equal(salary.transactionTypeHint, "income");
assert.equal(salary.counterpartyType, "employer");
assert.equal(salary.purposeHint, "salary");

const tax = resolveTransactionContext({ description: "WITHHOLDING TAX", currency: "PHP" });
assert.equal(tax.counterpartyType, "government");
assert.equal(tax.purposeHint, "tax");

const remittance = resolveTransactionContext({ merchantRaw: "WESTERN UNION", currency: "PHP" });
assert.equal(remittance.counterpartyType, "remittance_provider");
assert.equal(remittance.purposeHint, "remittance");

const expandedFixtures = [
  { input: { description: "DUITNOW QR PAYMENT", currency: "MYR" }, countryCode: "MY", paymentRail: "duitnow", purposeHint: null },
  { input: { description: "QRIS MERCHANT PAYMENT", currency: "IDR" }, countryCode: "ID", paymentRail: "qris_bi_fast", purposeHint: null },
  { input: { merchantRaw: "T MONEY TOP UP", currency: "KRW" }, countryCode: "KR", paymentRail: "korea_transit", purposeHint: "transport" },
  { input: { merchantRaw: "AL ANSARI EXCHANGE", currency: "AED" }, countryCode: "AE", paymentRail: "remittance", purposeHint: "remittance" },
  { input: { merchantRaw: "MERALCO", currency: "PHP" }, countryCode: "PH", purposeHint: "utilities" },
  { input: { merchantRaw: "WOOLWORTHS AUSTRALIA", currency: "AUD" }, countryCode: "AU", purposeHint: "groceries" },
  { input: { description: "INTERAC REQUEST MONEY", currency: "CAD" }, countryCode: "CA", paymentRail: "canada_transfer", purposeHint: null },
  { input: { description: "EFTPOS NEW ZEALAND", currency: "NZD" }, countryCode: "NZ", paymentRail: "new_zealand_bank_rail", purposeHint: null },
  { input: { description: "PIX BRAZIL", currency: "BRL" }, countryCode: "BR", paymentRail: "brazil_pix", purposeHint: null },
  { input: { description: "MADA SAUDI", currency: "SAR" }, countryCode: null, paymentRail: "gulf_domestic_rail", purposeHint: null },
  { input: { description: "TWINT SWITZERLAND", currency: "CHF" }, countryCode: "CH", paymentRail: "switzerland_bank_rail", purposeHint: null },
  { input: { description: "BIZUM SPAIN", currency: "EUR" }, countryCode: "ES", paymentRail: "spain_bank_rail", purposeHint: null },
  { input: { description: "BKASH BANGLADESH", currency: "BDT" }, countryCode: "BD", paymentRail: "bangladesh_wallet", purposeHint: null },
  { input: { description: "MPESA KENYA", currency: "KES" }, countryCode: "KE", paymentRail: "kenya_wallet", purposeHint: null },
  { input: { description: "VIPPS NORWAY", currency: "NOK" }, countryCode: "NO", paymentRail: "norway_bank_rail", purposeHint: null },
  { input: { description: "MPAY MACAU", currency: "MOP" }, countryCode: "MO", paymentRail: "macau_wallet", purposeHint: null },
  { input: { description: "MOBILE MONEY GHANA", currency: "GHS" }, countryCode: "GH", paymentRail: "ghana_wallet", purposeHint: null },
  { input: { merchantRaw: "RAFFLES MEDICAL SINGAPORE", currency: "SGD" }, countryCode: "SG", paymentRail: null, purposeHint: "healthcare" },
  { input: { merchantRaw: "DEWA DUBAI", currency: "AED" }, countryCode: "AE", paymentRail: null, purposeHint: "utilities" },
  { input: { merchantRaw: "TELSTRA BUSINESS AUSTRALIA", currency: "AUD" }, countryCode: "AU", paymentRail: null, purposeHint: "utilities" },
  { input: { description: "ペイペイ", currency: "JPY" }, countryCode: "JP", paymentRail: "japan_wallet", purposeHint: null },
  { input: { description: "카카오페이", currency: "KRW" }, countryCode: "KR", paymentRail: "korea_wallet", purposeHint: null },
  { input: { description: "八達通", currency: "HKD" }, countryCode: "HK", paymentRail: "hong_kong_fps", purposeHint: null },
  { input: { description: "支付宝", currency: "CNY" }, countryCode: "CN", paymentRail: "china_wallet", purposeHint: null },
  { input: { description: "พร้อมเพย์", currency: "THB" }, countryCode: "TH", paymentRail: "promptpay", purposeHint: null },
  { input: { description: "PIX QR CODE BRAZIL", currency: "BRL" }, countryCode: "BR", paymentRail: "brazil_pix", purposeHint: null },
  { input: { description: "SPEI TRANSFERENCIA", currency: "MXN" }, countryCode: "MX", paymentRail: "mexico_spei", purposeHint: null },
  { input: { description: "CAPITEC PAY", currency: "ZAR" }, countryCode: "ZA", paymentRail: "south_africa_payshap", purposeHint: null },
  { input: { merchantRaw: "CFE MEXICO", currency: "MXN" }, countryCode: "MX", paymentRail: null, purposeHint: "utilities" },
  { input: { merchantRaw: "KENYA POWER", currency: "KES" }, countryCode: "KE", paymentRail: null, purposeHint: "utilities" },
  { input: { merchantRaw: "VECTOR AUCKLAND ELECTRICITY", currency: "NZD" }, countryCode: "NZ", paymentRail: null, purposeHint: "utilities" },
  { input: { merchantRaw: "EDC CAMBODIA", currency: "KHR" }, countryCode: "KH", paymentRail: null, purposeHint: "utilities" },
  { input: { merchantRaw: "CHINA MOBILE", currency: "CNY" }, countryCode: "CN", paymentRail: null, purposeHint: "utilities" },
  { input: { merchantRaw: "PHONEPE INDIA", currency: "INR" }, countryCode: "IN", paymentRail: "india_wallet", purposeHint: null },
  { input: { merchantRaw: "HUNGERSTATION SAUDI", currency: "SAR" }, countryCode: "SA", paymentRail: null, purposeHint: "retail" },
  { input: { merchantRaw: "KAISER PERMANENTE", currency: "USD" }, countryCode: "US", paymentRail: null, purposeHint: "healthcare" },
  { input: { merchantRaw: "GOTRADE PHILIPPINES", currency: "PHP" }, countryCode: "PH", paymentRail: null, purposeHint: "investment" },
  { input: { merchantRaw: "Fidelity Investments", currency: "USD" }, countryCode: "US", paymentRail: null, purposeHint: "investment" },
  { input: { merchantRaw: "Rent Payment Canada", currency: "CAD" }, countryCode: "CA", paymentRail: null, purposeHint: "housing" },
  { input: { merchantRaw: "HUNGERSTATION SAUDI", currency: "SAR" }, countryCode: "SA", paymentRail: null, purposeHint: "retail" },
  { input: { merchantRaw: "HAMAD MEDICAL CORPORATION", currency: "QAR" }, countryCode: "QA", paymentRail: null, purposeHint: "healthcare" },
  { input: { merchantRaw: "BPJS KESEHATAN", currency: "IDR" }, countryCode: "ID", paymentRail: null, purposeHint: "healthcare" },
  { input: { merchantRaw: "EVN NATIONAL VIETNAM", currency: "VND" }, countryCode: "VN", paymentRail: null, purposeHint: "utilities" },
  { input: { merchantRaw: "BUMRUNGRAD HOSPITAL", currency: "THB" }, countryCode: "TH", paymentRail: null, purposeHint: "healthcare" },
  { input: { merchantRaw: "CHARITE BERLIN", currency: "EUR" }, countryCode: "DE", paymentRail: null, purposeHint: "healthcare" },
  { input: { merchantRaw: "RED CROSS PHILIPPINES", currency: "PHP" }, countryCode: "PH", paymentRail: null, purposeHint: "charity" },
] as const;
for (const fixture of expandedFixtures) {
  const context = resolveTransactionContext(fixture.input);
  assert.equal(context.countryCode, fixture.countryCode);
  if (fixture.paymentRail) assert.equal(context.paymentRail, fixture.paymentRail);
  assert.equal(context.purposeHint, fixture.purposeHint);
}

const falsePositive = resolveTransactionContext({ merchantRaw: "VISA CAFE", currency: "PHP" });
assert.equal(falsePositive.paymentRail, null);
assert.equal(falsePositive.institutionType, "card_network");

assert.equal(parseRegionalDateValue("31/12/2025", "ID")?.toISOString().slice(0, 10), "2025-12-31");
assert.equal(parseRegionalDateValue("12/31/2025", "US")?.toISOString().slice(0, 10), "2025-12-31");
assert.equal(parseRegionalAmountValue("1.234,56", "ID"), 1234.56);
assert.equal(parseRegionalAmountValue("1,234.56", "PH"), 1234.56);
assert.equal(parseRegionalAmountValue("1'234.56", "CH"), 1234.56);
assert.equal(parseRegionalAmountValue("(1.234,56)", "ID"), -1234.56);

const travelEpisodes = deriveTravelEpisodes([
  { date: "2026-01-10", merchantRaw: "HOTEL TOKYO", currency: "JPY" },
  { date: "2026-01-12", merchantRaw: "SUICA JR EAST", currency: "JPY" },
  { date: "2026-02-20", merchantRaw: "HOTEL TOKYO", currency: "JPY" },
]);
assert.equal(travelEpisodes.size, 3);
assert.equal(travelEpisodes.get(0)?.episodeId, travelEpisodes.get(1)?.episodeId);
assert.notEqual(travelEpisodes.get(0)?.episodeId, travelEpisodes.get(2)?.episodeId);
assert.equal(travelEpisodes.get(0)?.countries.includes("JP"), true);

console.log(`context corpus regression passed (${CONTEXT_CORPUS_VERSION})`);
