import { encodeLocalReceiptOcr } from "../lib/local-receipt-ocr-envelope";
import { resolvePositiveImportDocumentRoute } from "../lib/positive-import-route";
import { parseReceiptPhotoText, assessReceiptPreviewQuality } from "../lib/split-bill";
import { columnReceipt } from "./receipt-column-settlement-regression";
import assert from "node:assert/strict";
import { classifyUnsettledPurchaseDocument, type UnsettledPurchaseDocument } from "../lib/purchase-document-payment";
import { assessFinancialUploadScope } from "../lib/financial-upload-scope";

const examples: [string, UnsettledPurchaseDocument | null][] = [
  [columnReceipt, null],
  ["Sales Invoice\nTotal PHP 120.00\nTotal Paid PHP120.00", null],
  ["Sales Invoice\nTotal PHP 120.00\nTotal Paid USD120.00", "unverified_invoice"],
  ["Sales Invoice\nTotal PHP 120.00\nTotal Paid PHP20.00", "unverified_invoice"],
  ["Sales Invoice\nTotal PHP 120.00\nTotal Paid PHP120.00\nRemaining Balance PHP 10.00", "unpaid_invoice"],
  [columnReceipt.replace('750.00', '749.00'), "unverified_invoice"],
  [columnReceipt + "\nStatus: Unpaid", "unpaid_invoice"],
  ["Tax Invoice\nStatus: Unpaid\nTotal ₱425.00", "unpaid_invoice"],
  ["Invoice #PH-123\nPayment status: Pending payment\nTotal ₱425.00", "unpaid_invoice"],
  ["Invoice\nAmount paid PHP 100.00\nBalance due PHP 325.00", "unpaid_invoice"],
  ["Invoice\nAmount paid PHP 100.00\nAmount due PHP 325.00", "unpaid_invoice"],
  ["Sales Invoice\nInvoice No: SI-15\nTotal ₱425.00\nPayment Method: Bank Transfer", "unverified_invoice"],
  ["Commercial Invoice\nAmount paid ₱0.00\nTotal ₱425", "unpaid_invoice"],
  ["Sales Invoice\nGrand Total 42.00\nTotal Paid 42.00\nTotal Paid 24.00", "unverified_invoice"],
  ["Quotation No. Q-44\nTotal ₱425.00", "quote"],
  ["Pro Forma Invoice\nPayment Method: Card\nTotal ₱425.00", "quote"],
  ["Tax Invoice\nPayment status: Paid in full\nBalance Due: PHP 0.00", null],
  ["Sales Invoice\nTotal PHP 425.00\nApproval Code: AC8071", null],
  ["Invoice\nTotal ₱425.00\nAmount paid ₱425.00\nAmount due ₱0.00", null],
  ["Official Receipt\nAmount due ₱425.00\nCash ₱500\nChange ₱75", null],
  ["Credit Card Statement\nInvoice\nBalance Due: ₱425.00", null],
  ["Tax Invoice\nTotal ₱425.00\nCash tendered ₱500.00\nChange ₱75.00", null],
  ["Official Receipt\nTotal ₱425\n\nTake our survey\nQuotation\nTerms and conditions apply", null],
];

for (const [source, expected] of examples) {
  assert.equal(classifyUnsettledPurchaseDocument(source), expected, source);
  if (expected) {
    for (const [fileName, fileType] of [["scan.jpg", "image/jpeg"], ["document.pdf", "application/pdf"]]) {
      assert.equal(assessFinancialUploadScope({ text: source, fileName, fileType }).decision, "financial", source);
    }
  }
}
console.log(`${examples.length} purchase-document evidence cases passed`);

for (const source of ["Purchase Order", "Purchase Order No. PO-123"]) {
  assert.equal(classifyUnsettledPurchaseDocument(source + "\nTea PHP 20.00\nTotal PHP 20.00"), "purchase_order");
  assert.equal(classifyUnsettledPurchaseDocument("Official Receipt\n" + source + "\nTotal PHP 20.00"), null);
}
assert.equal(classifyUnsettledPurchaseDocument("Invoice\nTotal PHP 120.00\nAmount Paid PHP 20.00"), "unverified_invoice");
assert.equal(classifyUnsettledPurchaseDocument("Invoice\nTotal PHP 120.00\nAmount Paid USD 120.00"), "unverified_invoice");
assert.equal(classifyUnsettledPurchaseDocument("Invoice\nTotal PHP 120.00\nAmount Paid PHP 120.00"), null);
assert.equal(classifyUnsettledPurchaseDocument("Sales Invoice\nTotal 1.200,00 EUR\nAmount Paid 1.200,00 EUR"), null);
assert.equal(classifyUnsettledPurchaseDocument("Invoice\nTotal 1.200,00 EUR\nAmount Paid 20,00 EUR"), "unverified_invoice");

