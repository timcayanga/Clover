import assert from "node:assert/strict";
import { detectStatementMetadata, parseImportText } from "@/lib/import-parser";
import {
  resolveMobileWalletIdentityFromParsedRows,
  resolveStatementIdentityFromParsedRows,
} from "@/lib/import-statement-identity";
import { canonicalizePdaxInvestmentHoldings } from "@/lib/pdax-portfolio-accounts";

const pdaxPortfolioText = `
PDAX
Portfolio
Balances
My assets
PHP
0.45
Crypto
0.00
Bonds
0.00
Gold
0.00
Hide zero balance
`.trim();

const metadata = detectStatementMetadata(pdaxPortfolioText, "untrained-pdax.png");
assert.equal(metadata?.institution, "PDAX", "Visible PDAX evidence must never resolve as GCrypto.");
assert.equal(metadata?.accountName, "PDAX Portfolio");
assert.equal(metadata?.accountType, "investment");

const rows = parseImportText(pdaxPortfolioText, "untrained-pdax.png", "image/png");
assert.equal(rows.length, 1, "Only the visible non-zero PDAX bucket should become a snapshot marker.");
assert.ok(rows.every((row) => row.institution === "PDAX" && row.accountName === "Wallet"));
assert.ok(rows.every((row) => row.rawPayload?.kind === "account_snapshot_marker"));
assert.equal(rows[0]?.amount, "0.45");
assert.equal((rows[0]?.rawPayload as Record<string, unknown>)?.portfolioBucket, "php");
assert.equal((rows[0]?.rawPayload as Record<string, unknown>)?.accountType, "wallet");
assert.equal((rows[0]?.rawPayload as Record<string, unknown>)?.statementEndingBalance, 0.45);
assert.doesNotMatch(
  String(rows[0]?.description ?? ""),
  /crypto bonds gold hide zero balance/i,
  "PDAX UI labels must never become an asset name."
);

assert.deepEqual(resolveMobileWalletIdentityFromParsedRows(rows), {
  accountName: "PDAX Portfolio",
  institution: "PDAX",
  accountType: "investment",
  accountNumber: null,
});
assert.deepEqual(resolveStatementIdentityFromParsedRows(rows), {
  accountName: "Wallet",
  institution: "PDAX",
  accountType: "wallet",
  accountNumber: null,
});

const pdaxHoldingText = `
PDAX
Portfolio
Balances
My assets
(53) BTC 120.00 (+0.11%)
Bitcoin 0.002
`.trim();
const holdingRows = parseImportText(pdaxHoldingText, "untrained-pdax-holding.png", "image/png");
assert.equal(holdingRows.length, 1, "A complete visible PDAX holding should be retained.");
assert.equal(holdingRows[0]?.accountName, "BTC");
assert.equal(holdingRows[0]?.institution, "PDAX");
assert.equal((holdingRows[0]?.rawPayload as Record<string, unknown>)?.investmentSymbol, "BTC");
assert.equal((holdingRows[0]?.rawPayload as Record<string, unknown>)?.statementEndingBalance, 120);

const pdaxPortfolioWithAssetsText = `
PDAX
Portfolio
Balances
PHP 7,969.73
Crypto 97,155.46
Bonds 0.00
Gold 22,542.46
My assets
Crypto Bonds Gold Hide zero balance
(53) BTC 86,511.42 (+0.11%)
Bitcoin SegWit 0.018005
[x] XRP 10,644.04 (-0.45%)
Ripple 125.492000
`.trim();
const portfolioAssetRows = parseImportText(pdaxPortfolioWithAssetsText, "IMG_1377.PNG", "image/png");
assert.deepEqual(
  portfolioAssetRows.map((row) => [row.accountName, row.amount]),
  [
    ["BTC", "86511.42"],
    ["XRP", "10644.04"],
    ["Wallet", "7969.73"],
    ["Gold", "22542.46"],
  ],
  "PDAX must split its PHP wallet, reconciled crypto holdings, and Gold RWA position into their actual accounts."
);
assert.equal(
  portfolioAssetRows.some((row) => row.accountName === "Crypto balance"),
  false,
  "A Crypto bucket that reconciles to BTC and XRP must not create a duplicate aggregate account."
);
const goldRow = portfolioAssetRows.find((row) => row.accountName === "Gold");
assert.equal(
  (goldRow?.rawPayload as Record<string, unknown>)?.investmentSubtype,
  "real_world_asset",
  "The PDAX Gold balance must retain the dedicated Real-world asset subtype."
);

