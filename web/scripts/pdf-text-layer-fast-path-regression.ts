import assert from "node:assert/strict";
import {
  buildLayoutAwarePdfTextFromContentItems,
  ensurePdfJsTextPolyfills,
  pdfTextLayerLooksSufficientForParsing,
  shouldRunSecondaryPdfOcrPass,
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

assert.equal(
  shouldRunSecondaryPdfOcrPass({
    primaryOcrText: healthyStatementText,
    renderedPages: [{ page: 1, totalPages: 1 }],
    fileName: "unfamiliar-bank-statement.pdf",
  }),
  false,
  "A complete, parseable primary OCR result should not trigger a redundant second OCR pass."
);

assert.equal(
  shouldRunSecondaryPdfOcrPass({
    primaryOcrText: healthyStatementText,
    renderedPages: [
      { page: 1, totalPages: 8 },
      { page: 2, totalPages: 8 },
      { page: 3, totalPages: 8 },
      { page: 4, totalPages: 8 },
    ],
    fileName: "unfamiliar-bank-statement.pdf",
  }),
  true,
  "A parseable prefix must not suppress OCR for the unrendered remainder of a statement."
);

assert.equal(
  shouldRunSecondaryPdfOcrPass({
    primaryOcrText: "Statement Date Mar 22, 2026\nTotal Amount Due 12,746.52",
    renderedPages: [{ page: 1, totalPages: 1 }],
    fileName: "unfamiliar-bank-statement.pdf",
  }),
  true,
  "A complete render with insufficient transaction evidence must retain the secondary OCR pass."
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

const mayaSavingsSplitColumnText = [
  "Maya Savings",
  "Statement of Account",
  "Account holder Sample User",
  "Period covered August 1, 2026 to August 31, 2026",
  "Date & Time",
  "Transaction Type & Details",
  "Transaction No.",
  "Amount (PHP)",
  "Running Balance",
  "08/01/2026 09:14 AM",
  "Payroll disbursement from employer",
  "123456789001",
  "25,000.00",
  "31,450.00",
  "08/07/2026 02:31 PM",
  "Interest earned",
  "123456789002",
  "18.42",
  "31,468.42",
  "08/15/2026 08:02 AM",
  "Withholding tax",
  "123456789003",
  "3.68",
  "31,464.74",
  "08/26/2026 07:48 PM",
  "Online banking activity",
  "123456789004",
  "1,250.00",
  "30,214.74",
].join("\n");

assert.equal(
  pdfTextLayerLooksSufficientForParsing(mayaSavingsSplitColumnText),
  true,
  "A structured split-column Maya Savings statement should bypass redundant rendered OCR."
);

assert.equal(
  pdfTextLayerLooksSufficientForParsing(
    [
      "Maya Savings",
      "Statement of Account",
      "Date & Time",
      "Transaction Type & Details",
      "Transaction No.",
      "Amount (PHP)",
      "Running Balance",
      "Statement Date 08/31/2026",
      "Closing Balance 30,214.74",
      "This summary does not contain enough transaction rows to parse safely.",
    ].join("\n")
  ),
  false,
  "A sparse Maya statement shell must still receive OCR instead of being mistaken for transaction data."
);

const mayaSavingsHeaderlessText = [
  "Account activity export",
  "08/01/2026 09:14 AM",
  "08/03/2026 11:20 AM",
  "08/07/2026 02:31 PM",
  "08/11/2026 04:05 PM",
  "08/15/2026 08:02 AM",
  "08/19/2026 12:46 PM",
  "08/24/2026 03:17 PM",
  "08/26/2026 07:48 PM",
  "Payroll disbursement from employer",
  "Interest earned",
  "Withholding tax",
  "Online banking activity",
  "Groceries",
  "Utility bill",
  "Restaurant",
  "ATM activity",
  "25,000.00",
  "31,450.00",
  "250.00",
  "31,200.00",
  "18.42",
  "31,218.42",
  "3.68",
  "31,214.74",
  "1,250.00",
  "29,964.74",
  "950.00",
  "29,014.74",
  "340.00",
  "28,674.74",
  "2,000.00",
  "26,674.74",
].join("\n");

assert.equal(
  pdfTextLayerLooksSufficientForParsing(
    mayaSavingsHeaderlessText,
    "MayaSavings_SoA_example_2026AUG.pdf"
  ),
  true,
  "A dense Maya Savings text layer identified by its source filename should bypass OCR even when PDF headers are omitted."
);

assert.equal(
  pdfTextLayerLooksSufficientForParsing(mayaSavingsHeaderlessText, "unknown-statement.pdf"),
  false,
  "The filename-assisted dense-column exception must remain scoped to Maya Savings exports."
);

const pnbProjectReportText = [
  "STATEMENT OF ACCOUNT REPORT",
  "Account Number 001234567890",
  "NEGOTIATING TRANSACTION REPORT",
  "01/12/2021 DEPOSIT CLIENT PAYMENT CREDIT 25,000.00 BALANCE 125,000.00",
  "01/14/2021 DM_INTRA_XFR ORTIGAS FUNDS DEBIT 12,500.00 BALANCE 112,500.00",
  "01/25/2021 DEPOSIT SETTLEMENT CREDIT 7,250.00 BALANCE 119,750.00",
  "01/28/2021 DM_INTRA_XFR OPERATING ACCOUNT DEBIT 4,400.00 BALANCE 115,350.00",
  "This report is generated by Philippine National Bank for account reconciliation.",
].join(" ");

assert.equal(
  pdfTextLayerLooksSufficientForParsing(pnbProjectReportText),
  true,
  "A compact PNB Project report should go directly to its deterministic parser instead of incurring rendered OCR."
);

assert.equal(
  pdfTextLayerLooksSufficientForParsing("RCBC VISA PLATINUM\nStatement Date Mar 22, 2026\nTotal Amount Due 12,746.52"),
  false,
  "Sparse summary text must still receive the OCR fallback."
);

const characterSpacedBpiText = buildLayoutAwarePdfTextFromContentItems([
  { str: "B A N K", transform: [0, 0, 0, 0, 10, 700], width: 30 },
  { str: "O F", transform: [0, 0, 0, 0, 45, 700], width: 15 },
  { str: "T H E", transform: [0, 0, 0, 0, 65, 700], width: 22 },
  { str: "P H I L I P P I N E", transform: [0, 0, 0, 0, 92, 700], width: 65 },
  { str: "I S L A N D S", transform: [0, 0, 0, 0, 162, 700], width: 45 },
  { str: "O c t", transform: [0, 0, 0, 0, 10, 680], width: 14 },
  { str: "0 8", transform: [0, 0, 0, 0, 28, 680], width: 10 },
  { str: "I n s t a P a y", transform: [0, 0, 0, 0, 45, 680], width: 48 },
  { str: "T r a n s f e r", transform: [0, 0, 0, 0, 98, 680], width: 48 },
  { str: "1 0 . 0 0", transform: [0, 0, 0, 0, 180, 680], width: 30 },
  { str: "1 0 0 . 0 0", transform: [0, 0, 0, 0, 220, 680], width: 35 },
  { str: "O c t", transform: [0, 0, 0, 0, 10, 660], width: 14 },
  { str: "0 9", transform: [0, 0, 0, 0, 28, 660], width: 10 },
  { str: "B i l l s", transform: [0, 0, 0, 0, 45, 660], width: 24 },
  { str: "P a y m e n t", transform: [0, 0, 0, 0, 74, 660], width: 42 },
  { str: "2 0 . 0 0", transform: [0, 0, 0, 0, 180, 660], width: 30 },
  { str: "8 0 . 0 0", transform: [0, 0, 0, 0, 220, 660], width: 30 },
]);

assert.match(characterSpacedBpiText, /Oct 08 InstaPay Transfer 10\.00 100\.00/);

console.log("PDF text-layer fast-path regression passed.");
