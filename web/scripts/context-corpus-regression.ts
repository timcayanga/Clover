import assert from "node:assert/strict";
import { CONTEXT_CORPUS_VERSION, deriveTravelEpisodes, getContextCorpusCoverageReport, getContextCorpusEntries, getContextCorpusQualityReport, parseRegionalAmountValue, parseRegionalDateValue, resolveTransactionContext } from "@/lib/context-corpus";
import { WORLD_EVERYDAY_GAP_CONTEXT_ENTRIES } from "@/lib/world-context-corpus-everyday-gaps";
import { WORLD_ESSENTIAL_GAP_CONTEXT_ENTRIES } from "@/lib/world-context-corpus-essential-gaps";
import { WORLD_ESSENTIAL_SERVICE_CONTEXT_ENTRIES } from "@/lib/world-context-corpus-essential-services";
import { WORLD_FISCAL_CONTEXT_ENTRIES } from "@/lib/world-context-corpus-fiscal";
import { WORLD_FISCAL_CONTEXT_ENTRIES_2 } from "@/lib/world-context-corpus-fiscal-2";
import { WORLD_FISCAL_CONTEXT_ENTRIES_3 } from "@/lib/world-context-corpus-fiscal-3";

assert.ok(CONTEXT_CORPUS_VERSION);
assert.ok(getContextCorpusEntries().length >= 2614);
assert.ok(getContextCorpusQualityReport().profileCount >= 197);
assert.equal(getContextCorpusQualityReport().valid, true);
const coverage = getContextCorpusCoverageReport();
assert.equal(coverage.corpusVersion, CONTEXT_CORPUS_VERSION);
assert.ok(coverage.canonicalEntryCount >= 2614);
assert.ok(coverage.descriptorVariantEntryCount >= 146880);
assert.ok(coverage.aliasCount >= 6450);
assert.ok(Object.keys(coverage.countryCounts).length >= 198);
assert.ok(coverage.currencies.length >= 144);
assert.ok((coverage.canonicalCountryCounts.PH ?? 0) > 0);
assert.ok(coverage.localizedAliasCount >= 20);
assert.ok(coverage.canonicalLocalizedAliasCount >= 30);
assert.ok((coverage.aliasScriptCounts.japanese ?? 0) > 0);
assert.ok((coverage.aliasScriptCounts.hangul ?? 0) > 0);
assert.ok((coverage.aliasScriptCounts.han ?? 0) > 0);
assert.ok((coverage.aliasScriptCounts.georgian ?? 0) > 0);
assert.ok((coverage.aliasScriptCounts.armenian ?? 0) > 0);
assert.ok((coverage.countryPurposeCounts.PH?.utilities ?? 0) > 0);
assert.ok((coverage.countryPurposeCounts.SG?.healthcare ?? 0) > 0);
assert.ok((coverage.countryPurposeCounts.AE?.utilities ?? 0) > 0);
assert.ok((coverage.canonicalCountryPurposeCounts.PE?.transport ?? 0) > 0);
assert.ok((coverage.canonicalCountryPurposeCounts.EG?.groceries ?? 0) > 0);
assert.ok((coverage.canonicalCountryPurposeCounts.ET?.utilities ?? 0) > 0);

assert.equal(WORLD_ESSENTIAL_GAP_CONTEXT_ENTRIES.length, 95);
assert.equal(WORLD_EVERYDAY_GAP_CONTEXT_ENTRIES.length, 61);
assert.equal(WORLD_FISCAL_CONTEXT_ENTRIES.length, 120);
assert.equal(WORLD_FISCAL_CONTEXT_ENTRIES_2.length, 120);
assert.equal(WORLD_FISCAL_CONTEXT_ENTRIES_3.length, 152);

for (const entry of [...WORLD_ESSENTIAL_GAP_CONTEXT_ENTRIES, ...WORLD_EVERYDAY_GAP_CONTEXT_ENTRIES, ...WORLD_FISCAL_CONTEXT_ENTRIES, ...WORLD_FISCAL_CONTEXT_ENTRIES_2, ...WORLD_FISCAL_CONTEXT_ENTRIES_3]) {
  const context = resolveTransactionContext({ merchantRaw: entry.aliases[0], currency: entry.currency });
  assert.equal(context.countryCode, entry.countryCode, entry.id);
  assert.equal(context.purposeHint, entry.purposeHint, entry.id);
  assert.equal(context.transactionTypeHint, null, `${entry.id} must not infer transaction direction`);
}

const realCountries = Object.keys(coverage.canonicalCountryCounts).filter((country) => country !== "GLOBAL" && country !== "EU");
for (const country of realCountries) {
  assert.ok((coverage.canonicalCountryPurposeCounts[country]?.telecom ?? 0) > 0, `${country} is missing telecom context`);
  assert.ok((coverage.canonicalCountryPurposeCounts[country]?.healthcare ?? 0) > 0, `${country} is missing healthcare context`);
  assert.ok((coverage.canonicalCountryPurposeCounts[country]?.education ?? 0) > 0, `${country} is missing education context`);
  assert.ok((coverage.canonicalCountryPurposeCounts[country]?.transport ?? 0) > 0, `${country} is missing transport context`);
  assert.ok((coverage.canonicalCountryPurposeCounts[country]?.groceries ?? 0) > 0, `${country} is missing grocery context`);
  assert.ok((coverage.canonicalCountryPurposeCounts[country]?.utilities ?? 0) > 0, `${country} is missing utility context`);
  assert.ok((coverage.canonicalCountryPurposeCounts[country]?.tax ?? 0) > 0, `${country} is missing tax context`);
  assert.ok((coverage.canonicalCountryPurposeCounts[country]?.government_contribution ?? 0) > 0, `${country} is missing social-protection context`);
}

for (const description of ["SAT CLASS", "NAVIGATION NOTE", "FLOW CHART", "SUN AT NOON", "POST LETTER", "TEAM MEETING", "Revenue Forecast", "Social Gathering", "Metro Design", "Fresh Start"]) {
  const context = resolveTransactionContext({ description });
  assert.equal(context.countryCode, null, `${description} must remain geographically neutral`);
}

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

const postedDescriptor = resolveTransactionContext({ merchantRaw: "BANK OF COMMERCE PHILIPPINES POSTED", currency: "PHP" });
assert.equal(postedDescriptor.coverageTier, "descriptor_variant");
assert.equal(postedDescriptor.matchedAliases.includes("bank of commerce philippines posted"), true);

const referenceDescriptor = resolveTransactionContext({ merchantRaw: "BANK OF COMMERCE PHILIPPINES REFERENCE", currency: "PHP" });
assert.equal(referenceDescriptor.coverageTier, "descriptor_variant");
assert.equal(referenceDescriptor.matchedAliases.includes("bank of commerce philippines reference"), true);

const ledgerDescriptor = resolveTransactionContext({ merchantRaw: "BANK OF COMMERCE PHILIPPINES LEDGER ENTRY", currency: "PHP" });
assert.equal(ledgerDescriptor.coverageTier, "descriptor_variant");
assert.equal(ledgerDescriptor.matchedAliases.includes("bank of commerce philippines ledger entry"), true);

const activityDescriptor = resolveTransactionContext({ merchantRaw: "BANK OF COMMERCE PHILIPPINES ACCOUNT ACTIVITY", currency: "PHP" });
assert.equal(activityDescriptor.coverageTier, "descriptor_variant");
assert.equal(activityDescriptor.matchedAliases.includes("bank of commerce philippines account activity"), true);

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

