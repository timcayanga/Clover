import assert from "node:assert/strict";
import {
  assessImageStatementParse,
  buildParserRoutingDecision,
  shouldPreferDirectImageStatementVisionPath,
  shouldAttemptGenericScreenshotTranscriptRepair,
} from "@/workers/import-processor";
import { inferOpenAIImportDifficulty, shouldPrioritizeStrongImageTranscriptModel } from "@/lib/openai-import-parser";

assert.equal(
  inferOpenAIImportDifficulty({
    fileName: "Screenshot 2026-07-22.png",
    fileType: "image/png",
    text: "",
    detectedMetadata: null,
    parsedRows: [],
    importMode: "statement",
    pageImagesCount: 1,
    documentFamily: "generic_document",
  }),
  "medium",
  "A new one-screen statement should try fast transcription before escalating."
);

assert.equal(
  shouldPrioritizeStrongImageTranscriptModel({
    inferredDifficulty: "medium",
    promptImportMode: "statement",
    pageImageCount: 1,
  }),
  false,
  "A regular one-screen statement should use the fast vision model before escalating."
);

assert.equal(
  shouldPrioritizeStrongImageTranscriptModel({
    inferredDifficulty: "hard",
    promptImportMode: "statement",
    pageImageCount: 1,
  }),
  true,
  "A hard screenshot should retain strong-model-first transcription."
);

assert.equal(
  shouldPrioritizeStrongImageTranscriptModel({
    inferredDifficulty: "medium",
    promptImportMode: "statement",
    pageImageCount: 2,
  }),
  true,
  "A multi-page statement should retain strong-model-first transcription."
);

const noisyGenericRows = [
  {
    merchantRaw: "10:05",
    description: "10:05",
    amount: "33",
    date: null,
    rawPayload: {
      sourceLine: "10:05",
      source: "generic_statement_ocr",
    },
  },
  {
    merchantRaw: "Transaction History",
    description: "Transaction History",
    amount: "24072",
    date: null,
    rawPayload: {
      sourceLine: "Transaction History",
      source: "generic_statement_ocr",
    },
  },
  {
    merchantRaw: "All currencies",
    description: "All currencies",
    amount: "2782025",
    date: null,
    rawPayload: {
      sourceLine: "All currencies",
      source: "generic_statement_ocr",
    },
  },
  {
    merchantRaw: "PHP",
    description: "PHP",
    amount: "100",
    date: null,
    rawPayload: {
      sourceLine: "PHP",
      source: "generic_statement_ocr",
    },
  },
] as Array<Record<string, unknown>>;

const noisyAssessment = assessImageStatementParse({
  rows: noisyGenericRows,
  metadata: {
    institution: "Unknown",
    accountName: "Wallet",
    accountNumber: null,
    confidence: 52,
  },
  fileName: "IMG_9100.PNG",
  parsedRowsWithDates: 0,
  parsedDateCoverage: 0,
  parsedRowsHaveMultipleAccountNumbers: false,
  suspiciousDateCoverage: false,
  prefersVisionFallbackForInstitution: false,
});

assert.equal(noisyAssessment.shouldDiscardBeforeBackup, true, "Noisy screenshot OCR rows should be discarded before backup handoff.");
assert.equal(noisyAssessment.parseLooksUsable, false, "Noisy screenshot OCR rows should not count as a usable fast parse.");
assert.ok(
  noisyAssessment.suspiciousScreenshotCoverage >= 0.4,
  `Expected noisy screenshot coverage to be suspicious. got=${noisyAssessment.suspiciousScreenshotCoverage}`
);

const noisyRoutingDecision = buildParserRoutingDecision({
  fileType: "image/png",
  imageImport: true,
  importMode: "statement",
  screenshotLikeFile: true,
  screenshotArtifactCoverage: noisyAssessment.suspiciousScreenshotCoverage,
  hasTemplateMemory: false,
  trainedReceiptDetails: false,
  canReuseCachedStatementParse: false,
  hasReliableDeterministicStatementParse: false,
  imageStatementParseLooksUsable: noisyAssessment.parseLooksUsable,
  textForParse: "partial screenshot OCR text",
  parsedRowsLength: noisyGenericRows.length,
  hasKnownInstitution: false,
  metadataConfidence: 52,
  hasAccountNumber: false,
  hasMultipleAccountNumbers: false,
  genericParseLooksSuspicious: true,
  gcashSuspiciouslySparse: false,
  suspiciousDateCoverage: false,
  prefersVisionFallbackForInstitution: false,
  genericIdentityLooksWeak: true,
  parsedDateCoverage: 0,
});

