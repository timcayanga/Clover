import type { DetectedStatementMetadata } from "@/lib/import-parser";

export type ImportParserRoute = "deterministic" | "hybrid_openai" | "backup_openai";

export type ImportParserRouteDecision = {
  route: ImportParserRoute;
  confidence: number;
  reason: string;
  targetDecisionWindowMs: number;
  shouldRenderPageImages: boolean;
  shouldPreferOpenAiPrimary: boolean;
};

export type ImportFastScanAssessment = {
  score: number;
  weak: boolean;
  veryWeak: boolean;
  reasons: string[];
};

export type ImportSurfaceFingerprintKind =
  | "wallet_screenshot"
  | "statement_screenshot"
  | "receipt_like"
  | "structured_statement"
  | "generic_document";

export type ImportSurfaceFingerprint = {
  kind: ImportSurfaceFingerprintKind;
  confidence: number;
  reason: string;
};

type DecideImportParserRouteParams = {
  importMode?: string | null;
  fileType?: string | null;
  fileName?: string | null;
  imageImport?: boolean;
  likelyScreenshotStatement?: boolean;
  canReuseCachedStatementParse?: boolean;
  hasReliableDeterministicStatementParse?: boolean;
  imageStatementParseLooksUsable?: boolean;
  prefersVisionFallbackForInstitution?: boolean;
  hasKnownInstitution?: boolean;
  parsedRowsCount?: number;
  parsedDateCoverage?: number;
  parsedRowsHaveMultipleAccountNumbers?: boolean;
  genericParseLooksSuspicious?: boolean;
  suspiciousDateCoverage?: boolean;
  textLength?: number;
  textPreview?: string | null;
  screenshotNoiseRatio?: number;
  detectedMetadata?: DetectedStatementMetadata | null;
  trainedReceiptDetails?: boolean;
  prefersBackupParserForTemplateFamily?: boolean;
  surfaceFingerprint?: ImportSurfaceFingerprint | null;
};

const normalizeConfidence = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export const shouldPreferBackupParserForTemplateFamily = (params: {
  templateFamilyMatches: boolean;
  successCount?: number | null;
  failureCount?: number | null;
}) => {
  const successCount = Math.max(0, Math.round(params.successCount ?? 0));
  const failureCount = Math.max(0, Math.round(params.failureCount ?? 0));
  const totalRuns = successCount + failureCount;
  const reliability = totalRuns > 0 ? successCount / totalRuns : 1;

  return (
    params.templateFamilyMatches &&
    totalRuns >= 2 &&
    failureCount >= Math.max(2, successCount + 1) &&
    reliability < 0.45
  );
};