const navigo = resolveTransactionContext({ merchantRaw: "SERVICE NAVIGO 40 75 PARIS EUR VISA RATE", currency: "GBP" });
assert.equal(navigo.countryCode, "FR");
assert.equal(navigo.categoryHint, "Transport");
assert.equal(navigo.counterpartyType, "transport_provider");
assert.equal(navigo.purposeHint, "transport");
assert.equal(navigo.transactionTypeHint, null);

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
  { input: { merchantRaw: "SPOTIFY INDONESIA", currency: "IDR" }, countryCode: "ID", paymentRail: null, purposeHint: "subscription" },
  { input: { merchantRaw: "SHOWMAX SOUTH AFRICA", currency: "ZAR" }, countryCode: "ZA", paymentRail: null, purposeHint: "subscription" },
  { input: { merchantRaw: "RENT PAYMENT UAE", currency: "AED" }, countryCode: null, paymentRail: null, purposeHint: "housing" },
  { input: { merchantRaw: "UNICEF DONATION", currency: "USD" }, countryCode: null, paymentRail: null, purposeHint: "charity" },
  { input: { merchantRaw: "ITAU UNIBANCO BRASIL", currency: "BRL" }, countryCode: "BR", paymentRail: null, purposeHint: null },
  { input: { merchantRaw: "NU MEXICO", currency: "MXN" }, countryCode: "MX", paymentRail: null, purposeHint: null },
  { input: { merchantRaw: "KCB KENYA", currency: "KES" }, countryCode: "KE", paymentRail: null, purposeHint: null },
  { input: { merchantRaw: "KBZ BANK MYANMAR", currency: "MMK" }, countryCode: "MM", paymentRail: null, purposeHint: null },
  { input: { merchantRaw: "PHILLIP BANK CAMBODIA", currency: "KHR" }, countryCode: "KH", paymentRail: null, purposeHint: null },
] as const;
for (const fixture of expandedFixtures) {
  const context = resolveTransactionContext(fixture.input);
  assert.equal(context.countryCode, fixture.countryCode);
  if (fixture.paymentRail) assert.equal(context.paymentRail, fixture.paymentRail);
  assert.equal(context.purposeHint, fixture.purposeHint, fixture.merchantRaw);
}

const worldwideFixtures = [
  { input: { description: "TRANSFERENCIAS 3.0 ARGENTINA", currency: "ARS" }, countryCode: "AR", paymentRail: "argentina_transferencias_3", purposeHint: "transfer" },
  { input: { description: "PAGO YAPE", currency: "PEN" }, countryCode: "PE", paymentRail: "peru_wallet", purposeHint: "transfer" },
  { input: { merchantRaw: "TARJETA STM MONTEVIDEO", currency: "UYU" }, countryCode: "UY", paymentRail: null, purposeHint: "transport" },
  { input: { merchantRaw: "SUPERMAXI ECUADOR", currency: "USD" }, countryCode: "EC", paymentRail: null, purposeHint: "groceries" },
  { input: { description: "SINPE MOVIL COSTA RICA", currency: "CRC" }, countryCode: "CR", paymentRail: "costa_rica_sinpe", purposeHint: "transfer" },
  { input: { description: "YAPPY PANAMA", currency: "PAB" }, countryCode: "PA", paymentRail: "panama_wallet", purposeHint: "transfer" },
  { input: { merchantRaw: "EDESUR DOMINICANA", currency: "DOP" }, countryCode: "DO", paymentRail: null, purposeHint: "utilities" },
  { input: { merchantRaw: "TRANSMETRO GUATEMALA", currency: "GTQ" }, countryCode: "GT", paymentRail: null, purposeHint: "transport" },
  { input: { description: "MB WAY PORTUGAL", currency: "EUR" }, countryCode: "PT", paymentRail: "portugal_mb_way", purposeHint: "transfer" },
  { input: { merchantRaw: "HSL HELSINKI", currency: "EUR" }, countryCode: "FI", paymentRail: null, purposeHint: "transport" },
  { input: { merchantRaw: "LÍTAČKA PRAHA", currency: "CZK" }, countryCode: "CZ", paymentRail: null, purposeHint: "transport" },
  { input: { description: "QVIK HUNGARY", currency: "HUF" }, countryCode: "HU", paymentRail: "hungary_qvik", purposeHint: "transfer" },
  { input: { description: "ROPAY ROMANIA", currency: "RON" }, countryCode: "RO", paymentRail: "romania_ropay", purposeHint: "transfer" },
  { input: { merchantRaw: "KONZUM HRVATSKA", currency: "EUR" }, countryCode: "HR", paymentRail: null, purposeHint: "groceries" },
  { input: { merchantRaw: "БАНКА ДСК", currency: "BGN" }, countryCode: "BG", paymentRail: null, purposeHint: null },
  { input: { description: "انستاباي مصر", currency: "EGP" }, countryCode: "EG", paymentRail: "egypt_ipn", purposeHint: "transfer" },
  { input: { description: "פייבוקס ישראל", currency: "ILS" }, countryCode: "IL", paymentRail: "israel_wallet", purposeHint: "transfer" },
  { input: { merchantRaw: "ONCF MAROC", currency: "MAD" }, countryCode: "MA", paymentRail: null, purposeHint: "transport" },
  { input: { description: "كليك الأردن", currency: "JOD" }, countryCode: "JO", paymentRail: "jordan_cliq", purposeHint: "transfer" },
  { input: { description: "THAWANI PAY OMAN", currency: "OMR" }, countryCode: "OM", paymentRail: "oman_wallet", purposeHint: "transfer" },
  { input: { description: "BENEFITPAY BAHRAIN", currency: "BHD" }, countryCode: "BH", paymentRail: "bahrain_benefitpay", purposeHint: "transfer" },
  { input: { merchantRaw: "SAFEBODA UGANDA", currency: "UGX" }, countryCode: "UG", paymentRail: null, purposeHint: "transport" },
  { input: { description: "MTN MOMO RWANDA", currency: "RWF" }, countryCode: "RW", paymentRail: "rwanda_mobile_money", purposeHint: "transfer" },
  { input: { description: "ቴሌብር ኢትዮጵያ", currency: "ETB" }, countryCode: "ET", paymentRail: "ethiopia_mobile_money", purposeHint: "transfer" },
  { input: { description: "WAVE MOBILE MONEY SENEGAL", currency: "XOF" }, countryCode: "SN", paymentRail: "senegal_mobile_money", purposeHint: "transfer" },
  { input: { merchantRaw: "SOTRA ABIDJAN", currency: "XOF" }, countryCode: "CI", paymentRail: null, purposeHint: "transport" },
  { input: { merchantRaw: "METRO EXPRESS MAURITIUS", currency: "MUR" }, countryCode: "MU", paymentRail: null, purposeHint: "transport" },
  { input: { merchantRaw: "CHOPPIES BOTSWANA", currency: "BWP" }, countryCode: "BW", paymentRail: null, purposeHint: "groceries" },
  { input: { description: "CONNECTIPS NEPAL", currency: "NPR" }, countryCode: "NP", paymentRail: "nepal_connectips", purposeHint: "transfer" },
] as const;
for (const fixture of worldwideFixtures) {
  const context = resolveTransactionContext(fixture.input);
  assert.equal(context.countryCode, fixture.countryCode);
  assert.equal(context.paymentRail, fixture.paymentRail);
  assert.equal(context.purposeHint, fixture.purposeHint);
  assert.notEqual(context.transactionTypeHint, "expense");
}

