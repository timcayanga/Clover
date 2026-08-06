import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getInvestmentAssetBrand, getInvestmentAssetLogoCandidates } from "@/lib/investment-assets";
import { getGotradeSecurityName, resolveGotradeSecuritySymbol } from "@/lib/gotrade-securities";
import { inferInvestmentClassification, isActivityOnlyGcryptoAccount } from "@/lib/investments";
import {
  getInvestmentActivityAmountTone,
  getInvestmentActivityAssetName,
  getInvestmentActivityNote,
  getInvestmentActivityType,
  getInvestmentActivityUnits,
} from "@/lib/investment-activity";
import { buildPortfolioGrowthSeries, getPortfolioGrowthMarket } from "@/lib/investment-portfolio-growth";
import { canonicalizePdaxInvestmentHoldings } from "@/lib/pdax-portfolio-accounts";

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

const importedCryptoSale = {
  type: "income" as const,
  merchantRaw: "Sell Bitcoin",
  merchantClean: "Sell Bitcoin",
  description:
    'Crypto sale: "Sell 12:22 PM Bitcoin" with amounts "0.00725" and partially visible "PHP 14,653.28" and status Successful.',
  rawPayload: { action: "Sell", assetName: "Bitcoin", quantity: "0.00725000" },
  normalizedPayload: null,
};
assert.equal(getInvestmentActivityType(importedCryptoSale), "Sell");
assert.equal(getInvestmentActivityUnits(importedCryptoSale), "0.00725");
assert.equal(getInvestmentActivityNote(importedCryptoSale), null, "Parser narration should not appear as a user note");
assert.equal(getInvestmentActivityAmountTone(importedCryptoSale), "positive");

const legacyAiCryptoSale = {
  type: "income" as const,
  merchantRaw: "Sell Solana",
  merchantClean: "Sell Solana",
  description:
    'Crypto sale: "Sell 12:23 PM Solana" with amounts "4.4838" and "PHP 14,591.50" and status Successful. 4.4838 presumed SOL units.',
  rawPayload: {
    source: "openai",
    sourceLine: "Sell 12:23 PM\nSolana\n4.4838\nPHP 14,591.50\nSuccessful",
  },
  normalizedPayload: {},
};
assert.equal(getInvestmentActivityAssetName(legacyAiCryptoSale), "Solana");
assert.equal(getInvestmentActivityUnits(legacyAiCryptoSale), "4.4838");

const legacyAiCryptoPurchase = {
  type: "expense" as const,
  merchantRaw: "Buy Bitcoin 0.001598",
  merchantClean: "Bitcoin purchase",
  description: 'Crypto buy transaction. Asset: Bitcoin. Quantity: 0.001598 BTC. Status: Successful.',
  rawPayload: {
    source: "openai",
    sourceLine: "Feb 06, 2023\nBuy 1:15 PM\nBitcoin\nSuccessful\n0.001598\nPHP 2,023.00",
  },
  normalizedPayload: {},
};
assert.equal(getInvestmentActivityAssetName(legacyAiCryptoPurchase), "Bitcoin");
assert.equal(getInvestmentActivityUnits(legacyAiCryptoPurchase), "0.001598");
assert.equal(getInvestmentActivityNote(legacyAiCryptoPurchase), null);

const importedCryptoPurchase = {
  type: "expense" as const,
  merchantRaw: "Buy Bitcoin",
  merchantClean: null,
  description: "Buy - Bitcoin (0.001598)",
  rawPayload: { action: "Buy", assetName: "Bitcoin", quantity: "0.001598" },
  normalizedPayload: null,
};
assert.equal(getInvestmentActivityType(importedCryptoPurchase), "Buy");
assert.equal(getInvestmentActivityUnits(importedCryptoPurchase), "0.001598");
assert.equal(getInvestmentActivityAmountTone(importedCryptoPurchase), "negative");

assert.equal(
  getInvestmentActivityNote({
    type: "transfer",
    merchantRaw: "Move funds",
    description: "Moved to cold storage",
    rawPayload: null,
    normalizedPayload: null,
  }),
  "Moved to cold storage",
  "Concise user-authored notes should remain visible"
);

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

const gotradeBrand = getInvestmentAssetBrand({
  name: "Exxon Mobil",
  symbol: "XOM",
  institution: "GoTrade",
  subtype: "stock",
  currency: "USD",
});
assert.match(gotradeBrand.logoSrcs[0] ?? "", /gotrade/i, "Every GoTrade holding should prefer the GoTrade mark.");
assert.equal(resolveGotradeSecuritySymbol({ institution: "GoTrade", name: "Exxon Mobil" }), "XOM");
assert.equal(resolveGotradeSecuritySymbol({ institution: "GoTrade", name: "Verizon" }), "VZ");
assert.equal(getGotradeSecurityName("VZ"), "Verizon");

const canonicalPdaxHoldings = canonicalizePdaxInvestmentHoldings([
  { assetName: "PDAX Wallet", assetType: "crypto", quantity: null, currentValue: 18_675.92 },
  { assetName: "Ripple", assetType: "crypto", quantity: 100, currentValue: 5_000 },
  { assetName: "XRP", assetSymbol: "XRP", assetType: "crypto", quantity: 100, currentValue: 4_800 },
]);
assert.equal(canonicalPdaxHoldings.length, 1, "PDAX Wallet and duplicate Ripple aliases must not render as holdings.");
assert.equal(canonicalPdaxHoldings[0]?.assetName, "XRP");
assert.equal(canonicalPdaxHoldings[0]?.currentValue, 4_800, "The explicit canonical XRP position should win stale aliases.");

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

