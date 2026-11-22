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