const worldwidePhaseTwoFixtures = [
  { input: { description: "RT1 INSTANT PAYMENT ESTONIA", currency: "EUR" }, countryCode: "EE", paymentRail: "estonia_sepa_instant", purposeHint: "transfer" },
  { input: { merchantRaw: "RĪGAS SATIKSME", currency: "EUR" }, countryCode: "LV", paymentRail: null, purposeHint: "transport" },
  { input: { description: "CENTROLINK LITHUANIA", currency: "EUR" }, countryCode: "LT", paymentRail: "lithuania_centrolink", purposeHint: "transfer" },
  { input: { description: "OKAMZITA PLATBA SLOVENSKO", currency: "EUR" }, countryCode: "SK", paymentRail: "slovakia_sepa_instant", purposeHint: "transfer" },
  { input: { merchantRaw: "URBANA LJUBLJANA", currency: "EUR" }, countryCode: "SI", paymentRail: null, purposeHint: "transport" },
  { input: { description: "IPS NBS SERBIA", currency: "RSD" }, countryCode: "RS", paymentRail: "serbia_ips", purposeHint: "transfer" },
  { input: { merchantRaw: "ELEKTROPRIVREDA BIH", currency: "BAM" }, countryCode: "BA", paymentRail: null, purposeHint: "utilities" },
  { input: { merchantRaw: "ЈСП СКОПЈЕ", currency: "MKD" }, countryCode: "MK", paymentRail: null, purposeHint: "transport" },
  { input: { merchantRaw: "OSHEE ALBANIA", currency: "ALL" }, countryCode: "AL", paymentRail: null, purposeHint: "utilities" },
  { input: { description: "MIA PLATI INSTANT MOLDOVA", currency: "MDL" }, countryCode: "MD", paymentRail: "moldova_mia", purposeHint: "transfer" },
  { input: { merchantRaw: "СІЛЬПО УКРАЇНА", currency: "UAH" }, countryCode: "UA", paymentRail: null, purposeHint: "groceries" },
  { input: { merchantRaw: "თბილისის სატრანსპორტო კომპანია", currency: "GEL" }, countryCode: "GE", paymentRail: null, purposeHint: "transport" },
  { input: { merchantRaw: "ԵՐԵՎԱՆ ՍԻԹԻ ՍՈՒՊԵՐՄԱՐԿԵՏ", currency: "AMD" }, countryCode: "AM", paymentRail: null, purposeHint: "groceries" },
  { input: { merchantRaw: "AZƏRIŞIQ", currency: "AZN" }, countryCode: "AZ", paymentRail: null, purposeHint: "utilities" },
  { input: { description: "JCCSMART CYPRUS", currency: "EUR" }, countryCode: "CY", paymentRail: "cyprus_jcc", purposeHint: "transfer" },
  { input: { merchantRaw: "TALLINJA MALTA", currency: "EUR" }, countryCode: "MT", paymentRail: null, purposeHint: "transport" },
  { input: { merchantRaw: "BÓNUS ISLAND", currency: "ISK" }, countryCode: "IS", paymentRail: null, purposeHint: "groceries" },
  { input: { description: "PAYCONIQ LUXEMBOURG", currency: "EUR" }, countryCode: "LU", paymentRail: "luxembourg_payconiq", purposeHint: "transfer" },
  { input: { merchantRaw: "MI TELEFERICO BOLIVIA", currency: "BOB" }, countryCode: "BO", paymentRail: null, purposeHint: "transport" },
  { input: { description: "SPI PARAGUAY PAGOS INSTANTANEOS", currency: "PYG" }, countryCode: "PY", paymentRail: "paraguay_spi", purposeHint: "transfer" },
  { input: { merchantRaw: "ENEE HONDURAS", currency: "HNL" }, countryCode: "HN", paymentRail: null, purposeHint: "utilities" },
  { input: { description: "TRANSFER365 EL SALVADOR", currency: "USD" }, countryCode: "SV", paymentRail: "el_salvador_transfer365", purposeHint: "transfer" },
  { input: { merchantRaw: "DISNORTE DISSUR NICARAGUA", currency: "NIO" }, countryCode: "NI", paymentRail: null, purposeHint: "utilities" },
  { input: { description: "JAM-DEX JAMAICA DIGITAL CURRENCY", currency: "JMD" }, countryCode: "JM", paymentRail: "jamaica_jamdex", purposeHint: "transfer" },
  { input: { merchantRaw: "PTSC TRINIDAD", currency: "TTD" }, countryCode: "TT", paymentRail: null, purposeHint: "transport" },
  { input: { merchantRaw: "سونلغاز الجزائر", currency: "DZD" }, countryCode: "DZ", paymentRail: null, purposeHint: "utilities" },
  { input: { description: "D17 POSTE TUNISIENNE", currency: "TND" }, countryCode: "TN", paymentRail: "tunisia_d17", purposeHint: "transfer" },
  { input: { merchantRaw: "ZESCO ZAMBIA", currency: "ZMW" }, countryCode: "ZM", paymentRail: null, purposeHint: "utilities" },
  { input: { description: "AIRTEL MONEY MALAWI", currency: "MWK" }, countryCode: "MW", paymentRail: "malawi_mobile_money", purposeHint: "transfer" },
  { input: { description: "M-PESA MOZAMBIQUE", currency: "MZN" }, countryCode: "MZ", paymentRail: "mozambique_mobile_money", purposeHint: "transfer" },
  { input: { merchantRaw: "ОНАЙ АЛМАТЫ ТРАНСПОРТ", currency: "KZT" }, countryCode: "KZ", paymentRail: null, purposeHint: "transport" },
  { input: { description: "HUMO PAYMENT UZBEKISTAN", currency: "UZS" }, countryCode: "UZ", paymentRail: "uzbekistan_humo", purposeHint: "transfer" },
  { input: { description: "ELQR KYRGYZSTAN", currency: "KGS" }, countryCode: "KG", paymentRail: "kyrgyzstan_elqr", purposeHint: "transfer" },
  { input: { description: "QPAY MONGOLIA", currency: "MNT" }, countryCode: "MN", paymentRail: "mongolia_qpay", purposeHint: "transfer" },
] as const;
for (const fixture of worldwidePhaseTwoFixtures) {
  const context = resolveTransactionContext(fixture.input);
  assert.equal(context.countryCode, fixture.countryCode);
  assert.equal(context.paymentRail, fixture.paymentRail);
  assert.equal(context.purposeHint, fixture.purposeHint);
  assert.notEqual(context.transactionTypeHint, "expense");
}

const worldwidePhaseThreeFixtures = [
  { input: { description: "PAGO MOVIL VENEZUELA", currency: "VES" }, countryCode: "VE", paymentRail: "venezuela_pago_movil", purposeHint: "transfer" },
  { input: { merchantRaw: "BARBADOS LIGHT AND POWER", currency: "BBD" }, countryCode: "BB", paymentRail: null, purposeHint: "utilities" },
  { input: { description: "SAND DOLLAR BAHAMAS", currency: "BSD" }, countryCode: "BS", paymentRail: "bahamas_sand_dollar", purposeHint: "transfer" },
  { input: { merchantRaw: "BELIZE ELECTRICITY LIMITED", currency: "BZD" }, countryCode: "BZ", paymentRail: null, purposeHint: "utilities" },
  { input: { description: "MMG MOBILE MONEY GUYANA", currency: "GYD" }, countryCode: "GY", paymentRail: "guyana_mmg", purposeHint: "transfer" },
  { input: { merchantRaw: "ENERGIEBEDRIJVEN SURINAME", currency: "SRD" }, countryCode: "SR", paymentRail: null, purposeHint: "utilities" },
  { input: { description: "DIGICEL MONCASH HAITI", currency: "HTG" }, countryCode: "HT", paymentRail: "haiti_moncash", purposeHint: "transfer" },
  { input: { description: "MULTICAIXA EXPRESS ANGOLA", currency: "AOA" }, countryCode: "AO", paymentRail: "angola_multicaixa", purposeHint: "transfer" },
  { input: { merchantRaw: "NAMPOWER NAMIBIA", currency: "NAD" }, countryCode: "NA", paymentRail: null, purposeHint: "utilities" },
  { input: { description: "ZIM SWITCH ZIPIT", currency: "USD" }, countryCode: "ZW", paymentRail: "zimbabwe_zipit", purposeHint: "transfer" },
  { input: { description: "GIMAC PAY CAMEROUN", currency: "XAF" }, countryCode: "CM", paymentRail: "cemac_gimacpay", purposeHint: "transfer" },
  { input: { merchantRaw: "SEEG GABON", currency: "XAF" }, countryCode: "GA", paymentRail: null, purposeHint: "utilities" },
  { input: { description: "M-PESA DR CONGO", currency: "CDF" }, countryCode: "CD", paymentRail: "drc_mobile_money", purposeHint: "transfer" },
  { input: { description: "TELMA MVOLA MADAGASCAR", currency: "MGA" }, countryCode: "MG", paymentRail: "madagascar_mvola", purposeHint: "transfer" },
  { input: { merchantRaw: "SPTC SEYCHELLES", currency: "SCR" }, countryCode: "SC", paymentRail: null, purposeHint: "transport" },
  { input: { description: "REDE VINTI4 CAPE VERDE", currency: "CVE" }, countryCode: "CV", paymentRail: "cabo_verde_vinti4", purposeHint: "transfer" },
  { input: { merchantRaw: "SBEE BENIN", currency: "XOF" }, countryCode: "BJ", paymentRail: null, purposeHint: "utilities" },
  { input: { description: "T MONEY TOGOCOM", currency: "XOF" }, countryCode: "TG", paymentRail: "togo_tmoney", purposeHint: "transfer" },
  { input: { merchantRaw: "EDSA SIERRA LEONE", currency: "SLE" }, countryCode: "SL", paymentRail: null, purposeHint: "utilities" },
  { input: { description: "OMT PAY LEBANON", currency: "LBP" }, countryCode: "LB", paymentRail: "lebanon_omt_pay", purposeHint: "transfer" },
  { input: { description: "زين كاش العراق", currency: "IQD" }, countryCode: "IQ", paymentRail: "iraq_zaincash", purposeHint: "transfer" },
  { input: { description: "FAVARA TRANSFER MALDIVES", currency: "MVR" }, countryCode: "MV", paymentRail: "maldives_favara", purposeHint: "transfer" },
  { input: { description: "RMA BHUTAN QR", currency: "BTN" }, countryCode: "BT", paymentRail: "bhutan_qr", purposeHint: "transfer" },
  { input: { merchantRaw: "PNG POWER LIMITED", currency: "PGK" }, countryCode: "PG", paymentRail: null, purposeHint: "utilities" },
  { input: { merchantRaw: "FARMER JOE SUPERMARKET SAMOA", currency: "WST" }, countryCode: "WS", paymentRail: null, purposeHint: "groceries" },
  { input: { merchantRaw: "TONGA POWER LIMITED", currency: "TOP" }, countryCode: "TO", paymentRail: null, purposeHint: "utilities" },
  { input: { description: "VODAFONE MVATU VANUATU", currency: "VUV" }, countryCode: "VU", paymentRail: "vanuatu_mvatu", purposeHint: "transfer" },
  { input: { merchantRaw: "SOLOMON ISLANDS ELECTRICITY AUTHORITY", currency: "SBD" }, countryCode: "SB", paymentRail: null, purposeHint: "utilities" },
  { input: { merchantRaw: "VOLI CRNA GORA", currency: "EUR" }, countryCode: "ME", paymentRail: null, purposeHint: "groceries" },
  { input: { description: "ALIF MOBI TAJIKISTAN", currency: "TJS" }, countryCode: "TJ", paymentRail: "tajikistan_alif", purposeHint: "transfer" },
] as const;
for (const fixture of worldwidePhaseThreeFixtures) {
  const context = resolveTransactionContext(fixture.input);
  assert.equal(context.countryCode, fixture.countryCode);
  assert.equal(context.paymentRail, fixture.paymentRail);
  assert.equal(context.purposeHint, fixture.purposeHint);
  assert.notEqual(context.transactionTypeHint, "expense");
}