const pdaxLogoOmittedOcrText = `
Portfolio
PHP
0.45
Crypto Bonds Gold O Hide zero balance
`.trim();
const logoOmittedMetadata = detectStatementMetadata(pdaxLogoOmittedOcrText, "untrained-portfolio.png");
assert.equal(logoOmittedMetadata?.institution, "PDAX", "The PDAX portfolio layout must survive a missed logo OCR read.");
assert.equal(logoOmittedMetadata?.accountName, "PDAX Portfolio");
const logoOmittedRows = parseImportText(pdaxLogoOmittedOcrText, "untrained-portfolio.png", "image/png");
assert.equal(logoOmittedRows.length, 1, "Only the visible PHP bucket should be imported.");
assert.equal(logoOmittedRows[0]?.institution, "PDAX");
assert.equal(logoOmittedRows[0]?.accountName, "Wallet");
assert.equal(logoOmittedRows[0]?.amount, "0.45");
assert.doesNotMatch(
  `${logoOmittedRows[0]?.accountName} ${logoOmittedRows[0]?.description}`,
  /crypto bonds gold.*hide zero balance/i,
  "Portfolio UI labels must not become an account or asset name when the logo is omitted."
);

const pdaxActionControlsOcrText = `
Portfolio
Cash in Cash out Deposit Send
PHP
0.45
`.trim();
const actionControlsMetadata = detectStatementMetadata(pdaxActionControlsOcrText, "low-quality-pdax.png");
assert.equal(
  actionControlsMetadata?.institution,
  "PDAX",
  "PDAX's distinctive portfolio controls must route a cropped portfolio screenshot away from the generic parser."
);
const actionControlsRows = parseImportText(pdaxActionControlsOcrText, "low-quality-pdax.png", "image/png");
assert.equal(actionControlsRows.length, 1, "The visible PHP balance should still be retained as one safe snapshot.");
assert.equal(actionControlsRows[0]?.accountName, "Wallet");
assert.equal(actionControlsRows[0]?.institution, "PDAX");
assert.equal((actionControlsRows[0]?.rawPayload as Record<string, unknown>)?.accountType, "wallet");
assert.doesNotMatch(
  `${actionControlsRows[0]?.accountName} ${actionControlsRows[0]?.description}`,
  /cash in|cash out|deposit send/i,
  "PDAX action controls must never become an account or asset name."
);

const canonicalHoldings = canonicalizePdaxInvestmentHoldings([
  { assetName: "PDAX Wallet", assetSymbol: null, marketValue: 7969.73 },
  { assetName: "Ripple", assetSymbol: null, quantity: 125.492, currentValue: 10644.04 },
  { assetName: "XRP", assetSymbol: "XRP", quantity: 125.492, currentValue: 10644.04 },
  { assetName: "Bitcoin SegWit", assetSymbol: "BTC", quantity: 0.018005, currentValue: 86511.42 },
  { assetName: "PDAX Gold RWA", assetSymbol: null, assetType: "other", currentValue: 22542.46 },
]);
assert.deepEqual(
  canonicalHoldings.map((holding) => [holding.assetName, holding.assetSymbol, holding.currentValue]),
  [
    ["XRP", "XRP", 10644.04],
    ["BTC", "BTC", 86511.42],
    ["Gold", null, 22542.46],
  ],
  "PDAX wallet evidence must stay out of holdings, Ripple/XRP must collapse, and visible Gold must remain an asset."
);

console.log("[PASS] PDAX portfolio screenshots retain canonical identity and safe snapshot holdings.");
