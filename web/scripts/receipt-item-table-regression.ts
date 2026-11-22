import { splitBillDraftFromReceiptPreview } from "../lib/split-bill";
import { mergeReceiptBackup } from "../lib/receipt-backup-preview";
import assert from "node:assert/strict";
import { hasPrintedQuantityConflict, reconcilesReviewedDiscountPhoto, canPreviewLocalReceiptItems, hasPrintedItemizedTotal, readPartialPriceColumn, readOpticalItemQuantities, readChargedReceiptTable, readReconciledItemTable, readSubtotalItems } from "../lib/receipt-item-table";
import { parseReceiptPhotoText, parseReceiptText } from "../lib/split-bill";
import { locateDamagedReceiptPrices, recoverReceiptPrices } from "../lib/receipt-price-column";
import { applyVerifiedMarginReadings, recordVerifiedMarginReadings, recordReceiptQuantityCrop, recordReceiptTableCrop, readReceiptOpticalEvidence, hasConflictingReceiptTotalReading, encodeLocalReceiptOcr, readLocalReceiptOcrText, receiptDateDisagreements, recordReceiptDateCheck } from "../lib/local-receipt-ocr-envelope";
import { resolvePositiveImportDocumentRoute } from "../lib/positive-import-route";
import { qualifyDeviceReceiptReading } from "../lib/device-receipt-reading";
import { normalizeDeviceTextEvidence, type OpticalTextLine } from "../../shared/device-text-evidence";

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
const timedDate = { ...dateLine, text: "Date: 11/19/25 19:42", alternatives: [{text:"Date: 11/18/25 19:42",confidence:.85}] };
assert.deepEqual(receiptDateDisagreements([timedDate])[0]?.candidates, ["11/19/25", "11/18/25"]);
const timedSource = encodeLocalReceiptOcr({ text: timedDate.text, opticalLines: [timedDate] });
assert.equal(readLocalReceiptOcrText(recordReceiptDateCheck(timedSource,timedDate,null)), "Date: [unclear date] 19:42");
assert.equal(readLocalReceiptOcrText(recordReceiptDateCheck(timedSource,timedDate,"11/18/25")), "Date: 11/18/25 19:42");
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

const weighed = "Qty Item Unit Price Amount\n0.375 Coffee Beans 319.99 120.00\n1 Tea 25.00 25.00\nSubtotal 145.00\nTotal Amount 145.00";
assert.deepEqual(readReconciledItemTable(weighed)?.items[0],
  { description: "Coffee Beans", quantity: 0.375, unitPrice: "319.99", amount: "120.00" });
assert.equal(readReconciledItemTable(weighed.replace("319.99", "310.00")), null);
const halfCent = "Qty Item Unit Price Amount\n0.125 Flour 0.20 0.03\nSubtotal 0.03\nTotal Amount 0.03";
assert.equal(readReconciledItemTable(halfCent)?.items[0].amount, "0.03");
assert.equal(readReconciledItemTable(halfCent.replaceAll("0.03", "0.02")), null);
assert.equal(readReconciledItemTable(weighed.replace("0.375", "0,375"))?.items[0].quantity, 0.375);
assert.equal(readReconciledItemTable(weighed.replace(" Unit Price", "")), null);

assert.equal(readReconciledItemTable(weighed + "\nTotal Paid 140.00"), null);
assert.equal(readReconciledItemTable(weighed + "\nTotal Paid 145.00")?.total, "145.00");

assert.equal(hasPrintedItemizedTotal(weighed + "\nAmount Paid 140.00", "145.00", true), false);

const nameFirst = "Description Qty Unit Price Amount\nCoffee Beans 0.375 319.99 120.00\nTea 42 1 25.00 25.00\nSubtotal 145.00\nTotal Amount 145.00";
assert.deepEqual(readReconciledItemTable(nameFirst)?.items, [
  { description: "Coffee Beans", quantity: 0.375, unitPrice: "319.99", amount: "120.00" },
  { description: "Tea 42", quantity: 1, unitPrice: "25.00", amount: "25.00" },
]);
assert.equal(readReconciledItemTable(nameFirst.replace("319.99", "300.00")), null);
assert.equal(readReconciledItemTable(nameFirst + "\nSubtotal 250.00"), null);

const discountedPhoto = `Garden Cafe
Official Receipt
2026-11-19
Item Qty Amount
Price
Cake 2.00 50.00 100.00
Bag 1.00 12.00 12.00
Sub Total 112.00
Discount -12.00
Net Amount 89.29
12%VAT 10.71
AMOUNT DUE 100.00
VAT BREAKDOWN
VAT Amount 10.71`;
const discountDraft = parseReceiptPhotoText(discountedPhoto);
assert.ok(reconcilesReviewedDiscountPhoto(discountedPhoto, discountDraft));
for (const damaged of [
  discountedPhoto.replace("Net Amount 89.29", "Net Amount 39.29"),
  discountedPhoto.replace("2.00 50.00", "3.00 50.00"),
  discountedPhoto.replace("VAT Amount 10.71", "VAT Amount 11.71"),
  discountedPhoto + "\nAmount paid 101.00",
  discountedPhoto + "\nCash 110.00\nChange 12.00",
  discountedPhoto + "\nTotal Due 99.00",
]) assert.equal(reconcilesReviewedDiscountPhoto(damaged, discountDraft), false);
assert.equal(reconcilesReviewedDiscountPhoto(discountedPhoto, { ...discountDraft, requiresReview: false }), false);
const countedTill = "Garden Cafe\nOfficial Receipt\n2026-11-19\nTea 42 2 40.00\nRice 1\n60.00\nTotal Qty\n3\nGross Amount 100.00\nBill Amount 100.00\nCash 150.00\nChange 50.00";
assert.equal(hasPrintedItemizedTotal(countedTill, "100.00", true), true);
assert.deepEqual(readReconciledItemTable(countedTill)?.items, [
  { description: "Tea 42", quantity: 2, amount: "40.00" },
  { description: "Rice", quantity: 1, amount: "60.00" },
]);
for (const invalid of [
  countedTill.replace("Qty\n3", "Qty\n4"),
  countedTill.replace("Rice 1", "Rice"),
  countedTill.replace("Gross Amount 100", "Gross Amount 150"),
  countedTill.replace("Change 50", "Change 60"),
  countedTill + "\nTotal Paid 90.00",
  countedTill + "\nGross Amount 99.00",
  "Bill Amount 120.00\n" + countedTill,
  countedTill + "\nDiscount 10.00",
]) assert.equal(readReconciledItemTable(invalid), null);

