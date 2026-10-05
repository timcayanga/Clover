import assert from "node:assert/strict";
import { hasReceiptPhotoEvidence, applyReceiptDefaultCurrency, hasCompleteReceiptCore, receiptSummaryReconciles, inferReceiptLocationCurrency, receiptCacheQualityPercent } from "../lib/receipt-intake";
import { inferOpenAIDocumentFamily } from "../lib/openai-import-parser";
import { assessFinancialUploadScope } from "../lib/financial-upload-scope";
import { parseReceiptText, assessReceiptPreviewQuality } from "../lib/split-bill";
import { encodeLocalReceiptOcr } from "../lib/local-receipt-ocr-envelope";

const photo = `CAN COFFEE CORP.
MANDALUYONG NCR PHILIPPINES
Sales Invoice No: 014731
1:05pm, Fri 11 Sep 2026
Order Method: Take Out
Iced Latte 205.00
Cereal Milk Cold Brew 220.00
Subtotal 425.00
VATABLE SALES 379.46
VAT AMOUNT 45.54
TOTAL 425.00
Payment Type: Card`;
assert.equal(hasReceiptPhotoEvidence(photo), true);
assert.notEqual(inferOpenAIDocumentFamily({ text: photo, fileName: "receipt.jpg", importMode: "statement" }), "investment_history", "Method is not ETH");
for (const word of ["method", "refund", "thousands", "subscription fee"]) {
  if (word === "subscription fee") continue;
  assert.notEqual(inferOpenAIDocumentFamily({ text: word, fileName: "photo.jpg", importMode: "statement" }), "investment_history");
}
assert.equal(inferOpenAIDocumentFamily({ text: "ETH holdings market value 100", fileName: "portfolio.jpg", importMode: "statement" }), "investment_history");
assert.equal(hasReceiptPhotoEvidence("Bank statement\nOpening balance 100\nClosing balance 200\nReceipt number 55\nTOTAL 100"), false);
const raw = { currency: null, confidence_score: .98, parser_evidence: { reason: "Image extraction", source_text: "Harbour Cafe\nTotal 425.00" } };
const defaulted = applyReceiptDefaultCurrency(raw, "PHP");
assert.equal(defaulted.currency, "PHP");
assert.equal(defaulted.confidence_score, .69);
assert.equal(raw.currency, null, "Raw response is never overwritten");
assert.equal(defaulted.parser_evidence.source_text, raw.parser_evidence.source_text, "Default must not be inserted into printed text");
assert.equal(applyReceiptDefaultCurrency({ ...raw, currency: "KRW" }, "PHP").currency, "KRW");
assert.equal(applyReceiptDefaultCurrency({ ...raw, currency: "MIXED" }, "EUR").currency, "EUR");
assert.equal(applyReceiptDefaultCurrency(defaulted, "EUR").currency, "EUR", "Cached suggestions use the current default, never invent printed evidence");
assert.equal(applyReceiptDefaultCurrency({ ...defaulted, currency: "KRW" }, "EUR").currency, "KRW", "A corrected currency survives replay");
assert.ok(receiptSummaryReconciles({ subtotal: 425, total: 425, tax:45.54, tip:null,discount:null,service_charge:null }));
assert.ok(receiptSummaryReconciles({ subtotal: 379.46, total: 425, tax:45.54, tip:null,discount:null,service_charge:null }));
assert.equal(receiptSummaryReconciles({ subtotal: 400, total: 425, tax:45.54, tip:null,discount:null,service_charge:null }), false);
assert.equal(hasCompleteReceiptCore({ merchant_raw:"Store",merchant_clean:null,transaction_date:"2026-02-30",total:425 }), false);
assert.equal(hasCompleteReceiptCore({ merchant_raw:"Store",merchant_clean:null,transaction_date:"2026-09-11",total:425 }), true);
for (const text of [photo, "영수증\n결제금액 12,000원", "STRUK\nTOTAL Rp125.000", "to...al 4?5"]) {
  assert.notEqual(assessFinancialUploadScope({ text, fileName:"photo.jpg" }).decision, "non_financial");
}
for (const text of ["Meeting agenda and minutes. Discuss the project objectives and team responsibilities. ".repeat(8), "Coupon SPECIAL OFFER 50% OFF! Redeem by 10/10/2026. Menu coffee PHP 100.00"]) {
  assert.equal(assessFinancialUploadScope({ text, fileName:"photo.jpg" }).decision, "non_financial");
}
const preview = parseReceiptText(photo);
assert.equal(Number(preview.total), 425);
assert.ok(!assessReceiptPreviewQuality(preview).issues.includes("summary does not reconcile"), "VAT-inclusive receipt does not trigger a retry");
const optical = encodeLocalReceiptOcr({ text: `Harbour Coffee Company
SALES INVOICE
1:05pm, Fri 11 Sep 2026
MIN: 26052506545840040
Order#: 1789103132
Espresso 205.00
Cold Brew 220.00
Subtotal
425.00
VAT AMOUNT
45, 54
TOTAL
425. 00
Total Qty
2
CARD 425.00
Accred No. 0525023192062021121484
Date Issued: 12/21/2021`, source: "apple_vision", originalTextPreserved: true });
const opticalPreview = parseReceiptText(optical);
assert.equal(opticalPreview.total, "425.00", "Printed total wins over item counts and printer IDs");
assert.equal(opticalPreview.tax, "45.54", "OCR decimal separators retain cents");
assert.equal(opticalPreview.billDate?.slice(0, 10), "2026-09-11", "Purchase date precedes footer accreditation date");
assert.equal(opticalPreview.merchantName, "Harbour Coffee Company", "Document heading isn't a merchant");
assert.equal(opticalPreview.requiresReview, true);
assert.equal(opticalPreview.receiptText, optical);
assert.equal(opticalPreview.items.length, 2, "IDs and payment tender are not purchases");
console.log("Receipt intake: unfamiliar photo routing, honest default currency, VAT, partial-core safety and pre-AI relevance passed.");

