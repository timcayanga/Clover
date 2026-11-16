import assert from "node:assert/strict";
import { blankPurchaseTemplateMessage, classifyBlankPurchaseTemplate } from "../lib/blank-purchase-template";
import { assessFinancialUploadScope } from "../lib/financial-upload-scope";
import { parseImportText, parseImportTextGenericOnly } from "../lib/import-parser";

const receipt = "Sari-Sari Store\nOfficial Receipt\nDate: MM/DD/YYYY\nReceived from: ______\nItem | Qty | Amount\nTotal: ₱ ____";
const invoice = "Sales Invoice Template\nInvoice No.: _____\nDate: ____\nBill To: ____\nDescription Quantity Unit Price Amount\nSubtotal: ____\nTax: ____\nAmount Due: ____";
for (const [text, kind] of [[receipt, "blank_receipt_template"], [invoice, "blank_invoice_template"]] as const) {
  assert.equal(classifyBlankPurchaseTemplate(text), kind);
  assert.match(blankPurchaseTemplateMessage[kind], /Upload a completed copy/);
  for (const [fileName, fileType] of [["photo.jpg", "image/jpeg"], ["document.pdf", "application/pdf"]]) {
    const scope = assessFinancialUploadScope({ text, fileName, fileType });
    assert.equal(scope.decision, "financial");
    assert.deepEqual(scope.reasons, [kind]);
    assert.deepEqual(parseImportText(text, fileName, fileType), []);
    assert.deepEqual(parseImportTextGenericOnly(text, fileName, fileType), []);
  }
}
assert.equal(classifyBlankPurchaseTemplate("Invoice\nDate\nBill To\nDescription\nQuantity\nUnit price\nAmount\nTotal"), "blank_invoice_template");
for (const partial of [
  "Official Receipt\nTotal",
  "Invoice\nDate\nBill To\nTotal",
  receipt.replace("MM/DD/YYYY", "2026-09-11"),
  receipt.replace("______","Clover Customer"),
  receipt.replace("₱ ____", "₱ 0.00"),
  receipt.replace("₱ ____", "₱ 125.00"),
  receipt + "\nCoffee x1 ₱125.00",
  receipt + "\nOffic... [blurred]",
  receipt + "\nOfficial Receipt\nTotal ₱35.00",
  "2026/09/11\n" + receipt,
  invoice.replace("Invoice No.: _____","Invoice No.: AB-1234"),
]) assert.equal(classifyBlankPurchaseTemplate(partial), null, partial);

console.log("Blank purchase templates: receipts, invoices, empty columns, partial values and mixed documents passed");
