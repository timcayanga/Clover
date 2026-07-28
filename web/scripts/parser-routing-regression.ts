import assert from "node:assert/strict";
import {
  buildParserRoutingDecision,
  buildParserRoutingHistoryHint,
  buildImportReviewReasons,
  getImportReviewPriority,
  hasStrongStructuredPdfParse,
  hasStrongWisePdfDeterministicParse,
  normalizeWiseWalletParsedRows,
  mergeParserRoutingHistoryHints,
} from "@/workers/import-processor";

assert.equal(
  hasStrongStructuredPdfParse({
    fileType: "application/pdf",
    imageImport: false,
    importMode: "statement",
    parsedRowsLength: 17,
    parsedDateCoverage: 1,
    metadataConfidence: 95,
    hasKnownInstitution: true,
    hasAccountNumber: true,
    hasMultipleAccountNumbers: false,
  }),
  true,
  "Expected a complete known-bank PDF parse to remain trustworthy even when statement headers contain spaced lettering."
);

const baseRoutingInput = {
  fileType: "application/pdf",
  imageImport: false,
  importMode: "statement" as const,
  screenshotLikeFile: false,
  screenshotArtifactCoverage: 0,
  hasTemplateMemory: false,
  trainedReceiptDetails: false,
  canReuseCachedStatementParse: false,
  hasReliableDeterministicStatementParse: false,
  imageStatementParseLooksUsable: false,
  textForParse: "Some readable statement text",
  parsedRowsLength: 6,
  hasKnownInstitution: true,
  metadataConfidence: 74,
  hasAccountNumber: false,
  hasMultipleAccountNumbers: false,
  genericParseLooksSuspicious: false,
  gcashSuspiciouslySparse: false,
  suspiciousDateCoverage: false,
  prefersVisionFallbackForInstitution: false,
  genericIdentityLooksWeak: false,
  parsedDateCoverage: 0.67,
};

const strongHsbcPdfDecision = buildParserRoutingDecision({
  ...baseRoutingInput,
  parsedRowsLength: 31,
  metadataConfidence: 98,
  hasAccountNumber: true,
  hasReliableDeterministicStatementParse: hasStrongStructuredPdfParse({
    fileType: "application/pdf",
    imageImport: false,
    importMode: "statement",
    parsedRowsLength: 31,
    parsedDateCoverage: 1,
    metadataConfidence: 98,
    hasKnownInstitution: true,
    hasAccountNumber: true,
    hasMultipleAccountNumbers: false,
  }),
  genericParseLooksSuspicious: true,
  genericIdentityLooksWeak: true,
  parsedDateCoverage: 1,
});
assert.equal(
  strongHsbcPdfDecision.decision,
  "local_fast",
  "Expected a complete HSBC UK PDF parse to skip the slow backup and vision parsers."
);

const sparseHsbcPdfDecision = buildParserRoutingDecision({
  ...baseRoutingInput,
  parsedRowsLength: 2,
  metadataConfidence: 82,
  hasAccountNumber: true,
  hasReliableDeterministicStatementParse: hasStrongStructuredPdfParse({
    fileType: "application/pdf",
    imageImport: false,
    importMode: "statement",
    parsedRowsLength: 2,
    parsedDateCoverage: 1,
    metadataConfidence: 82,
    hasKnownInstitution: true,
    hasAccountNumber: true,
    hasMultipleAccountNumbers: false,
  }),
  genericParseLooksSuspicious: true,
  genericIdentityLooksWeak: true,
  parsedDateCoverage: 1,
});
assert.equal(
  sparseHsbcPdfDecision.decision,
  "backup_required",
  "Expected sparse HSBC PDFs to retain backup parser protection."
);

const noHistoryDecision = buildParserRoutingDecision({
  ...baseRoutingInput,
  hasTemplateMemory: true,
});
assert.equal(
  noHistoryDecision.decision,
  "backup_preferred",
  `Expected borderline file without history to start in hybrid mode. got=${noHistoryDecision.decision}`
);

const noTemplateMemoryDecision = buildParserRoutingDecision(baseRoutingInput);
assert.equal(
  noTemplateMemoryDecision.decision,
  "backup_required",
  `Expected borderline file without template memory to escalate immediately. got=${noTemplateMemoryDecision.decision}`
);