const investmentsPageSource = readFileSync(resolve(process.cwd(), "app/investments/page.tsx"), "utf8");
const investmentsStyles = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
const marketChartSource = readFileSync(resolve(process.cwd(), "components/investment-market-chart.tsx"), "utf8");
const portfolioGrowthSource = readFileSync(resolve(process.cwd(), "components/investment-portfolio-growth-chart.tsx"), "utf8");

assert.match(investmentsPageSource, /includeAllOption=\{false\}/, "Investments must require one portfolio currency.");
assert.doesNotMatch(investmentsPageSource, /allLabel="All currencies"/, "Investments must not show an aggregate currency option.");
assert.match(investmentsPageSource, /InvestmentPortfolioGrowthChart/, "Overview must render market-priced portfolio growth.");
assert.match(portfolioGrowthSource, /MARKET_RANGES\.map/, "Portfolio growth must support the same date ranges as Markets.");
assert.match(portfolioGrowthSource, /portfolio-growth__asset-picker/, "Portfolio growth investments must use one compact picker.");
assert.match(portfolioGrowthSource, /type="checkbox"/, "Portfolio growth picker must retain multi-selection.");
assert.match(portfolioGrowthSource, /useState<MarketRange>\("MAX"\)/, "Portfolio growth must open with the full recorded period.");
assert.doesNotMatch(portfolioGrowthSource, /<strong>\{asset\.symbol\}<\/strong>/, "Investment picker labels must not be bold.");
assert.match(portfolioGrowthSource, /onPointerMove/, "Portfolio growth must expose hover and pointer values.");
assert.doesNotMatch(investmentsPageSource, /\["neutral", "Neutral"\]/, "Portfolio Outlook must not render a neutral column.");
assert.match(investmentsPageSource, /\/api\/market-news\?/, "Asset news must load inside Clover.");
assert.doesNotMatch(investmentsPageSource, /news\.google\.com/, "Asset news must not navigate users away from Clover.");
assert.match(investmentsStyles, /\.content--investments\s*\{[\s\S]*?height:\s*100dvh;/, "Investments must own a scrollable viewport.");
assert.match(investmentsStyles, /\.content--investments\s*>\s*\.topbar\s*\{[\s\S]*?position:\s*sticky;/, "The desktop Investments header must be sticky.");
assert.match(investmentsStyles, /\.investments-mobile-header\s*\{[\s\S]*?position:\s*sticky;/, "The mobile Investments header must be sticky.");
assert.match(investmentsPageSource, /canonicalizePdaxInvestmentHoldings/, "Portfolio rows must hide PDAX wallet balances and collapse XRP aliases.");
assert.match(investmentsPageSource, /isInvestmentActivityOnlyLabel/, "Dividend activity must not render as a portfolio holding.");
assert.match(investmentsPageSource, /parseNullableAmount\(holding\.currentValue \?\? holding\.marketValue\) !== null/, "Incomplete imported holdings must stay out of the Portfolio table.");
assert.match(investmentsStyles, /\.content--investments \.investments-portfolio-table__row--head\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?background:\s*#fff;/, "Desktop Portfolio headers must remain sticky and opaque.");
assert.match(marketChartSource, /seenSymbols\.has\(key\)/, "Portfolio market tickers must be deduplicated.");

assert.equal(getPortfolioGrowthMarket("crypto", "PHP"), "crypto");
assert.equal(getPortfolioGrowthMarket("stock", "PHP"), "ph");
assert.equal(getPortfolioGrowthMarket("stock", "USD"), "us");
const growthSeries = buildPortfolioGrowthSeries({
  assets: [
    { id: "a", name: "Alpha", symbol: "AAA", market: "us", units: 2, currency: "PHP" },
    { id: "b", name: "Beta", symbol: "BBB", market: "us", units: 1, currency: "PHP" },
  ],
  histories: [
    { assetId: "a", currency: "USD", points: [{ date: "2026-08-01", value: 10 }, { date: "2026-08-02", value: 12 }] },
    { assetId: "b", currency: "USD", points: [{ date: "2026-08-01", value: 5 }, { date: "2026-08-02", value: 4 }] },
  ],
  exchangeRates: { USD: 50 },
});
assert.deepEqual(growthSeries, [
  { date: "2026-08-01", value: 1250 },
  { date: "2026-08-02", value: 1400 },
]);

const activityBoundGrowthSeries = buildPortfolioGrowthSeries({
  assets: [
    { id: "early", name: "Early", symbol: "EARLY", market: "us", units: 1, currency: "USD", startDate: "2026-02-10" },
    { id: "later", name: "Later", symbol: "LATER", market: "us", units: 1, currency: "USD", startDate: "2026-03-01" },
  ],
  histories: [
    { assetId: "early", currency: "USD", points: [{ date: "2026-02-01", value: 10 }, { date: "2026-02-10", value: 11 }, { date: "2026-03-01", value: 12 }] },
    { assetId: "later", currency: "USD", points: [{ date: "2026-03-01", value: 22 }] },
  ],
  exchangeRates: { USD: 1 },
});
assert.deepEqual(activityBoundGrowthSeries, [
  { date: "2026-02-10", value: 11 },
  { date: "2026-03-01", value: 34 },
]);

console.log(`Investment regression passed: ${classificationCases.length + 47} checks.`);