const located = applyReceiptDefaultCurrency(raw, "USD", photo);
assert.equal(located.currency, "PHP");
assert.equal(located.currency_resolution.source, "receipt_location");
assert.equal(located.currency_resolution.requiresReview, true);
assert.equal(applyReceiptDefaultCurrency({...raw,currency:"USD"}, "PHP", photo).currency, "USD");
assert.equal(inferReceiptLocationCurrency("Singapore 238839")?.currency, "SGD");
assert.equal(inferReceiptLocationCurrency("Jakarta 12190")?.currency, "IDR");
assert.equal(inferReceiptLocationCurrency("서울특별시 강남구")?.currency, "KRW");
assert.equal(inferReceiptLocationCurrency("Philippines\nUnited States"), null);
assert.equal(inferReceiptLocationCurrency("Maya Coffee\nTOTAL 425"), null);
assert.equal(applyReceiptDefaultCurrency(raw, "EUR").currency, "EUR");

// Synthetic abbreviated invoice, including a stored-value tender and VAT grid.
const abbreviatedInvoice = "Harbour Coffee\n09/09/26 2:16 PM\nInv. No.: 00000042\nTotal Php\nCoffee Card\n360\n-360\nVAT 39";
assert.equal(hasReceiptPhotoEvidence(abbreviatedInvoice), true, "Recognize a camera invoice before the general statement parser");
assert.equal(hasReceiptPhotoEvidence("Bank statement\nOpening balance 100\nClosing balance 200\nInv. No.: 42\nTotal Php 100"), false);

assert.equal(receiptCacheQualityPercent({score:10, issues:[]}),100);
assert.equal(receiptCacheQualityPercent({score:7, issues:[]}),70);
assert.equal(receiptCacheQualityPercent({score:90, issues:[]}),90);
assert.equal(receiptCacheQualityPercent({score:10, issues:["date missing"]}),null);
assert.equal(receiptCacheQualityPercent({score:10, critical:true}),null);
assert.equal(receiptCacheQualityPercent({score:NaN}),null);
