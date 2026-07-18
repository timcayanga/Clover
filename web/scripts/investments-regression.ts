import assert from "node:assert/strict";
import { getInvestmentAssetLogoCandidates } from "@/lib/investment-assets";
import { inferInvestmentClassification } from "@/lib/investments";

const classificationCases = [
  { name: "ATRAM Peso Money Market Fund", expected: "money_market_fund" },
  { name: "ATRAM Medium Term Peso Bond Fund", expected: "bond" },
  { name: "Vanguard S&P 500 ETF", expected: "etf" },
  { name: "GSave #UNOboost 1330", institution: "GSave", expected: "time_deposit" },
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

console.log(`Investment regression passed: ${classificationCases.length + 3} checks.`);
