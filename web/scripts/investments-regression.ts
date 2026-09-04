import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getInvestmentAssetBrand, getInvestmentAssetLogoCandidates } from "@/lib/investment-assets";
import { getGotradeSecurityName, resolveGotradeSecuritySymbol } from "@/lib/gotrade-securities";
import {
  canTrackInvestmentDividends,
  canTrackInvestmentPurchaseHistory,
  canTrackInvestmentUnits,
  convertInvestmentRowsForPortfolioMix,
  inferInvestmentClassification,
  isActivityOnlyGcryptoAccount,
} from "@/lib/investments";
import { isAllCurrencySelection } from "@/lib/currencies";
import {
  getInvestmentActivityAmountTone,
  getInvestmentActivityAssetName,
  getInvestmentActivityNote,
  getInvestmentActivityType,
  getInvestmentActivityUnits,
} from "@/lib/investment-activity";
import { buildPortfolioGrowthSeries, buildRecordedValueHistory, getPortfolioGrowthMarket } from "@/lib/investment-portfolio-growth";
import { canonicalizePdaxInvestmentHoldings } from "@/lib/pdax-portfolio-accounts";
import { filterMarketHistoryByRange, findClosestMarketPointIndex } from "@/lib/market-data";
import { parseStockAnalysisSeries } from "@/lib/stockanalysis-market-history";
import {
  getFirstManualInvestmentDate,
  getManualInvestmentPositionActivities,
  sumManualInvestmentUnits,
} from "@/lib/manual-investment-positions";

const investmentHoldingRouteSource = readFileSync(
  resolve(process.cwd(), "app/api/investment-holdings/[holdingId]/route.ts"),
  "utf8"
);
const adviserHeaderLinkSource = readFileSync(
  resolve(process.cwd(), "components/adviser-header-link.tsx"),
  "utf8",
);
const marketChartSource = readFileSync(
  resolve(process.cwd(), "components/investment-market-chart.tsx"),
  "utf8",
);
const globalStyles = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
const accountDetailSource = readFileSync(
  resolve(process.cwd(), "app/accounts/[accountId]/page.tsx"),
  "utf8",
);
const accountsRouteSource = readFileSync(resolve(process.cwd(), "app/api/accounts/route.ts"), "utf8");

const currentStockAnalysisShape = `symbol:"PSE-AREIT",data:[{c:36.65,h:37.05,l:36.6,o:37.05,t:"2026-08-28",v:405300,ch:-1.21},{a:37.1,c:37.1,h:37.5,l:36.85,o:37.45,t:"2026-08-27",v:1444100,ch:-.54}],created_at:"2025-03-07"`;
const parsedPhilippineHistory = parseStockAnalysisSeries(currentStockAnalysisShape, "AREIT", "1Y");
assert.ok(!("error" in parsedPhilippineHistory), "Current StockAnalysis history payloads must remain readable.");
if (!("error" in parsedPhilippineHistory)) {
  assert.equal(parsedPhilippineHistory.points.length, 2);
  assert.equal(parsedPhilippineHistory.latest.value, 36.65, "The current row can omit adjusted close and must fall back to close.");
  assert.equal(parsedPhilippineHistory.range, "1Y");
  assert.equal(filterMarketHistoryByRange(parsedPhilippineHistory.points, "1Y").length, 2);
}