const strongWiseRows = [
  {
    date: "2026-01-05",
    currency: "PHP",
    amount: "107920.33",
    accountNumber: "2001545280",
    rawPayload: { kind: "wise_pdf_statement_transaction" },
  },
  {
    date: "2026-01-06",
    currency: "PHP",
    rawPayload: { kind: "wise_pdf_statement_transaction" },
  },
];
assert.deepEqual(
  normalizeWiseWalletParsedRows(strongWiseRows, { institution: "Wise", accountType: "wallet" }),
  strongWiseRows,
  "Expected Wise PDF account-impact values and identity to survive screenshot normalization unchanged."
);
assert.equal(
  hasStrongWisePdfDeterministicParse({
    fileType: "application/pdf",
    imageImport: false,
    importMode: "statement",
    institution: "Wise",
    accountNumber: "2001545280",
    statementCurrency: "PHP",
    metadataConfidence: 98,
    parsedDateCoverage: 1,
    rows: strongWiseRows,
  }),
  true,
  "Expected a complete dedicated Wise PDF parse to remain on the deterministic path."
);
assert.equal(
  hasStrongWisePdfDeterministicParse({
    fileType: "application/pdf",
    imageImport: false,
    importMode: "statement",
    institution: "Wise",
    accountNumber: "2001545280",
    statementCurrency: "PHP",
    metadataConfidence: 98,
    parsedDateCoverage: 1,
    rows: [{ ...strongWiseRows[0], currency: "HKD" }],
  }),
  false,
  "Expected a cross-currency Wise result to remain eligible for backup review."
);

const strongWiseRoutingDecision = buildParserRoutingDecision({
  ...baseRoutingInput,
  parsedRowsLength: strongWiseRows.length,
  metadataConfidence: 98,
  hasAccountNumber: true,
  hasReliableDeterministicStatementParse: true,
  genericParseLooksSuspicious: true,
  genericIdentityLooksWeak: true,
  parsedDateCoverage: 1,
});
assert.equal(
  strongWiseRoutingDecision.decision,
  "local_fast",
  "Expected validated Wise parser provenance to override generic identity suspicion."
);

const backupHistoryHint = mergeParserRoutingHistoryHints([
  buildParserRoutingHistoryHint({
    successCount: 4,
    exampleCount: 4,
    failureCount: 0,
    parserConfig: {
      parserSource: "backup_parser",
      parserRoutingDecision: "backup_required",
      usedHybridRaceMode: true,
      backupParserRaceResolved: true,
      localParseHealthScore: 28,
      backupLearningSignalCount: 3,
    },
  }),
  buildParserRoutingHistoryHint({
    successCount: 3,
    exampleCount: 3,
    failureCount: 0,
    parserConfig: {
      parserSource: "backup_parser",
      parserRoutingDecision: "backup_preferred",
      usedHybridRaceMode: true,
      backupParserRaceResolved: true,
      localParseHealthScore: 42,
    },
  }),
]);

const backupHistoryDecision = buildParserRoutingDecision({
  ...baseRoutingInput,
  historicalRoutingHint: backupHistoryHint,
});
assert.equal(
  backupHistoryDecision.decision,
  "backup_required",
  `Expected strong backup history to force earlier handoff. got=${backupHistoryDecision.decision}`
);
assert.ok(
  backupHistoryDecision.localParseHealthScore < noHistoryDecision.localParseHealthScore,
  `Expected backup history to reduce local health score. backup=${backupHistoryDecision.localParseHealthScore} base=${noHistoryDecision.localParseHealthScore}`
);

const localHistoryHint = mergeParserRoutingHistoryHints([
  buildParserRoutingHistoryHint({
    successCount: 4,
    exampleCount: 4,
    failureCount: 0,
    parserConfig: {
      parserSource: "local_parser",
      parserRoutingDecision: "local_fast",
      usedHybridRaceMode: true,
      backupParserRaceTimedOut: true,
    },
  }),
  buildParserRoutingHistoryHint({
    successCount: 3,
    exampleCount: 3,
    failureCount: 0,
    parserConfig: {
      parserSource: "local_parser",
      parserRoutingDecision: "local_fast",
      usedHybridRaceMode: true,
      backupParserRaceTimedOut: true,
    },
  }),
]);