export const assessImportFastScan = (params: {
  importMode?: string | null;
  imageImport?: boolean;
  parsedRowsCount?: number;
  parsedDateCoverage?: number;
  metadataConfidence?: number;
  textLength?: number;
  screenshotNoiseRatio?: number;
  genericParseLooksSuspicious?: boolean;
  suspiciousDateCoverage?: boolean;
  surfaceFingerprint?: ImportSurfaceFingerprint | null;
}) : ImportFastScanAssessment => {
  const parsedRowsCount = Math.max(0, Number(params.parsedRowsCount ?? 0));
  const parsedDateCoverage = Math.max(0, Math.min(1, Number(params.parsedDateCoverage ?? 0)));
  const metadataConfidence = Math.max(0, Math.min(100, Number(params.metadataConfidence ?? 0)));
  const textLength = Math.max(0, Number(params.textLength ?? 0));
  const screenshotNoiseRatio = Math.max(0, Math.min(1, Number(params.screenshotNoiseRatio ?? 0)));
  const importMode = params.importMode ?? "statement";
  const reasons: string[] = [];
  let score = 100;

  if (parsedRowsCount === 0) {
    score -= 45;
    reasons.push("no_rows");
  } else if (parsedRowsCount <= 2) {
    score -= 25;
    reasons.push("sparse_rows");
  } else if (parsedRowsCount <= 5) {
    score -= 10;
    reasons.push("limited_rows");
  }

  if (parsedDateCoverage < 0.35) {
    score -= 22;
    reasons.push("low_date_coverage");
  } else if (parsedDateCoverage < 0.65) {
    score -= 12;
    reasons.push("partial_date_coverage");
  }

  if (metadataConfidence < 55) {
    score -= 20;
    reasons.push("weak_metadata");
  } else if (metadataConfidence < 75) {
    score -= 10;
    reasons.push("partial_metadata");
  }

  if (textLength < 80) {
    score -= 18;
    reasons.push("tiny_text");
  } else if (textLength < 180) {
    score -= 8;
    reasons.push("short_text");
  }

  if (params.imageImport && screenshotNoiseRatio >= 0.5) {
    score -= 20;
    reasons.push("high_noise");
  } else if (params.imageImport && screenshotNoiseRatio >= 0.3) {
    score -= 10;
    reasons.push("medium_noise");
  }

  if (params.genericParseLooksSuspicious) {
    score -= 22;
    reasons.push("suspicious_parse");
  }

  if (params.suspiciousDateCoverage) {
    score -= 10;
    reasons.push("suspicious_dates");
  }

  if (
    importMode === "statement" &&
    params.surfaceFingerprint?.kind === "wallet_screenshot" &&
    (parsedRowsCount < 4 || metadataConfidence < 80)
  ) {
    score -= 10;
    reasons.push("wallet_fast_scan_unstable");
  }

  score = normalizeConfidence(score);

  return {
    score,
    weak: score < 60,
    veryWeak: score < 40,
    reasons,
  };
};

