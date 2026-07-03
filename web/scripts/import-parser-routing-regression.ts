import assert from "node:assert/strict";
import {
  assessImportFastScan,
  decideImportParserRoute,
  fingerprintImportSurface,
  shouldAttemptVisualBackupBeforeFailure,
  shouldPreferBackupParserForTemplateFamily,
} from "@/lib/import-parser-routing";
import { parseImportText } from "@/lib/import-parser";

const main = () => {
  assert.equal(
    shouldPreferBackupParserForTemplateFamily({
      templateFamilyMatches: true,
      successCount: 0,
      failureCount: 3,
    }),
    true,
    "Expected repeatedly failing statement family to prefer backup parser."
  );

  assert.equal(
    shouldPreferBackupParserForTemplateFamily({
      templateFamilyMatches: true,
      successCount: 3,
      failureCount: 1,
    }),
    false,
    "Expected mostly successful statement family to stay on local parser."
  );

  const weakWalletSurface = fingerprintImportSurface({
    importMode: "statement",
    fileType: "image/png",
    fileName: "IMG_1327.PNG",
    imageImport: true,
    likelyScreenshotStatement: true,
    textPreview: "Wise Includes hidden To PHP Added TrainPal Refunded",
    detectedMetadata: { institution: "Wise", confidence: 62 },
  });

  const weakWalletRoute = decideImportParserRoute({
    importMode: "statement",
    fileType: "image/png",
    fileName: "IMG_1327.PNG",
    imageImport: true,
    likelyScreenshotStatement: true,
    hasKnownInstitution: true,
    parsedRowsCount: 2,
    parsedDateCoverage: 0.4,
    genericParseLooksSuspicious: true,
    textLength: 140,
    textPreview: "Wise Includes hidden To PHP Added TrainPal Refunded",
    screenshotNoiseRatio: 0.38,
    detectedMetadata: { institution: "Wise", confidence: 62 },
    surfaceFingerprint: weakWalletSurface,
  });
  assert.equal(weakWalletRoute.route, "backup_openai");
  assert.ok(weakWalletRoute.targetDecisionWindowMs <= 3000);

  const strongStructuredRoute = decideImportParserRoute({
    importMode: "statement",
    fileType: "application/pdf",
    fileName: "statement.pdf",
    imageImport: false,
    canReuseCachedStatementParse: false,
    hasReliableDeterministicStatementParse: true,
    hasKnownInstitution: true,
    parsedRowsCount: 38,
    parsedDateCoverage: 0.96,
    textLength: 6200,
    textPreview: "Statement Period Opening Balance Ending Balance Account Number",
    detectedMetadata: { institution: "BPI", accountNumber: "1234", confidence: 94 },
    surfaceFingerprint: fingerprintImportSurface({
      importMode: "statement",
      fileType: "application/pdf",
      fileName: "statement.pdf",
      imageImport: false,
      textPreview: "Statement Period Opening Balance Ending Balance Account Number",
      detectedMetadata: { institution: "BPI", accountNumber: "1234", confidence: 94 },
    }),
  });
  assert.equal(strongStructuredRoute.route, "deterministic");

  const weakFamilySurface = fingerprintImportSurface({
    importMode: "statement",
    fileType: "application/pdf",
    fileName: "scan.pdf",
    imageImport: false,
    textPreview: "Statement Period account balance",
    detectedMetadata: { institution: "Unknown", confidence: 48 },
  });
  const weakFamilyRoute = decideImportParserRoute({
    importMode: "statement",
    fileType: "application/pdf",
    fileName: "scan.pdf",
    imageImport: false,
    prefersBackupParserForTemplateFamily: true,
    hasKnownInstitution: false,
    parsedRowsCount: 1,
    parsedDateCoverage: 0.2,
    genericParseLooksSuspicious: true,
    suspiciousDateCoverage: true,
    textLength: 95,
    textPreview: "Statement Period account balance",
    detectedMetadata: { institution: "Unknown", confidence: 48 },
    surfaceFingerprint: weakFamilySurface,
  });
  assert.equal(weakFamilyRoute.route, "backup_openai");
  assert.ok(/statement family/i.test(weakFamilyRoute.reason));

  const fastScan = assessImportFastScan({
    importMode: "statement",
    imageImport: true,
    parsedRowsCount: 0,
    parsedDateCoverage: 0,
    metadataConfidence: 40,
    textLength: 60,
    screenshotNoiseRatio: 0.55,
    genericParseLooksSuspicious: true,
    suspiciousDateCoverage: true,
    surfaceFingerprint: weakWalletSurface,
  });
  assert.equal(fastScan.veryWeak, true);
  assert.ok(fastScan.reasons.includes("no_rows"));

  const timestampNamedGcashSurface = fingerprintImportSurface({
    importMode: "receipt",
    fileType: "image/jpeg",
    fileName: "2026-05-01 22.08.42.jpg",
    imageImport: true,
    textPreview: [
      "JA••N PA••••K L.",
      "+63 967 218 2712",
      "Sent via GCash",
      "Amount 1,281.00",
      "Total Amount Sent ₱1281.00",
      "Ref No. 2037683983228",
      "Feb 10, 2026 9:07 PM",
    ].join("\n"),
    detectedMetadata: { institution: "Unknown", confidence: 20 },
  });
  assert.equal(timestampNamedGcashSurface.kind, "wallet_screenshot");
  assert.ok(timestampNamedGcashSurface.confidence >= 90);

  const timestampNamedGcashRoute = decideImportParserRoute({
    importMode: "receipt",
    fileType: "image/jpeg",
    fileName: "2026-05-01 22.08.42.jpg",
    imageImport: true,
    hasKnownInstitution: false,
    parsedRowsCount: 0,
    parsedDateCoverage: 0,
    genericParseLooksSuspicious: true,
    textLength: 150,
    textPreview: "Sent via GCash Amount 1,281.00 Total Amount Sent ₱1281.00 Ref No. 2037683983228",
    screenshotNoiseRatio: 0.1,
    detectedMetadata: { institution: "Unknown", confidence: 20 },
    surfaceFingerprint: timestampNamedGcashSurface,
  });
  assert.equal(timestampNamedGcashRoute.route, "backup_openai");
  assert.equal(timestampNamedGcashRoute.shouldPreferOpenAiPrimary, true);

  const noTextTimestampReceiptSurface = fingerprintImportSurface({
    importMode: "receipt",
    fileType: "image/jpeg",
    fileName: "2026-05-01 22.08.42.jpg",
    imageImport: true,
    textPreview: "",
    detectedMetadata: { institution: "Unknown", confidence: 0 },
  });
  assert.equal(noTextTimestampReceiptSurface.kind, "receipt_like");

  const noTextTimestampReceiptRoute = decideImportParserRoute({
    importMode: "receipt",
    fileType: "image/jpeg",
    fileName: "2026-05-01 22.08.42.jpg",
    imageImport: true,
    hasKnownInstitution: false,
    parsedRowsCount: 0,
    parsedDateCoverage: 0,
    genericParseLooksSuspicious: true,
    textLength: 0,
    textPreview: "",
    screenshotNoiseRatio: 0,
    detectedMetadata: { institution: "Unknown", confidence: 0 },
    surfaceFingerprint: noTextTimestampReceiptSurface,
  });
  assert.equal(noTextTimestampReceiptRoute.route, "backup_openai");
  assert.equal(noTextTimestampReceiptRoute.shouldRenderPageImages, true);
  assert.equal(noTextTimestampReceiptRoute.shouldPreferOpenAiPrimary, true);
  assert.equal(
    shouldAttemptVisualBackupBeforeFailure({
      routeDecision: noTextTimestampReceiptRoute,
      imageImport: true,
      trainedReceiptDetails: false,
      canReuseCachedStatementParse: false,
    }),
    true,
    "Expected weak receipt screenshots to try visual backup before any I-104 failure."
  );

  const weakScannedPdfRoute = decideImportParserRoute({
    importMode: "statement",
    fileType: "application/pdf",
    fileName: "BE20260331.pdf",
    imageImport: false,
    hasKnownInstitution: true,
    parsedRowsCount: 0,
    parsedDateCoverage: 0,
    genericParseLooksSuspicious: true,
    suspiciousDateCoverage: true,
    textLength: 45,
    textPreview: "BPI Statement Account Number Total Amount Due",
    screenshotNoiseRatio: 0,
    detectedMetadata: { institution: "BPI", confidence: 61 },
    surfaceFingerprint: fingerprintImportSurface({
      importMode: "statement",
      fileType: "application/pdf",
      fileName: "BE20260331.pdf",
      imageImport: false,
      textPreview: "BPI Statement Account Number Total Amount Due",
      detectedMetadata: { institution: "BPI", confidence: 61 },
    }),
  });
  assert.equal(weakScannedPdfRoute.route, "backup_openai");
  assert.equal(weakScannedPdfRoute.shouldRenderPageImages, true);
  assert.equal(
    shouldAttemptVisualBackupBeforeFailure({
      routeDecision: weakScannedPdfRoute,
      isPdfImport: true,
      trainedReceiptDetails: false,
      canReuseCachedStatementParse: false,
    }),
    true,
    "Expected weak scanned PDFs to render pages for backup before failing."
  );

  const visualRecoveryRoute = decideImportParserRoute({
    importMode: "receipt",
    fileType: "image/jpeg",
    fileName: "untrained-restaurant-receipt.jpg",
    imageImport: true,
    hasKnownInstitution: false,
    parsedRowsCount: 2,
    parsedDateCoverage: 0,
    genericParseLooksSuspicious: false,
    textLength: 420,
    textPreview: "Restaurant Receipt Subtotal VAT Amount Due Mastercard",
    screenshotNoiseRatio: 0.08,
    detectedMetadata: { institution: "Unknown", confidence: 82 },
    surfaceFingerprint: fingerprintImportSurface({
      importMode: "receipt",
      fileType: "image/jpeg",
      fileName: "untrained-restaurant-receipt.jpg",
      imageImport: true,
      textPreview: "Restaurant Receipt Subtotal VAT Amount Due Mastercard",
      detectedMetadata: { institution: "Unknown", confidence: 82 },
    }),
    visualRecoveryAttempt: 1,
  });
  assert.equal(visualRecoveryRoute.route, "backup_openai");
  assert.equal(visualRecoveryRoute.shouldRenderPageImages, true);
  assert.equal(visualRecoveryRoute.shouldPreferOpenAiPrimary, true);
  assert.ok(/Previous visual parse attempt/i.test(visualRecoveryRoute.reason));

  const spacedBpiRows = parseImportText(
    [
      "Statement of tnuoccA",
      "C u s t o m e r N u m b e r 0 2 0 1 0 0 - 3 - 3 0 - 9 0 2 9 7 3 7",
      "M a r c h 1 9 M a r c h 2 0 P a y p a l * S e p h o r a p h i l 4 0 2 9 3 5 7 7 3 3 5 , 7 0 6 . 5 0",
      "M a r c h 1 9 M a r c h 2 0 G r a b M a k a t i 2 2 0 . 0 0",
      "M a r c h 2 0 M a r c h 2 3 L a z a d a P h M a k a t i 6 , 4 3 6 . 5 9",
    ].join("\n"),
    "BE20260331.pdf",
    "application/pdf",
    {
      institution: "BPI",
      accountName: "BPI",
      accountNumber: "0201003309029737",
    }
  );
  assert.equal(spacedBpiRows.length, 3, "Expected character-spaced BPI credit-card OCR to parse transaction rows.");
  assert.equal(spacedBpiRows[0]?.amount, "5706.50", "Expected BPI approval code not to merge into the PayPal amount.");
  assert.equal((spacedBpiRows[0]?.rawPayload as Record<string, unknown> | undefined)?.approvalCode, "4029357733");
  assert.equal(spacedBpiRows[1]?.categoryName, "Transport");

  console.log("Import parser routing regression passed.");
};

main();
