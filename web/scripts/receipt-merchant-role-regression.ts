import assert from "node:assert/strict";
import { parseReceiptText } from "../lib/split-bill";
import { readReceiptMerchantEvidence, reconcileReceiptMerchant } from "../lib/receipt-merchant-evidence";

const body = [
  "OFFICIAL RECEIPT", "Date: 2026-11-15", "Qty Description Amount",
  "1 Espresso PHP 185.00", "TOTAL PHP 185.00", "CARD PHP 185.00",
].join("\n");
const make = (header: string, footer = "") => [header, body, footer].filter(Boolean).join("\n");
const roles = [
  "Branch: Uptown Manila",
  "Terminal operator: Regional Merchant Systems Corporation",
  "Payment provider: PayMongo",
  "Franchisee: Twelve Pines Food Ventures Corporation",
].join("\n");
const explicit = make(roles + "\nTrade name: HARBOUR COFFEE 103");
assert.equal(parseReceiptText(explicit).merchantName, "HARBOUR COFFEE 103");
assert.equal(parseReceiptText(make(roles + "\nMerchant name: Twelve Pines Inc.\nTrade name: HARBOUR COFFEE 103")).merchantName,
  "HARBOUR COFFEE 103", "The trade name takes precedence over the registered seller name");
const namedHeader = make("HARBOUR COFFEE\n" + roles, "Printed by Printer Services Corporation");
assert.equal(parseReceiptText(namedHeader).merchantName, "HARBOUR COFFEE");
assert.equal(parseReceiptText(make("HARBOUR COFFEE\nOperated by Twelve Pines Food Ventures\nPayment processor: Stripe")).merchantName, "HARBOUR COFFEE");
assert.equal(parseReceiptText(make("Operated by Twelve Pines Food Ventures", "POS provider:\nPrinter Services Corporation")).merchantName, "Twelve Pines Food Ventures");
assert.equal(parseReceiptText(make(roles.replace(/\nFranchisee:.*/, ""))).merchantName, null, "Infrastructure alone cannot identify the seller");
assert.equal(readReceiptMerchantEvidence(make("BRANCH COFFEE COMPANY")).hasRoles, false, "Branch can be part of the seller's own name");
assert.equal(parseReceiptText(make("Merchant: Maya\nPayment provider: Stripe")).merchantName, "Maya", "An explicitly named seller may also be a payment brand");
assert.equal(parseReceiptText(make("Merchant: Harbour Coffee\nSeller: Bay Coffee")).merchantName, null, "Conflicting seller labels require review");
assert.equal(parseReceiptText(make("HARBOUR COFFEE\nPayment provider: Stripe", "Merchant: Last Page Rewards")).merchantName, "HARBOUR COFFEE", "Footer marketing cannot become an explicit seller");
assert.equal(readReceiptMerchantEvidence(make("Merchant ID: 123456")).explicit, null);

const model = { merchant_raw: "Regional Merchant Systems Corporation", merchant_clean: "Regional Merchant", total: 185 };
assert.deepEqual(reconcileReceiptMerchant(model, namedHeader, "HARBOUR COFFEE"), {
  merchant_raw: "HARBOUR COFFEE", merchant_clean: "HARBOUR COFFEE", total: 185,
});
assert.equal(reconcileReceiptMerchant({ ...model, merchant_raw: null, merchant_clean: null }, namedHeader, "HARBOUR COFFEE").merchant_raw, "HARBOUR COFFEE");
assert.equal(reconcileReceiptMerchant(model, namedHeader, "An unrelated shop").merchant_raw, null);
assert.equal(reconcileReceiptMerchant({ ...model, merchant_raw: "Uptown Manila" }, explicit, null).merchant_raw, "HARBOUR COFFEE 103");
assert.equal(reconcileReceiptMerchant({ ...model, merchant_raw: "Unlabeled Seller" }, namedHeader, null).merchant_raw, "Unlabeled Seller",
  "An unrelated optical candidate does not replace a visual seller without role evidence");
console.log("PASS receipt merchant roles, branch suffixes, provider exclusions, issuer fallback and ambiguous sellers");
