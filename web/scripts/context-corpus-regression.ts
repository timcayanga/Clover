import assert from "node:assert/strict";
import { CONTEXT_CORPUS_VERSION, deriveTravelEpisodes, getContextCorpusCoverageReport, getContextCorpusEntries, getContextCorpusQualityReport, parseRegionalAmountValue, parseRegionalDateValue, resolveTransactionContext } from "@/lib/context-corpus";

assert.ok(CONTEXT_CORPUS_VERSION);
assert.ok(getContextCorpusEntries().length >= 800);
assert.ok(getContextCorpusQualityReport().profileCount >= 119);
assert.equal(getContextCorpusQualityReport().valid, true);
const coverage = getContextCorpusCoverageReport();
assert.equal(coverage.corpusVersion, CONTEXT_CORPUS_VERSION);
assert.ok(coverage.canonicalEntryCount >= 800);
assert.ok(coverage.descriptorVariantEntryCount > 60000);
assert.ok(Object.keys(coverage.countryCounts).length >= 120);
assert.ok(coverage.currencies.length >= 95);
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
  assert.equal(context.purposeHint, fixture.purposeHint);
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