assert.match(adviserHeaderLinkSource, /getNavigationIconSrc\("adviser"\)/);
assert.match(adviserHeaderLinkSource, /aria-label="Open Adviser"/);
assert.match(
  globalStyles,
  /\.content--investments \.adviser-header-link img \{\s*width: 48px;\s*height: 48px;/,
  "The desktop Investments Adviser icon must match the large account header action."
);
assert.match(
  globalStyles,
  /@media \(max-width: 1100px\)[\s\S]*?\.content--investments \.adviser-header-link img \{[\s\S]{0,180}width: 40px;/,
  "The mobile Investments Adviser icon must match the standard compact header action."
);
assert.match(
  marketChartSource,
  /MARKET_HISTORY_CLIENT_CACHE_TTL_MS/,
  "Investment range switches should reuse recent market responses.",
);
assert.doesNotMatch(
  marketChartSource,
  /setTimeout\(async \(\) =>/,
  "A confirmed ticker or range change should start loading immediately rather than waiting on a debounce.",
);
assert.match(
  accountDetailSource,
  /className="accounts-detail__history-form"/,
  "Investment purchase and dividend activity must use the shared responsive form layout.",
);
assert.doesNotMatch(accountDetailSource, /Record the date, units, and total purchase value\./);
assert.doesNotMatch(accountDetailSource, /No purchases logged yet\./);
assert.doesNotMatch(accountDetailSource, /No dividends logged yet\./);
assert.doesNotMatch(accountDetailSource, /<span>Reinvested<\/span>/);
assert.match(accountDetailSource, /Reinvested the dividend back to this asset/);
assert.match(
  accountsRouteSource,
  /loadEarliestInvestmentPurchaseDatesForWorkspace/,
  "Investment overview accounts must inherit dates from saved purchase-history records.",
);
assert.match(
  accountsRouteSource,
  /effectiveInvestmentStartDate/,
  "The earliest saved purchase must reach Investment Growth without overwriting an earlier recorded start date.",
);
assert.match(
  globalStyles,
  /\.accounts-detail__history-form\s*\{[\s\S]{0,180}grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/,
  "Investment activity forms must use columns that are allowed to shrink inside their cards.",
);
assert.match(
  globalStyles,
  /\.accounts-detail__history-form label > :is\(input:not\(\[type="checkbox"\]\), select\)\s*\{[\s\S]{0,180}min-width:\s*0;[\s\S]{0,100}max-width:\s*100%;/,
  "Investment activity fields must remain contained within their grid columns.",
);
assert.match(
  globalStyles,
  /@media \(max-width: 560px\)\s*\{[\s\S]{0,180}\.accounts-detail__history-form\s*\{[\s\S]{0,100}grid-template-columns:\s*minmax\(0, 1fr\);/,
  "Investment activity forms must collapse to one column on narrow mobile screens.",
);

assert.match(investmentHoldingRouteSource, /export async function DELETE/, "Imported holdings need a delete endpoint.");
assert.match(
  investmentHoldingRouteSource,
  /prisma\.investmentHolding\.delete/,
  "Deleting an imported asset should remove only its normalized holding row."
);
assert.equal(canTrackInvestmentPurchaseHistory("real_world_asset"), true, "Real-world assets support purchase history.");
assert.equal(canTrackInvestmentUnits("real_world_asset"), true, "Real-world assets persist units.");
assert.equal(canTrackInvestmentDividends("crypto"), true, "Crypto assets can record distributions.");
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

assert.equal(isAllCurrencySelection("ALL"), true, "The all-currency sentinel must not be rendered as a real currency.");
assert.equal(isAllCurrencySelection("__all__"), true, "Legacy all-currency sentinels should remain recognized.");
assert.equal(isAllCurrencySelection("PHP"), false, "Real ISO currencies must remain selectable.");

const convertedPortfolioMixRows = convertInvestmentRowsForPortfolioMix(
  [
    { id: "php", currency: "PHP", balance: "100", investmentCostBasis: "80", investmentPrincipal: null },
    { id: "usd", currency: "USD", balance: "10", investmentCostBasis: null, investmentPrincipal: "8" },
  ],
  "PHP",
  { PHP: 1, USD: 55 }
);
assert.ok(convertedPortfolioMixRows, "Portfolio Mix should convert mixed-currency holdings when all FX rates are available.");
assert.equal(convertedPortfolioMixRows[0]?.balance, "100");
assert.equal(convertedPortfolioMixRows[1]?.balance, "550");
assert.equal(convertedPortfolioMixRows[1]?.investmentPrincipal, "440");
assert.equal(convertedPortfolioMixRows[1]?.currency, "PHP");
assert.equal(
  convertInvestmentRowsForPortfolioMix(
    [{ currency: "USD", balance: "10", investmentCostBasis: null, investmentPrincipal: null }],
    "PHP",
    { PHP: 1 }
  ),
  null,
  "Portfolio Mix must not combine currencies when an FX rate is missing."
);

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
const currencySelectorSource = readFileSync(resolve(process.cwd(), "components/currency-selector.tsx"), "utf8");
const portfolioGrowthSource = readFileSync(resolve(process.cwd(), "components/investment-portfolio-growth-chart.tsx"), "utf8");
const marketHistoryRouteSource = readFileSync(resolve(process.cwd(), "app/api/market-history/route.ts"), "utf8");

assert.match(
  investmentsPageSource,
  /actions=\{[\s\S]*?<AdviserHeaderLink \/>[\s\S]*?<CurrencySelector/,
  "Investments must expose Adviser in its page header",
);
assert.match(investmentsPageSource, /deleteSelectedInvestmentAsset/, "Asset details should expose the delete workflow.");
assert.match(investmentsPageSource, /"Delete asset"/, "Asset details should render a clear delete action.");
assert.match(
  investmentsPageSource,
  /selectedPortfolioRow\.source === "derived"/,
  "Activity-derived rows must not expose a misleading destructive action."
);
assert.match(investmentsPageSource, /includeAllOption\s+allLabel="All Currencies"/, "Investments must offer an all-currency view.");
assert.match(
  currencySelectorSource,
  /const isAllValue = includeAllOption && isAllCurrencySelection\(current\);[\s\S]{0,120}?isKnown \|\| !current \|\| isAllValue/,
  "The all-currency sentinel must not be duplicated as a catalog option."
);
assert.match(
  investmentsPageSource,
  /convertInvestmentRowsForPortfolioMix\([\s\S]{0,180}?defaultCurrencyCode[\s\S]{0,180}?portfolioExchangeRates\.rates/,
  "The all-currency Portfolio Mix must convert holdings into the user's default currency."
);
assert.doesNotMatch(
  investmentsPageSource,
  /Choose one currency to view Portfolio Mix/,
  "Portfolio Mix should no longer be disabled solely because holdings use multiple currencies."
);
assert.match(
  investmentsPageSource,
  /portfolioCurrencyFilter === "ALL"\s*\? visibleInvestmentAccounts/,
  "The all-currency view must include every visible investment account."
);
assert.match(
  investmentsPageSource,
  /portfolioCurrencyFilter !== "ALL" && formatCurrencyCode\(row\.currency\) !== portfolioCurrencyFilter/,
  "Portfolio rows and growth assets must bypass currency filtering in the all-currency view."
);
assert.match(
  investmentsPageSource,
  /portfolioCurrencyFilter === "ALL"[\s\S]{0,120}formatCurrencyCode\(defaultCurrency\)/,
  "The mixed-currency growth chart must convert values into the user's default currency."
);
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
assert.match(portfolioGrowthSource, /Input a purchase date for an asset to start tracking your investment growth\./, "Growth must explain the next action when no dated valuation is available.");
assert.match(portfolioGrowthSource, /Clover found your purchase history but still needs a usable value or ticker\./);
assert.match(portfolioGrowthSource, /add its current value or market ticker\./);
assert.match(portfolioGrowthSource, /assetsWithHistory/, "One unavailable investment must not blank the rest of the portfolio chart.");
assert.match(investmentsPageSource, /historyMode: isMarketPriced \? "market" : "recorded"/, "Growth must include recorded-value investments beyond exchange-traded assets.");
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
assert.match(
  marketChartSource,
  /portfolioAssetsForSelectedMarket = useMemo\([\s\S]{0,240}getMarketForInvestment\(account\) === selectedMarket/,
  "The market selector must scope Your Portfolio to holdings from that market."
);
assert.match(marketChartSource, /selectMarket\(nextMarket\)/, "Changing markets must immediately synchronize the selected portfolio asset.");
assert.match(marketChartSource, /preserveAspectRatio="none"/, "Every market chart must fill the available chart width.");
assert.doesNotMatch(marketChartSource, /<iframe/, "PH, US, and Crypto must use the same Clover chart canvas.");
assert.doesNotMatch(marketChartSource, /buildPhTradingViewUrl/, "PH charts must not branch into a separate embedded presentation.");
assert.match(investmentsStyles, /--market-chart-height:\s*clamp\(250px, 28vw, 320px\)/, "Market charts must share one responsive height.");
assert.match(marketHistoryRouteSource, /isShortPhilippineRange[\s\S]{0,220}fetchYahooHistory/, "Short PH ranges must prefer Clover's intraday data source.");
assert.match(marketHistoryRouteSource, /currency: market === "ph" \? \("PHP" as const\)/, "Yahoo PH history must retain PHP as its source currency.");

assert.equal(getPortfolioGrowthMarket("crypto", "PHP"), "crypto");
assert.equal(getPortfolioGrowthMarket("stock", "PHP"), "ph");
assert.equal(getPortfolioGrowthMarket("stock", "USD"), "us");
const recordedInvestmentHistory = buildRecordedValueHistory({
  id: "time-deposit",
  name: "Time deposit",
  symbol: "Time deposit",
  market: "ph",
  units: 1,
  currency: "PHP",
  historyMode: "recorded",
  currentValue: 105_000,
  purchaseValue: 100_000,
  startDate: "2026-01-15",
}, "MAX", new Date("2026-08-30T12:00:00Z"));
assert.deepEqual(recordedInvestmentHistory?.points, [
  { date: "2026-01-15", value: 100_000 },
  { date: "2026-08-30", value: 105_000 },
]);
assert.equal(
  buildRecordedValueHistory({
    id: "undated",
    name: "Undated asset",
    symbol: "Undated asset",
    market: "ph",
    units: 1,
    currency: "PHP",
    currentValue: 50_000,
  }, "MAX", new Date("2026-08-30T12:00:00Z")),
  null,
  "Undated recorded values must not invent a purchase date.",
);
const recordedStockFallback = buildRecordedValueHistory({
  id: "stock-fallback",
  name: "Recorded stock",
  symbol: "REC",
  market: "ph",
  units: 10,
  currency: "PHP",
  historyMode: "market",
  currentValue: 3_000,
  purchaseValue: 2_000,
  startDate: "2026-01-15",
}, "MAX", new Date("2026-08-30T12:00:00Z"));
assert.deepEqual(recordedStockFallback?.points, [
  { date: "2026-01-15", value: 200 },
  { date: "2026-08-30", value: 300 },
], "A market asset fallback must expose per-unit values to the portfolio series builder.");
const recordedInvestmentSeries = buildPortfolioGrowthSeries({
  assets: [{
    id: "time-deposit",
    name: "Time deposit",
    symbol: "Time deposit",
    market: "ph",
    units: 1,
    currency: "PHP",
    historyMode: "recorded",
    currentValue: 105_000,
    purchaseValue: 100_000,
    startDate: "2026-01-15",
  }],
  histories: recordedInvestmentHistory ? [recordedInvestmentHistory] : [],
  exchangeRates: { PHP: 1 },
});
assert.deepEqual(recordedInvestmentSeries[0], { date: "2026-01-15", value: 100_000 });
assert.deepEqual(
  recordedInvestmentSeries.at(-1),
  { date: "2026-08-30", value: 105_000 },
  "A dated non-market investment must produce a growth series from its saved values.",
);
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

const staggeredGrowthSeries = buildPortfolioGrowthSeries({
  assets: [
    { id: "early", name: "Early holding", symbol: "EARLY", market: "us", units: 1, currency: "USD", startDate: "2026-01-01" },
    { id: "later", name: "Later holding", symbol: "LATER", market: "us", units: 1, currency: "USD", startDate: "2026-03-01" },
  ],
  histories: [
    { assetId: "early", currency: "USD", points: [{ date: "2026-01-01", value: 10 }, { date: "2026-01-02", value: 12 }] },
    { assetId: "later", currency: "USD", points: [{ date: "2026-03-01", value: 20 }, { date: "2026-03-02", value: 22 }] },
  ],
  exchangeRates: { USD: 1 },
});
assert.deepEqual(staggeredGrowthSeries[0], { date: "2026-01-01", value: 10 });
assert.deepEqual(staggeredGrowthSeries.find((point) => point.date === "2026-03-01"), { date: "2026-03-01", value: 32 });
assert.deepEqual(
  staggeredGrowthSeries.at(-1),
  { date: "2026-03-02", value: 34 },
  "Selected assets with staggered price histories must combine instead of blanking the full chart.",
);

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

console.log(`Investment regression passed: ${classificationCases.length + 88} checks.`);
