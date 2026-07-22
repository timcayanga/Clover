import assert from "node:assert/strict";
import { detectStatementMetadata, parseImportText } from "@/lib/import-parser";
import {
  resolveMobileWalletIdentityFromParsedRows,
  resolveStatementIdentityFromParsedRows,
} from "@/lib/import-statement-identity";

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
assert.ok(rows.every((row) => row.institution === "PDAX" && row.accountName === "PDAX Portfolio"));
assert.ok(rows.every((row) => row.rawPayload?.kind === "account_snapshot_marker"));
assert.equal(rows[0]?.amount, "0.45");
assert.equal((rows[0]?.rawPayload as Record<string, unknown>)?.portfolioBucket, "php");
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
  accountName: "PDAX Portfolio",
  institution: "PDAX",
  accountType: "investment",
  accountNumber: null,
});

const pdaxHoldingText = `
PDAX
Portfolio
Balances
My assets
BTC 120.00
Bitcoin 0.002
`.trim();
const holdingRows = parseImportText(pdaxHoldingText, "untrained-pdax-holding.png", "image/png");
assert.equal(holdingRows.length, 1, "A complete visible PDAX holding should be retained.");
assert.equal(holdingRows[0]?.accountName, "PDAX Portfolio");
assert.equal(holdingRows[0]?.institution, "PDAX");
assert.equal((holdingRows[0]?.rawPayload as Record<string, unknown>)?.investmentSymbol, "BTC");
assert.equal((holdingRows[0]?.rawPayload as Record<string, unknown>)?.statementEndingBalance, 120);

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
assert.equal(logoOmittedRows[0]?.accountName, "PDAX Portfolio");
assert.equal(logoOmittedRows[0]?.amount, "0.45");
assert.doesNotMatch(
  `${logoOmittedRows[0]?.accountName} ${logoOmittedRows[0]?.description}`,
  /crypto bonds gold.*hide zero balance/i,
  "Portfolio UI labels must not become an account or asset name when the logo is omitted."
);

console.log("[PASS] PDAX portfolio screenshots retain canonical identity and safe snapshot holdings.");