const numberedGoods = countedTill.replace("Tea 42 2 40.00\nRice 1\n60.00", "Description Amount\nTea 2 40.00\nBlend 1 60.00");
assert.deepEqual(readReconciledItemTable(numberedGoods)?.items.map(item => item.description), ["Tea 2", "Blend 1"]);
assert.deepEqual(parseReceiptPhotoText(numberedGoods).items.map(item => [item.description, item.quantity]),
  [["Tea 2", undefined], ["Blend 1", undefined]]);

const countedUnitPrices = countedTill.replace("Tea 42 2 40.00\nRice 1\n60.00",
  "Qty Description Unit Price Amount\n2 Green Tea 42 20.00 40.00\n1 Rice Bowl 60.00 60.00");
assert.deepEqual(readReconciledItemTable(countedUnitPrices)?.items, [
  { description: "Green Tea 42", quantity: 2, unitPrice: "20.00", amount: "40.00" },
  { description: "Rice Bowl", quantity: 1, unitPrice: "60.00", amount: "60.00" },
]);
assert.deepEqual(readReconciledItemTable(countedUnitPrices.replace("Unit Price", "UnitPrice"))?.items,
  readReconciledItemTable(countedUnitPrices)?.items);
assert.deepEqual(readReconciledItemTable(numberedGoods.replace("Total Qty\n3", "Total Qty 3").replace("Tea 2 40.00", "Tea 2\n40.00"))?.items,
  readReconciledItemTable(numberedGoods)?.items);
for (const invalid of [
  countedUnitPrices.replace("Qty\n3", "Qty\n2"),
  countedUnitPrices.replace("20.00 40.00", "30.00 40.00"),
  countedUnitPrices.replace("Cash 150.00", "Cash 160.00"),
]) {
  assert.equal(readReconciledItemTable(invalid), null);
  assert.equal(hasPrintedItemizedTotal(invalid, "100.00", true), false);
}

const weighedCount = countedUnitPrices.replace("2 Green Tea 42 20.00", "0.100 Green Tea 42 400.00")
  .replace("1 Rice Bowl 60.00", "0.200 Rice Bowl 300.00").replace("Total Qty\n3", "Total Qty 0.300");
assert.deepEqual(readReconciledItemTable(weighedCount)?.items.map(item => item.quantity), [0.1, 0.2]);
assert.equal(hasPrintedItemizedTotal(weighedCount, "100.00", true), true);
for (const quantity of ["0.299", "0.3001", "0", "1,300"]) {
  assert.equal(readReconciledItemTable(weighedCount.replace("Qty 0.300", "Qty " + quantity)), null);
}
assert.equal(hasPrintedItemizedTotal(weighedCount.replace("400.00", "399.00"), "100.00", true), false);

const weighedSubtotal = weighedCount.replace("Total Qty 0.300\nGross Amount 100.00", "Subtotal 100.00\nTotal Qty 0.300");
assert.equal(readReconciledItemTable(weighedSubtotal)?.total, "100.00");
for (const count of ["0.299", "0.301", "0.3001"]) {
  const conflicting = weighedSubtotal.replace("Qty 0.300", "Qty " + count);
  assert.equal(readReconciledItemTable(conflicting), null);
  assert.equal(hasPrintedItemizedTotal(conflicting, "100.00", true), false);
}

assert.equal(hasPrintedQuantityConflict("Total Qty 0.300", [{quantity: 0.4}, {}]), true);
assert.equal(hasPrintedQuantityConflict("Total Qty 0.300", [{quantity: 0.1}, {}]), false);

const wrongChange = weighedSubtotal.replace("Change 50.00", "Change 20.00");
assert.equal(readReconciledItemTable(wrongChange), null);
assert.equal(hasPrintedItemizedTotal(wrongChange, "100.00", true), false);

// Both clients can deliver a complete transcript even when one digit is wrong.
for (const source of ["apple_vision", "google_mlkit"]) {
  for (const mode of ["statement", "receipt"]) {
    const read = (text: string) => qualifyDeviceReceiptReading(normalizeDeviceTextEvidence({
      source, version: 1, complete: true, pagesRead: 1, totalPages: 1, durationMs: 1, text,
    }), mode, "PHP");
    const printed = countedUnitPrices.replace("Unit Price", "UnitPrice");
    assert.equal(read(printed)?.preview.items[0].unitPrice, "20.00");
    assert.equal(read(printed.replace("Qty\n3", "Qty\n4")), null);
    const damaged = printed.replace("20.00 40.00", "25.00 40.00");
    assert.equal(read(damaged), null);
    assert.equal(parseReceiptPhotoText(damaged).items[0].unitPrice, null);
    assert.equal(parseReceiptPhotoText(damaged).total, "100.00");
  }
}

