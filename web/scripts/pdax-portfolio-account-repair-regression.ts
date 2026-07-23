import assert from "node:assert/strict";
import { readPdaxPortfolioAccount, readPublishedPdaxPortfolioAccount } from "@/lib/pdax-portfolio-accounts";

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
  readPdaxPortfolioAccount(
    { source: "pdax_portfolio_screenshot", accountName: "Crypto Balance", accountType: "investment", balance: 97155.46 },
    { requireScreenshotSource: true }
  ),
  null,
  "Aggregate crypto buckets must not be recreated as a portfolio account."
);

console.log("[PASS] PDAX account repair preserves Wallet evidence and excludes aggregate buckets.");
