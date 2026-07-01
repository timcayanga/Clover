import assert from "node:assert/strict";
import { detectStatementMetadata, parseGfundsAccountDetailSnapshotText } from "@/lib/import-parser";
import { parseImportTextWithOpenAIFallback } from "@/lib/openai-import-parser";

const main = async () => {
  const accountDetailText = `GFunds
ATRAM Global Technology Feeder Fund
Current Value PHP 2,854.14
Subscribed Amount PHP 2,000.00
Gain/Loss PHP 854.14
Units 120.5500
NAVPU PHP 23.6765
As of April 24, 2025
Invest through Ryse`;

  const deterministic = parseGfundsAccountDetailSnapshotText(accountDetailText, "IMG_1420.PNG");
  assert.ok(deterministic, "Single-fund GFunds detail OCR should trigger deterministic account-detail parsing.");
  assert.equal(deterministic?.documentType, "account_detail");
  assert.equal(deterministic?.metadata.institution, "ATRAM");
  assert.equal(deterministic?.metadata.accountType, "investment");
  assert.equal(deterministic?.metadata.accountName, "ATRAM Global Technology Feeder Fund");
  assert.equal(deterministic?.metadata.endingBalance, 2854.14);
  assert.equal(deterministic?.metadata.openingBalance, 2000);
  assert.equal(deterministic?.holdings.length, 1);
  assert.equal(deterministic?.holdings[0]?.asset_name, "ATRAM Global Technology Feeder Fund");
  assert.equal(deterministic?.holdings[0]?.current_value, 2854.14);
  assert.equal(deterministic?.holdings[0]?.cost_basis, 2000);
  assert.equal(deterministic?.holdings[0]?.gain_loss_value, 854.14);
  assert.equal(deterministic?.holdings[0]?.quantity, 120.55);
  assert.equal(deterministic?.holdings[0]?.unit_price, 23.6765);

  const metadata = detectStatementMetadata(accountDetailText, "IMG_1420.PNG");
  assert.equal(metadata?.institution, "ATRAM");
  assert.equal(metadata?.accountType, "investment");
  assert.equal(metadata?.accountName, "ATRAM Global Technology Feeder Fund");
  assert.equal(metadata?.endingBalance, 2854.14);

  const fallbackResult = await parseImportTextWithOpenAIFallback({
    text: accountDetailText,
    fileName: "IMG_1420.PNG",
    fileType: "image/png",
    detectedMetadata: metadata,
    parsedRows: [],
    importMode: "statement",
  });

  assert.ok(fallbackResult, "Single-fund GFunds detail OCR should return an OpenAI-compatible deterministic fallback.");
  assert.equal(fallbackResult?.documentType, "account_detail");
  assert.equal(fallbackResult?.model, "deterministic_gfunds_account_detail");
  assert.equal(fallbackResult?.holdings.length, 1);
  assert.equal(fallbackResult?.rows.length, 0);
  assert.equal(fallbackResult?.metadata.accountName, "ATRAM Global Technology Feeder Fund");
  assert.equal(fallbackResult?.audit.schemaValidationResult, "deterministic_gfunds_account_detail");

  console.log("[PASS] GFunds account-detail screenshots promote to deterministic investment account-detail imports.");
};

void main();