// Mobile recognizers can emit each column separately. Row geometry and the
// three printed checks must agree before the server can reuse that evidence.
const countedColumns = [
  ["Garden Cafe", "Official Receipt", "2026-11-19", "Garden Tea 42", "Rice", "Total Qty", "Gross Amount", "Bill Amount"],
  ["", "", "", "2", "1", "3", "", ""],
  ["", "", "", "40.00", "60.00", "", "100.00", "100.00"],
];
const countedBlocks = countedColumns.flatMap((column, c) => column.flatMap((text, r) =>
  text ? [{ text, box: [c * .33, r * .1, c * .33 + .30, r * .1 + .04] as OpticalTextLine["box"] }] : []));
for (const source of ["apple_vision", "google_mlkit"]) {
  const device = normalizeDeviceTextEvidence({ version: 1, source, text: countedBlocks.map(b => b.text).join("\n"),
    opticalLines: countedBlocks, complete: true, pagesRead: 1, totalPages: 1, durationMs: 10 });
  for (const mode of ["receipt", "statement"]) {
    const accepted = qualifyDeviceReceiptReading(device, mode, "PHP");
    assert.ok(accepted);
    const parsed = parseReceiptPhotoText(accepted.source);
    assert.equal(parsed.receiptText, accepted.source);
    assert.deepEqual(parsed.items.map(i => [i.description, i.quantity]), [["Garden Tea 42", 2], ["Rice", 1]]);
    assert.equal(parsed.total, "100.00");
  }
}
const damagedNameFirst = parseReceiptPhotoText("Green Cafe\nOfficial Receipt\n" + nameFirst.replace("319.99", "310.00"));
assert.equal(damagedNameFirst.items[0].description, "Coffee Beans");
assert.equal(damagedNameFirst.items[0].unitPrice, null);
assert.equal(damagedNameFirst.items[0].amount, "120.00");
assert.ok(damagedNameFirst.requiresReview);
assert.equal(splitBillDraftFromReceiptPreview(parseReceiptPhotoText(nameFirst)).billDate, "");
assert.equal(splitBillDraftFromReceiptPreview(parseReceiptPhotoText("Green Cafe\nOfficial Receipt\n2026-11-19\n" + nameFirst)).billDate, "2026-11-19");

const register = "Coffee\n2 @ 4.00 8.00\nTea\n1 @ 3.00 3.00\nSub Total 11.00";
assert.deepEqual(readSubtotalItems(register)?.map(item => [item.description, item.quantity, item.amount]),
  [["Coffee", 2, "8.00"], ["Tea", 1, "3.00"]]);
assert.equal(readSubtotalItems(register.replace("2 @", "3 @")), null);
assert.equal(readSubtotalItems(register.replace("11.00", "12.00")), null);
const charged = "Coffee 8.00\nTea 3.00\nService Charge: 1.10\nAmo 12=10";
assert.equal(readChargedReceiptTable(charged)?.total, "12.10");
assert.equal(readChargedReceiptTable(charged.replace("12=10", "12=30")), null);
assert.equal(readChargedReceiptTable(charged + "\nGrand Total 15.00"), null);
const ambiguousDate = encodeLocalReceiptOcr({text: "Green Cafe\nOfficial Receipt\n03/04/2026\nTotal PHP 25.00"});
assert.equal(parseReceiptPhotoText(ambiguousDate).billDate, null);
assert.equal(parseReceiptPhotoText(ambiguousDate.replace("03/04", "03/24")).billDate?.slice(0,10), "2026-03-24");
console.log("PASS paired item prices, reconciled charges, conflicting subtotals and ambiguous dates");

const counted = "Cold Brew 2 12.00\nTea 1 5.00\nTotal Qty 3\nGross Amount 17.00\nService Charge 1.70\nBill Amount 18.70";
assert.deepEqual(readChargedReceiptTable(counted)?.items[0], { description: "Cold Brew", quantity: 2, amount: "12.00" });
assert.equal(readChargedReceiptTable(counted.replace("Total Qty 3", "Total Qty 4"))?.items[0].description, "Cold Brew 2");
assert.equal(readChargedReceiptTable(counted.replace("Gross Amount 17.00", "Gross Amount 16.00")), null);
const foreign = encodeLocalReceiptOcr({text: "GREEN CAFE\n2026-11-19\nCoffee 10.00\nService Charge 1.00\nTotal USD 11.00"});
assert.equal(parseReceiptPhotoText(foreign).currency, "USD");
assert.equal(parseReceiptPhotoText(foreign.replace("USD ", "")).currency, "MIXED");
assert.equal(parseReceiptPhotoText(foreign.replace("USD ", "")).total, "11.00");

const unpriced = encodeLocalReceiptOcr({text: "CAFE GREEN\n#401\nOfficial Receipt\nRef: 188270\nMango Juice\nCarrot Juice\nLemon Tea\nSubtotal\nAmount Due PHP 180.00"});
assert.equal(parseReceiptPhotoText(unpriced).total, "180.00");
assert.deepEqual(parseReceiptPhotoText(unpriced).items, []);
const opticalBlocks: OpticalTextLine[] = [];
for (const [i, name, qty, price] of [[0,"Cocoa","1","10.00"],[1,"Tea","2","12.00"]] as const) {
  const top = 0.1 + i * 0.1;
  opticalBlocks.push({text:name, box:[0.1,top,0.3,top+0.04]}, {text:qty,box:[0.5,top,0.52,top+0.04]},
    {text:price,box:[0.7,top,0.8,top+0.04]});
}
const quantityRows = [{description:"Cocoa 1",amount:"10.00"}, {description:"Tea 2",amount:"12.00"}];
assert.deepEqual(readOpticalItemQuantities(quantityRows, "Total Qty 3", opticalBlocks).map(item => item.description), ["Cocoa","Tea"]);
assert.deepEqual(readOpticalItemQuantities(quantityRows, "Total Qty 2", opticalBlocks), quantityRows);
assert.deepEqual(readOpticalItemQuantities(quantityRows, "Total Qty 3", opticalBlocks.slice(1)), quantityRows);
const damagedColumn = "Orange Juice 25.00\nTea\nBeer\nSpring Roll 30.00\nNoodles 8.8\nSubtotal 120.00";
assert.deepEqual(readPartialPriceColumn(damagedColumn), [
  { description: "Orange Juice", amount: "25.00" }, { description: "Spring Roll", amount: "30.00" },
]);
assert.equal(readPartialPriceColumn(damagedColumn.replace("8.8", "8.80")), null);
assert.deepEqual(parseReceiptPhotoText(readLocalReceiptOcrText(unpriced)!).items, []);
assert.deepEqual(parseReceiptPhotoText(register + "\nTotal PHP 11.00").items.map(item => item.description), ["Coffee","Tea"]);

