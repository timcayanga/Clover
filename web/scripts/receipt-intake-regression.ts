import { resolveEarlyPhotoImportRoute, resolvePositiveImportDocumentRoute } from "../lib/positive-import-route";
import { qualifyDeviceReceiptReading } from "../lib/device-receipt-reading";
import { splitReceiptPromotionalFooter } from "../lib/receipt-promotional-footer";
import { repairReceiptDateFromEvidence } from "../lib/receipt-date-evidence";
import assert from "node:assert/strict";
import { hasReceiptPhotoEvidence, selectSavedStatementReceiptText, shouldRecoverEmptyStatementImageAsReceipt, applyReceiptDefaultCurrency, hasCompleteReceiptCore, receiptSummaryReconciles, inferReceiptLocationCurrency, receiptCacheQualityPercent } from "../lib/receipt-intake";
import { inferOpenAIDocumentFamily } from "../lib/openai-import-parser";
import { assessFinancialUploadScope } from "../lib/financial-upload-scope";
import { parseReceiptText, assessReceiptPreviewQuality } from "../lib/split-bill";
import { normalizeDeviceTextEvidence, type OpticalTextLine } from "../../shared/device-text-evidence";
import { encodeLocalReceiptOcr, readReceiptOpticalLayout, readReceiptOpticalEvidence, hasConflictingReceiptTotalReading } from "../lib/local-receipt-ocr-envelope";

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
const emptyStatement = {
  image: true, mode: "statement", transactionHistory: false,
  hasStatementRows: false, hasSavedRows: false, opticalText: photo,
};
assert.equal(shouldRecoverEmptyStatementImageAsReceipt(emptyStatement), true);
assert.equal(shouldRecoverEmptyStatementImageAsReceipt({
  ...emptyStatement, opticalText: "CAN COFFEE CORP.\nSales Invoice No: 014731\n09/11/2026\nSubtotal unreadable",
}), true, "A recognizable receipt missing its total can open a saved draft");
for (const change of [
  { image: false }, { transactionHistory: true }, { hasStatementRows: true },
  { hasSavedRows: true }, { opticalText: "Order menu special 425.00" },
  { opticalText: photo + "\nTransaction History" },
]) assert.equal(shouldRecoverEmptyStatementImageAsReceipt({ ...emptyStatement, ...change }), false);
assert.notEqual(inferOpenAIDocumentFamily({ text: photo, fileName: "receipt.jpg", importMode: "statement" }), "investment_history", "Method is not ETH");
for (const word of ["method", "refund", "thousands", "subscription fee"]) {
  if (word === "subscription fee") continue;
  assert.notEqual(inferOpenAIDocumentFamily({ text: word, fileName: "photo.jpg", importMode: "statement" }), "investment_history");
}
// Rename the same image without supplying any new visible evidence.
for (const fileName of ["1686710083.webp", "gcash-wallet.jpg", "investment-portfolio.png", "electronic-ticket.jpg", "statement.csv"]) {
  const hints = { fileName, fileType: "image/jpeg", parsedRowsCount: 4, metadataConfidence: 99, hasInstitution: true };
  assert.equal(assessFinancialUploadScope({ ...hints, text: "A note for 2026-08-01" }).decision, "ambiguous");
  assert.equal(assessFinancialUploadScope({ ...hints, text: "Resume Studio\nProfessional experience\nEmployment history" }).decision, "non_financial");
  assert.equal(assessFinancialUploadScope({ ...hints, text: photo }).decision, "financial");
  assert.equal(inferOpenAIDocumentFamily({ ...hints, text: "", importMode: "statement" }), "generic_document");
  assert.equal(inferOpenAIDocumentFamily({ ...hints, text: "Bank Statement\nOpening Balance", importMode: "statement" }), "bank_statement");
}
assert.equal(inferOpenAIDocumentFamily({ text: "ETH holdings market value 100", fileName: "portfolio.jpg", importMode: "statement" }), "investment_history");
assert.equal(hasReceiptPhotoEvidence("Bank statement\nOpening balance 100\nClosing balance 200\nReceipt number 55\nTOTAL 100"), false);
const raw = { currency: null, confidence_score: .98, parser_evidence: { reason: "Image extraction", source_text: "Harbour Cafe\nTotal 425.00" } };
const defaulted = applyReceiptDefaultCurrency(raw, "PHP");
assert.equal(defaulted.currency, "PHP");
assert.equal(defaulted.confidence_score, .98);
assert.equal(raw.currency, null, "Raw response is never overwritten");
assert.equal(defaulted.parser_evidence.source_text, raw.parser_evidence.source_text, "Default must not be inserted into printed text");
assert.equal(applyReceiptDefaultCurrency({ ...raw, currency: "KRW" }, "PHP").currency, "PHP", "An unquoted currency guess is not printed evidence");
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
for (const footer of [
  "ADVERTISEMENT: Save on your next purchase\nTotal USD 999.00",
  "Join our loyalty rewards program\nRewards 100.00\nOffer expires 10/31/2026",
  "Scan this QR code for a discount\nTotal USD 50.00",
  "Take our customer survey\nWin USD 50.00\n11/01/2026",
]) {
  const original = photo + "\n" + footer;
  assert.equal(assessFinancialUploadScope({ text: original, fileName: "IMG_1249.jpg" }).decision, "financial");
  const parsed = parseReceiptText(original);
  assert.equal(parsed.receiptText, original, "The original OCR evidence includes the footer");
  assert.deepEqual([parsed.merchantName, parsed.billDate, parsed.total, parsed.currency, parsed.items],
    [preview.merchantName, preview.billDate, preview.total, preview.currency, preview.items]);
}
// Model a real OCR block ordering error: the left-hand promotion was
// emitted before the amount in the purchase total's right-hand cell.
const opticalLines: OpticalTextLine[] = [
  { text: "CLOVER CAFE", box: [.05, .04, .50, .08] },
  { text: "Official Receipt", box: [.05, .10, .54, .14] },
  { text: "2026-09-11", box: [.06, .16, .40, .20] },
  { text: "Total", box: [.05, .30, .24, .34] },
  { text: "Take our survey", box: [.05, .45, .60, .50] },
  { text: "Total USD 999.00", box: [.05, .53, .65, .57] },
  { text: "PHP 425.00", box: [.70, .30, .95, .34] },
];
const deviceOcr = {
  version: 1, source: "apple_vision", pagesRead: 1, totalPages: 1, complete: true, durationMs: 100,
  text: opticalLines.map(line => line.text).join("\n"), opticalLines,
};
const boxedReceipt = encodeLocalReceiptOcr(normalizeDeviceTextEvidence(deviceOcr)!);
assert.match(readReceiptOpticalLayout(boxedReceipt), /Total PHP 425\.00\nTake our survey/);
assert.equal(assessFinancialUploadScope({ text: boxedReceipt, fileName: "receipt.jpg" }).decision, "financial");
assert.equal(Number(parseReceiptText(boxedReceipt).total), 425);
assert.equal(parseReceiptText(boxedReceipt).currency, "PHP");
assert.equal(parseReceiptText(boxedReceipt).receiptText, boxedReceipt);
assert.equal(readReceiptOpticalLayout(encodeLocalReceiptOcr({ ...deviceOcr, opticalLines: opticalLines.slice(0, -1) })), deviceOcr.text);
// Vision can locate an edge glyph just outside the page. Other rows remain usable.
const edgeBlocks = opticalLines.map((line, index) => index === 0 ? { ...line, box: [-0.001, .04, .50, .08] } : line);
const clipped = normalizeDeviceTextEvidence({ ...deviceOcr, opticalLines: edgeBlocks });
assert.equal(clipped?.opticalLines?.length, opticalLines.length);
assert.equal(clipped?.opticalLines?.[0].box[0], 0);
const malformed = { ...deviceOcr, opticalLines: [{ text: "Total", box: [0, 2, 1, 3] }] };
assert.equal(normalizeDeviceTextEvidence(malformed)?.opticalLines, undefined);
assert.equal(normalizeDeviceTextEvidence(malformed)?.text, deviceOcr.text);
const readableLines: OpticalTextLine[] = [
  ...opticalLines,
  { text: "Espresso PHP 425.00", box: [.05, .24, .72, .27] },
];
const readableDeviceOcr = {
  ...deviceOcr, text: readableLines.map(line => line.text).join("\n"), opticalLines: readableLines,
};
const acceptedReading = qualifyDeviceReceiptReading(normalizeDeviceTextEvidence(readableDeviceOcr), "statement", "PHP");
assert.match(acceptedReading?.layout ?? "", /Total PHP 425\.00/);
assert.equal(acceptedReading?.source, encodeLocalReceiptOcr(normalizeDeviceTextEvidence(readableDeviceOcr)!),
  "Keep source text and validated geometry together");
