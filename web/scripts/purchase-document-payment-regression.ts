import { encodeLocalReceiptOcr } from "../lib/local-receipt-ocr-envelope";
import { resolvePositiveImportDocumentRoute } from "../lib/positive-import-route";
import { parseReceiptPhotoText, assessReceiptPreviewQuality } from "../lib/split-bill";
import { columnReceipt } from "./receipt-column-settlement-regression";
import assert from "node:assert/strict";
import { classifyUnsettledPurchaseDocument, type UnsettledPurchaseDocument } from "../lib/purchase-document-payment";
import { assessFinancialUploadScope } from "../lib/financial-upload-scope";

const examples: [string, UnsettledPurchaseDocument | null][] = [
  ["PREPAY CHIT NUMBER 17\nTHIS IS NOT A RECEIPT\nCASH RM 50.00", "provisional_fuel_slip"],
  ["PRE-AUTHORISATION\nTotal RM 60.00\nThis is not the final fiscal receipt", "provisional_fuel_slip"],
  ["Tax Invoice / Adjustment Note\nCash Inv No.: A18\nTotal payable: 32.10\nReceived above goods in good order", "unverified_invoice"],
  ["Tax Invoice\nTotal RM 50.00\nCash tendered RM 50.00\nPrevious pre-authorisation released", null],
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

const roundedInvoice = "Tax Invoice\nTotal Sales (Inclusive GST) RM 13.58\nRounding Adjustment RM .02\nRounding RM 13.60\nCash RM 14.00\nChange RM .40";
assert.equal(classifyUnsettledPurchaseDocument(roundedInvoice), null);
assert.equal(classifyUnsettledPurchaseDocument(roundedInvoice.replace(".40", ".00").replace("14.00", "13.60")), null);
assert.equal(classifyUnsettledPurchaseDocument(roundedInvoice.replace("13.58", "13.57")), "unverified_invoice");
assert.equal(classifyUnsettledPurchaseDocument(roundedInvoice + "\nOutstanding balance RM 1.00"), "unpaid_invoice");
assert.equal(classifyUnsettledPurchaseDocument(roundedInvoice + "\nVisa RM 1.00"), "unverified_invoice");

const closedBill = "Tax Invoice\nTotal (Inclusive of GST): 65.72\nRounding Adj: -0.02\nTOTAL: 65.70\nClosed: 1 28-04-2018 21:08:20\nServer: 113 CASHIER\nCASH: 65.70\nGST Summary Amount (RM) Tax(RM)";
assert.equal(classifyUnsettledPurchaseDocument(closedBill), null);
for (const conflicting of [closedBill.replace("65.72", "65.70"), closedBill.replace("CASH: 65.70", "CASH: 50.00"), closedBill + "\nVisa RM 1.00"]) {
  assert.equal(classifyUnsettledPurchaseDocument(conflicting), "unverified_invoice");
}
assert.equal(classifyUnsettledPurchaseDocument(closedBill + "\nOutstanding balance RM 2.00"), "unpaid_invoice");

const nettInvoice = "TAX INVOICE\nTotal Amount: RM8.19\nGST @0%: RM0.00\nRounding: RM0.01\nNett Total: RM8.20\nPayment Mode Amount\nCASH RM8.20\nChange RM0.00\nGST Summary Amount(RM) Tax(RM)";
assert.equal(classifyUnsettledPurchaseDocument(nettInvoice), null);
for (const contradictory of [nettInvoice.replace("RM8.19", "RM7.19"), nettInvoice.replace("CASH RM8.20", "CASH RM8.25"), nettInvoice + "\nVisa RM1.00", nettInvoice + "\nGrand Total RM10.00"]) {
  assert.equal(classifyUnsettledPurchaseDocument(contradictory), "unverified_invoice");
}
assert.equal(classifyUnsettledPurchaseDocument(nettInvoice + "\nOutstanding balance RM2.00"), "unpaid_invoice");

const ringgitRegisters = [
  "Tax Invoice\nRounded Total (RM): 46.65\nCash 51.65\nCash Change 5.00",
  "Tax Invoice\nRM\nTotal Incl GST 56.00\nPay Cash 56.00\nChange 0.00",
];
for (const bill of ringgitRegisters) {
  assert.equal(classifyUnsettledPurchaseDocument(bill), null);
  assert.equal(classifyUnsettledPurchaseDocument(bill.replace(/Change [\d.]+$/, "Change 9.00")), "unverified_invoice");
  assert.equal(classifyUnsettledPurchaseDocument(bill + "\nVisa 1.00"), "unverified_invoice");
  assert.equal(classifyUnsettledPurchaseDocument(bill + "\nOutstanding balance 1.00"), "unpaid_invoice");
}

const myrNet = "Tax Invoice\nNet Total (MYR) : 14.63\nRounding Adj. : 0.02\nNet Total Rounded (MYR) : 14.65\nCash 15.00\nChange 0.35";
assert.equal(classifyUnsettledPurchaseDocument(myrNet), null);
for (const mismatch of [myrNet.replace("0.02","0.01"), myrNet.replace("0.35","0.34"), myrNet + "\nVisa 1.00"]) {
  assert.equal(classifyUnsettledPurchaseDocument(mismatch), "unverified_invoice");
}
