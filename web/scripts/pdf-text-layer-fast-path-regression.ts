import assert from "node:assert/strict";
import {
  buildPdfJsStandardFontDataUrl,
  getPdfJsStandardFontDataUrl,
  pdfTextLayerLooksSufficientForParsing,
} from "@/lib/import-file-text.server";

const healthyStatementText = [
  "RCBC VISA PLATINUM STATEMENT OF ACCOUNT",
  "Statement Date Mar 22, 2026",
  "Previous Balance 12,345.67",
  "Mar 02 DQ DAIRY QUEEN MAKATI 245.00",
  "Mar 04 ROBINSONS EASYMART 1,420.35",
  "Mar 08 PETRON SERVICE STATION 2,100.00",
  "Mar 11 JOLLIBEE BGC 385.50",
  "Mar 14 LINKEDIN SINGAPORE 1,250.00",
  "Mar 18 PAYMENT THANK YOU 5,000.00",
  "Total Amount Due 12,746.52",
  "Minimum Amount Due 850.00",
  "Please review your transactions and report any discrepancy promptly.",
].join("\n");

assert.equal(
  pdfTextLayerLooksSufficientForParsing(healthyStatementText),
  true,
  "A transaction-rich PDF text layer should bypass redundant server OCR."
);

assert.equal(
  pdfTextLayerLooksSufficientForParsing("RCBC VISA PLATINUM\nStatement Date Mar 22, 2026\nTotal Amount Due 12,746.52"),
  false,
  "Sparse summary text must still receive the OCR fallback."
);

assert.match(
  getPdfJsStandardFontDataUrl("https://staging.clover.ph") ?? "",
  /^file:.*\/pdfjs-dist\/standard_fonts\/$/,
  "Server PDF extraction must use bundled fonts instead of a deployment self-fetch."
);

assert.equal(
  buildPdfJsStandardFontDataUrl(70270),
  null,
  "A webpack module id must disable the optional font path instead of crashing PDF extraction."
);

console.log("PDF text-layer fast-path regression passed.");
