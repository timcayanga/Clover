import assert from "node:assert/strict";
import { matchPrintedReceiptAccount, readPrintedPaymentIdentity, receiptPaymentHistoryKey, type PrintedPaymentIdentity } from "../lib/receipt-account-resolution";

const accounts = [
  { id: "personal", name: "BPI Personal", institution: "BPI", accountNumber: "1234", type: "credit_card", currency: "PHP" },
  { id: "second", name: "BPI Travel", institution: "BPI", accountNumber: "5678", type: "credit_card", currency: "PHP" },
  { id: "other", name: "BDO", institution: "BDO", accountNumber: "1234", type: "credit_card", currency: "PHP" },
  { id: "wallet", name: "GCash Personal", institution: "GCash", accountNumber: null, type: "wallet", currency: "PHP" },
];
const read = (text: string) => readPrintedPaymentIdentity(text, accounts) as PrintedPaymentIdentity;
const card = read("Card issuer: Bank of the Philippine Islands\nVisa ****1234");
assert.equal(matchPrintedReceiptAccount(card, accounts, "PHP").resolution?.accountId, "personal");
assert.equal(receiptPaymentHistoryKey(card), "card:bpi:1234");
const suffixOnly = matchPrintedReceiptAccount(read("Card ending in 1234"), accounts, "PHP");
assert.equal(suffixOnly.resolution, null);
assert.deepEqual(suffixOnly.candidateIds, ["personal", "other"]);
assert.equal(matchPrintedReceiptAccount(read("Card issuer: BPI"), accounts, "PHP").resolution, null);
assert.equal(matchPrintedReceiptAccount(read("Card issuer: BPI\nCard ending in 9988"), accounts, "PHP", ["personal"]).resolution, null);
assert.equal(matchPrintedReceiptAccount(read("GCash 50.00"), accounts, "PHP").resolution?.accountId, "wallet");
assert.equal(matchPrintedReceiptAccount(read("Paid with GCash ****2468"), accounts, "PHP", ["wallet"]).resolution?.accountId, "wallet");
assert.equal(matchPrintedReceiptAccount(card, accounts, "USD").resolution, null);
assert.equal(readPrintedPaymentIdentity("Maya Coffee\nReference 1234\nPaid with cash", accounts), null);
assert.equal(readPrintedPaymentIdentity("Card ending in 1234\nCard ending in 5678", accounts), "ambiguous");
console.log("Printed receipt accounts passed for issuer, suffix, wallet, conflicts, currency, and confirmed history.");