const worldwidePhaseFourFixtures = [
  { input: { merchantRaw: "FEDA ANDORRA ELECTRICITY", currency: "EUR" }, countryCode: "AD", paymentRail: null, purposeHint: "utilities" },
  { input: { merchantRaw: "LIEMOBIL LIECHTENSTEIN", currency: "CHF" }, countryCode: "LI", paymentRail: null, purposeHint: "transport" },
  { input: { merchantRaw: "SMEG MONACO ELECTRICITY", currency: "EUR" }, countryCode: "MC", paymentRail: null, purposeHint: "utilities" },
  { input: { merchantRaw: "CONAD SUPERMARKET SAN MARINO", currency: "EUR" }, countryCode: "SM", paymentRail: null, purposeHint: "groceries" },
  { input: { merchantRaw: "TRAFIKU URBAN PRISHTINA", currency: "EUR" }, countryCode: "XK", paymentRail: null, purposeHint: "transport" },
  { input: { merchantRaw: "БЕЛЭНЕРГО БЕЛАРУСЬ", currency: "BYN" }, countryCode: "BY", paymentRail: null, purposeHint: "utilities" },
  { input: { merchantRaw: "مترو تهران ایران", currency: "IRR" }, countryCode: "IR", paymentRail: null, purposeHint: "transport" },
  { input: { merchantRaw: "JEDCO PALESTINE ELECTRICITY", currency: "ILS" }, countryCode: "PS", paymentRail: null, purposeHint: "utilities" },
  { input: { merchantRaw: "YEMEN KUWAIT BANK", currency: "YER" }, countryCode: "YE", paymentRail: null, purposeHint: null },
  { input: { merchantRaw: "GECOL LIBYA ELECTRICITY", currency: "LYD" }, countryCode: "LY", paymentRail: null, purposeHint: "utilities" },
  { input: { description: "PI SPI MALI", currency: "XOF" }, countryCode: "ML", paymentRail: "uemoa_pispi", purposeHint: "transfer" },
  { input: { merchantRaw: "SONABEL BURKINA FASO", currency: "XOF" }, countryCode: "BF", paymentRail: null, purposeHint: "utilities" },
  { input: { merchantRaw: "SOTRUNI BUS NIAMEY", currency: "XOF" }, countryCode: "NE", paymentRail: null, purposeHint: "transport" },
  { input: { merchantRaw: "ELECTRICITE DE GUINEE", currency: "GNF" }, countryCode: "GN", paymentRail: null, purposeHint: "utilities" },
  { input: { merchantRaw: "LIBERIA ELECTRICITY CORPORATION", currency: "LRD" }, countryCode: "LR", paymentRail: null, purposeHint: "utilities" },
  { input: { merchantRaw: "GTSC BUS GAMBIA", currency: "GMD" }, countryCode: "GM", paymentRail: null, purposeHint: "transport" },
  { input: { merchantRaw: "SOMELEC MAURITANIA ELECTRICITY", currency: "MRU" }, countryCode: "MR", paymentRail: null, purposeHint: "utilities" },
  { input: { merchantRaw: "AFRA SHOPPING CENTER SUDAN", currency: "SDG" }, countryCode: "SD", paymentRail: null, purposeHint: "groceries" },
  { input: { merchantRaw: "ELECTRICITE DE DJIBOUTI", currency: "DJF" }, countryCode: "DJ", paymentRail: null, purposeHint: "utilities" },
  { input: { description: "SIPS SOMALIA SOMQR", currency: "SOS" }, countryCode: "SO", paymentRail: "somalia_sips", purposeHint: "transfer" },
  { input: { merchantRaw: "SHOPRITE MASERU SUPERMARKET", currency: "LSL" }, countryCode: "LS", paymentRail: null, purposeHint: "groceries" },
  { input: { merchantRaw: "EEC ELECTRICITY ESWATINI", currency: "SZL" }, countryCode: "SZ", paymentRail: null, purposeHint: "utilities" },
  { input: { merchantRaw: "STPU BRAZZAVILLE CONGO", currency: "XAF" }, countryCode: "CG", paymentRail: null, purposeHint: "transport" },
  { input: { merchantRaw: "ENERCA ELECTRICITY CENTRAFRIQUE", currency: "XAF" }, countryCode: "CF", paymentRail: null, purposeHint: "utilities" },
  { input: { merchantRaw: "SEGESA GUINEA ECUATORIAL", currency: "XAF" }, countryCode: "GQ", paymentRail: null, purposeHint: "utilities" },
  { input: { merchantRaw: "EMAE SAO TOME UTILITIES", currency: "STN" }, countryCode: "ST", paymentRail: null, purposeHint: "utilities" },
  { input: { merchantRaw: "SODIFRAM COMOROS SUPERMARKET", currency: "KMF" }, countryCode: "KM", paymentRail: null, purposeHint: "groceries" },
  { input: { merchantRaw: "TURKMENENERGO ELECTRICITY", currency: "TMT" }, countryCode: "TM", paymentRail: null, purposeHint: "utilities" },
  { input: { description: "AFGHANISTAN PAYMENTS SYSTEM AFPAY", currency: "AFN" }, countryCode: "AF", paymentRail: "afghanistan_afpay", purposeHint: "transfer" },
  { input: { merchantRaw: "PPUC PALAU UTILITIES", currency: "USD" }, countryCode: "PW", paymentRail: null, purposeHint: "utilities" },
] as const;
for (const fixture of worldwidePhaseFourFixtures) {
  const context = resolveTransactionContext(fixture.input);
  assert.equal(context.countryCode, fixture.countryCode);
  assert.equal(context.paymentRail, fixture.paymentRail);
  assert.equal(context.purposeHint, fixture.purposeHint);
  assert.notEqual(context.transactionTypeHint, "expense");
}