const alternateReading = normalizeDeviceTextEvidence({
  ...readableDeviceOcr,
  opticalLines: readableLines.map(line => !line.text.startsWith("PHP 425") ? line : {
    ...line, confidence: .83, minimumCharacterConfidence: .62,
    alternatives: [{ text: "PHP 425.00", confidence: .82 }, { text: "PHP 426.00", confidence: .76 }],
    characterAlternatives: [{ index: line.text.indexOf("5"), text: "6", confidence: .29 }, { index: 900, text: "9", confidence: .4 }],
  }),
})!;
const ambiguousSource = encodeLocalReceiptOcr(alternateReading);
const totalEvidence = readReceiptOpticalEvidence(ambiguousSource).find(line => line.text.startsWith("PHP 425"))!;
assert.equal(totalEvidence.confidence, .83);
assert.equal(totalEvidence.minimumCharacterConfidence, .62);
assert.deepEqual(totalEvidence.alternatives, [{ text: "PHP 426.00", confidence: .76 }]);
assert.deepEqual(totalEvidence.characterAlternatives, [{ index: totalEvidence.text.indexOf("5"), text: "6", confidence: .29 }]);
assert.equal(qualifyDeviceReceiptReading(alternateReading, "receipt", "PHP"), null);
assert.equal(Number(parseReceiptText(ambiguousSource).total), 425, "Alternatives never replace the primary value");
assert.equal(hasConflictingReceiptTotalReading([{ ...totalEvidence, text: "TOTAL 1,425.00", characterAlternatives: undefined,
  alternatives: [{ text: "TOTAL 1425.00", confidence: .84 }] }]), false, "Equivalent formatting is not a conflict");
