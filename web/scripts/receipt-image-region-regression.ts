import assert from "node:assert/strict";
import type { OpticalTextLine } from "../../shared/device-text-evidence";
import { encodeLocalReceiptOcr } from "../lib/local-receipt-ocr-envelope";
import { detectMultipleReceipts, findReceiptImageRegion } from "../lib/receipt-image-region";
import { assessFinancialUploadScope } from "../lib/financial-upload-scope";
import { parseReceiptText } from "../lib/split-bill";

const receipt: OpticalTextLine[] = [
  { text: "CLOVER CAFE", box: [.60, .31, .73, .33] },
  { text: "Official Receipt", box: [.60, .35, .78, .37] },
  { text: "2026-09-11", box: [.60, .38, .71, .40] },
  { text: "Coffee PHP 125.00", box: [.60, .42, .81, .44] },
  { text: "Total PHP 125.00", box: [.60, .46, .81, .48] },
];
const background: OpticalTextLine[] = [
  { text: "Meeting agenda", box: [.02, .30, .22, .34] },
  { text: "Action items for 2026-10-23", box: [.02, .36, .34, .39] },
  { text: "Budget USD 999.00", box: [.02, .45, .30, .49] },
];
const encode = (lines: OpticalTextLine[]) => encodeLocalReceiptOcr({
  text: lines.map(line => line.text).join("\n"), opticalLines: lines,
});
const source = encode([...background, ...receipt]);
const region = findReceiptImageRegion(source);
assert.ok(region);
assert.equal(region.text, receipt.map(line => line.text).join("\n"));
assert.equal(assessFinancialUploadScope({ text: source, fileName: "photo.jpg" }).decision, "financial");
assert.equal(Number(parseReceiptText(region.text).total), 125);
assert.equal(parseReceiptText(region.text).billDate?.slice(0, 10), "2026-09-11");
assert.equal(findReceiptImageRegion(encode(receipt)), null, "Standalone receipts keep the ordinary path");
assert.equal(findReceiptImageRegion(encode([...background, ...receipt.slice(0, -1)])), null);
assert.equal(findReceiptImageRegion(encode([...background, ...receipt, { text: "Receipt", box: [.1,.7,.3,.74] }])), null);
assert.equal(findReceiptImageRegion(encode([...background, ...receipt, { text: "Partly overlapping", box: [.53,.4,.65,.43] }])), null);
const withoutDate = findReceiptImageRegion(encode([...background, ...receipt.filter(line => line.text !== "2026-09-11")]));
assert.ok(withoutDate);
assert.equal(parseReceiptText(withoutDate.text).billDate, null);
console.log("Receipt-region isolation: separate receipt, unrelated values, missing date, and ambiguous boundaries passed");

const second: OpticalTextLine[] = receipt.map(line => ({
  text: line.text.replace("CLOVER CAFE", "PARK CAFE").replace("Coffee PHP 125.00", "Tea PHP 215.00").replace("125.00", "215.00"),
  box: [line.box[0] - .49, line.box[1], line.box[2] - .49, line.box[3]],
}));
const sideBySide = encode([...receipt, ...second]);
assert.deepEqual(detectMultipleReceipts(sideBySide), { layout: "side_by_side" });
assert.equal(findReceiptImageRegion(sideBySide), null, "Neither receipt may silently win");
const blocked = parseReceiptText(sideBySide);
assert.equal(blocked.total, null);
assert.equal(blocked.items.length, 0);
assert.equal(blocked.requiresReview, true);

const firstText = ["CLOVER CAFE", "Receipt No. R-100", "2026-09-11", "Coffee PHP 125.00", "Total PHP 125.00"].join("\n");
const secondText = ["PARK CAFE", "Receipt No. R-120", "2026-09-11", "Tea PHP 215.00", "Total PHP 215.00"].join("\n");
assert.deepEqual(detectMultipleReceipts(firstText + "\n" + secondText), { layout: "sequential" });
assert.equal(parseReceiptText(firstText + "\n" + secondText).total, null);
assert.deepEqual(detectMultipleReceipts(firstText.replace("Receipt No.", "Official Receipt\nReceipt No.") +
  "\n" + secondText.replace("Receipt No.", "Official Receipt\nReceipt No.")), { layout: "sequential" });
assert.equal(parseReceiptText(firstText).total, "125.00");
assert.equal(parseReceiptText(secondText).total, "215.00");
assert.equal(detectMultipleReceipts(firstText + "\nCUSTOMER COPY\n" + firstText), null);
assert.equal(detectMultipleReceipts(firstText + "\nPROMO: receipt survey\nTotal rewards 500"), null);
console.log("Multiple receipt detection blocks side-by-side and sequential receipts with independent totals.");