const worldwideVerticalFixtures = [
  { merchantRaw: "A1 TELEKOM AUSTRIA", currency: "EUR", countryCode: "AT", purposeHint: "telecom" },
  { merchantRaw: "UZ LEUVEN BELGIUM", currency: "EUR", countryCode: "BE", purposeHint: "healthcare" },
  { merchantRaw: "SHELL NEDERLAND STATION", currency: "EUR", countryCode: "NL", purposeHint: "fuel" },
  { merchantRaw: "UNIVERSITY OF COPENHAGEN DENMARK", currency: "DKK", countryCode: "DK", purposeHint: "education" },
  { merchantRaw: "TELIA SVERIGE BILLING", currency: "SEK", countryCode: "SE", purposeHint: "telecom" },
  { merchantRaw: "OSLO UNIVERSITETSSYKEHUS NORWAY", currency: "NOK", countryCode: "NO", purposeHint: "healthcare" },
  { merchantRaw: "NESTE STATION FINLAND", currency: "EUR", countryCode: "FI", purposeHint: "fuel" },
  { merchantRaw: "UNIWERSYTET WARSZAWSKI POLAND", currency: "PLN", countryCode: "PL", purposeHint: "education" },
  { merchantRaw: "COSMOTE GREECE TELECOM", currency: "EUR", countryCode: "GR", purposeHint: "telecom" },
  { merchantRaw: "CONFIDO HEALTHCARE ESTONIA", currency: "EUR", countryCode: "EE", purposeHint: "healthcare" },
  { merchantRaw: "VIRSI STATION LATVIA", currency: "EUR", countryCode: "LV", purposeHint: "fuel" },
  { merchantRaw: "VILNIAUS UNIVERSITETAS LITHUANIA", currency: "EUR", countryCode: "LT", purposeHint: "education" },
  { merchantRaw: "SLOVAK TELEKOM TELECOM", currency: "EUR", countryCode: "SK", purposeHint: "telecom" },
  { merchantRaw: "UNIVERSITY MEDICAL CENTRE LJUBLJANA SLOVENIA", currency: "EUR", countryCode: "SI", purposeHint: "healthcare" },
  { merchantRaw: "INA STATION CROATIA", currency: "EUR", countryCode: "HR", purposeHint: "fuel" },
  { merchantRaw: "SOFIYSKI UNIVERSITET BULGARIA", currency: "BGN", countryCode: "BG", purposeHint: "education" },
  { merchantRaw: "ORANGE ROMANIA TELECOM", currency: "RON", countryCode: "RO", purposeHint: "telecom" },
  { merchantRaw: "SEMMELWEIS HEALTHCARE HUNGARY", currency: "HUF", countryCode: "HU", purposeHint: "healthcare" },
  { merchantRaw: "PETROLINA STATION CYPRUS", currency: "EUR", countryCode: "CY", purposeHint: "fuel" },
  { merchantRaw: "UNIVERSITY OF MALTA", currency: "EUR", countryCode: "MT", purposeHint: "education" },
  { merchantRaw: "TELCEL MEXICO TELECOM", currency: "MXN", countryCode: "MX", purposeHint: "telecom" },
  { merchantRaw: "CLINICA INTERNACIONAL LIMA HEALTHCARE", currency: "PEN", countryCode: "PE", purposeHint: "healthcare" },
  { merchantRaw: "TERPEL COLOMBIA FUEL", currency: "COP", countryCode: "CO", purposeHint: "fuel" },
  { merchantRaw: "UNIVERSITY OF CHILE EDUCATION", currency: "CLP", countryCode: "CL", purposeHint: "education" },
  { merchantRaw: "MOVISTAR ARGENTINA TELECOM", currency: "ARS", countryCode: "AR", purposeHint: "telecom" },
  { merchantRaw: "BRITISH HOSPITAL MONTEVIDEO URUGUAY", currency: "UYU", countryCode: "UY", purposeHint: "healthcare" },
  { merchantRaw: "PETROPAR STATION PARAGUAY", currency: "PYG", countryCode: "PY", purposeHint: "fuel" },
  { merchantRaw: "UMSA BOLIVIA EDUCATION", currency: "BOB", countryCode: "BO", purposeHint: "education" },
  { merchantRaw: "CLARO ECUADOR TELECOM", currency: "USD", countryCode: "EC", purposeHint: "telecom" },
  { merchantRaw: "CLINICA BIBLICA SAN JOSE COSTA RICA", currency: "CRC", countryCode: "CR", purposeHint: "healthcare" },
  { merchantRaw: "TERPEL PANAMA FUEL", currency: "PAB", countryCode: "PA", purposeHint: "fuel" },
  { merchantRaw: "USAC GUATEMALA EDUCATION", currency: "GTQ", countryCode: "GT", purposeHint: "education" },
  { merchantRaw: "TIGO HONDURAS TELECOM", currency: "HNL", countryCode: "HN", purposeHint: "telecom" },
  { merchantRaw: "DIAGNOSTICO HEALTHCARE SAN SALVADOR", currency: "USD", countryCode: "SV", purposeHint: "healthcare" },
  { merchantRaw: "SUNIX STATION DOMINICANA", currency: "DOP", countryCode: "DO", purposeHint: "fuel" },
  { merchantRaw: "DJEZZY ALGERIA TELECOM", currency: "DZD", countryCode: "DZ", purposeHint: "telecom" },
  { merchantRaw: "TAOUFIK HEALTHCARE TUNIS", currency: "TND", countryCode: "TN", purposeHint: "healthcare" },
  { merchantRaw: "MISR STATION EGYPT", currency: "EGP", countryCode: "EG", purposeHint: "fuel" },
  { merchantRaw: "UON KENYA EDUCATION", currency: "KES", countryCode: "KE", purposeHint: "education" },
  { merchantRaw: "VODACOM TANZANIA TELECOM", currency: "TZS", countryCode: "TZ", purposeHint: "telecom" },
  { merchantRaw: "NAKASERO HEALTHCARE KAMPALA", currency: "UGX", countryCode: "UG", purposeHint: "healthcare" },
  { merchantRaw: "RUBIS STATION RWANDA", currency: "RWF", countryCode: "RW", purposeHint: "fuel" },
  { merchantRaw: "UCAD SENEGAL EDUCATION", currency: "XOF", countryCode: "SN", purposeHint: "education" },
  { merchantRaw: "ORANGE COTE IVOIRE TELECOM", currency: "XOF", countryCode: "CI", purposeHint: "telecom" },
  { merchantRaw: "NETCARE HOSPITAL SOUTH AFRICA", currency: "ZAR", countryCode: "ZA", purposeHint: "healthcare" },
  { merchantRaw: "PUMA STATION ZAMBIA", currency: "ZMW", countryCode: "ZM", purposeHint: "fuel" },
  { merchantRaw: "UZ ZIMBABWE EDUCATION", currency: "USD", countryCode: "ZW", purposeHint: "education" },
  { merchantRaw: "MTN GHANA TELECOM", currency: "GHS", countryCode: "GH", purposeHint: "telecom" },
  { merchantRaw: "LAGOON HEALTHCARE LAGOS", currency: "NGN", countryCode: "NG", purposeHint: "healthcare" },
  { merchantRaw: "AFRIQUIA STATION MOROCCO", currency: "MAD", countryCode: "MA", purposeHint: "fuel" },
  { merchantRaw: "NTT DOCOMO JAPAN TELECOM", currency: "JPY", countryCode: "JP", purposeHint: "telecom" },
  { merchantRaw: "삼성서울병원 대한민국", currency: "KRW", countryCode: "KR", purposeHint: "healthcare" },
  { merchantRaw: "中国石化 加油站", currency: "CNY", countryCode: "CN", purposeHint: "fuel" },
  { merchantRaw: "DELHI UNIVERSITY INDIA EDUCATION", currency: "INR", countryCode: "IN", purposeHint: "education" },
  { merchantRaw: "GRAMEENPHONE BANGLADESH TELECOM", currency: "BDT", countryCode: "BD", purposeHint: "telecom" },
  { merchantRaw: "SHIFA HEALTHCARE ISLAMABAD", currency: "PKR", countryCode: "PK", purposeHint: "healthcare" },
  { merchantRaw: "LIOC STATION SRI LANKA", currency: "LKR", countryCode: "LK", purposeHint: "fuel" },
  { merchantRaw: "TU NEPAL EDUCATION", currency: "NPR", countryCode: "NP", purposeHint: "education" },
  { merchantRaw: "BEELINE KAZAKHSTAN TELECOM", currency: "KZT", countryCode: "KZ", purposeHint: "telecom" },
  { merchantRaw: "AKFA HEALTHCARE TASHKENT", currency: "UZS", countryCode: "UZ", purposeHint: "healthcare" },
] as const;
for (const fixture of worldwideVerticalFixtures) {
  const context = resolveTransactionContext(fixture);
  assert.equal(context.countryCode, fixture.countryCode);
  assert.equal(context.purposeHint, fixture.purposeHint);
  assert.equal(context.transactionTypeHint, null);
}

