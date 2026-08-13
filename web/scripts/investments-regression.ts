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
import { findClosestMarketPointIndex } from "@/lib/market-data";
import {
  getFirstManualInvestmentDate,
  getManualInvestmentPositionActivities,
  sumManualInvestmentUnits,
} from "@/lib/manual-investment-positions";

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
  getInvestmentActivityUnits({
    type: "expense",
    merchantRaw: "Buy Vanguard S&P 500 ETF",
    rawPayload: { receiptLineItems: [{ description: "Buy Vanguard S&P 500 ETF", quantity: "1.2500" }] },
    normalizedPayload: null,
  }),
  "1.25",
  "Manual investment units must survive transaction creation metadata."
);

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

const latestCanonicalPdaxHoldings = canonicalizePdaxInvestmentHoldings([
  { assetName: "XRP", assetSymbol: "XRP", assetType: "crypto", quantity: 125.492, currentValue: 8_264.9 },
  { assetName: "XRP", assetSymbol: "XRP", assetType: "crypto", quantity: 125.492, currentValue: 7_729.05 },
]);
assert.equal(latestCanonicalPdaxHoldings.length, 1, "Equivalent XRP positions across snapshots must collapse.");
assert.equal(latestCanonicalPdaxHoldings[0]?.currentValue, 7_729.05, "The later equally strong XRP position should win.");

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
const institutionPageSource = readFileSync(resolve(process.cwd(), "app/accounts/institutions/[institutionSlug]/page.tsx"), "utf8");
const investmentsStyles = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
const marketChartSource = readFileSync(resolve(process.cwd(), "components/investment-market-chart.tsx"), "utf8");
const portfolioGrowthSource = readFileSync(resolve(process.cwd(), "components/investment-portfolio-growth-chart.tsx"), "utf8");
const marketHistoryRouteSource = readFileSync(resolve(process.cwd(), "app/api/market-history/route.ts"), "utf8");

