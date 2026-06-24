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
  surfaceFingerprint?: ImportSurfaceFingerprint | null;
};

const normalizeConfidence = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

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
  const walletChrome =
    /\b(?:includes hidden|all currencies|direction|transaction history|wallet|added|refunded|received|sent|cash in)\b/.test(
      sample
    );
  const receiptLexicon =
    /\b(?:official receipt|sales invoice|tax invoice|receipt no|subtotal|vat|amount due|change due|cashier)\b/.test(sample);
  const statementLexicon =
    /\b(?:statement period|opening balance|ending balance|account number|available balance|transaction history)\b/.test(sample);

  if (walletInstitution || (looksLikePhoneScreenshot && walletChrome)) {
    return {
      kind: "wallet_screenshot",
      confidence: walletInstitution ? 96 : 88,
      reason: walletInstitution ? "Known wallet institution matched mobile screenshot surface" : "Mobile screenshot looks like a wallet history",
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

  if (params.canReuseCachedStatementParse) {
    return {
      route: "deterministic",
      confidence: 99,
      reason: "Reused cached extraction and parsed rows",
      targetDecisionWindowMs: 5_000,
      shouldRenderPageImages: false,
      shouldPreferOpenAiPrimary: false,
    };
  }

  if (params.trainedReceiptDetails) {
    return {
      route: "deterministic",
      confidence: 97,
      reason: "Matched a trained receipt pattern",
      targetDecisionWindowMs: 5_000,
      shouldRenderPageImages: false,
      shouldPreferOpenAiPrimary: false,
    };
  }

  if (
    surfaceFingerprint.kind === "wallet_screenshot" &&
    (parsedRowsCount === 0 || weakText || noisyScreenshotText || metadataConfidence < 75 || genericParseLooksSuspicious)
  ) {
    return {
      route: "backup_openai",
      confidence: 94,
      reason: "Wallet screenshot should jump to the backup parser after a weak fast scan",
      targetDecisionWindowMs: 5_000,
      shouldRenderPageImages,
      shouldPreferOpenAiPrimary: true,
    };
  }

  if (
    surfaceFingerprint.kind === "receipt_like" &&
    (imageImport || isPdf) &&
    (veryWeakText || parsedRowsCount === 0 || metadataConfidence < 65 || genericParseLooksSuspicious)
  ) {
    return {
      route: "backup_openai",
      confidence: 92,
      reason: "Receipt-like document looked too weak for a reliable local parse",
      targetDecisionWindowMs: 5_000,
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

    if ((imageImport || isPdf) && (veryWeakText || parsedRowsCount === 0 || metadataConfidence < 65)) {
      return {
        route: "backup_openai",
        confidence: 90,
        reason: "Non-statement OCR was too weak for a reliable local parse",
        targetDecisionWindowMs: 5_000,
        shouldRenderPageImages,
        shouldPreferOpenAiPrimary: true,
      };
    }

    return {
      route: "hybrid_openai",
      confidence: 78,
      reason: "Local non-statement parse is partial and should be enriched by the backup parser",
      targetDecisionWindowMs: 5_000,
      shouldRenderPageImages,
      shouldPreferOpenAiPrimary: false,
    };
  }

  if (
    surfaceFingerprint.kind === "statement_screenshot" &&
    (parsedRowsCount === 0 ||
      weakText ||
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
      targetDecisionWindowMs: 5_000,
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
      targetDecisionWindowMs: 5_000,
      shouldRenderPageImages: false,
      shouldPreferOpenAiPrimary: false,
    };
  }

  if (
    surfaceFingerprint.kind === "structured_statement" &&
    parsedRowsCount > 0 &&
    (genericParseLooksSuspicious || suspiciousDateCoverage || metadataConfidence < 80 || parsedDateCoverage < 0.65)
  ) {
    return {
      route: "hybrid_openai",
      confidence: 79,
      reason: "Structured statement produced partial local structure and should be enriched",
      targetDecisionWindowMs: 5_000,
      shouldRenderPageImages,
      shouldPreferOpenAiPrimary: false,
    };
  }

  if (
    params.prefersVisionFallbackForInstitution &&
    (imageImport || isPdf || veryWeakText || parsedRowsCount === 0 || genericParseLooksSuspicious || noisyScreenshotText)
  ) {
    return {
      route: "backup_openai",
      confidence: 93,
      reason: "Institution is known to parse more reliably through the backup vision path",
      targetDecisionWindowMs: 5_000,
      shouldRenderPageImages,
      shouldPreferOpenAiPrimary: true,
    };
  }

  if (
    (imageImport || isPdf) &&
    (parsedRowsCount === 0 ||
      weakText ||
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