assert.equal(
  noisyRoutingDecision.decision,
  "backup_required",
  `Noisy screenshot OCR rows should route to backup immediately. got=${noisyRoutingDecision.decision}`
);

const structuredScreenshotRows = [
  {
    merchantRaw: "Train Pal",
    description: "Refunded",
    amount: "43.54",
    date: "2026-04-13",
    rawPayload: {
      kind: "wise_mobile_screenshot_transaction",
      source: "wise_mobile_screenshot",
      sourceLine: "TrainPal Refunded +43.54 GBP",
    },
  },
  {
    merchantRaw: "To PHP",
    description: "Added",
    amount: "50000",
    date: "2026-04-06",
    rawPayload: {
      kind: "wise_mobile_screenshot_transaction",
      source: "wise_mobile_screenshot",
      sourceLine: "To PHP Added +50,000 PHP",
    },
  },
] as Array<Record<string, unknown>>;

const structuredAssessment = assessImageStatementParse({
  rows: structuredScreenshotRows,
  metadata: {
    institution: "Wise",
    accountName: "Wise",
    accountNumber: null,
    confidence: 92,
  },
  fileName: "IMG_1327.PNG",
  parsedRowsWithDates: 2,
  parsedDateCoverage: 1,
  parsedRowsHaveMultipleAccountNumbers: false,
  suspiciousDateCoverage: false,
  prefersVisionFallbackForInstitution: false,
});

assert.equal(structuredAssessment.shouldDiscardBeforeBackup, false, "Structured screenshot rows should not be discarded.");
assert.equal(structuredAssessment.parseLooksUsable, true, "Structured screenshot rows should stay eligible for the fast path.");

const sparseGsaveRows = [
  {
    merchantRaw: "CIMB snapshot",
    description: "CIMB snapshot",
    amount: "0.00",
    date: "2000-01-01",
    rawPayload: {
      kind: "account_snapshot_marker",
      source: "gsave_uno_screenshot",
      accountName: "GSave CIMB 6972",
    },
  },
] as Array<Record<string, unknown>>;

const sparseGsaveAssessment = assessImageStatementParse({
  rows: sparseGsaveRows,
  metadata: {
    institution: "GSave",
    accountName: "GSave",
    accountNumber: null,
    confidence: 90,
  },
  fileName: "IMG_1407.PNG",
  parsedRowsWithDates: 1,
  parsedDateCoverage: 1,
  parsedRowsHaveMultipleAccountNumbers: false,
  suspiciousDateCoverage: false,
  prefersVisionFallbackForInstitution: false,
  sparseLocalRowsSuspicious: true,
});

assert.equal(
  sparseGsaveAssessment.parseLooksUsable,
  false,
  "GSave overview screenshots that visibly imply multiple accounts should not stay on the fast path when only one snapshot row survived."
);

const sparseGsaveRoutingDecision = buildParserRoutingDecision({
  fileType: "image/png",
  imageImport: true,
  importMode: "statement",
  screenshotLikeFile: true,
  screenshotArtifactCoverage: 0,
  hasTemplateMemory: false,
  trainedReceiptDetails: false,
  canReuseCachedStatementParse: false,
  hasReliableDeterministicStatementParse: false,
  imageStatementParseLooksUsable: sparseGsaveAssessment.parseLooksUsable,
  textForParse: "GSave My Accounts GSave ...6972 #UNOready ...4132",
  parsedRowsLength: sparseGsaveRows.length,
  hasKnownInstitution: true,
  metadataConfidence: 90,
  hasAccountNumber: false,
  hasMultipleAccountNumbers: false,
  genericParseLooksSuspicious: false,
  gcashSuspiciouslySparse: true,
  suspiciousDateCoverage: false,
  prefersVisionFallbackForInstitution: false,
  genericIdentityLooksWeak: false,
  parsedDateCoverage: 1,
});