assert.equal(hasConflictingReceiptTotalReading([{ ...totalEvidence, text: "Total PHP 425.00", characterAlternatives: undefined,
  alternatives: [{ text: "Total PHP 426.00", confidence: .1 }] }]), false, "Weak alternatives alone do not trigger rereading");
assert.equal(hasConflictingReceiptTotalReading([
  { text: "GRAND TOTAL", box: [.1, .4, .4, .45] },
  { text: "425.00", box: [.6, .4, .8, .45], confidence: .8, alternatives: [{ text: "426.00", confidence: .72 }] },
]), true, "A distinct amount block aligns to its summary label");
const mismatchedTranscript = encodeLocalReceiptOcr({ ...alternateReading, text: "Separate revised reading" });
assert.equal(readReceiptOpticalLayout(mismatchedTranscript), "Separate revised reading");
assert.ok(readReceiptOpticalEvidence(mismatchedTranscript).some(line => line.alternatives?.length));
const missingCurrencyReading = normalizeDeviceTextEvidence({
  ...deviceOcr, opticalLines: [],
  text: "Harbour Coffee QA\nOFFICIAL RECEIPT\nOctober 04, 2026 10:05 AM\nEspresso 120.00\nSUBTOTAL 120.00\nVATABLE SALES 107.14\nVAT 12.86\nTOTAL 120.00\nCARD 120.00\nThank you!",
});
assert.ok(qualifyDeviceReceiptReading(missingCurrencyReading, "receipt", "PHP"));
assert.equal(qualifyDeviceReceiptReading({
  ...missingCurrencyReading!, text: missingCurrencyReading!.text.replace("OFFICIAL RECEIPT", "SALES INVOICE"),
}, "receipt", "PHP"), null, "An invoice without verified payment needs a server read");
assert.equal(parseReceiptText(missingCurrencyReading!.text).currency, "MIXED", "A successful gate must not write an inferred currency into source evidence");
for (const mode of ["portfolio", "account_detail", "notes"]) {
  assert.equal(qualifyDeviceReceiptReading(normalizeDeviceTextEvidence(readableDeviceOcr), mode, "PHP"), null);
}
for (const evidence of [
  null,
  { ...deviceOcr, complete: false },
  { ...deviceOcr, opticalLines: opticalLines.slice(0, -1) },
  { ...deviceOcr, text: "Transaction History\n2026-11-12 Deposit +PHP 425.00\n2026-11-13 Transfer -PHP 25.00", opticalLines: [] },
  { ...deviceOcr, text: "CLOVER CAFE\nOfficial Receipt\n09/11/2026\nTotal unreadable", opticalLines: [] },
  { ...deviceOcr, text: "CLOVER CAFE\nOfficial Receipt\nTotal PHP 425.00", opticalLines: [] },
]) {
  assert.equal(qualifyDeviceReceiptReading(normalizeDeviceTextEvidence(evidence), "receipt", "PHP"), null);
}
const sidePromo = opticalLines.map(line => line.text === "Take our survey"
  ? { ...line, box: [.29, .30, .65, .34] as OpticalTextLine["box"] } : line);