const order = "Green Cafe\nPurchase Order #PO-52\n2026-11-19\nQty Item Amount\n1 Tea 20.00\nSubtotal 20.00\nTotal PHP 20.00";
for (const source of [order, encodeLocalReceiptOcr({text: order})]) {
  assert.equal(resolvePositiveImportDocumentRoute(source), null);
  const draft = parseReceiptPhotoText(source);
  assert.equal(draft.requiresReview, true);
  assert.equal(assessReceiptPreviewQuality(draft).reliableForFastPath, false);
}

for (const [code, symbol] of [["PHP", "₱"], ["EUR", "€"], ["GBP", "£"]]) {
  assert.equal(classifyUnsettledPurchaseDocument("Sales Invoice\nTotal " + code + " 120.00\nAmount paid 120.00 " + symbol), null);
}
assert.equal(classifyUnsettledPurchaseDocument("Tax Invoice\nTotal USD 120.00\nAmount Paid $120.00"), "unverified_invoice");
const unpaidSlip = "Green Cafe\nOfficial Receipt\nQty Item Amount\n1 Tea 20.00\nSubtotal 20.00\nTotal PHP 20.00\nStatus: Partially paid";
for (const source of [unpaidSlip, encodeLocalReceiptOcr({ text: unpaidSlip })]) {
  assert.equal(resolvePositiveImportDocumentRoute(source), null);
  assert.equal(parseReceiptPhotoText(source).requiresReview, true);
}

assert.equal(classifyUnsettledPurchaseDocument("Official Receipt\nPayment status: Pending\nTotal PHP 20.00"), "unpaid_receipt");

const exactCashInvoice = "INVOICE\nGrand Total: 20.00\nCash: 20.00\nChange: 0.00";
assert.equal(classifyUnsettledPurchaseDocument(exactCashInvoice), null);
assert.equal(classifyUnsettledPurchaseDocument(exactCashInvoice.replace("Cash: 20.00", "Cash: 19.00")), "unverified_invoice");
assert.equal(classifyUnsettledPurchaseDocument(exactCashInvoice + "\nOutstanding balance RM 1.00"), "unpaid_invoice");
assert.equal(classifyUnsettledPurchaseDocument(exactCashInvoice.replace("Change: 0.00", "")), "unverified_invoice");

const speedMartInvoice = "Invoice No: 18314/102/T0422\nTotal Sales (Inclusive GST) RM 9.90\nCASH RM 10.00\nCHANGE RM .10";
assert.equal(classifyUnsettledPurchaseDocument(speedMartInvoice), null);
assert.equal(classifyUnsettledPurchaseDocument(speedMartInvoice.replace(".10", ".20")), "unverified_invoice");
assert.equal(classifyUnsettledPurchaseDocument(speedMartInvoice + "\nOutstanding balance RM 1.00"), "unpaid_invoice");
assert.equal(classifyUnsettledPurchaseDocument(speedMartInvoice + "\nVisa RM 1.00"), "unverified_invoice");

const exactGstCash = "Tax Invoice\nTotal (Inclusive of GST): 9.10\nTOTAL: 9.10\nCash: 9.10\nGST Summary Amount (RM) Tax(RM)";
assert.equal(classifyUnsettledPurchaseDocument(exactGstCash), null);
assert.equal(classifyUnsettledPurchaseDocument(exactGstCash.replace("Cash: 9.10", "Cash: 8.10")), "unverified_invoice");
assert.equal(classifyUnsettledPurchaseDocument(exactGstCash.replace("TOTAL: 9.10", "TOTAL: 9.00")), "unverified_invoice");
assert.equal(classifyUnsettledPurchaseDocument(exactGstCash + "\nWallet: 1.00"), "unverified_invoice");
assert.equal(classifyUnsettledPurchaseDocument(exactGstCash + "\nBalance due: 2.00"), "unpaid_invoice");
