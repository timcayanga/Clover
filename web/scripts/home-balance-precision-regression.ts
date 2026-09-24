import assert from "node:assert/strict";
import { formatCurrencyAmount } from "../lib/currency-format";

assert.equal(formatCurrencyAmount("9999999999999999.99", "PHP"), "₱9,999,999,999,999,999.99");
assert.equal(formatCurrencyAmount("10000000000000000.01", "USD"), "$10,000,000,000,000,000.01");
assert.equal(formatCurrencyAmount("0.005", "PHP"), "₱0.01");
assert.equal(formatCurrencyAmount("0.004", "PHP"), "₱0.00");
assert.equal(formatCurrencyAmount(1234.56, "PHP"), "₱1,234.56");
assert.equal(formatCurrencyAmount(0, "USD"), "$0.00");
console.log("Home balance precision: 6 formatting regressions passed.");

import { convertHomeTotal } from "../lib/home-currency-total";
assert.equal(convertHomeTotal([{currency:"PHP",amount:1000},{currency:"USD",amount:20}],{PHP:1,USD:56}),"2120.00");
assert.equal(convertHomeTotal([{currency:"PHP",amount:1000},{currency:"USD",amount:20}],{PHP:1/50,USD:1}),"40.00");
assert.equal(convertHomeTotal([{currency:"PHP",amount:1000},{currency:"USD",amount:20}],{PHP:1,USD:null}),null);
assert.equal(convertHomeTotal([{currency:"USD",amount:0}],{USD:null}),"0.00");
assert.equal(convertHomeTotal([{currency:"PHP",amount:"9999999999999999.99"},{currency:"USD",amount:"0.01"}],{PHP:1,USD:2}),"10000000000000000.01");
assert.equal(convertHomeTotal([{currency:"USD",amount:1}],{USD:0}),null);
assert.equal(convertHomeTotal([{currency:"USD",amount:1}],{USD:NaN}),null);
console.log("Home combined totals: conversion, missing-rate handling, zero values and decimal precision passed.");