assert.equal(splitReceiptPromotionalFooter(readReceiptOpticalLayout(encodeLocalReceiptOcr({ ...deviceOcr, opticalLines: sidePromo }))).footer,
  null, "A same-row offer is not a separate footer");
assert.equal(splitReceiptPromotionalFooter(photo + "\nScan QR code to pay").footer, null, "Payment QR is settlement evidence");
assert.equal(splitReceiptPromotionalFooter(photo + "\nTake our survey\nOfficial Receipt No. 273\nTotal 50.00").footer, null,
  "Retain a second receipt after a promotion");
const datedReceipt = "REVIEW CAFE\nReceipt\n2026-09-11\nTotal PHP 425.00";
assert.equal(repairReceiptDateFromEvidence({ transaction_date: "2026-10-31" },
  datedReceipt + "\nTake our survey\nOffer ends 2026-10-31").transaction_date, "2026-09-11");
const withAppliedDiscount = "REVIEW CAFE\nReceipt\n2026-09-11\nCoffee 50.00\nSubtotal 50.00\nDiscount 5.00\nTotal PHP 45.00";
assert.equal(parseReceiptText(withAppliedDiscount + "\nTake our survey\nRewards 20.00").discount, "5.00");
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

const located = applyReceiptDefaultCurrency(raw, "USD", photo);
assert.equal(located.currency, "PHP");
assert.equal(located.currency_resolution.source, "receipt_location");
assert.equal(located.currency_resolution.requiresReview, false);
assert.equal(applyReceiptDefaultCurrency({...raw,currency:"USD"}, "PHP", photo).currency, "PHP", "Unsubstantiated parser currency cannot outrank printed geography");
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

for (const header of ['RECEIPT', 'INVOICE', 'EXPENSE RECORD']) {
  assert(hasReceiptPhotoEvidence(`SAMPLE CONDOMINIUM ASSOCIATION\n${header}\nOct 23, 2026\nCondominium dues\nTOTAL PAID\nPHP 1,250.00`), 'A plain document heading is receipt evidence before statement parsing');
}
assert(!hasReceiptPhotoEvidence('Account statement\nRECEIPT\nOpening balance 100.00\nTOTAL 100.00'));

for (const settlement of ['TOTAL PAID\nPHP 1,250.00', 'TOTAL\nAMOUNT\nP1,250.00']) {
  const source = `SAMPLE ASSOCIATION\nTaguig City Philippines\nRECEIPT\nOct 23, 2026\nDues\n${settlement}`;
  const parsed = parseReceiptText(source);
  assert.equal(parsed.total, '1250.00', 'Use the adjacent printed settlement, not an unrelated number');
  assert.equal(parsed.receiptText, source, 'Original line boundaries remain in the source evidence');
}
const countOnly = parseReceiptText('SAMPLE CAFE\nRECEIPT\nOct 23, 2026\nTOTAL ITEMS\n12\nInvoice no 12345678');
assert.notEqual(countOnly.total, '12.00');
assert.notEqual(countOnly.total, '12345678.00');

assert(hasReceiptPhotoEvidence('SAMPLE ASSOCIATION\nOct 23, 2026\nDues and utilities\nTOTAL PAID\nPHP 1,250.00'), 'A printed paid settlement can identify a receipt without a receipt heading');
assert(!hasReceiptPhotoEvidence('Bank statement\nOpening balance 100\nTOTAL PAID\nPHP 100.00'));

