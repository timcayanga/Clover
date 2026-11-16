import assert from "node:assert/strict";
import { parseReceiptLineItemNumber, parseReceiptLineItemsFromPayload } from "../lib/receipt-line-items";
import { parseReceiptText } from "../lib/split-bill";

const make = (...rows: string[]) => ["HARBOUR CAFE", "OFFICIAL RECEIPT", "2026-11-15", ...rows, "TOTAL PHP 115.00"].join("\n");
for (const heading of [[], ["Qty Description Unit Price Amount"]]) {
  const source = make(...heading, "2 × Chicken",
    "Club Sandwich", "No onions", "50.00 100.00", "+ Extra cheese 15.00", "Subtotal 115.00", "No VAT");
  const result = parseReceiptText(source);
  assert.equal(result.receiptText, source);
  assert.deepEqual(result.items.map(({ description, quantity, unitPrice, amount }) => ({ description, quantity, unitPrice, amount })), [
    { description: "Chicken Club Sandwich (No onions)", quantity: 2, unitPrice: "50.00", amount: "100.00" },
    { description: "Chicken Club Sandwich (No onions) (Extra cheese)", quantity: undefined, unitPrice: undefined, amount: "15.00" },
  ]);
}

const split = parseReceiptText(make("Qty Description Amount", "2 × Sandwich", "1 × Coffee 15.00", "Subtotal 115.00"));
assert.deepEqual(split.items.map(({ description, quantity, amount }) => [description, quantity, amount]), [
  ["Sandwich", 2, null], ["Coffee", 1, "15.00"],
]);
assert.deepEqual(parseReceiptText(make("2 × Sandwich PHP 50.00 100.00", "1 x Tea 15.00")).items.map(({ description, quantity }) =>
  [description, quantity]), [["Sandwich", 2], ["Tea", 1]]);
console.log("Wrapped receipt rows preserve quantities, continuation text, modifiers, and separate charges.");

const freebies = parseReceiptText(make("Qty Description Amount", "2 × Sandwich 100.00", "No onions",
  "Complimentary water", "1 × Cookie (FOC) 0.00", "Sugar Free Soda 15.00", "Subtotal 115.00"));
assert.deepEqual(freebies.items.map(({ description, amount, complimentary }) => [description, amount, complimentary]), [
  ["Sandwich (No onions)", "100.00", undefined],
  ["water (Complimentary)", null, true],
  ["Cookie (Complimentary)", "0.00", true],
  ["Sugar Free Soda", "15.00", undefined],
]);
assert.equal(parseReceiptLineItemNumber("FOC"), null);
assert.deepEqual(parseReceiptLineItemsFromPayload({ receiptLineItems: freebies.items }).slice(1, 3).map(item => item.amount), [null, "0.00"]);
