import assert from "node:assert/strict";
import {
  assessImageStatementParse,
  buildParserRoutingDecision,
  shouldAttemptGenericScreenshotTranscriptRepair,
} from "@/workers/import-processor";

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
