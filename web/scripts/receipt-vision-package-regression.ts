import { encodeLocalReceiptOcr } from "../lib/local-receipt-ocr-envelope";
import assert from "node:assert/strict";
import { agreesWithCompactReceiptEvidence, buildCompactReceiptEvidence } from "@/lib/receipt-vision-package";

const purchase = [
  "CLOVER CAFE",
  "Official Receipt",
  "Date: 2026-11-15",
  "Latte PHP 125.00",
  "Total PHP 125.00",
  "Cash 150.00",
  "Change 25.00",
].join("\n");
const promo = "\nTake our feedback survey\nScan QR for a coupon";
const evidence = buildCompactReceiptEvidence(purchase + promo);
assert.ok(evidence);
assert.equal(evidence.text, purchase);
assert.equal(evidence.total, 125);
assert.equal(evidence.date, "2026-11-15");
assert.equal(evidence.currency, "PHP");
assert.equal(buildCompactReceiptEvidence(""), null);
assert.equal(buildCompactReceiptEvidence(purchase.replace("Date: 2026-11-15\n", "")), null);
assert.equal(buildCompactReceiptEvidence(purchase.replaceAll("PHP ", "")), null);
assert.equal(buildCompactReceiptEvidence(purchase + "\n" + "Printed product description\n".repeat(90)), null);

assert.equal(buildCompactReceiptEvidence(purchase.replace("2026-11-15", "04/05/2026")), null);

assert.deepEqual(buildCompactReceiptEvidence(encodeLocalReceiptOcr({ text: purchase })), evidence);

const matching = { merchant_raw: "Clover Café", currency: "PHP", transaction_date: "2026-11-15", total: 125 };
assert.equal(agreesWithCompactReceiptEvidence(evidence, { ...matching, merchant_raw: "Clover Cafe" }), true);
assert.equal(agreesWithCompactReceiptEvidence(evidence, { ...matching, merchant_raw: "Different Cafe" }), false);
assert.equal(agreesWithCompactReceiptEvidence(evidence, { ...matching, merchant_raw: evidence.merchant, total: 150 }), false);
assert.equal(agreesWithCompactReceiptEvidence(evidence, { ...matching, merchant_raw: evidence.merchant, transaction_date: null }), false);
assert.equal(agreesWithCompactReceiptEvidence(evidence, { ...matching, merchant_raw: evidence.merchant, currency: "USD" }), false);
console.log("Receipt vision package regression passed.");
