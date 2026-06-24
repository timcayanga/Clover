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

type DecideImportParserRouteParams = {
  importMode?: string | null;
  fileType?: string | null;
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
  detectedMetadata?: DetectedStatementMetadata | null;
  trainedReceiptDetails?: boolean;
};

const normalizeConfidence = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

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
  const weakText = textLength < 120;
  const veryWeakText = textLength < 50;
  const shouldRenderPageImages = imageImport || isPdf;

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
    params.prefersVisionFallbackForInstitution &&
    (imageImport || isPdf || veryWeakText || parsedRowsCount === 0 || genericParseLooksSuspicious)
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
    (parsedRowsCount < 4 || weakText || metadataConfidence < 75 || weakStatementIdentity || suspiciousDateCoverage)
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