const columns = [
  ["Test Cafe", "Official Receipt", "2026-11-19", "1 Black Tea", "2 Coffee", "Sub-total", "Service Charge", "Amount Due"],
  ["", "", "", "125.00", "250.00", "375.00", "37.50", "412.50"],
];
const blocks = columns.flatMap((column, col) => column.flatMap((text,i) => text ? [{
  text, box:[col * .65, i * .1, col * .65 + .34, i * .1 + .04],
}] : []));
for (const source of ["apple_vision", "google_mlkit"]) {
  const evidence = normalizeDeviceTextEvidence({
    version: 1, source, text: blocks.map(block => block.text).join("\n"), opticalLines: blocks,
    complete: true, pagesRead: 1, totalPages: 1, durationMs: 100,
  });
  assert(evidence);
  const columnSource = encodeLocalReceiptOcr(evidence);
  const columnReceipt = parseReceiptPhotoText(columnSource);
  assert.equal(columnReceipt.total, "412.50");
  assert.deepEqual(columnReceipt.items.map(item => item.amount), ["125.00", "250.00"]);
  assert.equal(columnReceipt.receiptText, columnSource);
}
const feeReceipt = "Qty Item Amount\n1 Tea\n125.00\n2 Coffee 250.00\n10%ServiceChrge: 37.50\nAmo 412.50";
assert.equal(readChargedReceiptTable(feeReceipt)?.items[1].quantity, 2);
assert.equal(readChargedReceiptTable(feeReceipt.replace("412.50", "422.50")), null);
assert.equal(readChargedReceiptTable(feeReceipt.replace("Qty Item Amount\n1 Tea", "7 Up"))?.items[0].description, "7 Up");

const marginTable = "1 Tea 100.00\nLime Juice 200.00\nBlack Coffee 300.00\nService Charge: 60.00\nAmo 660.00";
const marginBlocks: OpticalTextLine[] = [{ text: "1", box: [.05, .1, .07, .14] }];
for (const [index, [text, price]] of [["Tea", "100.00"], ["Lime Juice", "200.00"], ["Black Coffee", "300.00"]].entries()) {
  const y = .1 + index * .1;
  marginBlocks.push({ text, box: [.15, y, .45, y + .04] }, { text: price, box: [.75, y, .9, y + .04] });
}
assert.deepEqual(readChargedReceiptTable(marginTable, marginBlocks)?.items[0], { description: "Tea", amount: "100.00", quantity: 1 });
assert.equal(readChargedReceiptTable(marginTable, marginBlocks.slice(1))?.items[0].description, "1 Tea");

const countedGap = "Tea 2 12.00\nCoffee 1 5.00\nCake 9.00\nTotal Qty 4\nGross Amount 26.00\nService Charge 2.60\nBill Amount 28.60";
assert.equal(readChargedReceiptTable(countedGap)?.items[2].quantity, 1);
for (const uncertain of [
  countedGap.replace("Qty 4", "Qty 5"), countedGap.replace("Coffee 1", "Coffee"),
  countedGap + "\nTotal Qty 3", countedGap.replace("Cake 9.00", "Cake 0.5 9.00"),
]) assert.equal(readChargedReceiptTable(uncertain)?.items[2].quantity, undefined);

const croppedIdentity = { merchantName: null, billDate: "2026-11-19", total: "123.20" };
const taxedService = "Tea 45.00\nCake 67.00\n10%ServiceChrge: 11.20\nAmo 123=20\nVAT Sales 100.00\nVAT Exempt Sales 0.00\n12% VAT 12.00";
assert.ok(canPreviewLocalReceiptItems(taxedService, croppedIdentity));
for (const conflicting of [
  taxedService.replace("67.00", "66.00"), taxedService.replace("10%", "11%"), taxedService.replace("12%", "13%"),
  taxedService.replace("VAT Sales 100.00", "VAT Sales 90.00"), taxedService.replace("Sales 0.00", "Sales 10.00"),
  taxedService + "\nDiscount 10.00", taxedService + "\nTotal 130.00", taxedService + "\nVAT Sales 100.00",
]) assert.equal(canPreviewLocalReceiptItems(conflicting, croppedIdentity), false);

const grossBill = "Tea 10.00\nCoffee 20.00\nGross Amount 30.00\nBill Amount 30.00";
assert.ok(hasPrintedItemizedTotal(grossBill, "30.00"));
assert.ok(!hasPrintedItemizedTotal(grossBill.replace("Bill Amount 30", "Bill Amount 45"), "45.00"));
assert.ok(!hasPrintedItemizedTotal(grossBill + "\nAmount Due 29.00", "30.00"));

const fullyPaid = "Tea 10.00\nCoffee 20.00\nTotal Amount 30.00\nTotal Paid 30.00";
assert.ok(hasPrintedItemizedTotal(fullyPaid, "30.00", true));
for (const ambiguous of [fullyPaid.replace("10.00", "11.00"), fullyPaid.replace("Paid 30", "Paid 25"),
  "Tax 10.00\n" + fullyPaid, fullyPaid + "\nAmount Due 9.00"]) {
  assert.equal(hasPrintedItemizedTotal(ambiguous, "30.00", true), false);
}

