import assert from "node:assert/strict";
import { detectPaymentQrProvider, getPaymentQrTheme, PAYMENT_QR_PROVIDERS } from "../lib/payment-qr";

const gcash = detectPaymentQrProvider("000201010212GCASH G-XCHANGE INC PH.PPMI.P2M6304A1B2");
assert.equal(gcash.provider, "GCash");
assert.equal(gcash.confidence, "high");

const maya = detectPaymentQrProvider("000201010212PAYMAYA PYMYPHM2 6304A1B2");
assert.equal(maya.provider, "Maya");

const interoperable = detectPaymentQrProvider("00020101021226580011ph.ppmi.p2m6304A1B2");
assert.equal(interoperable.provider, "QR Ph");

const screenshotHint = detectPaymentQrProvider(null, "My_GCash_QR_screenshot.png");
assert.equal(screenshotHint.provider, "GCash");
assert.equal(screenshotHint.confidence, "low");

const unknown = detectPaymentQrProvider("https://example.com/pay/123", "payment-code.png");
assert.equal(unknown.provider, "Other");
assert.ok(PAYMENT_QR_PROVIDERS.includes(unknown.provider));

assert.notEqual(getPaymentQrTheme("GCash").start, getPaymentQrTheme("Maya").start);

console.log("Split Bills QR regression passed.");
