import assert from "node:assert/strict";
import { CONTEXT_CORPUS_VERSION, deriveTravelEpisodes, getContextCorpusEntries, getContextCorpusQualityReport, parseRegionalAmountValue, parseRegionalDateValue, resolveTransactionContext } from "@/lib/context-corpus";

assert.ok(CONTEXT_CORPUS_VERSION);
assert.ok(getContextCorpusEntries().length >= 20);
assert.equal(getContextCorpusQualityReport().valid, true);

const gcash = resolveTransactionContext({ merchantRaw: "GCASH CASH IN", currency: "PHP" });
assert.equal(gcash.countryCode, "PH");
assert.equal(gcash.paymentRail, "gcash");
assert.equal(gcash.transactionTypeHint, "transfer");
assert.equal(gcash.primaryLocale, "en-PH");
assert.equal(gcash.dateOrder, "mdy");
assert.equal(gcash.decimalSeparator, ".");

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

const salary = resolveTransactionContext({ description: "SALARY CREDIT", currency: "PHP" });
assert.equal(salary.categoryHint, "Income");
assert.equal(salary.transactionTypeHint, "income");

const falsePositive = resolveTransactionContext({ merchantRaw: "VISA CAFE", currency: "PHP" });
assert.equal(falsePositive.paymentRail, null);
assert.equal(falsePositive.institutionType, "card_network");

assert.equal(parseRegionalDateValue("31/12/2025", "ID")?.toISOString().slice(0, 10), "2025-12-31");
assert.equal(parseRegionalDateValue("12/31/2025", "US")?.toISOString().slice(0, 10), "2025-12-31");
assert.equal(parseRegionalAmountValue("1.234,56", "ID"), 1234.56);
assert.equal(parseRegionalAmountValue("1,234.56", "PH"), 1234.56);
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