const tightMargin = [{ text: "2", box: [.056, .2, .115, .24] as OpticalTextLine["box"] },
  { text: "1", box: [.075, .1, .10, .14] as OpticalTextLine["box"] }, ...marginBlocks.slice(1)];
const twoMarginRows = marginTable.replace("Lime Juice", "2 Lime Juice");
assert.equal(readChargedReceiptTable(twoMarginRows, tightMargin)?.items[1].quantity, 2);
assert.equal(readChargedReceiptTable(twoMarginRows, tightMargin.filter(block => block.text !== "1"))?.items[1].quantity, undefined);

const mergedNameTable = twoMarginRows.replace("Black Coffee", "1 Black Coffee");
const mergedNameBlocks: OpticalTextLine[] = [
  ...marginBlocks.filter(block => block.text !== "Black Coffee"),
  { text: "2", box: [.052,.2,.072,.24] }, { text: "1 Black Coffee", box: [.05,.3,.45,.34] },
];
assert.deepEqual(readChargedReceiptTable(mergedNameTable, mergedNameBlocks)?.items[2],
  { description: "Black Coffee", amount: "300.00", quantity: 1 });
const numberedProduct = mergedNameBlocks.map(block => block.text === "1 Black Coffee"
  ? { ...block, box: [.15,.3,.45,.34] as OpticalTextLine["box"] } : block);
assert.equal(readChargedReceiptTable(mergedNameTable, numberedProduct)?.items[2].description, "1 Black Coffee");
assert.equal(readChargedReceiptTable(mergedNameTable, mergedNameBlocks.slice(1))?.items[2].quantity, undefined);

const originalMargin = encodeLocalReceiptOcr({ text: marginTable, opticalLines: marginBlocks });
const recoveredMargin = recordReceiptQuantityCrop(originalMargin, new Map([
  ["Lime Juice 200.00", { text: "2", box: [.052,.2,.072,.24] }],
]), [.02,.05,.11,.4]);
assert.equal(readLocalReceiptOcrText(originalMargin), marginTable);
assert.equal(readLocalReceiptOcrText(recoveredMargin), twoMarginRows);
assert.equal(readChargedReceiptTable(twoMarginRows, readReceiptOpticalEvidence(recoveredMargin))?.items[1].quantity, 2);
assert.ok(recoveredMargin.includes(JSON.stringify(marginTable)), "Keep original row text with the crop evidence");

const weakDate = (other: string) => encodeLocalReceiptOcr({
  text: "Example Cafe\nOfficial Receipt\n6/30/2023\nTea 50.00\n" + other + "\nTotal PHP 50.00",
  opticalLines: [{text:"6/30/2023",box:[0.2,0.1,0.4,0.2],minimumCharacterConfidence:0.42}],
});
assert.equal(parseReceiptPhotoText(weakDate("JANON IBERICO")).billDate, null);
assert.equal(parseReceiptPhotoText(weakDate("June 30, 2023")).billDate?.slice(0,10), "2023-06-30");

const trailingMoney: OpticalTextLine = {text:"120.00 USD", box:[.5,.1,.8,.15], alternatives:[{text:"720.00 USD",confidence:.90}],confidence:.96};
const totalLabel: OpticalTextLine = {text:"Bill Total",box:[.1,.1,.35,.15]};
assert.ok(hasConflictingReceiptTotalReading([totalLabel, trailingMoney]));
assert.ok(hasConflictingReceiptTotalReading([totalLabel, {...trailingMoney,text:"120.00"}, {text:"USD",box:[.85,.1,.95,.15]}]));
assert.ok(!hasConflictingReceiptTotalReading([{...totalLabel,text:"Coffee"}, trailingMoney]));
assert.ok(!hasConflictingReceiptTotalReading([totalLabel, {...trailingMoney, alternatives:[],characterAlternatives:[{index:8,text:"5",confidence:.4}]}]));

// A queued import and a direct photo preview can consume the same optical source.
for (const source of [weakDate("JANON IBERICO"), ambiguousDate, unpriced, foreign]) {
  assert.deepEqual(parseReceiptText(source), parseReceiptPhotoText(source));
}

for (const [primary, alternative, conflict] of [
  ["합계 ₩12,000", "합계 ₩17,000", true],
  ["Jumlah bayar 50.000 IDR", "Jumlah bayar 80.000 IDR", true],
  ["Total 1 234,50 EUR", "Total 1 734,50 EUR", true],
  ["Total 50.00 USD", "Total 50 USD", false],
  ["Total 50.00 USD", "Total 5000 USD", true],
  ["Total items 12", "Total items 17", false],
] as const) {
  assert.equal(hasConflictingReceiptTotalReading([{ ...trailingMoney, text: primary,
    alternatives: [{text: alternative, confidence: .9}] }]), conflict, primary);
}

const itemCountReceipt = "Qty Item Amount\n2 Tea 40.00\n1 Coffee 30.00\nSubtotal 70.00\n3 Item(s) Total Amount 70.00\nTotal Amount 70.00";
assert.ok(readReconciledItemTable(itemCountReceipt));
assert.ok(readReconciledItemTable(itemCountReceipt.replace("3 Item(s)", "2 Item(s)")));
assert.equal(readReconciledItemTable(itemCountReceipt.replace("3 Item(s)", "5 Item(s)")), null);
assert.ok(hasPrintedItemizedTotal(grossBill.replace("Bill Amount 30.00", "Amount to pay 30.00 EUR"), "30.00"));
assert.ok(!hasPrintedItemizedTotal(grossBill + "\nBill Total 35.00 EUR", "30.00"));
assert.ok(!hasPrintedItemizedTotal(itemCountReceipt + "\nBill Total 75.00 PHP", "70.00"));

