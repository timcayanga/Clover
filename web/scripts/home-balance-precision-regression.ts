import assert from "node:assert/strict";
import { formatCurrencyAmount } from "../lib/currency-format";

assert.equal(formatCurrencyAmount("9999999999999999.99", "PHP"), "₱9,999,999,999,999,999.99");
assert.equal(formatCurrencyAmount("10000000000000000.01", "USD"), "$10,000,000,000,000,000.01");
assert.equal(formatCurrencyAmount("0.005", "PHP"), "₱0.01");
assert.equal(formatCurrencyAmount("0.004", "PHP"), "₱0.00");
assert.equal(formatCurrencyAmount(1234.56, "PHP"), "₱1,234.56");
assert.equal(formatCurrencyAmount(0, "USD"), "$0.00");
console.log("Home balance precision: 6 formatting regressions passed.");
