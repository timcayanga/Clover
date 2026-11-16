import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { readPdaxPortfolioAccount, readPublishedPdaxPortfolioAccount } from "@/lib/pdax-portfolio-accounts";
import { formatUploadAccountDisplayName } from "@/lib/account-display";
import { prefersLiveInvestmentBalance } from "@/lib/investment-balance";

const walletFromParsedEvidence = readPdaxPortfolioAccount(
  {
    source: "pdax_portfolio_screenshot",
    accountName: "Wallet",
    accountType: "wallet",
    statementEndingBalance: 7969.73,
  },
  { requireScreenshotSource: true }
);
assert.deepEqual(walletFromParsedEvidence, {
  name: "Wallet",
  balance: 7969.73,
  type: "wallet",
  subtype: null,
  symbol: null,
  quantity: null,
});

const walletFromPublishedSummary = readPublishedPdaxPortfolioAccount({
  institution: "PDAX",
  accountName: "Wallet",
  accountType: "wallet",
  balance: "7,969.73",
});
assert.equal(walletFromPublishedSummary?.balance, 7969.73);
assert.equal(walletFromPublishedSummary?.type, "wallet");

const walletFromCachedParse = readPdaxPortfolioAccount(
  {
    source: "pdax_portfolio_screenshot",
    accountName: "Wallet",
    accountType: "wallet",
    balance: "7,969.73",
  },
  { requireScreenshotSource: true }
);
assert.equal(walletFromCachedParse?.balance, 7969.73, "A cached deterministic parse must remain sufficient to restore Wallet.");
assert.equal(
  formatUploadAccountDisplayName("Wallet", "PDAX", null, "wallet"),
  "Wallet",
  "PDAX Wallet must not be renamed to the generic provider label and filtered from Accounts."
);

assert.equal(
  prefersLiveInvestmentBalance("investment"),
  true,
  "A historical PDAX screenshot checkpoint must not replace the current BTC/XRP holding value."
);
assert.equal(prefersLiveInvestmentBalance("wallet"), false);

const accountsRouteSource = readFileSync(path.join(process.cwd(), "app/api/accounts/route.ts"), "utf8");
const cleanupBucketSet = accountsRouteSource.match(/const bucketNames = new Set\(\[([^\]]+)\]\)/)?.[1] ?? "";
assert.doesNotMatch(
  cleanupBucketSet,
  /["']gold["']/i,
  "PDAX cleanup must not delete a visible Gold balance; Gold is a concrete real-world asset."
);

const institutionPageSource = readFileSync(
  path.join(process.cwd(), "app/accounts/institutions/[institutionSlug]/page.tsx"),
  "utf8"
);
assert.match(
  institutionPageSource,
  /for \(const account of holdingAccounts\)/,
  "Institution details must supplement incomplete snapshots with persisted asset accounts such as PDAX Gold."
);

assert.equal(
  readPdaxPortfolioAccount(
    { source: "pdax_portfolio_screenshot", accountName: "Crypto Balance", accountType: "investment", balance: 97155.46 },
    { requireScreenshotSource: true }
  ),
  null,
  "Aggregate crypto buckets must not be recreated as a portfolio account."
);

console.log("[PASS] PDAX account repair preserves Wallet evidence and excludes aggregate buckets.");