const registerFee = [
  "BILL SLIP", "Lime tea", "2 @ 50.00 100.00", "Cake", "1 @ 80.00 80.00",
  "Total Amount 180.00", "Service Charge (10%) 18.00", "Total Due 198.00", "TOTAL No. of ITEMS : 3",
].join("\n");
assert.equal(readReconciledItemTable(registerFee)?.serviceCharge, "18.00");
assert.ok(hasPrintedItemizedTotal(registerFee, "198.00"));
assert.equal(parseReceiptPhotoText(encodeLocalReceiptOcr({text: registerFee})).total, "198.00");
for (const bad of [registerFee.replace("ITEMS : 3", "ITEMS : 5"), registerFee + "\nBill Amount 200.00",
  registerFee + "\nTotal PHP 180.00", registerFee + "\nTotal Qty 5", registerFee + "\nTip 5.00", registerFee.replace("18.00\nTotal Due", "10.00\nTotal Due"),
  registerFee.replace("2 @ 50.00", "3 @ 50.00")]) {
  assert.equal(readReconciledItemTable(bad), null);
  assert.ok(!hasPrintedItemizedTotal(bad, "198.00"));
}

const smudgedQuantity = registerFee.replace("1 @ 80.00", "(0) 80.00");
assert.equal(readReconciledItemTable(smudgedQuantity)?.items[1].quantity, 1);
assert.equal(readReconciledItemTable(smudgedQuantity.replace("ITEMS : 3", "ITEMS : 4")), null);

const discountedVat = [
  "Cafe Tea 65.00", "Rye Toast 47.00", "Sub-total: 112.00", "Price Net of VAT: 100.00",
  "10% Member: -10.00", "VAT: 10.80", "Total: PHP100.80", "Total Paid: PHP100.80",
].join("\n");
assert.ok(hasPrintedItemizedTotal(discountedVat, "100.80", true));
for (const conflicting of [
  discountedVat.replace("65.00", "66.00"), discountedVat.replace("10% Member", "20% Member"),
  discountedVat.replace("VAT: 10.80", "VAT: 11.80"), discountedVat.replace("Paid: PHP", "Paid: EUR"),
  discountedVat.replace("Paid: PHP100.80", "Paid: PHP99.80"), discountedVat + "\nAmount Due 108.00",
  discountedVat + "\nVATable Sales: 102.00",
]) assert.equal(hasPrintedItemizedTotal(conflicting, "100.80", true), false);

const plainPhoto = "CAFE GREEN\nOfficial Receipt\n04/05/2026\nTea 20.00\nTotal EUR 20.00";
const plain = parseReceiptPhotoText(plainPhoto);
const enveloped = parseReceiptPhotoText(encodeLocalReceiptOcr({ text: plainPhoto }));
assert.equal(plain.currency, "EUR");
assert.equal(plain.billDate, null);
assert.equal(plain.billDate, enveloped.billDate);
assert.equal(parseReceiptPhotoText(plainPhoto.replace("EUR ", "")).currency, "MIXED");
const mixed = parseReceiptPhotoText(plainPhoto + "\nCurrency: USD");
assert.equal(mixed.currency, "MIXED");

const local = { ...plain, items: [], subtotal: "20.00" };
const model = { currency: "EUR", confidence_score: 90, total: "20.00", subtotal: "20.00",
  line_items: [{ description: "Tea", amount: "20.00" }] };
const merged = (changes: Record<string, unknown> = {}, valid = true) =>
  mergeReceiptBackup(local, { ...model, ...changes }, null, { schemaValidated: valid });
assert.equal(merged().items[0]?.description, "Tea");
assert.deepEqual(merged({total: "80.00", tip: "60.00"}).items, []);
assert.equal(merged({total: "80.00", tip: "60.00"}).tip, local.tip);
assert.equal(merged({currency: "USD"}).currency, "EUR");
assert.deepEqual(merged({currency: "USD"}).items, []);
assert.deepEqual(merged({line_items: [{ description: "VAT", amount: "1.00" }]}).items, []);
assert.deepEqual(merged({}, false).items, []);
assert.equal(mergeReceiptBackup(mixed, model, null, {schemaValidated: true}).currency, "MIXED");

assert.deepEqual(merged({line_items: [{ description: "Tea", quantity: 3, unit_price: 10, amount: "20.00" }]}).items, []);
const brokenItems = { ...local, items: [{description: "Audit check", amount: "803.26"}] };
assert.equal(mergeReceiptBackup(brokenItems, model, null, {schemaValidated: true}).items[0].description, "Tea");
const badSummary = { ...model, subtotal: "10.00", line_items: [{description: "Tea", amount: "10.00"}] };
assert.deepEqual(mergeReceiptBackup({ ...local, subtotal: null }, badSummary, null, {schemaValidated: true}).items, []);

const incompleteIdentity = { merchantName: null, billDate: null, total: "198.00" };
assert.ok(canPreviewLocalReceiptItems(registerFee, incompleteIdentity));
assert.equal(canPreviewLocalReceiptItems(registerFee + "\nTotal Due 199.00", incompleteIdentity), false);
assert.equal(canPreviewLocalReceiptItems(registerFee.replace("ITEMS : 3", "ITEMS : 6"), incompleteIdentity), false);
assert.equal(canPreviewLocalReceiptItems(registerFee, { ...incompleteIdentity, total: null }), false);

const unknownCurrency = { ...local, currency: "MIXED", currencyMentions: [], currencyWarning: "Confirm the currency." };
assert.equal(mergeReceiptBackup(unknownCurrency, model, null, {schemaValidated: true}).currency, "MIXED");
const printedCurrency = mergeReceiptBackup(unknownCurrency, { ...model, currency_source_text: "Total EUR 20.00" }, null, {schemaValidated: true});
assert.equal(printedCurrency.currency, "EUR");
assert.equal(printedCurrency.currencyWarning, null);

