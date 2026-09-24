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

import { convertHomeWindow } from "../lib/home-currency-total";
const from = new Date("2026-09-01T00:00:00Z"), to = new Date("2026-10-01T00:00:00Z");
const row = {date:from,currency:"USD",amount:"10.00",type:"income" as const,isTransfer:false};
const records = [row, {...row,currency:"PHP",amount:"560.00"}, {...row,amount:"-2.00",type:"expense" as const}, {...row,amount:"500",isTransfer:true}, {...row,date:to,amount:"999"}];
const before = JSON.stringify(records);
assert.deepEqual(convertHomeWindow(records,from,to,{USD:1,PHP:1/56}),{income:"20.00",expense:"2.00"});
assert.deepEqual(convertHomeWindow(records,from,to,{USD:1}),{income:null,expense:"2.00"});
assert.equal(JSON.stringify(records),before);
assert.deepEqual(convertHomeWindow([],from,to,{}),{income:"0.00",expense:"0.00"});
console.log("Native hero totals: mixed currency, transfer exclusion, exclusive end, missing rates and source preservation passed.");

import { buildHomeAdviserInsights } from "../../shared/home-adviser-insights";
const insightInput = { currency: "USD", daysSinceLastImport: null, categorySpike: null, paymentTitles: [], recurringCount: 0, weekly: { income: 100, expense: 20, transfer: 0 }, previousWeeklyExpense: 30, monthNet: 80, hasRecentTransactions: true, recentReviewCount: 0 };
const advice = buildHomeAdviserInsights(insightInput);
assert.deepEqual(advice.map(i => i.label), ["Upload Reminder", "Spending eased", "Positive cash flow"]);
assert.deepEqual(advice[1].parts, ["You spent ", { amount: 10, currency: "USD" }, " less than last week."]);
assert.deepEqual(buildHomeAdviserInsights({ ...insightInput, categorySpike: { name: "Food & Dining", delta: 600 }, paymentTitles: ["Rent"] }).map(i => i.label), ["Upload Reminder", "Spending spike", "Upcoming payment"]);
const warning = buildHomeAdviserInsights({ ...insightInput, daysSinceLastImport: 0, previousWeeklyExpense: 0, monthNet: -10, recentReviewCount: 1, weekly: { income: 0, expense: 20, transfer: 50 } });
assert.equal(warning.length, 1);
assert.equal(warning[0].tone, "warning");
assert.ok(warning[0].parts.includes(" moved between accounts"));
assert.ok(!warning[0].parts.some(p => typeof p === "string" && p.includes("Spending is there")));
assert.deepEqual(buildHomeAdviserInsights({ ...insightInput, daysSinceLastImport: 0, previousWeeklyExpense: 0, monthNet: 0, hasRecentTransactions: false }), []);
console.log("Shared Home advice: priority, monetary privacy tokens, review suppression, empty activity and transfer context passed.");

assert.ok(buildHomeAdviserInsights({ ...insightInput, paymentTitles: ["Rent"] }).find(i => i.label === "Upcoming payment")?.parts.includes("Rent is due in the next 7 days."));
assert.ok(buildHomeAdviserInsights({ ...insightInput, paymentTitles: ["Rent", "Internet"] }).find(i => i.label === "Upcoming payment")?.parts.includes("Rent, Internet are due in the next 7 days."));