assert.equal(
  sparseGsaveRoutingDecision.decision,
  "backup_required",
  `Sparse GSave overview screenshots should escalate to backup/transcript repair early. got=${sparseGsaveRoutingDecision.decision}`
);
assert.ok(
  sparseGsaveRoutingDecision.reasons.includes("gcash_sparse_parse"),
  `Expected sparse GSave overview screenshots to record gcash_sparse_parse. reasons=${JSON.stringify(sparseGsaveRoutingDecision.reasons)}`
);

const sparseGfundsRows = [
  {
    merchantRaw: "Sell Order Completed",
    description: "ATRAM Peso Money Market Fund - Sell Order Completed",
    amount: "26804.31",
    date: "2025-04-22",
    rawPayload: {
      kind: "gfunds_transaction_screenshot",
      source: "gfunds_transaction_screenshot",
    },
  },
] as Array<Record<string, unknown>>;

const sparseGfundsAssessment = assessImageStatementParse({
  rows: sparseGfundsRows,
  metadata: {
    institution: "GFunds",
    accountName: "GFunds",
    accountNumber: null,
    confidence: 88,
  },
  fileName: "IMG_1415.PNG",
  parsedRowsWithDates: 1,
  parsedDateCoverage: 1,
  parsedRowsHaveMultipleAccountNumbers: false,
  suspiciousDateCoverage: false,
  prefersVisionFallbackForInstitution: false,
  sparseLocalRowsSuspicious: true,
});

assert.equal(
  sparseGfundsAssessment.parseLooksUsable,
  false,
  "GFunds transaction-history screenshots should escalate when only a small fraction of visible orders were recovered."
);

const sparseGfundsRoutingDecision = buildParserRoutingDecision({
  fileType: "image/png",
  imageImport: true,
  importMode: "statement",
  screenshotLikeFile: true,
  screenshotArtifactCoverage: 0,
  hasTemplateMemory: false,
  trainedReceiptDetails: false,
  canReuseCachedStatementParse: false,
  hasReliableDeterministicStatementParse: false,
  imageStatementParseLooksUsable: sparseGfundsAssessment.parseLooksUsable,
  textForParse: "Transaction History ATRAM Peso Money Market Fund Sell Order Completed April 22, 2025 -PHP 26,804.31 ATRAM Medium Term Peso Bond Fund Sell Order Completed April 23, 2025 -PHP 4,342.40",
  parsedRowsLength: sparseGfundsRows.length,
  hasKnownInstitution: true,
  metadataConfidence: 88,
  hasAccountNumber: false,
  hasMultipleAccountNumbers: false,
  genericParseLooksSuspicious: false,
  gcashSuspiciouslySparse: true,
  suspiciousDateCoverage: false,
  prefersVisionFallbackForInstitution: false,
  genericIdentityLooksWeak: false,
  parsedDateCoverage: 1,
});

assert.equal(
  sparseGfundsRoutingDecision.decision,
  "backup_required",
  `Sparse GFunds screenshot parses should escalate early. got=${sparseGfundsRoutingDecision.decision}`
);

const sparseGcryptoRows = [
  {
    merchantRaw: "Sell",
    description: "Sell - Solana (4.4838)",
    amount: "14591.50",
    date: "2023-11-20",
    rawPayload: {
      kind: "gcrypto_transaction_screenshot",
      source: "gcrypto_transaction_screenshot",
    },
  },
] as Array<Record<string, unknown>>;

const sparseGcryptoAssessment = assessImageStatementParse({
  rows: sparseGcryptoRows,
  metadata: {
    institution: "GCrypto",
    accountName: "GCrypto",
    accountNumber: null,
    confidence: 89,
  },
  fileName: "IMG_1427.PNG",
  parsedRowsWithDates: 1,
  parsedDateCoverage: 1,
  parsedRowsHaveMultipleAccountNumbers: false,
  suspiciousDateCoverage: false,
  prefersVisionFallbackForInstitution: false,
  sparseLocalRowsSuspicious: true,
});