const localHistoryDecision = buildParserRoutingDecision({
  ...baseRoutingInput,
  historicalRoutingHint: localHistoryHint,
  hasTemplateMemory: true,
});
assert.equal(
  localHistoryDecision.decision,
  "local_fast",
  `Expected strong local-win history to keep a borderline file on the fast path. got=${localHistoryDecision.decision}`
);
assert.ok(
  localHistoryDecision.localParseHealthScore > noHistoryDecision.localParseHealthScore,
  `Expected local history to improve local health score. local=${localHistoryDecision.localParseHealthScore} base=${noHistoryDecision.localParseHealthScore}`
);

const screenshotArtifactDecision = buildParserRoutingDecision({
  ...baseRoutingInput,
  fileType: "image/png",
  imageImport: true,
  screenshotLikeFile: true,
  screenshotArtifactCoverage: 0.5,
  parsedRowsLength: 5,
  hasKnownInstitution: false,
  metadataConfidence: 62,
  genericParseLooksSuspicious: true,
  parsedDateCoverage: 0.2,
});
assert.equal(
  screenshotArtifactDecision.decision,
  "backup_required",
  `Expected artifact-heavy screenshot parse to hand off immediately. got=${screenshotArtifactDecision.decision}`
);
assert.ok(
  screenshotArtifactDecision.reasons.includes("artifact_heavy_rows"),
  `Expected artifact-heavy screenshot parse to record artifact_heavy_rows. reasons=${JSON.stringify(screenshotArtifactDecision.reasons)}`
);

const screenshotHistoryHint = buildParserRoutingHistoryHint({
  successCount: 5,
  exampleCount: 5,
  failureCount: 0,
  parserConfig: {
    parserSource: "backup_parser",
    parserRoutingDecision: "backup_required",
    parserRoutingReasons: ["artifact_heavy_rows", "generic_parse_suspicious"],
    screenshotLikeFile: true,
    screenshotArtifactCoverage: 0.52,
    usedHybridRaceMode: true,
    backupParserRaceResolved: true,
    localParseHealthScore: 24,
  },
});
assert.ok(
  screenshotHistoryHint.reasons.some((reason) => reason.code === "historical_screenshot_artifact_heavy"),
  "Expected screenshot-heavy backup template history to preserve artifact-heavy routing evidence."
);

const untrainedLayoutDecision = buildParserRoutingDecision({
  ...baseRoutingInput,
  hasTemplateMemory: false,
  parsedRowsLength: 2,
  hasKnownInstitution: false,
  metadataConfidence: 58,
  genericParseLooksSuspicious: true,
  parsedDateCoverage: 0.33,
});
assert.equal(
  untrainedLayoutDecision.decision,
  "backup_required",
  `Expected low-confidence untrained layout to route straight to backup. got=${untrainedLayoutDecision.decision}`
);
assert.ok(
  untrainedLayoutDecision.reasons.includes("untrained_layout_family"),
  `Expected low-confidence untrained layout to record untrained_layout_family. reasons=${JSON.stringify(untrainedLayoutDecision.reasons)}`
);

const seededBackupHistoryHint = buildParserRoutingHistoryHint({
  successCount: 2,
  exampleCount: 2,
  failureCount: 0,
  parserConfig: {
    parserSource: "backup_parser",
    parserRoutingDecision: "backup_required",
    seededFromBackupWithoutPriorTemplate: true,
  },
});
assert.ok(
  seededBackupHistoryHint.reasons.some((reason) => reason.code === "historical_untrained_layout_family"),
  "Expected backup-seeded template history to preserve untrained layout routing evidence."
);

const reviewReasons = buildImportReviewReasons({
  confidence: 52,
  categoryName: "Other",
  type: "expense",
  rawPayload: {
    validation: {
      critical: true,
      findings: [{ code: "amount.coverage_low" }],
    },
    classification: {
      rowAnomalies: { issues: ["amount_text_mismatch"] },
    },
  },
});
assert.ok(reviewReasons.includes("low_confidence"));
assert.ok(reviewReasons.includes("ambiguous_category"));
assert.ok(reviewReasons.includes("validation:amount.coverage_low"));
assert.ok(reviewReasons.includes("anomaly:amount_text_mismatch"));
assert.equal(getImportReviewPriority(reviewReasons), "critical");

console.log("parser routing regression passed");
