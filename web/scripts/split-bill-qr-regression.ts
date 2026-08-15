import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

const paymentOptionsSource = readFileSync(resolve(process.cwd(), "components/split-bill-qr-library.tsx"), "utf8");
const paymentToolsSource = readFileSync(resolve(process.cwd(), "components/split-bill-payment-tools.tsx"), "utf8");
const paymentRequestRoute = readFileSync(resolve(process.cwd(), "app/api/split-bills/[billId]/payment-requests/route.ts"), "utf8");

assert.match(paymentOptionsSource, />Payment Options</, "The QR library must be presented as reusable Payment Options.");
assert.doesNotMatch(
  paymentOptionsSource,
  /if \(!draft\.qrImageData\)/,
  "Bank-only payment options must not require a QR image.",
);
assert.match(paymentOptionsSource, /<span>Bank<\/span>/, "Payment options must capture the bank or payment provider.");
assert.match(paymentOptionsSource, /QR Code <small>Optional<\/small>/, "QR images must remain optional.");
assert.match(paymentToolsSource, /typeof navigator\.share === "function"/, "Payment requests must prefer native device sharing.");
assert.match(paymentToolsSource, /mailto:/, "Desktop payment requests must retain an email fallback.");
assert.match(paymentToolsSource, /navigator\.clipboard\.writeText/, "Payment requests must retain a copy-link fallback.");
assert.match(
  paymentRequestRoute,
  /where: \{ id: body\.paymentProfileId, userId: user\.id \}/,
  "Only the owner may attach a saved payment option to a request.",
);

console.log("Split Bills payment options regression passed.");
