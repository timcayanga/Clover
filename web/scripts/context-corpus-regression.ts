import assert from "node:assert/strict";
import { CONTEXT_CORPUS_VERSION, getContextCorpusEntries, resolveTransactionContext } from "@/lib/context-corpus";

assert.ok(CONTEXT_CORPUS_VERSION);
assert.ok(getContextCorpusEntries().length >= 20);

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

console.log(`context corpus regression passed (${CONTEXT_CORPUS_VERSION})`);
