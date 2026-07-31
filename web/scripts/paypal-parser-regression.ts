import assert from "node:assert/strict";
import {
  detectStatementMetadata,
  inferAccountTypeFromStatement,
  normalizePayPalAccountType,
} from "@/lib/import-parser";

const ordinaryActivityText = `
PayPal
Activity statement
Statement date: July 31, 2026
Currency: GBP

Date        Type                 Name                 Credit       Debit       Balance
Jul 30      Payment received     Example Customer     25.00                    125.00
Jul 31      Payment sent         Example Merchant                  10.00       115.00
`;

const ordinaryMetadata = detectStatementMetadata(
  ordinaryActivityText,
  "PayPal Activity Statement.pdf"
);

assert.equal(
  normalizePayPalAccountType("PayPal", "PayPal", ordinaryActivityText),
  "wallet",
  "Ordinary PayPal activity must remain a wallet even when its table contains a Credit column."
);
assert.equal(
  inferAccountTypeFromStatement("PayPal", "PayPal Activity", "bank"),
  "wallet",
  "PayPal institution identity should default to wallet."
);
assert.equal(
  ordinaryMetadata.accountType,
  "wallet",
  "Generic statement metadata must not classify ordinary PayPal activity as a credit card."
);
assert.equal(
  normalizePayPalAccountType(
    "PayPal",
    "PayPal Credit",
    "PayPal Credit monthly statement. Minimum payment due."
  ),
  "credit_card",
  "The explicitly branded PayPal Credit product must remain a credit account."
);

console.log("PayPal account-classification regression passed.");
