import assert from "node:assert/strict";
import { transactionMerchantLogo } from "../lib/transaction-merchant-logo";
import { enrichMerchantIdentityPayload } from "../lib/merchant-identity";
import { mobileApiResponse } from "../lib/mobile-api-response";

const merchant = { merchantRaw: "STARBUCKS PH", merchantClean: "Starbucks", currency: "PHP", categoryName: "Food & Dining" };
const row = { ...merchant, normalizedPayload: enrichMerchantIdentityPayload(merchant) };
const logo = transactionMerchantLogo(row);
assert.ok(logo.merchantLogoUrl?.includes("starbucks"));
assert.equal(logo.merchantLogoNameKey, JSON.stringify([row.merchantRaw, row.merchantClean]));
assert.equal(transactionMerchantLogo({ ...row, merchantRaw: "Unknown Merchant", merchantClean: "Unknown Merchant" }).merchantLogoUrl, null);
assert.equal(transactionMerchantLogo({ merchantRaw: "PADDLE.NET * OTHER PRODUCT" }).merchantLogoUrl, null);
const projected = mobileApiResponse("transactions", { transactions: [row] }) as { transactions: Record<string, unknown>[] };
assert.equal(projected.transactions[0].merchantLogoUrl, logo.merchantLogoUrl);
assert.equal(projected.transactions[0].merchantLogoNameKey, logo.merchantLogoNameKey);
assert.ok(!("normalizedPayload" in projected.transactions[0]));
assert.ok(!("rawPayload" in projected.transactions[0]));
const ambiguous = { legalName: "First Financial Bank", merchantCountry: "US", industry: "financial-services" };
assert.equal(transactionMerchantLogo(ambiguous).merchantLogoUrl, null);
for (const merchantRaw of ["grab lunch", "Apple juice", "Target savings", "Shellfish lunch", "Transfer to John"]) {
  assert.equal(transactionMerchantLogo({ merchantRaw, currency: "PHP", categoryName: "Food & Dining" }).merchantLogoUrl, null, merchantRaw);
}
assert.ok(transactionMerchantLogo({ merchantRaw: "GRAB *GRABFOOD", currency: "PHP" }).merchantLogoUrl, "An explicit Grab descriptor keeps its logo");
assert.equal(transactionMerchantLogo({ ...row, merchantClean: "Unidentified seller", reviewStatus: "edited" }).merchantLogoUrl, null, "A user correction must not inherit the imported merchant logo");
console.log("Transaction logo projection passed: confident match, stale edits, ambiguous merchant, provider safety, compact native response.");
