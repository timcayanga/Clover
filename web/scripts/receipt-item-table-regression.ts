import assert from "node:assert/strict";
import { readReconciledItemTable } from "../lib/receipt-item-table";
import { parseReceiptText } from "../lib/split-bill";
import { encodeLocalReceiptOcr, readLocalReceiptOcrText, receiptDateDisagreements, recordReceiptDateCheck } from "../lib/local-receipt-ocr-envelope";
import { resolvePositiveImportDocumentRoute } from "../lib/positive-import-route";
import { qualifyDeviceReceiptReading } from "../lib/device-receipt-reading";
import type { OpticalTextLine } from "../../shared/device-text-evidence";

const text = `THE SPIRITS LIBRARY INC.
AuditCHECK: 80326
Transaction Type: MAIN BAR
Qty Ite Deseription Am
1 Mocktail 350.00
REFRESHING
1 Cavinti Fizz 480.00
1 Punch from the Past 520.00
Sub-total: 1350.00
Service Chalge: 120.54
3 Iten(s) Tota Aount 1470.54
SUMMARY
Vatable Sales 1206.30
12 VAT:
Zero Rated Sales 0.00
Total Amount 1470.54`;
const expected = [
  {description:"Mocktail REFRESHING", quantity:1, amount:"350.00"},
  {description:"Cavinti Fizz", quantity:1, amount:"480.00"},
  {description:"Punch from the Past", quantity:1, amount:"520.00"},
];
const preview = parseReceiptText(text);
assert.deepEqual(preview.items, expected);
assert.equal(preview.total, "1470.54");
assert.equal(preview.serviceCharge, "120.54");
assert.equal(readReconciledItemTable(text.replace("520.00", "525.00")), null);
assert.equal(readReconciledItemTable(text + "\nTotal Amount 2941.08"), null);
console.log("PASS receipt item bounds, wrapped description, service charge, subtotal and printed total");


const dateLine: OpticalTextLine = {text:"11/19/25",box:[0.2,0.3,0.4,0.34],confidence:.97,
  alternatives:[{text:"11/19/26",confidence:.94}]};
const sourceText = text.replace("AuditCHECK",dateLine.text+"\nAuditCHECK");
const envelope = encodeLocalReceiptOcr({text:sourceText,opticalLines:[dateLine]});
assert.equal(receiptDateDisagreements([dateLine]).length,1);
assert.equal(receiptDateDisagreements([{...dateLine, alternatives:[{text:"11/19/26",confidence:.25}]}]).length,0);
const corrected = recordReceiptDateCheck(envelope,dateLine,"11/19/26");
assert.equal(parseReceiptText(corrected).billDate?.slice(0,10),"2026-11-19");
assert.ok(corrected.includes('"original":{"text":"11/19/25"'));
assert.equal(parseReceiptText(corrected).requiresReview,true);
assert.ok(parseReceiptText(corrected).confidence <= 45);
assert.ok(!readLocalReceiptOcrText(recordReceiptDateCheck(envelope,dateLine,null))?.includes("11/19/25"));
assert.equal(qualifyDeviceReceiptReading({text:sourceText,opticalLines:[dateLine],complete:true,
  totalPages:1,pagesRead:1,source:"apple_vision",version:1,durationMs:100}, "statement","PHP"),null);
assert.equal(resolvePositiveImportDocumentRoute(corrected)?.mode,"receipt");
assert.notEqual(resolvePositiveImportDocumentRoute("TRANSACTION HISTORY\nOpening balance 100.00\n"+sourceText)?.mode,"receipt");
console.log("PASS optical date disagreement, corroboration, abstention, evidence retention and document routing");

const unrelated = parseReceiptText("PINE CAFE\n11/19/2026\n1 Dirty Sorbetes 85.00\nTotal Amount 85.00");
assert.equal(unrelated.billDate?.slice(0, 10), "2026-11-19");
assert.equal(unrelated.merchantName, "PINE CAFE");
assert.equal(unrelated.receiptAccountMatch?.accountName ?? null, null);
assert.equal(readReconciledItemTable(text.replace("1 Mocktail", "2 Mocktail"))?.items[0].quantity, 2);
