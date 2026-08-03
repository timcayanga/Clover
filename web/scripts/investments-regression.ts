import assert from "node:assert/strict";
import { getInvestmentAssetBrand, getInvestmentAssetLogoCandidates } from "@/lib/investment-assets";
import { inferInvestmentClassification, isActivityOnlyGcryptoAccount } from "@/lib/investments";

const classificationCases = [
  { name: "ATRAM Peso Money Market Fund", expected: "money_market_fund" },
  { name: "ATRAM Medium Term Peso Bond Fund", expected: "bond" },
  { name: "Vanguard S&P 500 ETF", expected: "etf" },
  { name: "GSave #UNOboost 1330", institution: "GSave", expected: "time_deposit" },
  { name: "GSave (UNO)", institution: "UNO Digital Bank", expected: "savings" },
  { name: "HSBC Savings", institution: "HSBC", expected: "savings" },
  { name: "Bitcoin", institution: "GCrypto", symbol: "BTC", expected: "crypto" },
  { name: "Manila Electric", institution: "GStocks", symbol: "MER", expected: "stock" },
  { name: "Ayala REIT", symbol: "AREIT", expected: "reit" },
  { name: "BPI Unit Investment Trust Fund", expected: "uitf" },
] as const;

for (const testCase of classificationCases) {
  const result = inferInvestmentClassification(testCase);
  assert.equal(result.subtype, testCase.expected, `${testCase.name} should classify as ${testCase.expected}`);
  assert.equal(result.source, "inferred");
  assert.ok(result.confidence >= 80);
}

const confirmed = inferInvestmentClassification({
  subtype: "other",
  name: "Bitcoin",
});
assert.equal(confirmed.subtype, "other", "A saved Other classification must not be overwritten");
assert.equal(confirmed.source, "confirmed");

const unknown = inferInvestmentClassification({ name: "Family investment account" });
assert.equal(unknown.subtype, "other");
assert.equal(unknown.source, "fallback");
assert.ok(unknown.confidence < 50);

const logoCandidates = getInvestmentAssetLogoCandidates({
  name: "Manila Electric",
  symbol: "MER",
  subtype: "stock",
  currency: "PHP",
});
assert.equal(logoCandidates.length, 1, "Investment assets should use one stable local fallback");
assert.match(logoCandidates[0] ?? "", /^data:image\/svg\+xml,/);

const hsbcBrand = getInvestmentAssetBrand({
  name: "HSBC Savings",
  institution: "HSBC",
  subtype: "other",
  currency: "PHP",
});
assert.equal(hsbcBrand.logoFit, "contain", "Institution investment marks must show the complete HSBC logo");
assert.ok(hsbcBrand.logoSrcs.length > 0, "Institution investment marks should retain provider logo candidates");

const gsaveBrand = getInvestmentAssetBrand({
  name: "GSave (UNO)",
  institution: "UNO Digital Bank",
  subtype: "savings",
  currency: "PHP",
});
assert.match(gsaveBrand.logoSrcs.join(" "), /gcash/i, "GSave investment rows should use the GSave/GCash mark");

assert.equal(
  isActivityOnlyGcryptoAccount({
    source: "upload",
    name: "GCrypto Transaction History",
    institution: "GCrypto / PDAX",
    transactionCount: 12,
    hasSnapshotHoldings: false,
    hasPositionEvidence: false,
  }),
  true,
  "GCrypto transaction history must not become a portfolio asset."
);
assert.equal(
  isActivityOnlyGcryptoAccount({
    source: "upload",
    name: "Bitcoin",
    institution: "GCrypto",
    transactionCount: 12,
    hasSnapshotHoldings: false,
    hasPositionEvidence: true,
  }),
  false,
  "A GCrypto account with explicit position evidence should remain a visible holding."
);

console.log(`Investment regression passed: ${classificationCases.length + 8} checks.`);