const partialBill = parseReceiptPhotoText("GREEN CAFE\nOfficial Receipt\n2026-11-19\nTea 20.00\nTotal No of Items: 4\nGrand Total EUR 60.00");
const partialDraft = splitBillDraftFromReceiptPreview(partialBill);
assert.equal(partialDraft.total, "60.00");
assert.equal(partialDraft.subtotal, "");
assert.equal(partialDraft.items.some(item => item.description === "Tea"), false);
assert.equal(splitBillDraftFromReceiptPreview({ ...partialBill, total: "35.00" }).total, "");

const pricedTable = [
  "Fictional Café", "Qty Item Description Unit Price Amount",
  "2 Jasmine Tea 25.50 51.00", "1 Cake 30.00 30.00", "Subtotal 81.00", "Total Amount 81.00",
].join("\n");
const pricedRows = parseReceiptPhotoText(pricedTable).items;
assert.deepEqual(pricedRows.map(({ description, quantity, unitPrice, amount }) => [description, quantity, unitPrice, amount]), [
  ["Jasmine Tea", 2, "25.50", "51.00"], ["Cake", 1, "30.00", "30.00"],
]);
assert.equal(readReconciledItemTable(pricedTable.replace("25.50", "26.50")), null);

for (const date of ["04/05/2026", "04-05-2026", "04.05.2026"]) {
  const ambiguous = parseReceiptPhotoText(plainPhoto.replace("04/05/2026", date));
  assert.equal(ambiguous.billDate, null);
  assert.equal(mergeReceiptBackup(ambiguous, { ...model, transaction_date: "2026-04-05" }, null, { schemaValidated: true }).billDate, null);
}
assert.equal(parseReceiptPhotoText(plainPhoto.replace("04/05/2026", "2026-04-05")).billDate?.slice(0, 10), "2026-04-05");

for (const header of ["Date: 11/12/2026", "Date: 2026-11-15", "19.11.2026", "Ref: 12345"]) {
  const text = ["CLOVER CAFE", "Official Receipt", header, "Latte PHP 125.00",
    "Date Cake 45.00", "Reference Book 80.00", "Total PHP 250.00", "Cash 300.00", "Change 50.00"].join("\n");
  for (const source of [text, encodeLocalReceiptOcr({ text })]) {
    const preview = parseReceiptPhotoText(source);
    assert.deepEqual(preview.items.map(item => [item.description, item.amount]), [
      ["Latte", "125.00"], ["Date Cake", "45.00"], ["Reference Book", "80.00"],
    ], header);
    assert.equal(preview.total, "250.00");
    assert.equal(preview.subtotal, "250.00");
  }
}

for (const name of ["Café", "Éclair", "紅茶", "抹茶ラテ", "Orderly Tea", "Vitamin B 12"]) {
  const text = ["GREEN CAFE", "Official Receipt", "Date: 2026-11-15", "Order: 901",
    name + " PHP 125.00", "Total PHP 125.00"].join("\n");
  for (const input of [text, encodeLocalReceiptOcr({ text })]) {
    const preview = parseReceiptPhotoText(input);
    assert.deepEqual(preview.items.map(item => [item.description, item.amount]), [[name, "125.00"]]);
    assert.equal(preview.subtotal, "125.00");
  }
}

const priceAmountHeader = "Shop\nOfficial Receipt\nQty Item Price Amount\n2 Tea 10.00 20.00\n1 Coffee 12 15.00 15.00\nSubtotal 35.00\nTOTAL DUE 35.00";
const pricedItems = readReconciledItemTable(priceAmountHeader)?.items;
assert.deepEqual(pricedItems, [
  { description: "Tea", quantity: 2, unitPrice: "10.00", amount: "20.00" },
  { description: "Coffee 12", quantity: 1, unitPrice: "15.00", amount: "15.00" },
]);
for (const source of [priceAmountHeader, encodeLocalReceiptOcr({ text: priceAmountHeader })]) {
  assert.equal(resolvePositiveImportDocumentRoute(source)?.mode, "receipt");
  assert.deepEqual(parseReceiptPhotoText(source).items, pricedItems);
}
assert.equal(readReconciledItemTable(priceAmountHeader.replace("10.00 20.00", "11.00 20.00")), null);
assert.equal(readReconciledItemTable(priceAmountHeader + "\nBill Amount 36.00"), null);
assert.equal(readReconciledItemTable(priceAmountHeader + "\n3 Item(s) Total Amount 35.00\n8 Item(s) Total Amount 35.00"), null);

const missingIdentity = { merchantName: null, billDate: null, total: "30.00" };
assert.equal(canPreviewLocalReceiptItems(grossBill, missingIdentity), true);
for (const disputed of [grossBill.replace("Tea 10.00", "Tea 9.00"), grossBill.replace("Gross Amount 30", "Gross Amount 31"),
  grossBill + "\nGrand Total 35.00", grossBill + "\nGrand Total 3?.00", grossBill + "\nTotal Qty 40", grossBill.replace("Bill Amount", "Discount 5.00\nBill Amount")]) {
  assert.equal(canPreviewLocalReceiptItems(disputed, missingIdentity), false);
}

const brokenPrice = plainPhoto + "\n@ 490.00 4.90.00";
for (const input of [brokenPrice, encodeLocalReceiptOcr({ text: brokenPrice })]) {
  const result = parseReceiptPhotoText(input);
  assert.equal(result.billDate, null);
  assert.equal(mergeReceiptBackup(result, { ...model, transaction_date: "2026-04-05" }, null, { schemaValidated: true }).billDate, null);
}

