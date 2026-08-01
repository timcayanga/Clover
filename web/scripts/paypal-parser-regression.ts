import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  detectStatementMetadata,
  inferAccountTypeFromStatement,
  normalizePayPalAccountType,
} from "@/lib/import-parser";
import { matchesLegacyPayPalWalletDuplicate } from "@/lib/imported-account-identity";

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

assert.equal(
  matchesLegacyPayPalWalletDuplicate(
    {
      name: "PayPal 5067",
      institution: "PayPal",
      accountNumber: "5067",
      type: "wallet",
      currency: "GBP",
      source: "upload",
    },
    {
      name: "PayPal 5067",
      institution: "PayPal",
      accountNumber: "5067",
      type: "credit_card",
      currency: "GBP",
      source: "upload",
    }
  ),
  true,
  "A legacy upload-created PayPal credit-card copy should reconcile into the matching wallet."
);
assert.equal(
  matchesLegacyPayPalWalletDuplicate(
    {
      name: "PayPal 5067",
      institution: "PayPal",
      accountNumber: "5067",
      type: "wallet",
      currency: "GBP",
      source: "upload",
    },
    {
      name: "PayPal Credit 5067",
      institution: "PayPal",
      accountNumber: "5067",
      type: "credit_card",
      currency: "GBP",
      source: "upload",
    }
  ),
  false,
  "PayPal Credit must remain separate from an ordinary PayPal wallet."
);
assert.equal(
  matchesLegacyPayPalWalletDuplicate(
    {
      name: "PayPal 5067",
      institution: "PayPal",
      accountNumber: "5067",
      type: "wallet",
      currency: "GBP",
      source: "upload",
    },
    {
      name: "PayPal 5067",
      institution: "PayPal",
      accountNumber: "5067",
      type: "credit_card",
      currency: "GBP",
      source: "manual",
    }
  ),
  false,
  "Automatic repair must not remove a manually created account."
);

const accountsRouteSource = readFileSync(resolve(process.cwd(), "app/api/accounts/route.ts"), "utf8");
const eagerRepairCall = accountsRouteSource.indexOf("await repairLegacyUploadedPayPalAccountSplits(workspaceId, compatibleColumns)");
const visibleAccountQuery = accountsRouteSource.indexOf("const [accounts, accountRules, statementCheckpoints, investmentSnapshots]");
assert.ok(
  eagerRepairCall > 0 && visibleAccountQuery > eagerRepairCall,
  "PayPal duplicate repair must run before the Accounts API returns visible accounts."
);

console.log("PayPal account-classification regression passed.");