assert.equal(
  sparseGcryptoAssessment.parseLooksUsable,
  false,
  "GCrypto transaction-history screenshots should escalate when only a small fraction of visible rows were recovered."
);

const sparseGcryptoRoutingDecision = buildParserRoutingDecision({
  fileType: "image/png",
  imageImport: true,
  importMode: "statement",
  screenshotLikeFile: true,
  screenshotArtifactCoverage: 0,
  hasTemplateMemory: false,
  trainedReceiptDetails: false,
  canReuseCachedStatementParse: false,
  hasReliableDeterministicStatementParse: false,
  imageStatementParseLooksUsable: sparseGcryptoAssessment.parseLooksUsable,
  textForParse: "GCrypto Transaction History Past Transactions Nov 20, 2023 Withdraw 12:24 PM Successful Trading Wallet - PHP 33,791.22 Sell 12:24 PM Successful Stellar 227.5 PHP 1,489.48 Sell 12:23 PM Successful The Graph 411.25 PHP 3,055.73 Sell 12:23 PM Successful Solana 4.4838 PHP 14,591.50",
  parsedRowsLength: sparseGcryptoRows.length,
  hasKnownInstitution: true,
  metadataConfidence: 89,
  hasAccountNumber: false,
  hasMultipleAccountNumbers: false,
  genericParseLooksSuspicious: false,
  gcashSuspiciouslySparse: true,
  suspiciousDateCoverage: false,
  prefersVisionFallbackForInstitution: false,
  genericIdentityLooksWeak: false,
  parsedDateCoverage: 1,
});

assert.equal(
  sparseGcryptoRoutingDecision.decision,
  "backup_required",
  `Sparse GCrypto screenshot parses should escalate early. got=${sparseGcryptoRoutingDecision.decision}`
);

assert.equal(
  shouldPreferDirectImageStatementVisionPath({
    fileName: "IMG_1407.PNG",
    fileType: "image/png",
    importMode: "statement",
    text: "",
    textCacheInfo: null,
    trainedReceiptDetails: null,
  }),
  false,
  "Known GSave screenshots should keep deterministic text extraction enabled in the background path."
);

assert.equal(
  shouldPreferDirectImageStatementVisionPath({
    fileName: "IMG_1415.PNG",
    fileType: "image/png",
    importMode: "statement",
    text: "",
    textCacheInfo: null,
    trainedReceiptDetails: null,
  }),
  false,
  "Known GFunds screenshots should keep deterministic text extraction enabled in the background path."
);

assert.equal(
  shouldPreferDirectImageStatementVisionPath({
    fileName: "IMG_9100.PNG",
    fileType: "image/png",
    importMode: "statement",
    text: "",
    textCacheInfo: null,
    trainedReceiptDetails: null,
  }),
  true,
  "Unknown screenshots can still use the direct vision path when no text was provided."
);

assert.equal(
  shouldAttemptGenericScreenshotTranscriptRepair({
    likelyScreenshotStatement: true,
    hasTemplateMemory: false,
    shouldPrioritizeBackupEarly: false,
    pageImageCount: 1,
    parsedRowsLength: noisyGenericRows.length,
    parseLooksUsable: noisyAssessment.parseLooksUsable,
    shouldDiscardBeforeBackup: noisyAssessment.shouldDiscardBeforeBackup,
    institutionHint: "Unknown",
    fileName: "IMG_9100.PNG",
  }),
  true,
  "Unknown screenshot families with unusable local rows should try early generic transcript repair."
);

assert.equal(
  shouldAttemptGenericScreenshotTranscriptRepair({
    likelyScreenshotStatement: true,
    hasTemplateMemory: true,
    shouldPrioritizeBackupEarly: false,
    pageImageCount: 1,
    parsedRowsLength: structuredScreenshotRows.length,
    parseLooksUsable: structuredAssessment.parseLooksUsable,
    shouldDiscardBeforeBackup: structuredAssessment.shouldDiscardBeforeBackup,
    institutionHint: "Wise",
    fileName: "IMG_1327.PNG",
  }),
  false,
  "Known/family-backed screenshot layouts should not trigger the generic repair path."
);

console.log("screenshot routing regression passed");