const worldwideCommerceFixtures = [
  { merchantRaw: "UNIQA VERSICHERUNG OSTERREICH", currency: "EUR", countryCode: "AT", purposeHint: "insurance" },
  { merchantRaw: "BOL BELGIQUE MARKETPLACE", currency: "EUR", countryCode: "BE", purposeHint: "ecommerce" },
  { merchantRaw: "THUISBEZORGD.NL FOOD DELIVERY", currency: "EUR", countryCode: "NL", purposeHint: "food_delivery" },
  { merchantRaw: "TRYG FORSIKRING DANMARK", currency: "DKK", countryCode: "DK", purposeHint: "insurance" },
  { merchantRaw: "CDON SVERIGE MARKETPLACE", currency: "SEK", countryCode: "SE", purposeHint: "ecommerce" },
  { merchantRaw: "FOODORA NORGE FOOD", currency: "NOK", countryCode: "NO", purposeHint: "food_delivery" },
  { merchantRaw: "PZU UBEZPIECZENIA POLSKA", currency: "PLN", countryCode: "PL", purposeHint: "insurance" },
  { merchantRaw: "SKROUTZ GREEK MARKETPLACE", currency: "EUR", countryCode: "GR", purposeHint: "ecommerce" },
  { merchantRaw: "BOLT DELIVERY TALLINN ESTONIA", currency: "EUR", countryCode: "EE", purposeHint: "food_delivery" },
  { merchantRaw: "TRIGLAV INSURANCE SLOVENIA", currency: "EUR", countryCode: "SI", purposeHint: "insurance" },
  { merchantRaw: "MERCADOLIBRE MX MARKETPLACE", currency: "MXN", countryCode: "MX", purposeHint: "ecommerce" },
  { merchantRaw: "PEDIDOS YA PERU FOOD", currency: "PEN", countryCode: "PE", purposeHint: "food_delivery" },
  { merchantRaw: "SEGUROS SURA COLOMBIA", currency: "COP", countryCode: "CO", purposeHint: "insurance" },
  { merchantRaw: "FALABELLA.COM CHILE MARKETPLACE", currency: "CLP", countryCode: "CL", purposeHint: "ecommerce" },
  { merchantRaw: "PEDIDOS YA ARGENTINA FOOD", currency: "ARS", countryCode: "AR", purposeHint: "food_delivery" },
  { merchantRaw: "BANCO DE SEGUROS ESTADO URUGUAY", currency: "UYU", countryCode: "UY", purposeHint: "insurance" },
  { merchantRaw: "DISMAC ONLINE BOLIVIA", currency: "BOB", countryCode: "BO", purposeHint: "ecommerce" },
  { merchantRaw: "UBEREATS SAN JOSE COSTA RICA", currency: "CRC", countryCode: "CR", purposeHint: "food_delivery" },
  { merchantRaw: "SAA ASSURANCE ALGERIA", currency: "DZD", countryCode: "DZ", purposeHint: "insurance" },
  { merchantRaw: "JUMIA MARKETPLACE EGYPT", currency: "EGP", countryCode: "EG", purposeHint: "ecommerce" },
  { merchantRaw: "GLOVO NAIROBI FOOD", currency: "KES", countryCode: "KE", purposeHint: "food_delivery" },
  { merchantRaw: "JUBILEE INSURANCE UGANDA", currency: "UGX", countryCode: "UG", purposeHint: "insurance" },
  { merchantRaw: "KASHA MARKETPLACE RWANDA", currency: "RWF", countryCode: "RW", purposeHint: "ecommerce" },
  { merchantRaw: "MRD DELIVERY SOUTH AFRICA", currency: "ZAR", countryCode: "ZA", purposeHint: "food_delivery" },
  { merchantRaw: "LEADWAY ASSURANCE NIGERIA", currency: "NGN", countryCode: "NG", purposeHint: "insurance" },
  { merchantRaw: "RAKUTEN ICHIBA JAPAN", currency: "JPY", countryCode: "JP", purposeHint: "ecommerce" },
  { merchantRaw: "배달의민족 대한민국", currency: "KRW", countryCode: "KR", purposeHint: "food_delivery" },
  { merchantRaw: "中国平安保险", currency: "CNY", countryCode: "CN", purposeHint: "insurance" },
  { merchantRaw: "FLIPKART MARKETPLACE INDIA", currency: "INR", countryCode: "IN", purposeHint: "ecommerce" },
  { merchantRaw: "FOODMANDU KATHMANDU", currency: "NPR", countryCode: "NP", purposeHint: "food_delivery" },
] as const;
for (const fixture of worldwideCommerceFixtures) {
  const context = resolveTransactionContext(fixture);
  assert.equal(context.countryCode, fixture.countryCode);
  assert.equal(context.purposeHint, fixture.purposeHint, fixture.merchantRaw);
  assert.equal(context.transactionTypeHint, null);
}

const worldwideDepthFixtures = [
  { merchantRaw: "AMERICAN HOSPITAL ALBANIA", currency: "ALL", countryCode: "AL", purposeHint: "healthcare" },
  { merchantRaw: "EDESUR ARGENTINA", currency: "ARS", countryCode: "AR", purposeHint: "utilities" },
  { merchantRaw: "BH TELECOM BIH", currency: "BAM", countryCode: "BA", purposeHint: "telecom" },
  { merchantRaw: "SHWAPNO BANGLADESH", currency: "BDT", countryCode: "BD", purposeHint: "groceries" },
  { merchantRaw: "ROYAL BAHRAIN HOSPITAL", currency: "BHD", countryCode: "BH", purposeHint: "healthcare" },
  { merchantRaw: "JPMC BRUNEI", currency: "BND", countryCode: "BN", purposeHint: "healthcare" },
  { merchantRaw: "BILHETE UNICO SAO PAULO", currency: "BRL", countryCode: "BR", purposeHint: "transport" },
  { merchantRaw: "BOKAMOSO HOSPITAL BOTSWANA", currency: "BWP", countryCode: "BW", purposeHint: "healthcare" },
  { merchantRaw: "UNIVERSITY HOSPITAL MOTOL", currency: "CZK", countryCode: "CZ", purposeHint: "healthcare" },
  { merchantRaw: "ETHIO TELECOM", currency: "ETB", countryCode: "ET", purposeHint: "telecom" },
  { merchantRaw: "EVEX MEDICAL GEORGIA", currency: "GEL", countryCode: "GE", purposeHint: "healthcare" },
  { merchantRaw: "MELCOM GHANA SUPERMARKET", currency: "GHS", countryCode: "GH", purposeHint: "groceries" },
  { merchantRaw: "CLALIT HEALTH SERVICES", currency: "ILS", countryCode: "IL", purposeHint: "healthcare" },
  { merchantRaw: "JORDAN ELECTRIC POWER COMPANY", currency: "JOD", countryCode: "JO", purposeHint: "utilities" },
  { merchantRaw: "AKDITAL HOSPITAL MOROCCO", currency: "MAD", countryCode: "MA", purposeHint: "healthcare" },
  { merchantRaw: "CITY MART SUPERMARKET YANGON", currency: "MMK", countryCode: "MM", purposeHint: "groceries" },
  { merchantRaw: "REDDINGTON HOSPITAL LAGOS", currency: "NGN", countryCode: "NG", purposeHint: "healthcare" },
  { merchantRaw: "SAJHA BUS KATHMANDU", currency: "NPR", countryCode: "NP", purposeHint: "transport" },
  { merchantRaw: "SPARK NEW ZEALAND TELECOM", currency: "NZD", countryCode: "NZ", purposeHint: "telecom" },
  { merchantRaw: "AGA KHAN UNIVERSITY HOSPITAL PAKISTAN", currency: "PKR", countryCode: "PK", purposeHint: "healthcare" },
] as const;
for (const fixture of worldwideDepthFixtures) {
  const context = resolveTransactionContext(fixture);
  assert.equal(context.countryCode, fixture.countryCode);
  assert.equal(context.purposeHint, fixture.purposeHint);
  assert.equal(context.transactionTypeHint, null);
}

