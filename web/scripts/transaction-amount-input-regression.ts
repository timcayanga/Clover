import assert from "node:assert/strict";
import { normalizeTransactionAmountInput, parsePositiveTransactionAmount } from "../lib/transaction-amount-input";
for (const [input, expected] of [[".50", ".50"], ["12.", "12."], ["12,345.67", "12345.67"], ["1,234,567.89", "1234567.89"], ["1234.56", "1234.56"], [" 0.00 ", "0.00"], ["-12.34", "-12.34"]]) {
  assert.equal(normalizeTransactionAmountInput(input), expected);
}
for (const input of ["12,34", "1.234,56", "12,34.56", "1,23,456", "123.456", "", "Infinity", "1e3", "1 234.56"]) {
  assert.equal(normalizeTransactionAmountInput(input), null, input);
}
for (const [input, expected] of [["12,345.67", 12345.67], ["0.01", 0.01], [1, 1]]) {
  assert.equal(parsePositiveTransactionAmount(input), expected);
}
for (const input of ["0", "0.00", "-1", "-0.01", "1.234", "12,34"]) {
  assert.equal(parsePositiveTransactionAmount(input), null, input);
}
console.log("PASS: grouped decimal amounts normalize; ambiguous and malformed input is rejected");