for (const marker of ["₱", "PHP ", "EUR ", "£", "USD "]) {
  const marked = priceAmountHeader.replace(/\d+\.\d{2}/g, price => marker + price);
  assert.deepEqual(readReconciledItemTable(marked)?.items, pricedItems);
  for (const input of [marked, encodeLocalReceiptOcr({ text: marked })]) {
    assert.deepEqual(parseReceiptPhotoText(input).items, pricedItems);
  }
  assert.equal(readReconciledItemTable(marked + "\nTotal EUR 39.00"), null);
}
assert.equal(readReconciledItemTable(priceAmountHeader.replace("10.00 20.00", "EUR 10.00 ₱20.00")), null);

const disputedUnit = priceAmountHeader.replace("10.00 20.00", "15.00 20.00");
for (const input of [disputedUnit, encodeLocalReceiptOcr({ text: disputedUnit })]) {
  const preview = parseReceiptPhotoText(input);
  assert.equal(preview.total, "35.00");
  const tea = preview.items.find(item => item.description === "Tea");
  assert.equal(tea?.amount, "20.00");
  assert.equal(tea.unitPrice, null);
  assert.equal(preview.requiresReview, true);
}
assert.equal(readReconciledItemTable(priceAmountHeader.replace("10.00 20.00", "EUR 10.00 EUR 20.00").replace("TOTAL DUE 35.00", "TOTAL INR 35.00")), null);

for (const currency of [" EUR", "PHP", " ₱", " INR"]) {
  const marked = priceAmountHeader.replace(/\d+\.\d{2}/g, value => value + currency);
  const rows = readReconciledItemTable(marked);
  assert.deepEqual(rows?.items, pricedItems);
  for (const input of [marked, encodeLocalReceiptOcr({ text: marked })]) {
    assert.deepEqual(parseReceiptPhotoText(input).items, pricedItems);
    assert.equal(parseReceiptPhotoText(input).total, "35.00");
  }
}
assert.equal(readReconciledItemTable(priceAmountHeader.replace("10.00 20.00", "10.00 USD 20.00 EUR")), null);

const decimalComma = ["Fictional Shop", "Qty Item Unit Price Amount", "2,00 Tea 1.025,50 EUR 2.051,00 EUR",
  "1 Cake 30,00 EUR 30,00 EUR", "Subtotal 2.081,00 EUR", "Total Due 2.081,00 EUR"].join("\n");
for (const input of [decimalComma, encodeLocalReceiptOcr({ text: decimalComma })]) {
  const preview = parseReceiptPhotoText(input);
  assert.equal(preview.total, "2081.00");
  assert.equal(preview.items[0]?.description, "Tea");
  assert.equal(preview.items[0]?.unitPrice, "1025.50");
  assert.equal(preview.items[0]?.amount, "2051.00");
}
assert.equal(readReconciledItemTable(decimalComma.replace("1.025,50", "1.02,50")), null);

function checkDamagedPriceColumn() {
  const names = ["Green Tea", "Rye Bread", "Apple Tart", "Black Coffee", "Lemon Cake", "Orange Tea"];
  const expected = ["10.00", "20.00", "30.00", "40.00", "50.00", "60.00"];
  const lines = [names[0] + " 10.00", names[1], names[2] + " 3.0", names[3] + " 40.00", names[4], names[5]];
  const source = ["2026-11-19", ...lines, "Subtotal 210.00", "Total PHP 210.00"].join("\n");
  const blocks: OpticalTextLine[] = names.map((text,i) => ({text, box:[.1, .2+i*.05, .45, .23+i*.05]}));
  for (const i of [0,3]) blocks.push({text:expected[i],box:[.7,.2+i*.05,.83,.23+i*.05]});
  const plan = locateDamagedReceiptPrices(source, blocks);
  assert.ok(plan);
  const priced = names.map((name,i) => name + " " + expected[i]).join("\n");
  assert.equal(recoverReceiptPrices(plan, [priced]), priced);
  assert.equal(recoverReceiptPrices(plan, [priced.replace("20.00",""), priced.replace("50.00","")]), priced);
  for (const other of [priced.replace("20.00","80.00"), priced.replace("Rye Bread","A date"), priced.replace("40.00","12.00"),
    priced.replace("10.00","40.00").replace("Black Coffee 40.00","Black Coffee 10.00"), priced.replace("Apple Tart 30.00\n",""),
    priced.replace("Rye Bread", "Extra Tea 13.00\nRye Bread")]) {
    assert.equal(recoverReceiptPrices(plan, [other]), null);
  }
  assert.equal(recoverReceiptPrices(plan, [priced, priced.replace("20.00","30.00")]), null);
  assert.equal(locateDamagedReceiptPrices(source, [...blocks,blocks[0]]), null);
  const raw = encodeLocalReceiptOcr({text:source, opticalLines:blocks});
  const repaired = recordReceiptTableCrop(raw, plan.original, priced, plan.bounds, [priced]);
  assert.deepEqual(readReceiptOpticalEvidence(repaired), readReceiptOpticalEvidence(raw));
  assert.equal(readLocalReceiptOcrText(repaired), source.replace(plan.original, priced));
}
checkDamagedPriceColumn();

const marginSource = encodeLocalReceiptOcr({ engine: "ppocr-v5-local", text: "Milk 10.00" });
const marginItem = { description: "Milk", amount: "10.00" };
const withMargin = recordVerifiedMarginReadings(marginSource, [{ ...marginItem,
  digit: { text: "2", box: [0.1, 0.2, 0.12, 0.23], minimumCharacterConfidence: 0.99 },
}], [0.08, 0.18, 0.15, 0.4]);
assert.equal(readLocalReceiptOcrText(withMargin), "Milk 10.00");
assert.deepEqual(applyVerifiedMarginReadings(withMargin, [marginItem]), [{ ...marginItem, quantity: 2 }]);
for (const ambiguous of [[marginItem, marginItem], [{ ...marginItem, amount: "20.00" }], [{ ...marginItem, quantity: 3 }]]) {
  assert.deepEqual(applyVerifiedMarginReadings(withMargin, ambiguous), ambiguous);
}
