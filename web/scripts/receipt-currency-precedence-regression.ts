import { parseReceiptPhotoText } from "../lib/split-bill";
import { readPrintedReceiptCurrency } from "../lib/receipt-currency-evidence";
import assert from "node:assert/strict";
import { captureReceiptLocation } from "../../shared/receipt-capture-location";
import { applyReceiptDefaultCurrency } from "../lib/receipt-intake";
import { incompleteReceiptFields } from "../lib/receipt-review";

const splitReceipt = "Sample Cafe\nOFFICIAL RECEIPT\n2026-11-19\nDrink 80.00\nTotal Amount 80.00";
const located = parseReceiptPhotoText(splitReceipt + "\nCITY OF MAKATI FOURTH DISTRICT", "USD");
assert.equal(located.currency, "PHP");
assert.equal(located.currencySource, "receipt_location");
assert.equal(located.currencyWarning, null);
assert.equal(parseReceiptPhotoText(splitReceipt, "SGD").currency, "SGD");
assert.equal(parseReceiptPhotoText(splitReceipt + "\nCity of Makati\nCurrency: USD", "PHP").currency, "USD");
assert.equal(parseReceiptPhotoText(splitReceipt + "\nCurrency: USD\nCurrency: PHP", "PHP").currency, "MIXED");

const now = Date.now();
const date = new Date(now).toISOString().slice(0, 10);
const capture = captureReceiptLocation({ countryCode: "ID", locatedAt: new Date(now).toISOString(), accuracyMeters: 100 }, now);
assert.ok(capture);
const draft = {
  merchant_raw: "Harbour Coffee", transaction_date: date, total: 185, currency: "USD", confidence_score: 90,
  parser_evidence: { source_text: "Paid USD 185", reason: "Initial extraction" },
  line_items: [
    { currency: "USD", parser_evidence: { reason: "Receipt line item parsed from OCR" } },
    { currency: "EUR", parser_evidence: { reason: "Printed item currency" } },
  ],
  currency_resolution: undefined as { source?: string; currency?: string | null; original?: string | null; evidence?: string } | undefined,
};
const parse = (text: string) => applyReceiptDefaultCurrency(draft, "GBP", text, capture);
const wrapped = parse("OFFICIAL RECEIPT\nPhilippines\nTotal Php\n185\nPaid with USD 3.35");
assert.equal(wrapped.currency, "PHP");
assert.equal(wrapped.currency_resolution?.source, "printed_currency");
assert.equal(wrapped.currency_resolution?.original, "USD");
assert.equal(wrapped.line_items[0].currency, "PHP");
assert.equal(wrapped.line_items[1].currency, "EUR");
assert.equal(wrapped.parser_evidence, draft.parser_evidence);
assert.deepEqual(applyReceiptDefaultCurrency(wrapped, "GBP", "OFFICIAL RECEIPT\nPhilippines\nTotal Php\n185\nPaid with USD 3.35", capture), wrapped);

assert.equal(parse("Philippines\nTOTAL USD 185\nPayment amount PHP 10,000").currency, "USD");
assert.equal(parse("Singapore 238839\nTOTAL $185").currency, "SGD");
assert.equal(parse("Japan\nTOTAL ¥185").currency, "JPY");
assert.equal(parse("TOTAL S$185").currency, "SGD");
assert.equal(parse("Jumlah bayar Rp185.000").currency, "IDR");
assert.equal(parse("결제금액 185원").currency, "KRW");
assert.equal(parse("TOTAL 185 rupiah").currency, "IDR");
assert.equal(applyReceiptDefaultCurrency({ ...draft, parser_evidence: { reason: "No optical text" } }, "GBP").currency, "GBP");
assert.equal(parse("OFFICIAL RECEIPT\nTOTAL £185\nPromo: Get USD 10 off").currency, "GBP");
assert.equal(parse("Japan\nTOTAL 185").currency_resolution?.source, "receipt_location");
assert.equal(parse("Coffee\nTOTAL $185").currency_resolution?.source, "device_location");
assert.equal(parse("Coffee\nTOTAL $185").currency, "IDR");
const profile = applyReceiptDefaultCurrency(draft, "GBP", "TOTAL 185");
assert.equal(profile.currency_resolution?.source, "user_default");
assert.equal(profile.currency_resolution?.evidence, "Profile default currency");
assert.equal(applyReceiptDefaultCurrency(profile, "GBP", "TOTAL ₱185", capture).currency_resolution?.original, "USD");
const conflict = parse("TOTAL USD 185\nGRAND TOTAL EUR 185");
assert.equal(conflict.currency, null);
assert.equal(conflict.currency_resolution?.source, "printed_conflict");
assert.deepEqual(incompleteReceiptFields(conflict), ["currency"]);
assert.equal(draft.currency, "USD");
console.log("Receipt currency evidence passed for total, tender, regional symbols, capture, Profile default, replay, and printed conflicts.");

assert.equal(readPrintedReceiptCurrency("Makati City\nAmount Due P99.80")?.kind, "printed");
assert.deepEqual(readPrintedReceiptCurrency("Philippines\nBill Amount\nP 99.80"), {kind:"printed", currency:"PHP", evidence:"P"});
assert.equal(readPrintedReceiptCurrency("Amount Due P99.80", "PHP"), null);
assert.equal(readPrintedReceiptCurrency("Philippines\nJapan\nAmount Due P99.80"), null);
assert.equal(readPrintedReceiptCurrency("Philippines\nProduct P99.80"), null);
assert.equal(readPrintedReceiptCurrency("Philippines\nAmount Due P99.80\nCurrency: USD")?.kind, "conflict");