export const fingerprintImportSurface = (params: {
  importMode?: string | null;
  fileType?: string | null;
  fileName?: string | null;
  imageImport?: boolean;
  likelyScreenshotStatement?: boolean;
  textPreview?: string | null;
  detectedMetadata?: DetectedStatementMetadata | null;
}): ImportSurfaceFingerprint => {
  const importMode = params.importMode ?? "statement";
  const fileType = String(params.fileType ?? "").toLowerCase();
  const fileName = String(params.fileName ?? "");
  const imageImport = Boolean(params.imageImport);
  const sample = String(params.textPreview ?? "")
    .slice(0, 1500)
    .toLowerCase();
  const institution = String(params.detectedMetadata?.institution ?? "").toLowerCase();
  const looksLikePhoneScreenshot =
    imageImport &&
    (/(?:^|[\\/])img_\d+\.(?:jpe?g|png|webp|heic|heif|gif|bmp|avif)$/i.test(fileName) || /screenshot/i.test(fileName));
  const walletInstitution = /^(wise|gcash|maya)$/i.test(String(params.detectedMetadata?.institution ?? ""));
  const walletTransferLexicon =
    /\b(?:sent\s+via\s+(?:gcash|maya|wise)|express\s+send|total\s+amount\s+sent|ref\.?\s*no\.?|reference\s*(?:no\.?|#|:)|gcash|maya|wise)\b/.test(
      sample
    ) && /\b(?:amount|total|sent|received|transfer|wallet)\b/.test(sample);
  const walletChrome =
    /\b(?:includes hidden|all currencies|direction|transaction history|wallet|added|refunded|received|sent|cash in)\b/.test(
      sample
    );
  const receiptLexicon =
    /\b(?:official receipt|sales invoice|tax invoice|receipt no|subtotal|vat|amount due|change due|cashier)\b/.test(sample);
  const statementLexicon =
    /\b(?:statement period|opening balance|ending balance|account number|available balance|transaction history)\b/.test(sample);

  if (walletInstitution || walletTransferLexicon || (looksLikePhoneScreenshot && walletChrome)) {
    return {
      kind: "wallet_screenshot",
      confidence: walletInstitution ? 96 : walletTransferLexicon ? 94 : 88,
      reason: walletInstitution
        ? "Known wallet institution matched mobile screenshot surface"
        : walletTransferLexicon
          ? "Text matched wallet transfer screenshot markers"
          : "Mobile screenshot looks like a wallet history",
    };
  }

  if (importMode === "receipt" || receiptLexicon) {
    return {
      kind: "receipt_like",
      confidence: importMode === "receipt" ? 95 : 84,
      reason: importMode === "receipt" ? "Import mode is receipt" : "Text matched receipt-like signals",
    };
  }

  if (params.likelyScreenshotStatement || (looksLikePhoneScreenshot && imageImport && importMode === "statement")) {
    return {
      kind: "statement_screenshot",
      confidence: params.likelyScreenshotStatement ? 90 : 82,
      reason: params.likelyScreenshotStatement ? "Matched statement screenshot heuristics" : "Image statement looked like a mobile screenshot",
    };
  }

  if (
    importMode === "statement" &&
    !imageImport &&
    (statementLexicon || fileType === "application/pdf" || Boolean(params.detectedMetadata?.accountNumber) || institution.length > 0)
  ) {
    return {
      kind: "structured_statement",
      confidence: statementLexicon || Boolean(params.detectedMetadata?.accountNumber) ? 88 : 76,
      reason: statementLexicon
        ? "Text matched structured statement markers"
        : "PDF or known institution suggests a structured statement",
    };
  }

  return {
    kind: "generic_document",
    confidence: 60,
    reason: "Document did not strongly match a more specific import surface",
  };
};

export const decideImportParserRoute = (params: DecideImportParserRouteParams): ImportParserRouteDecision => {
  const importMode = params.importMode ?? "statement";
  const fileType = String(params.fileType ?? "").toLowerCase();
  const imageImport = Boolean(params.imageImport);
  const isPdf = fileType === "application/pdf";
  const parsedRowsCount = Math.max(0, Number(params.parsedRowsCount ?? 0));
  const parsedDateCoverage = Math.max(0, Math.min(1, Number(params.parsedDateCoverage ?? 0)));
  const metadataConfidence = Number(params.detectedMetadata?.confidence ?? 0);
  const hasKnownInstitution = Boolean(params.hasKnownInstitution);
  const hasAccountIdentity = Boolean(params.detectedMetadata?.accountNumber || params.detectedMetadata?.accountName);
  const hasMultiAccountIdentity = Boolean(params.parsedRowsHaveMultipleAccountNumbers);
  const genericParseLooksSuspicious = Boolean(params.genericParseLooksSuspicious);
  const suspiciousDateCoverage = Boolean(params.suspiciousDateCoverage);
  const weakStatementIdentity = !hasAccountIdentity && !hasMultiAccountIdentity;
  const textLength = Math.max(0, Number(params.textLength ?? 0));
  const screenshotNoiseRatio = Math.max(0, Math.min(1, Number(params.screenshotNoiseRatio ?? 0)));
  const weakText = textLength < 120;
  const veryWeakText = textLength < 50;
  const weakScreenshotText = textLength < 220;
  const weakStructuredDocumentText = textLength < 180;
  const noisyScreenshotText = imageImport && screenshotNoiseRatio >= 0.35;
  const extremelyNoisyScreenshotText = imageImport && screenshotNoiseRatio >= 0.5;
  const shouldRenderPageImages = imageImport || isPdf;
  const surfaceFingerprint =
    params.surfaceFingerprint ??
    fingerprintImportSurface({
      importMode,
      fileType,
      fileName: params.fileName,
      imageImport,
      likelyScreenshotStatement: params.likelyScreenshotStatement,
      textPreview: params.textPreview,
      detectedMetadata: params.detectedMetadata,
    });
  const fastScan = assessImportFastScan({
    importMode,
    imageImport,
    parsedRowsCount,
    parsedDateCoverage,
    metadataConfidence,
    textLength,
    screenshotNoiseRatio,
    genericParseLooksSuspicious,
    suspiciousDateCoverage,
    surfaceFingerprint,
  });

  if (params.canReuseCachedStatementParse) {
    return {
      route: "deterministic",
      confidence: 99,
      reason: "Reused cached extraction and parsed rows",
      targetDecisionWindowMs: 3_000,
      shouldRenderPageImages: false,
      shouldPreferOpenAiPrimary: false,
    };
  }

  if (params.trainedReceiptDetails) {
    return {
      route: "deterministic",
      confidence: 97,
      reason: "Matched a trained receipt pattern",
      targetDecisionWindowMs: 3_000,
      shouldRenderPageImages: false,
      shouldPreferOpenAiPrimary: false,
    };
  }

  if (
    params.prefersBackupParserForTemplateFamily &&
    importMode === "statement" &&
    (imageImport || isPdf) &&
    !params.hasReliableDeterministicStatementParse &&
    (fastScan.weak || parsedRowsCount === 0 || weakText || metadataConfidence < 85 || genericParseLooksSuspicious)
  ) {
    return {
      route: "backup_openai",
      confidence: 95,
      reason: `This statement family has repeatedly parsed more reliably through the backup parser${fastScan.reasons.length ? ` (${fastScan.reasons.join(", ")})` : ""}`,
      targetDecisionWindowMs: 3_000,
      shouldRenderPageImages,
      shouldPreferOpenAiPrimary: true,
    };
  }

  if (
    surfaceFingerprint.kind === "wallet_screenshot" &&
    (fastScan.weak || parsedRowsCount === 0 || weakScreenshotText || noisyScreenshotText || metadataConfidence < 75 || genericParseLooksSuspicious)
  ) {
    return {
      route: "backup_openai",
      confidence: 94,
      reason: `Wallet screenshot should jump to the backup parser after a weak fast scan${fastScan.reasons.length ? ` (${fastScan.reasons.join(", ")})` : ""}`,
      targetDecisionWindowMs: 3_000,
      shouldRenderPageImages,
      shouldPreferOpenAiPrimary: true,
    };
  }

  if (
    surfaceFingerprint.kind === "receipt_like" &&
    (imageImport || isPdf) &&
    (fastScan.weak || veryWeakText || parsedRowsCount === 0 || metadataConfidence < 65 || genericParseLooksSuspicious)
  ) {
    return {
      route: "backup_openai",
      confidence: 92,
      reason: "Receipt-like document looked too weak for a reliable local parse",
      targetDecisionWindowMs: 3_000,
      shouldRenderPageImages,
      shouldPreferOpenAiPrimary: true,
    };
  }

  if (importMode !== "statement") {
    if (parsedRowsCount > 0 && metadataConfidence >= 75 && !genericParseLooksSuspicious) {
      return {
        route: "deterministic",
        confidence: normalizeConfidence(metadataConfidence),
        reason: "Local parser produced usable non-statement rows",
        targetDecisionWindowMs: 5_000,
        shouldRenderPageImages: false,
        shouldPreferOpenAiPrimary: false,
      };
    }

    if ((imageImport || isPdf) && (fastScan.weak || veryWeakText || parsedRowsCount === 0 || metadataConfidence < 65)) {
      return {
        route: "backup_openai",
        confidence: 90,
        reason: "Non-statement OCR was too weak for a reliable local parse",
        targetDecisionWindowMs: 3_000,
        shouldRenderPageImages,
        shouldPreferOpenAiPrimary: true,
      };
    }

    return {
      route: "hybrid_openai",
      confidence: 78,
      reason: "Local non-statement parse is partial and should be enriched by the backup parser",
      targetDecisionWindowMs: fastScan.weak ? 3_000 : 5_000,
      shouldRenderPageImages,
      shouldPreferOpenAiPrimary: false,
    };
  }

  if (
    surfaceFingerprint.kind === "statement_screenshot" &&
    (parsedRowsCount === 0 ||
      fastScan.weak ||
      weakScreenshotText ||
      noisyScreenshotText ||
      metadataConfidence < 76 ||
      weakStatementIdentity ||
      genericParseLooksSuspicious ||
      suspiciousDateCoverage)
  ) {
    return {
      route: "backup_openai",
      confidence: 90,
      reason: "Statement screenshot looked too weak after the fast local scan",
      targetDecisionWindowMs: 3_000,
      shouldRenderPageImages: true,
      shouldPreferOpenAiPrimary: true,
    };
  }

  if (params.hasReliableDeterministicStatementParse || params.imageStatementParseLooksUsable) {
    return {
      route: "deterministic",
      confidence: normalizeConfidence(Math.max(metadataConfidence, parsedRowsCount >= 20 ? 92 : 84)),
      reason: params.imageStatementParseLooksUsable
        ? "Fast screenshot parser produced usable statement rows"
        : "Local statement parser produced a reliable structured result",
      targetDecisionWindowMs: 3_000,
      shouldRenderPageImages: false,
      shouldPreferOpenAiPrimary: false,
    };
  }

  if (
    surfaceFingerprint.kind === "structured_statement" &&
    parsedRowsCount > 0 &&
    (fastScan.weak || genericParseLooksSuspicious || suspiciousDateCoverage || metadataConfidence < 80 || parsedDateCoverage < 0.65)
  ) {
    return {
      route: "hybrid_openai",
      confidence: 79,
      reason: "Structured statement produced partial local structure and should be enriched",
      targetDecisionWindowMs: fastScan.veryWeak ? 3_000 : 5_000,
      shouldRenderPageImages,
      shouldPreferOpenAiPrimary: false,
    };
  }

  if (
    params.prefersVisionFallbackForInstitution &&
    (fastScan.weak || imageImport || isPdf || veryWeakText || parsedRowsCount === 0 || genericParseLooksSuspicious || noisyScreenshotText)
  ) {
    return {
      route: "backup_openai",
      confidence: 93,
      reason: "Institution is known to parse more reliably through the backup vision path",
      targetDecisionWindowMs: 3_000,
      shouldRenderPageImages,
      shouldPreferOpenAiPrimary: true,
    };
  }

  if (
    (imageImport || isPdf) &&
    (parsedRowsCount === 0 ||
      (surfaceFingerprint.kind === "structured_statement" ? weakStructuredDocumentText : weakScreenshotText) ||
      extremelyNoisyScreenshotText ||
      metadataConfidence < 70 ||
      weakStatementIdentity ||
      !hasKnownInstitution ||
      genericParseLooksSuspicious ||
      suspiciousDateCoverage)
  ) {
    return {
      route: "backup_openai",
      confidence: 88,
      reason: "Document failed the fast local statement scan and should jump to the backup parser",
      targetDecisionWindowMs: 5_000,
      shouldRenderPageImages,
      shouldPreferOpenAiPrimary: true,
    };
  }

  if (
    params.likelyScreenshotStatement &&
    (parsedRowsCount < 4 ||
      weakText ||
      noisyScreenshotText ||
      metadataConfidence < 75 ||
      weakStatementIdentity ||
      suspiciousDateCoverage)
  ) {
    return {
      route: "backup_openai",
      confidence: 86,
      reason: "Screenshot statement looked incomplete after the first deterministic pass",
      targetDecisionWindowMs: 5_000,
      shouldRenderPageImages: true,
      shouldPreferOpenAiPrimary: true,
    };
  }

  if (
    parsedRowsCount > 0 &&
    (genericParseLooksSuspicious ||
      suspiciousDateCoverage ||
      metadataConfidence < 82 ||
      weakStatementIdentity ||
      !hasKnownInstitution ||
      parsedDateCoverage < 0.55)
  ) {
    return {
      route: "hybrid_openai",
      confidence: 74,
      reason: "Local statement parse found partial structure but needs backup enrichment",
      targetDecisionWindowMs: 5_000,
      shouldRenderPageImages,
      shouldPreferOpenAiPrimary: false,
    };
  }

  return {
    route: "deterministic",
    confidence: normalizeConfidence(Math.max(metadataConfidence, 80)),
    reason: "Local parser looked good enough to finish without the backup parser",
    targetDecisionWindowMs: 5_000,
    shouldRenderPageImages: false,
    shouldPreferOpenAiPrimary: false,
  };
};