const worldwideCoverageFiveFixtures = [
  { merchantRaw: "APUA ANTIGUA UTILITIES", currency: "XCD", countryCode: "AG", purposeHint: "utilities" },
  { merchantRaw: "OTRACO BURUNDI TRANSPORT", currency: "BIF", countryCode: "BI", purposeHint: "transport" },
  { merchantRaw: "MODERN MARKET N DJAMENA CHAD", currency: "XAF", countryCode: "TD", purposeHint: "groceries" },
  { merchantRaw: "METROBUS LA HABANA", currency: "CUP", countryCode: "CU", purposeHint: "transport" },
  { merchantRaw: "DOMLEC DOMINICA ELECTRICITY", currency: "XCD", countryCode: "DM", purposeHint: "utilities" },
  { merchantRaw: "ALFA SUPERMARKET ASMARA ERITREA", currency: "ERN", countryCode: "ER", purposeHint: "groceries" },
  { merchantRaw: "GRENLEC GRENADA ELECTRICITY", currency: "XCD", countryCode: "GD", purposeHint: "utilities" },
  { merchantRaw: "TOCA TOCA BISSAU TRANSPORT", currency: "XOF", countryCode: "GW", purposeHint: "transport" },
  { merchantRaw: "PAYLESS SUPERMARKET MARSHALL ISLANDS", currency: "USD", countryCode: "MH", purposeHint: "groceries" },
  { merchantRaw: "POHNPEI UTILITIES CORPORATION", currency: "USD", countryCode: "FM", purposeHint: "utilities" },
  { merchantRaw: "RAMS SUPERMARKET ST KITTS", currency: "XCD", countryCode: "KN", purposeHint: "groceries" },
  { merchantRaw: "LUCELEC SAINT LUCIA ELECTRICITY", currency: "XCD", countryCode: "LC", purposeHint: "utilities" },
  { merchantRaw: "KINGSTOWN MINIBUS SVG", currency: "XCD", countryCode: "VC", purposeHint: "transport" },
  { merchantRaw: "PHENICIA SUPERMARKET JUBA", currency: "SSP", countryCode: "SS", purposeHint: "groceries" },
  { merchantRaw: "PUBLIC ESTABLISHMENT FOR ELECTRICITY SYRIA", currency: "SYP", countryCode: "SY", purposeHint: "utilities" },
  { merchantRaw: "MIKROLET DILI TIMOR LESTE", currency: "USD", countryCode: "TL", purposeHint: "transport" },
  { merchantRaw: "TUVALU ELECTRICITY CORPORATION", currency: "AUD", countryCode: "TV", purposeHint: "utilities" },
  { merchantRaw: "PEREKRESTOK SUPERMARKET RUSSIA", currency: "RUB", countryCode: "RU", purposeHint: "groceries" },
] as const;
for (const fixture of worldwideCoverageFiveFixtures) {
  const context = resolveTransactionContext(fixture);
  assert.equal(context.countryCode, fixture.countryCode, fixture.merchantRaw);
  assert.equal(context.purposeHint, fixture.purposeHint, fixture.merchantRaw);
  assert.equal(context.transactionTypeHint, null);
  assert.ok(context.primaryLocale);
}