assert(!hasReceiptPhotoEvidence('GCash Transaction History\n2026-10-23\nINVOICE\nTOTAL PAID\nPHP 1,250.00'), 'History screens remain statements even when they contain a receipt heading or payment summary');
assert(!hasReceiptPhotoEvidence('GCash statement\nSTARTING BALANCE 100.00\nINVOICE\nTOTAL PAID\nPHP 50.00\nENDING BALANCE 50.00'));

const positiveStatement = "BANK STATEMENT\nDate Description Debit Credit Balance\n2026-11-12 Deposit 425.00\n2026-11-13 Grocery 25.00";
assert.deepEqual(resolvePositiveImportDocumentRoute(positiveStatement), {
  mode: "statement", rule: "statement_heading_columns_and_rows",
});
assert.equal(resolvePositiveImportDocumentRoute(positiveStatement.replace("2026-11-13 Grocery 25.00", "")), null);
assert.equal(resolvePositiveImportDocumentRoute(positiveStatement.replace("Deposit", "Opening Balance").replace("Grocery", "Closing Balance")), null);
assert.equal(resolvePositiveImportDocumentRoute("Recent transactions\n2026-09-15\nCoffee purchase\n-₱125.00\nPosted\nCash deposit\n+₱500.00\nCompleted")?.mode, "statement");
assert.equal(resolvePositiveImportDocumentRoute(boxedReceipt)?.mode, "receipt");
assert.equal(resolvePositiveImportDocumentRoute("Sales Invoice\nDate: 2026-11-12\nTotal PHP 425.00\nPayment status: Unpaid"), null);
assert.equal(resolvePositiveImportDocumentRoute("Official Receipt"), null);
assert.equal(resolvePositiveImportDocumentRoute("Coupon\nRedeem before Nov 30\nSave PHP 425.00"), null);

const historyWithReceiptReference = "Recent transactions\n2026-09-15\nCoffee purchase · Receipt #42\n-₱125.00\nPosted\nCash deposit\n+₱500.00\nCompleted";
assert.equal(resolveEarlyPhotoImportRoute("", abbreviatedInvoice)?.mode, "receipt",
  "Photo evidence available during intake selects the receipt reader even before the full server read");
assert.equal(resolveEarlyPhotoImportRoute(historyWithReceiptReference, boxedReceipt)?.mode, "statement");
assert.equal(resolveEarlyPhotoImportRoute(boxedReceipt, historyWithReceiptReference)?.mode, "statement");
assert.equal(resolveEarlyPhotoImportRoute("", "Receipt\nThank you for visiting"), null);
assert.equal(resolveEarlyPhotoImportRoute("", "Sales Invoice\nTotal PHP 425.00\nPayment status: Unpaid"), null);

const isStatementReading = (text: string) => resolvePositiveImportDocumentRoute(text)?.mode === "statement";
const savedReceiptReading = encodeLocalReceiptOcr({ text: photo, source: "apple_vision" });
assert.equal(selectSavedStatementReceiptText(emptyStatement, ["", savedReceiptReading], isStatementReading), savedReceiptReading);
assert.equal(selectSavedStatementReceiptText(emptyStatement, ["", "Only thank you"], isStatementReading), null);
assert.equal(selectSavedStatementReceiptText(emptyStatement, [photo, historyWithReceiptReference], isStatementReading), null);
assert.equal(selectSavedStatementReceiptText(emptyStatement, [positiveStatement, photo], isStatementReading), null);
assert.equal(selectSavedStatementReceiptText({ ...emptyStatement, hasSavedRows: true }, [photo], isStatementReading), null);
assert.equal(selectSavedStatementReceiptText({ ...emptyStatement, hasStatementRows: true }, [photo], isStatementReading), null);
const missingTotalReading = "CAN COFFEE CORP.\nSales Invoice No: 014731\n09/11/2026\nSubtotal unreadable";
assert.equal(selectSavedStatementReceiptText(emptyStatement, [missingTotalReading], isStatementReading), missingTotalReading);
assert.equal(parseReceiptText(missingTotalReading).total, null, "The saved draft still needs the actual total");

console.log("Receipt intake: positive routing, default currency, VAT, partial-core safety and pre-AI relevance passed.");
