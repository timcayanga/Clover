import assert from "node:assert/strict";
import { readReconciledItemTable } from "../lib/receipt-item-table";
import { parseReceiptText } from "../lib/split-bill";

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
  {description:"Mocktail REFRESHING", amount:"350.00"},
  {description:"Cavinti Fizz", amount:"480.00"},
  {description:"Punch from the Past", amount:"520.00"},
];
const preview = parseReceiptText(text);
assert.deepEqual(preview.items, expected);
assert.equal(preview.total, "1470.54");
assert.equal(preview.serviceCharge, "120.54");
assert.equal(readReconciledItemTable(text.replace("520.00", "525.00")), null);
assert.equal(readReconciledItemTable(text + "\nTotal Amount 2941.08"), null);
console.log("PASS receipt item bounds, wrapped description, service charge, subtotal and printed total");