const travelerFixtures = [
  { merchantRaw: "BIPA OSTERREICH DROGERIE", currency: "EUR", countryCode: "AT", purposeHint: "healthcare" },
  { merchantRaw: "BRUSSELS AIRLINES BELGIUM", currency: "EUR", countryCode: "BE", purposeHint: "travel" },
  { merchantRaw: "ETOS NEDERLAND DROGIST", currency: "EUR", countryCode: "NL", purposeHint: "healthcare" },
  { merchantRaw: "SAS FLIGHT DENMARK", currency: "DKK", countryCode: "DK", purposeHint: "travel" },
  { merchantRaw: "APOTEKET SVERIGE", currency: "SEK", countryCode: "SE", purposeHint: "healthcare" },
  { merchantRaw: "NORWEGIAN FLIGHT NORWAY", currency: "NOK", countryCode: "NO", purposeHint: "travel" },
  { merchantRaw: "YLIOPISTON APTEEKKI FINLAND", currency: "EUR", countryCode: "FI", purposeHint: "healthcare" },
  { merchantRaw: "LOT POLISH AIRLINES POLAND", currency: "PLN", countryCode: "PL", purposeHint: "travel" },
  { merchantRaw: "HONDOS CENTER GREECE HEALTH RETAIL", currency: "EUR", countryCode: "GR", purposeHint: "healthcare" },
  { merchantRaw: "TALLINK FERRY ESTONIA", currency: "EUR", countryCode: "EE", purposeHint: "travel" },
  { merchantRaw: "BENU APTIEKA LATVIA", currency: "EUR", countryCode: "LV", purposeHint: "healthcare" },
  { merchantRaw: "AIRBALTIC FLIGHT VILNIUS LITHUANIA", currency: "EUR", countryCode: "LT", purposeHint: "travel" },
  { merchantRaw: "DR MAX PHARMACY SLOVAKIA", currency: "EUR", countryCode: "SK", purposeHint: "healthcare" },
  { merchantRaw: "SAVA HOTELS RESORTS SLOVENIA", currency: "EUR", countryCode: "SI", purposeHint: "travel" },
  { merchantRaw: "FARMACIA HRVATSKA LJEKARNA", currency: "EUR", countryCode: "HR", purposeHint: "healthcare" },
  { merchantRaw: "BULGARIA AIR BULGARIA", currency: "BGN", countryCode: "BG", purposeHint: "travel" },
  { merchantRaw: "FARMACIA CATENA ROMANIA", currency: "RON", countryCode: "RO", purposeHint: "healthcare" },
  { merchantRaw: "WIZZ AIR HUNGARY", currency: "HUF", countryCode: "HU", purposeHint: "travel" },
  { merchantRaw: "ALPHAMEGA PHARMACY CYPRUS", currency: "EUR", countryCode: "CY", purposeHint: "healthcare" },
  { merchantRaw: "KM MALTA AIRLINES", currency: "EUR", countryCode: "MT", purposeHint: "travel" },
  { merchantRaw: "FARMACIAS DEL AHORRO MEXICO", currency: "MXN", countryCode: "MX", purposeHint: "healthcare" },
  { merchantRaw: "LATAM AIRLINES PERU", currency: "PEN", countryCode: "PE", purposeHint: "travel" },
  { merchantRaw: "CRUZ VERDE COLOMBIA PHARMACY", currency: "COP", countryCode: "CO", purposeHint: "healthcare" },
  { merchantRaw: "LATAM AIRLINES CHILE", currency: "CLP", countryCode: "CL", purposeHint: "travel" },
  { merchantRaw: "FARMACITY ARGENTINA PHARMACY", currency: "ARS", countryCode: "AR", purposeHint: "healthcare" },
  { merchantRaw: "BUQUEBUS URUGUAY FERRY", currency: "UYU", countryCode: "UY", purposeHint: "travel" },
  { merchantRaw: "FARMACENTER PARAGUAY PHARMACY", currency: "PYG", countryCode: "PY", purposeHint: "healthcare" },
  { merchantRaw: "BOLIVIANA DE AVIACION BOLIVIA", currency: "BOB", countryCode: "BO", purposeHint: "travel" },
  { merchantRaw: "FYBECA ECUADOR PHARMACY", currency: "USD", countryCode: "EC", purposeHint: "healthcare" },
  { merchantRaw: "SANSA AIRLINES COSTA RICA", currency: "CRC", countryCode: "CR", purposeHint: "travel" },
  { merchantRaw: "FARMACIAS ARROCHA PANAMA", currency: "PAB", countryCode: "PA", purposeHint: "healthcare" },
  { merchantRaw: "AVIANCA FLIGHT GUATEMALA", currency: "GTQ", countryCode: "GT", purposeHint: "travel" },
  { merchantRaw: "FARMACIAS KIELSA HONDURAS", currency: "HNL", countryCode: "HN", purposeHint: "healthcare" },
  { merchantRaw: "AVIANCA FLIGHT EL SALVADOR", currency: "USD", countryCode: "SV", purposeHint: "travel" },
  { merchantRaw: "FARMACIA CAROL DOMINICAN REPUBLIC", currency: "DOP", countryCode: "DO", purposeHint: "healthcare" },
  { merchantRaw: "AIR ALGERIE ALGERIA", currency: "DZD", countryCode: "DZ", purposeHint: "travel" },
  { merchantRaw: "PHARMACIE CENTRALE DE TUNISIE", currency: "TND", countryCode: "TN", purposeHint: "healthcare" },
  { merchantRaw: "EGYPTAIR MS FLIGHT", currency: "EGP", countryCode: "EG", purposeHint: "travel" },
  { merchantRaw: "GOODLIFE PHARMACY KENYA", currency: "KES", countryCode: "KE", purposeHint: "healthcare" },
  { merchantRaw: "PRECISION AIR TANZANIA", currency: "TZS", countryCode: "TZ", purposeHint: "travel" },
  { merchantRaw: "GUARDIAN PHARMACY KAMPALA UGANDA", currency: "UGX", countryCode: "UG", purposeHint: "healthcare" },
  { merchantRaw: "RWANDAIR WB FLIGHT", currency: "RWF", countryCode: "RW", purposeHint: "travel" },
  { merchantRaw: "PHARMACIE GUIGON SENEGAL", currency: "XOF", countryCode: "SN", purposeHint: "healthcare" },
  { merchantRaw: "AIR COTE D IVOIRE", currency: "XOF", countryCode: "CI", purposeHint: "travel" },
  { merchantRaw: "CLICKS PHARMACY SOUTH AFRICA", currency: "ZAR", countryCode: "ZA", purposeHint: "healthcare" },
  { merchantRaw: "PROFLIGHT ZAMBIA", currency: "ZMW", countryCode: "ZM", purposeHint: "travel" },
  { merchantRaw: "BOOTIES PHARMACY HARARE", currency: "USD", countryCode: "ZW", purposeHint: "healthcare" },
  { merchantRaw: "AFRICA WORLD AIRLINES GHANA", currency: "GHS", countryCode: "GH", purposeHint: "travel" },
  { merchantRaw: "HEALTHPLUS PHARMACY NIGERIA", currency: "NGN", countryCode: "NG", purposeHint: "healthcare" },
  { merchantRaw: "ROYAL AIR MAROC MOROCCO", currency: "MAD", countryCode: "MA", purposeHint: "travel" },
  { merchantRaw: "マツモトキヨシ 日本", currency: "JPY", countryCode: "JP", purposeHint: "healthcare" },
  { merchantRaw: "대한항공 대한민국", currency: "KRW", countryCode: "KR", purposeHint: "travel" },
  { merchantRaw: "国药控股 药房 中国", currency: "CNY", countryCode: "CN", purposeHint: "healthcare" },
  { merchantRaw: "INDIGO 6E FLIGHT INDIA", currency: "INR", countryCode: "IN", purposeHint: "travel" },
  { merchantRaw: "LAZZ PHARMA BANGLADESH", currency: "BDT", countryCode: "BD", purposeHint: "healthcare" },
  { merchantRaw: "PAKISTAN INTERNATIONAL AIRLINES", currency: "PKR", countryCode: "PK", purposeHint: "travel" },
  { merchantRaw: "HEALTHGUARD PHARMACY SRI LANKA", currency: "LKR", countryCode: "LK", purposeHint: "healthcare" },
  { merchantRaw: "BUDDHA AIR NEPAL", currency: "NPR", countryCode: "NP", purposeHint: "travel" },
  { merchantRaw: "ЕВРОФАРМА КАЗАХСТАН", currency: "KZT", countryCode: "KZ", purposeHint: "healthcare" },
  { merchantRaw: "UZBEKISTAN AIRWAYS UZBEKISTAN", currency: "UZS", countryCode: "UZ", purposeHint: "travel" },
] as const;
for (const fixture of travelerFixtures) {
  const context = resolveTransactionContext(fixture);
  assert.equal(context.countryCode, fixture.countryCode, fixture.merchantRaw);
  assert.equal(context.purposeHint, fixture.purposeHint, fixture.merchantRaw);
  assert.equal(context.transactionTypeHint, null);
  assert.equal(context.travelLikely, fixture.purposeHint === "travel");
}

assert.equal(WORLD_ESSENTIAL_SERVICE_CONTEXT_ENTRIES.length, 228);
for (const entry of WORLD_ESSENTIAL_SERVICE_CONTEXT_ENTRIES) {
  const context = resolveTransactionContext({ merchantRaw: entry.aliases[0], currency: entry.currency });
  assert.equal(context.countryCode, entry.countryCode, entry.aliases[0]);
  assert.equal(context.purposeHint, entry.purposeHint, entry.aliases[0]);
  assert.equal(context.transactionTypeHint, null, entry.aliases[0]);
}

for (const description of ["A BIT OF SOFTWARE", "WAVE HOTEL", "METRO MARKET", "MODE PAYMENT"]) {
  const context = resolveTransactionContext({ description, currency: "USD" });
  assert.equal(context.countryCode, null);
  assert.equal(context.paymentRail, null);
}

for (const description of ["BONUS PAYMENT", "MAXI DRESS", "BINGO GAME", "BRAVO MUSIC", "GLOBUS MAP", "AURORA HOTEL"]) {
  const context = resolveTransactionContext({ description, currency: "USD" });
  assert.equal(context.countryCode, null);
  assert.equal(context.paymentRail, null);
}

for (const description of ["ORANGE DRESS", "CASINO GAME", "TRUST EXERCISE", "COOP SOFTWARE", "FINEST HOTEL"]) {
  const context = resolveTransactionContext({ description, currency: "USD" });
  assert.equal(context.countryCode, null);
  assert.equal(context.paymentRail, null);
}

for (const description of ["SHELL SCRIPT", "CLARO PHOTO", "TIGO SPORTS", "CIRCLE K THEORY", "TOTAL REWARDS"]) {
  const context = resolveTransactionContext({ description, currency: "USD" });
  assert.equal(context.countryCode, null);
  assert.equal(context.purposeHint, null);
}

for (const description of ["QUICK NOTE", "HAPPY SONG", "UNIVERSAL REMOTE", "DISCOVERY CHANNEL", "JUBILEE PARTY"]) {
  const context = resolveTransactionContext({ description, currency: "USD" });
  assert.equal(context.countryCode, null);
  assert.equal(context.purposeHint, null);
}

for (const description of ["BIPA FILE", "MATAS NOTE", "LOT NUMBER", "CLICKS MOUSE", "AIR PEACE TALKS"]) {
  const context = resolveTransactionContext({ description, currency: "USD" });
  assert.equal(context.countryCode, null);
  assert.equal(context.purposeHint, null);
}

for (const description of ["TEAM MEETING", "POST LETTER", "FLOW CHART", "A1 PAPER", "TIM CLOCK", "MTS FILE"]) {
  const context = resolveTransactionContext({ description, currency: "USD" });
  assert.equal(context.countryCode, null);
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
