import assert from "node:assert/strict";
import { detectStatementMetadata, parseGfundsPortfolioSnapshotText } from "@/lib/import-parser";
import { parseImportTextWithOpenAIFallback } from "@/lib/openai-import-parser";

const main = async () => {
  const portfolioText = `GFunds Portfolio
ATRAM
Portfolio Value PHP 81,250.00
As of April 24, 2025

ATRAM Philippine Equity Smart Index Fund
Current Value PHP 28,414.89
Subscribed Amount PHP 15,000.00
Gain/Loss PHP 13,414.89
Units 12,345.67
NAVPU PHP 2.3014

ATRAM Global Consumer Trends Feeder Fund
Market Value PHP 16,559.45
Invested Amount PHP 12,500.00
Gain/Loss PHP 4,059.45
Units 321.45
NAVPU PHP 51.5150

ATRAM Peso Money Market Fund
Current Value PHP 26,804.31
Subscribed Amount PHP 25,000.00
Gain/Loss PHP 1,804.31`;

  const deterministic = parseGfundsPortfolioSnapshotText(portfolioText, "IMG_1419.PNG");
  assert.ok(deterministic, "Portfolio OCR should trigger deterministic GFunds holdings parsing.");
  assert.equal(deterministic?.documentType, "portfolio");
  assert.equal(deterministic?.metadata.institution, "ATRAM");
  assert.equal(deterministic?.metadata.accountType, "investment");
  assert.equal(deterministic?.metadata.accountName, "GFunds Investments");
  assert.equal(deterministic?.metadata.endingBalance, 81250);
  assert.equal(deterministic?.holdings.length, 3);
  assert.deepEqual(
    deterministic?.holdings.map((holding) => holding.asset_name),
    [
      "ATRAM Philippine Equity Smart Index Fund",
      "ATRAM Global Consumer Trends Feeder Fund",
      "ATRAM Peso Money Market Fund",
    ],
  );
  assert.ok(
    deterministic?.holdings.every((holding) => holding.asset_type === "mutual_fund" && holding.currency === "PHP"),
    "Each holding should be persisted as a PHP mutual fund."
  );

  const metadata = detectStatementMetadata(portfolioText, "IMG_1419.PNG");
  assert.equal(metadata?.institution, "ATRAM");
  assert.equal(metadata?.accountType, "investment");
  assert.equal(metadata?.accountName, "GFunds Investments");
  assert.equal(metadata?.endingBalance, 81250);

  const openAiFallbackResult = await parseImportTextWithOpenAIFallback({
    text: portfolioText,
    fileName: "IMG_1419.PNG",
    fileType: "image/png",
    detectedMetadata: metadata,
    parsedRows: [],
    importMode: "statement",
  });

  assert.ok(openAiFallbackResult, "Deterministic GFunds portfolio parser should return an OpenAI-compatible fallback result.");
  assert.equal(openAiFallbackResult?.documentType, "portfolio");
  assert.equal(openAiFallbackResult?.model, "deterministic_gfunds_portfolio");
  assert.equal(openAiFallbackResult?.holdings.length, 3);
  assert.equal(openAiFallbackResult?.rows.length, 0);
  assert.equal(openAiFallbackResult?.metadata.accountName, "GFunds Investments");
  assert.equal(openAiFallbackResult?.audit.schemaValidationResult, "deterministic_gfunds_portfolio");

  console.log("[PASS] GFunds portfolio screenshots promote to portfolio imports with deterministic holdings.");
};

void main();