assert.match(investmentsPageSource, /includeAllOption=\{false\}/, "Investments must require one portfolio currency.");
assert.doesNotMatch(investmentsPageSource, /allLabel="All currencies"/, "Investments must not show an aggregate currency option.");
assert.match(investmentsPageSource, /InvestmentPortfolioGrowthChart/, "Overview must render market-priced portfolio growth.");
assert.match(investmentsPageSource, /account\.type === "investment" \|\| isGSaveInvestmentAccount\(account\)/, "GSave manual activity must remain available to Investments.");
assert.match(portfolioGrowthSource, /MARKET_RANGES\.map/, "Portfolio growth must support the same date ranges as Markets.");
assert.match(portfolioGrowthSource, /portfolio-growth__asset-picker/, "Portfolio growth investments must use one compact picker.");
assert.match(portfolioGrowthSource, /type="checkbox"/, "Portfolio growth picker must retain multi-selection.");
assert.match(portfolioGrowthSource, /useState<MarketRange>\("MAX"\)/, "Portfolio growth must open with the full recorded period.");
assert.doesNotMatch(portfolioGrowthSource, /<strong>\{asset\.symbol\}<\/strong>/, "Investment picker labels must not be bold.");
assert.match(portfolioGrowthSource, /onPointerMove/, "Portfolio growth must expose hover and pointer values.");
assert.match(portfolioGrowthSource, /preserveAspectRatio="none"/, "Portfolio growth must not letterbox chart coordinates at short browser heights.");
assert.match(portfolioGrowthSource, /findClosestMarketPointIndex/, "Portfolio hover must resolve the nearest rendered point.");
assert.match(marketHistoryRouteSource, /MAX:\s*\{\s*range:\s*"max",\s*interval:\s*"1d"\s*\}/, "MAX portfolio history must request daily prices.");
assert.match(portfolioGrowthSource, /className="portfolio-growth__canvas"/, "Portfolio hover markers must use an unstretched overlay canvas.");
assert.doesNotMatch(portfolioGrowthSource, /<circle className="portfolio-growth__hover-dot"/, "The hover marker must not be distorted by SVG scaling.");
assert.doesNotMatch(investmentsPageSource, /\["neutral", "Neutral"\]/, "Portfolio Outlook must not render a neutral column.");
assert.match(investmentsPageSource, /\/api\/market-news\?/, "Asset news must load inside Clover.");
assert.doesNotMatch(investmentsPageSource, /news\.google\.com/, "Asset news must not navigate users away from Clover.");
assert.match(investmentsStyles, /\.content--investments\s*\{[\s\S]*?height:\s*100dvh;/, "Investments must own a scrollable viewport.");
assert.match(investmentsStyles, /\.content--investments\s*>\s*\.topbar\s*\{[\s\S]*?position:\s*sticky;/, "The desktop Investments header must be sticky.");
assert.match(investmentsStyles, /\.investments-mobile-header\s*\{[\s\S]*?position:\s*sticky;/, "The mobile Investments header must be sticky.");
assert.match(investmentsPageSource, /canonicalizePdaxInvestmentHoldings/, "Portfolio rows must hide PDAX wallet balances and collapse XRP aliases.");
assert.match(institutionPageSource, /canonicalizePdaxInvestmentHoldings/, "Institution holdings must canonicalize PDAX rows across snapshots and accounts.");
assert.match(institutionPageSource, /routeInstitution\.toLowerCase\(\) !== "pdax"/, "PDAX Institution Details must compare live account values with immutable snapshot evidence.");
assert.match(investmentsPageSource, /!\/\\bpdax\\b\/i\.test\(account\.institution/, "The Investments portfolio must compare live PDAX account values with snapshots.");
assert.match(investmentsPageSource, /duplicatesSnapshotHolding && !\/\\bpdax\\b\/i\.test/, "A live PDAX account row must be allowed to supersede its older snapshot row.");
assert.match(investmentsPageSource, /isInvestmentActivityOnlyLabel/, "Dividend activity must not render as a portfolio holding.");
assert.match(investmentsPageSource, /parseNullableAmount\(holding\.currentValue \?\? holding\.marketValue\) !== null/, "Incomplete imported holdings must stay out of the Portfolio table.");
assert.match(investmentsStyles, /\.content--investments \.investments-portfolio-table__row--head\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?background:\s*#fff;/, "Desktop Portfolio headers must remain sticky and opaque.");
assert.match(investmentsPageSource, /endAngle - startAngle >= Math\.PI \* 2/, "A single 100% portfolio allocation must render as a full pie.");
assert.match(investmentsPageSource, /investments-portfolio-outlook__unrated/, "Holdings without purchase values must remain visible without restoring a Neutral outlook column.");
assert.match(investmentsStyles, /\.investments-portfolio-outlook__unrated\s*\{/, "Unrated portfolio holdings must have a compact visible treatment.");
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
assert.equal(activityBoundGrowthSeries[0]?.date, "2026-02-10");
assert.equal(activityBoundGrowthSeries[0]?.value, 11);
assert.equal(activityBoundGrowthSeries[1]?.date, "2026-02-11", "MAX growth must expose each calendar day.");
assert.equal(activityBoundGrowthSeries.at(-1)?.date, "2026-03-01");
assert.equal(activityBoundGrowthSeries.at(-1)?.value, 34);

const datedPositionGrowthSeries = buildPortfolioGrowthSeries({
  assets: [
    {
      id: "traded",
      name: "Traded asset",
      symbol: "TRADE",
      market: "us",
      units: 1,
      currency: "USD",
      unitActivities: [
        { date: "2026-01-02", unitsDelta: 2 },
        { date: "2026-01-04", unitsDelta: -1 },
      ],
    },
  ],
  histories: [
    {
      assetId: "traded",
      currency: "USD",
      points: [
        { date: "2026-01-01", value: 10 },
        { date: "2026-01-02", value: 11 },
        { date: "2026-01-03", value: 12 },
        { date: "2026-01-04", value: 13 },
      ],
    },
  ],
  exchangeRates: { USD: 1 },
});
assert.deepEqual(datedPositionGrowthSeries, [
  { date: "2026-01-02", value: 22 },
  { date: "2026-01-03", value: 24 },
  { date: "2026-01-04", value: 13 },
]);

const fullySoldGrowthSeries = buildPortfolioGrowthSeries({
  assets: [{
    id: "sold",
    name: "Sold asset",
    symbol: "SOLD",
    market: "us",
    units: 0,
    currency: "USD",
    unitActivities: [
      { date: "2026-01-01", unitsDelta: 1 },
      { date: "2026-01-02", unitsDelta: -1 },
    ],
  }],
  histories: [{
    assetId: "sold",
    currency: "USD",
    points: [{ date: "2026-01-01", value: 10 }, { date: "2026-01-02", value: 12 }],
  }],
  exchangeRates: { USD: 1 },
});
assert.deepEqual(fullySoldGrowthSeries, [
  { date: "2026-01-01", value: 10 },
  { date: "2026-01-02", value: 0 },
]);

const manualPositionActivities = getManualInvestmentPositionActivities([
  {
    id: "buy",
    accountId: "gstocks",
    date: "2026-02-10",
    createdAt: "2026-08-06T01:00:00Z",
    type: "expense",
    merchantRaw: "Buy MER",
    rawPayload: { source: "manual", action: "Buy", assetName: "MER", quantity: "5" },
  },
  {
    id: "sell",
    accountId: "gstocks",
    date: "2026-04-10",
    createdAt: "2026-08-06T02:00:00Z",
    type: "income",
    merchantRaw: "Sell MER",
    rawPayload: { source: "manual", action: "Sell", assetName: "MER", quantity: "2" },
  },
]);
assert.equal(sumManualInvestmentUnits(manualPositionActivities, { accountId: "gstocks", assetName: "MER" }), 3);
assert.equal(getFirstManualInvestmentDate(manualPositionActivities, { accountId: "gstocks", assetName: "MER" }), "2026-02-10");
assert.equal(
  findClosestMarketPointIndex([{ x: 30 }, { x: 245 }, { x: 460 }], 238),
  1,
  "Hover coordinates must resolve to the visually nearest chart date."
);

console.log(`Investment regression passed: ${classificationCases.length + 60} checks.`);
