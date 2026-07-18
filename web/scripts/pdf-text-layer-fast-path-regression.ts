import assert from "node:assert/strict";
import {
  ensurePdfJsTextPolyfills,
  pdfTextLayerLooksSufficientForParsing,
} from "@/lib/import-file-text.server";
import { pdfjs } from "@/lib/pdfjs.server";

ensurePdfJsTextPolyfills();
assert.equal(typeof globalThis.DOMMatrix, "function", "Text extraction should install its lightweight DOMMatrix fallback.");
assert.equal(typeof pdfjs.getDocument, "function", "The server PDF.js module should load without resolving a filesystem worker path.");

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

const wiseStatementText = [
  "Wise Pilipinas Inc.",
  "GBP statement",
  "1 January 2026 [GMT+08:00] - 30 June 2026 [GMT+08:00]",
  "GBP on 30 June 2026 [GMT+08:00] 30.96 GBP",
  "Description Incoming Outgoing Amount",
  "Card transaction of 1,032.58 BWP issued by Maun Airport -55.36 30.96",
  "10 June 2026 Card ending in 6453 Transaction: CARD-3904653901",
  "Card transaction of -43.54 GBP issued by Trainpal London 43.54 103.54",
  "13 April 2026 Card ending in 6453 Transaction: CARD-3666012761",
  "Sent money to EMMANUEL COLLEGE -111.50 540.63",
  "28 February 2026 Transaction: TRANSFER-1995929409 Reference: HT Cayanga",
  "Received money from EMMANUEL PAYMENTS with reference noref 548.00 652.13",
].join("\n");

assert.equal(
  pdfTextLayerLooksSufficientForParsing(wiseStatementText),
  true,
  "Day-first Wise transaction dates should keep a healthy PDF text layer on the deterministic fast path."
);

const emptyWiseStatementText = [
  "Wise Pilipinas Inc.",
  "WeWork 30th Floor Yuchengco Tower, RCBC Plaza, 6819 Ayala Ave., Makati City, Philippines",
  "EUR statement",
  "1 January 2026 [GMT+08:00] - 30 June 2026 [GMT+08:00]",
  "Account Holder IBAN Swift/BIC",
  "Timothy Cayanga BE11 9050 2880 3448 TRWIBEB1XXX",
  "EUR on 30 June 2026 [GMT+08:00] 0.00 EUR",
  "Description Incoming Outgoing Amount",
  "Wise Pilipinas Inc. is licensed by the Bangko Sentral ng Pilipinas.",
].join("\n");

assert.equal(
  pdfTextLayerLooksSufficientForParsing(emptyWiseStatementText),
  true,
  "A structurally complete zero-activity Wise statement should not spend time on OCR."
);

assert.equal(
  pdfTextLayerLooksSufficientForParsing("RCBC VISA PLATINUM\nStatement Date Mar 22, 2026\nTotal Amount Due 12,746.52"),
  false,
  "Sparse summary text must still receive the OCR fallback."
);

console.log("PDF text-layer fast-path regression passed.");
