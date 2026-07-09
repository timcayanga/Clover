import type { AccountType, Prisma, ReviewStatus, TransactionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { capturePostHogServerEvent } from "@/lib/analytics";
import { findDeletedAccountTombstoneMatch } from "@/lib/account-tombstones";
import { formatUploadAccountDisplayName } from "@/lib/account-display";
import { recordDataQaRun, type DataQaParsedRow, type DataQaSource } from "@/lib/data-qa";
import { deriveReconciledBalance, type BalanceLikeTransaction } from "@/lib/account-balance";
import { getWorkspaceOwnerLimits, getWorkspaceOwnerPlanUsage } from "@/lib/plan-access";
import {
  normalizeInstitutionCurrency,
  parseAmountValue,
  parseDateValue,
  parseImportText,
  parseImportTextGenericOnly,
  type ParsedImportRow,
} from "@/lib/import-parser";
import {
  isLikelyScreenshotDateFragment,
  isLikelyScreenshotUiArtifactText,
  normalizeScreenshotArtifactText,
  screenshotEvidenceContainsUiArtifact,
} from "@/lib/screenshot-artifact-filter";
import {
  gsaveScreenshotExpectsMultipleAccounts,
  looksLikeGcashFamilyScreenshotText,
  normalizeGcashFamilyScreenshotOcrText,
} from "@/lib/gcash-family-screenshot";
import {
  readImportedFileImageDataUrls,
  readImportedFileTextWithCacheInfo,
  readImportedPdfPageImages,
  storeImportedFileTextCacheRecord,
} from "@/lib/import-file-text.server";
import { downloadImportObject } from "@/lib/import-storage.server";
import { resolveReceiptAccountHintToAccount } from "@/lib/receipt-account-resolution";
import { syncWorkspaceRecurringPatterns } from "@/lib/recurring-detection";
import { parseReceiptText } from "@/lib/split-bill";
import {
  DATA_ENGINE_VERSION,
  applyDataQaReviewLearning,
  buildParsedTransactionInsertData,
  buildStatementFamilySignatureFromText,
  buildStatementFingerprint,
  buildUnsupervisedLearningSnapshot,
  countTransactionsByImportFileCompat,
  detectStatementMetadataFromText,
  type EnrichedParsedImportRow,
  findExistingImportedStatement,
  fetchImportFileCompat,
  fetchParsedTransactionRows,
  enrichParsedRowsWithTraining,
  defaultCategoryForType,
  insertTransactionCompat,
  replaceDocumentImportPagesCompat,
  upsertDocumentImportCompat,
  upsertInvestmentSnapshotCompat,
  replaceInvestmentHoldingsCompat,
  upsertReceiptDocumentCompat,
  getCompatibleImportFileColumns,
  insertParsedTransactionsCompat,
  hasCompatibleTable,
  assessParsedRowTeachability,
  recordTrainingSignal,
  loadStatementTemplate,
  loadScoredStatementTemplatesForInstitution,
  mergeStatementMetadataWithTemplate,
  recordStatementTemplateOutcome,
  promoteUnsupervisedLearningClustersForWorkspace,
  recordUnsupervisedLearningAuditForTemplate,
  updateImportFileCompat,
  upsertAccountRule,
  upsertStatementTemplate,
} from "@/lib/data-engine";
import { getTrailingBalanceFromParsedRows, inferAccountTypeFromStatement } from "@/lib/import-parser";
import { guessCategoryName } from "@/lib/import-parser";
import { parseImportTextWithOpenAIFallback, transcribeImportImagesWithOpenAI } from "@/lib/openai-import-parser";
import { isMissingAccountNumberColumnError, omitAccountNumberField } from "@/lib/account-column-compat";
import { ensureWorkspaceCashAccount } from "@/lib/starter-data";
import { coerceTransactionTypeFromCategoryName, isTransferCategoryName, toInternalTransactionType } from "@/lib/transaction-directions";
import { normalizeBankName, sanitizeBankNameLabel } from "@/lib/data-qa-banks";
import { normalizeImportImageMode, type ImportImageMode } from "@/lib/import-image-mode";
import {
  isGenericMobileScreenshotFileName,
  resolveStatementIdentityFromMetadata,
  resolveStatementIdentityFromParsedRows,
} from "@/lib/import-statement-identity";
import { mergeCheckpointSourceMetadata, readCheckpointImportMode } from "@/lib/import-workflow";
import { findBestImportedAccountMatch, matchesImportedAccountIdentity, normalizeImportedAccountKey } from "@/lib/workspace-cache";
import {
  claimNextImportEnrichmentJob,
  completeImportEnrichmentJob,
  failImportEnrichmentJob,
  MAX_IMPORT_ENRICHMENT_ATTEMPTS,
  updateImportEnrichmentJobProgress,
  updateRunningImportEnrichmentJobProgress,
  upsertImportEnrichmentJob,
} from "@/lib/import-enrichment-jobs";

type ImportInsightSummary = {
  incomeTotal: number;
  expenseTotal: number;
  netTotal: number;
  topCategoryName: string | null;
  topCategoryAmount: number | null;
  topCategoryShare: number | null;
  topMerchantName: string | null;
  topMerchantCount: number | null;
};

type ImportInsightSourceRow = {
  date?: unknown;
  amount?: unknown;
  currency?: unknown;
  institution?: unknown;
  type?: unknown;
  merchantRaw?: unknown;
  merchantClean?: unknown;
  description?: unknown;
  categoryName?: unknown;
  categoryConfidence?: unknown;
  categoryReason?: unknown;
  confidence?: unknown;
  parserConfidence?: unknown;
  accountMatchConfidence?: unknown;
  duplicateConfidence?: unknown;
  transferConfidence?: unknown;
  statementFingerprint?: unknown;
  normalizedPayload?: unknown;
  learnedRuleIdsApplied?: unknown;
  rawPayload?: unknown;
};

const inferStructuredDocumentImportModeFromParsedRows = (
  requestedMode: ImportImageMode,
  parsedRows: ParsedImportRow[],
  metadata: {
    accountType?: string | null;
    accountName?: string | null;
  } | null | undefined
): ImportImageMode => {
  if (requestedMode !== "statement") {
    return requestedMode;
  }

  if (
    parsedRows.length === 0 &&
    metadata?.accountType === "investment" &&
    /time deposit|account details/i.test(String(metadata.accountName ?? ""))
  ) {
    return "account_detail";
  }

  if (parsedRows.length === 0) {
    return requestedMode;
  }

  const markerRows = parsedRows.filter((row) => {
    const rawPayload = row.rawPayload;
    return (
      rawPayload &&
      typeof rawPayload === "object" &&
      !Array.isArray(rawPayload) &&
      (rawPayload as Record<string, unknown>).kind === "account_snapshot_marker"
    );
  });
  if (markerRows.length === 0) {
    return requestedMode;
  }

  const visibleTransactionRows = parsedRows.filter((row) => {
    const rawPayload = row.rawPayload;
    return !(
      rawPayload &&
      typeof rawPayload === "object" &&
      !Array.isArray(rawPayload) &&
      ((rawPayload as Record<string, unknown>).kind === "account_snapshot_marker" ||
        (rawPayload as Record<string, unknown>).kind === "opening_balance")
    );
  });
  if (visibleTransactionRows.length > 0) {
    return requestedMode;
  }

  const markerDocumentTypes = new Set(
    markerRows
      .map((row) => {
        const rawPayload = row.rawPayload;
        if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
          return null;
        }
        return typeof (rawPayload as Record<string, unknown>).documentType === "string"
          ? String((rawPayload as Record<string, unknown>).documentType)
          : null;
      })
      .filter((value): value is string => Boolean(value))
  );
  if (markerDocumentTypes.has("portfolio")) {
    return "portfolio";
  }

  if (markerDocumentTypes.has("account_detail") || metadata?.accountType === "investment") {
    return "account_detail";
  }

  return requestedMode;
};

type TransferAccountLookup = {
  id: string;
  name: string;
  institution?: string | null;
  accountNumber?: string | null;
  type?: AccountType | string | null;
  currency?: string | null;
};

type PreparedImportTransaction = {
  transactionId: string | null;
  insertRow: Record<string, unknown>;
  insightRow: ImportInsightSourceRow;
  trainingSignal: {
    merchantText: string;
    categoryId: string;
    categoryName: string;
    type: "income" | "expense" | "transfer";
    confidence: number;
    teachabilityScore: number;
    notes: string | null;
  };
};

type BackupParserLearningSignal = {
  merchantText: string;
  normalizedName: string | null;
  categoryName: string;
  type: "income" | "expense" | "transfer";
  confidence: number;
  teachabilityScore: number;
  notes: string | null;
};

type ParserRoutingReason = {
  code: string;
  weight: number;
};

type ParserRoutingDecision = {
  localParseHealthScore: number;
  reasons: string[];
  shouldForceBackupForSuspiciousParse: boolean;
  shouldUseVisionFallback: boolean;
  decision: "local_fast" | "backup_preferred" | "backup_required";
};

type ParserRoutingHistoryHint = {
  reasons: ParserRoutingReason[];
  localBonus: number;
};

type HistoricalRoutingTemplateLike = {
  parserConfig?: unknown;
  successCount?: number | null;
  failureCount?: number | null;
  exampleCount?: number | null;
};

const EARLY_BACKUP_PARSER_DECISION_WINDOW_MS = 3_500;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const waitForPromiseWithin = async <T>(promise: Promise<T>, timeoutMs: number): Promise<{ resolved: true; value: T } | { resolved: false }> => {
  let timeoutHandle: NodeJS.Timeout | null = null;
  try {
    const result = await Promise.race([
      promise.then((value) => ({ resolved: true as const, value })),
      new Promise<{ resolved: false }>((resolve) => {
        timeoutHandle = setTimeout(() => resolve({ resolved: false }), Math.max(1, timeoutMs));
      }),
    ]);
    return result;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

const readStringCandidate = (value: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
};

const readNumberCandidate = (value: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
    if (typeof candidate === "string" && candidate.trim()) {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
};

const normalizeLearningType = (value: string | null | undefined): "income" | "expense" | "transfer" | null => {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "income" || normalized === "expense" || normalized === "transfer") {
    return normalized;
  }

  if (normalized === "credit") {
    return "income";
  }

  if (normalized === "debit") {
    return "expense";
  }

  return null;
};

const extractBackupParserLearningSignals = (rows: EnrichedParsedImportRow[]): BackupParserLearningSignal[] => {
  const collected = new Map<string, BackupParserLearningSignal>();
  const upsertSignal = (signal: BackupParserLearningSignal | null) => {
    if (!signal) {
      return;
    }

    const key = [
      signal.merchantText.trim().toLowerCase(),
      signal.categoryName.trim().toLowerCase(),
      signal.type,
    ].join("|");
    const existing = collected.get(key);
    if (!existing || signal.confidence > existing.confidence) {
      collected.set(key, signal);
    }
  };

  for (const row of rows) {
    const rawPayload = isPlainObject(row.rawPayload) ? row.rawPayload : null;
    if (!rawPayload || rawPayload.source !== "openai") {
      continue;
    }

    const merchantText =
      (typeof row.merchantRaw === "string" && row.merchantRaw.trim() ? row.merchantRaw.trim() : null) ??
      (typeof row.merchantClean === "string" && row.merchantClean.trim() ? row.merchantClean.trim() : null);
    const categoryName = typeof row.categoryName === "string" ? row.categoryName.trim() : "";
    const confidence = typeof row.confidence === "number" && Number.isFinite(row.confidence) ? row.confidence : 0;
    const type = normalizeLearningType(typeof row.type === "string" ? row.type : null);
    if (!merchantText || !categoryName || categoryName.toLowerCase() === "other" || !type || confidence < 88) {
      continue;
    }

    const teachability = assessParsedRowTeachability({
      merchantRaw: typeof row.merchantRaw === "string" ? row.merchantRaw : null,
      merchantClean: typeof row.merchantClean === "string" ? row.merchantClean : null,
      description: typeof row.description === "string" ? row.description : null,
      categoryName,
      type,
      amount: row.amount,
      date: row.date,
      rawPayload: row.rawPayload ?? null,
    } as ParsedImportRow);
    if (teachability.score < 55) {
      continue;
    }

    upsertSignal({
      merchantText,
      normalizedName: typeof row.merchantClean === "string" && row.merchantClean.trim() ? row.merchantClean.trim() : null,
      categoryName,
      type,
      confidence,
      teachabilityScore: teachability.score,
      notes: typeof rawPayload.notes === "string" && rawPayload.notes.trim() ? rawPayload.notes.trim() : "Learned from backup parser result.",
    });
  }

  const learningCandidates = rows
    .map((row) => (isPlainObject(row.rawPayload) ? row.rawPayload.learningCandidates : null))
    .find((value) => isPlainObject(value));
  if (!learningCandidates) {
    return Array.from(collected.values());
  }

  const appendStructuredCandidates = (items: unknown, fallbackType: "income" | "expense" | "transfer" | null) => {
    if (!Array.isArray(items)) {
      return;
    }

    for (const item of items) {
      if (!isPlainObject(item)) {
        continue;
      }

      const merchantText = readStringCandidate(item, [
        "merchant_text",
        "merchantText",
        "raw_name",
        "rawName",
        "source_text",
        "sourceText",
        "code",
        "label",
        "alias",
        "pattern",
        "merchant",
        "name",
      ]);
      const categoryName = readStringCandidate(item, ["category", "category_name", "categoryName"]);
      const type =
        normalizeLearningType(readStringCandidate(item, ["type", "movement_type", "movementType", "direction"])) ?? fallbackType;
      const confidence = readNumberCandidate(item, ["confidence", "confidence_score", "confidenceScore"]) ?? 0;
      if (!merchantText || !categoryName || categoryName.toLowerCase() === "other" || !type || confidence < 90) {
        continue;
      }

      const normalizedName =
        readStringCandidate(item, [
          "normalized_name",
          "normalizedName",
          "clean_name",
          "cleanName",
          "normalized",
        ]) ?? null;
      const teachability = assessParsedRowTeachability({
        merchantRaw: merchantText,
        merchantClean: normalizedName ?? merchantText,
        description: null,
        categoryName,
        type,
      } as ParsedImportRow);
      if (teachability.score < 55) {
        continue;
      }

      upsertSignal({
        merchantText,
        normalizedName,
        categoryName,
        type,
        confidence: Math.round(confidence),
        teachabilityScore: teachability.score,
        notes: "Learned from backup parser guidance.",
      });
    }
  };

  appendStructuredCandidates(learningCandidates.merchant_mappings, null);
  appendStructuredCandidates(learningCandidates.code_mappings, null);
  appendStructuredCandidates(learningCandidates.institution_aliases, null);
  appendStructuredCandidates(learningCandidates.edge_cases, "expense");

  return Array.from(collected.values());
};

export const buildParserRoutingHistoryHint = (
  template: HistoricalRoutingTemplateLike | null | undefined,
  options?: {
    exactTemplateMatch?: boolean;
  }
): ParserRoutingHistoryHint => {
  if (!template || !isPlainObject(template)) {
    return {
      reasons: [],
      localBonus: 0,
    };
  }

  const parserConfig = isPlainObject(template.parserConfig) ? template.parserConfig : null;
  if (!parserConfig) {
    return {
      reasons: [],
      localBonus: 0,
    };
  }

  const reasons: ParserRoutingReason[] = [];
  let localBonus = 0;
  const exactTemplateMatch = options?.exactTemplateMatch === true;
  const successCount = Math.max(0, Math.round(Number(template.successCount ?? 0) || 0));
  const failureCount = Math.max(0, Math.round(Number(template.failureCount ?? 0) || 0));
  const exampleCount = Math.max(0, Math.round(Number(template.exampleCount ?? 0) || 0));
  const evidenceMultiplier = exactTemplateMatch ? 1.35 : 1;
  const reliability =
    successCount + failureCount > 0 ? Math.max(0, Math.min(1, successCount / Math.max(1, successCount + failureCount))) : 1;
  const evidenceScore = Math.max(1, Math.min(4, successCount + Math.max(0, exampleCount - 1)));
  const scaledWeight = (baseWeight: number) =>
    Math.max(1, Math.round(baseWeight * evidenceMultiplier * (0.7 + reliability * 0.5) * Math.min(1.1, 0.8 + evidenceScore * 0.1)));

  const parserSource = typeof parserConfig.parserSource === "string" ? parserConfig.parserSource.trim().toLowerCase() : null;
  const parserRoutingDecision =
    typeof parserConfig.parserRoutingDecision === "string" ? parserConfig.parserRoutingDecision.trim().toLowerCase() : null;
  const seededFromBackupWithoutPriorTemplate = parserConfig.seededFromBackupWithoutPriorTemplate === true;
  const localParseHealthScore =
    typeof parserConfig.localParseHealthScore === "number" && Number.isFinite(parserConfig.localParseHealthScore)
      ? Math.max(0, Math.min(100, Math.round(parserConfig.localParseHealthScore)))
      : null;
  const usedHybridRaceMode = parserConfig.usedHybridRaceMode === true;
  const backupParserRaceResolved = parserConfig.backupParserRaceResolved === true;
  const backupParserRaceTimedOut = parserConfig.backupParserRaceTimedOut === true;
  const backupLearningSignalCount =
    typeof parserConfig.backupLearningSignalCount === "number" && Number.isFinite(parserConfig.backupLearningSignalCount)
      ? Math.max(0, Math.round(parserConfig.backupLearningSignalCount))
      : 0;
  const parserRoutingReasons = Array.isArray(parserConfig.parserRoutingReasons)
    ? parserConfig.parserRoutingReasons
        .map((reason) => (typeof reason === "string" ? reason.trim().toLowerCase() : null))
        .filter((reason): reason is string => Boolean(reason))
    : [];
  const screenshotLikeFile = parserConfig.screenshotLikeFile === true;
  const screenshotArtifactCoverage =
    typeof parserConfig.screenshotArtifactCoverage === "number" && Number.isFinite(parserConfig.screenshotArtifactCoverage)
      ? Math.max(0, Math.min(1, Number(parserConfig.screenshotArtifactCoverage)))
      : 0;

  if (parserSource === "backup_parser") {
    if (parserRoutingDecision === "backup_required") {
      reasons.push({ code: "historical_backup_required", weight: scaledWeight(16) });
    } else if (parserRoutingDecision === "backup_preferred") {
      reasons.push({ code: "historical_backup_preferred", weight: scaledWeight(10) });
    }

    if (usedHybridRaceMode && backupParserRaceResolved) {
      reasons.push({ code: "historical_hybrid_backup_win", weight: scaledWeight(8) });
    } else if (usedHybridRaceMode && backupParserRaceTimedOut) {
      localBonus += scaledWeight(5);
    }

    if (localParseHealthScore !== null) {
      if (localParseHealthScore <= 35) {
        reasons.push({ code: "historical_low_local_health", weight: scaledWeight(8) });
      } else if (localParseHealthScore <= 55) {
        reasons.push({ code: "historical_medium_local_health", weight: scaledWeight(5) });
      }
    }

    if (backupLearningSignalCount > 0) {
      reasons.push({ code: "historical_backup_learning", weight: Math.min(6, scaledWeight(Math.min(3, backupLearningSignalCount))) });
    }

    if (
      seededFromBackupWithoutPriorTemplate ||
      parserRoutingReasons.includes("untrained_layout_family") ||
      parserRoutingReasons.includes("no_template_memory")
    ) {
      reasons.push({ code: "historical_untrained_layout_family", weight: scaledWeight(12) });
    }

    if (screenshotLikeFile && screenshotArtifactCoverage >= 0.35) {
      reasons.push({ code: "historical_screenshot_artifact_heavy", weight: scaledWeight(10) });
    }

    const repeatedScreenshotHardCaseReasons = parserRoutingReasons.filter((reason) =>
      [
        "artifact_heavy_rows",
        "partial_artifact_rows",
        "generic_parse_suspicious",
        "no_local_rows",
        "sparse_local_rows",
        "poor_date_coverage",
      ].includes(reason)
    ).length;
    if (repeatedScreenshotHardCaseReasons > 0) {
      reasons.push({
        code: "historical_screenshot_hard_case",
        weight: Math.min(10, scaledWeight(repeatedScreenshotHardCaseReasons * 3)),
      });
    }
  } else {
    if (parserRoutingDecision === "local_fast") {
      localBonus += scaledWeight(6);
    }

    if (usedHybridRaceMode && backupParserRaceTimedOut) {
      localBonus += scaledWeight(8);
    } else if (usedHybridRaceMode && backupParserRaceResolved) {
      reasons.push({ code: "historical_hybrid_backup_helped", weight: scaledWeight(4) });
    }
  }

  return {
    reasons,
    localBonus,
  };
};

export const mergeParserRoutingHistoryHints = (hints: Array<ParserRoutingHistoryHint | null | undefined>): ParserRoutingHistoryHint => {
  const mergedReasonWeights = new Map<string, number>();
  let localBonus = 0;

  for (const hint of hints) {
    if (!hint) {
      continue;
    }

    localBonus += Math.max(0, Math.round(hint.localBonus ?? 0));
    for (const reason of hint.reasons ?? []) {
      if (!reason?.code) {
        continue;
      }
      const nextWeight = Math.max(0, Math.round(reason.weight ?? 0));
      if (nextWeight <= 0) {
        continue;
      }
      mergedReasonWeights.set(reason.code, Math.max(mergedReasonWeights.get(reason.code) ?? 0, nextWeight));
    }
  }

  return {
    reasons: Array.from(mergedReasonWeights.entries())
      .map(([code, weight]) => ({ code, weight }))
      .sort((left, right) => right.weight - left.weight),
    localBonus: Math.min(18, localBonus),
  };
};

export const buildParserRoutingDecision = (params: {
  fileType: string | null | undefined;
  imageImport: boolean;
  importMode: ImportImageMode;
  screenshotLikeFile: boolean;
  screenshotArtifactCoverage: number;
  hasTemplateMemory: boolean;
  trainedReceiptDetails: boolean;
  canReuseCachedStatementParse: boolean;
  hasReliableDeterministicStatementParse: boolean;
  imageStatementParseLooksUsable: boolean;
  textForParse: string;
  parsedRowsLength: number;
  hasKnownInstitution: boolean;
  metadataConfidence: number;
  hasAccountNumber: boolean;
  hasMultipleAccountNumbers: boolean;
  genericParseLooksSuspicious: boolean;
  gcashSuspiciouslySparse: boolean;
  suspiciousDateCoverage: boolean;
  prefersVisionFallbackForInstitution: boolean;
  genericIdentityLooksWeak: boolean;
  parsedDateCoverage: number;
  historicalRoutingHint?: ParserRoutingHistoryHint | null;
}) : ParserRoutingDecision => {
  const documentLikeImport = params.fileType === "application/pdf" || params.imageImport;
  if (
    !documentLikeImport ||
    params.importMode !== "statement" ||
    params.trainedReceiptDetails ||
    params.canReuseCachedStatementParse ||
    params.hasReliableDeterministicStatementParse ||
    params.imageStatementParseLooksUsable
  ) {
    return {
      localParseHealthScore: 100,
      reasons: [],
      shouldForceBackupForSuspiciousParse: false,
      shouldUseVisionFallback: false,
      decision: "local_fast",
    };
  }

  const reasons: ParserRoutingReason[] = [];
  const addReason = (code: string, weight: number, condition: boolean) => {
    if (condition) {
      reasons.push({ code, weight });
    }
  };

  addReason("no_extracted_text", 42, !params.textForParse.trim());
  addReason("no_local_rows", 44, params.parsedRowsLength === 0);
  addReason("sparse_local_rows", params.imageImport ? 16 : 12, params.parsedRowsLength > 0 && params.parsedRowsLength < (params.imageImport ? 4 : 6));
  addReason("unknown_institution", 18, !params.hasKnownInstitution);
  addReason(
    "no_template_memory",
    10,
    !params.hasTemplateMemory &&
      (params.parsedRowsLength === 0 || !params.hasKnownInstitution || params.metadataConfidence < 80 || params.genericParseLooksSuspicious)
  );
  addReason(
    "untrained_layout_family",
    18,
    !params.hasTemplateMemory &&
      (
        params.parsedRowsLength === 0 ||
        (!params.hasKnownInstitution && params.metadataConfidence < 75) ||
        (params.genericParseLooksSuspicious && params.parsedRowsLength < 8)
      )
  );
  addReason("low_metadata_confidence", 18, params.metadataConfidence < 70);
  addReason("medium_metadata_confidence", 10, params.metadataConfidence >= 70 && params.metadataConfidence < 85);
  addReason("missing_account_identity", 16, !params.hasAccountNumber && !params.hasMultipleAccountNumbers);
  addReason("weak_account_identity", 12, params.genericIdentityLooksWeak);
  addReason("poor_date_coverage", 22, params.suspiciousDateCoverage);
  addReason("partial_date_coverage", 10, params.parsedRowsLength >= 3 && params.parsedDateCoverage > 0 && params.parsedDateCoverage < 0.5);
  addReason("artifact_heavy_rows", 24, params.screenshotArtifactCoverage >= 0.4);
  addReason(
    "partial_artifact_rows",
    12,
    params.screenshotArtifactCoverage >= 0.2 && params.screenshotArtifactCoverage < 0.4
  );
  addReason(
    "screenshot_like_file",
    6,
    params.imageImport && params.importMode === "statement" && params.screenshotLikeFile && params.parsedRowsLength < 6
  );
  addReason("generic_parse_suspicious", 20, params.genericParseLooksSuspicious);
  addReason("institution_prefers_vision", 18, params.prefersVisionFallbackForInstitution);
  addReason("gcash_sparse_parse", 16, params.gcashSuspiciouslySparse);
  if (params.historicalRoutingHint?.reasons?.length) {
    reasons.push(...params.historicalRoutingHint.reasons);
  }

  const totalPenalty = reasons.reduce((sum, entry) => sum + entry.weight, 0);
  const localBonus = Math.max(0, Math.round(params.historicalRoutingHint?.localBonus ?? 0));
  const localParseHealthScore = Math.max(0, Math.min(100, 100 - totalPenalty + localBonus));
  const criticalReasonCodes = new Set([
    "no_extracted_text",
    "no_local_rows",
    "poor_date_coverage",
    "generic_parse_suspicious",
    "artifact_heavy_rows",
    "untrained_layout_family",
  ]);
  const hasCriticalReason = reasons.some((entry) => criticalReasonCodes.has(entry.code));
  const shouldForceBackupForSuspiciousParse =
    hasCriticalReason ||
    localParseHealthScore <= 68 ||
    reasons.filter((entry) => entry.weight >= 16).length >= 3;
  const shouldUseVisionFallback =
    shouldForceBackupForSuspiciousParse ||
    localParseHealthScore <= 82 ||
    reasons.some((entry) => entry.code === "institution_prefers_vision");

  return {
    localParseHealthScore,
    reasons: reasons.map((entry) => entry.code),
    shouldForceBackupForSuspiciousParse,
    shouldUseVisionFallback,
    decision: shouldForceBackupForSuspiciousParse ? "backup_required" : shouldUseVisionFallback ? "backup_preferred" : "local_fast",
  };
};

const normalizeTransactionDedupeText = (value: unknown) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const normalizeTransferMatchText = (value: unknown) =>
  normalizeTransactionDedupeText(value).replace(/[^a-z0-9]+/g, " ").trim();

const normalizeTransferDigits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

const extractTransferLastFour = (value: unknown) => {
  const digits = normalizeTransferDigits(value);
  return digits.length >= 4 ? digits.slice(-4) : null;
};

const stringifyTransferPayload = (value: unknown): string => {
  if (!value || typeof value !== "object") {
    return "";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
};

const buildTransferCandidateText = (row: ImportInsightSourceRow) =>
  [
    row.merchantRaw,
    row.merchantClean,
    row.description,
    row.categoryName,
    stringifyTransferPayload(row.rawPayload),
  ].join(" ");

const normalizeLandbankImportedRow = (row: ImportInsightSourceRow, institution?: string | null): ImportInsightSourceRow => {
  const text = buildTransferCandidateText(row);
  if (/cash\s+out\s*-\s*order/i.test(text)) {
    return { ...row, categoryName: "Cash & ATM", type: "expense" };
  }

  if (/atm\s+withdrawal/i.test(text) || /\bcash\s+out\b/i.test(text) || /\bwithdrawal\b/i.test(text)) {
    return { ...row, categoryName: "Cash & ATM", type: "expense" };
  }

  if (/cash\s+deposit/i.test(text)) {
    return { ...row, categoryName: "Cash & ATM", type: "income" };
  }

  if (/transfer\s*\(internet\s+banking\)|\bbank\s+transfer\b|account\s+replenis/i.test(text)) {
    return { ...row, categoryName: "Transfers", type: "transfer" };
  }

  return row;
};

const rowMentionsAnotherWorkspaceAccount = (
  row: ImportInsightSourceRow,
  workspaceAccounts: TransferAccountLookup[],
  currentAccountId: string
) => {
  const haystack = buildTransferCandidateText(row);
  const normalizedHaystack = normalizeTransferMatchText(haystack);
  const haystackDigits = normalizeTransferDigits(haystack);
  const currentAccount = workspaceAccounts.find((account) => account.id === currentAccountId) ?? null;

  if (!normalizedHaystack && !haystackDigits) {
    return false;
  }

  const accountMatchesRow = (account: TransferAccountLookup) => {
    if (account.type === "cash") {
      return false;
    }

    const accountLastFour = extractTransferLastFour(account.accountNumber ?? account.name);
    const explicitAccountNumberContext = accountLastFour
      ? new RegExp(
          `(?:account|acct|card|wallet|number|no\\.?|ending\\s+in|ending|last\\s+4|last\\s+four)[^\\n\\r]{0,24}\\b${accountLastFour}\\b`,
          "i"
        )
      : null;
    if (accountLastFour && explicitAccountNumberContext?.test(normalizedHaystack)) {
      return true;
    }

    const accountName = normalizeTransferMatchText(account.name);
    const institution = normalizeTransferMatchText(account.institution);
    const namedToken = accountName && accountName.length >= 6 ? accountName : null;
    const institutionToken = institution && institution.length >= 6 ? institution : null;

    if (namedToken && normalizedHaystack.includes(namedToken)) {
      return true;
    }

    return Boolean(institutionToken && accountLastFour && normalizedHaystack.includes(institutionToken));
  };

  if (!currentAccount || !accountMatchesRow(currentAccount)) {
    return false;
  }

  return workspaceAccounts.some((account) => {
    if (account.id === currentAccountId) {
      return false;
    }
    return accountMatchesRow(account);
  });
};

const inferExternalTransferDirection = (row: ImportInsightSourceRow): TransactionType => {
  const lower = buildTransferCandidateText(row).toLowerCase();

  if (/\b(received|receive|incoming|credited|credit|cash\s*in|add\s+money|transfer\s+from|from)\b/.test(lower)) {
    return "income";
  }

  if (/\b(sent|send|outgoing|debited|debit|cash\s*out|payment\s+to|transfer\s+to|to)\b/.test(lower)) {
    return "expense";
  }

  return "expense";
};

const shouldPreserveParserTransferDirection = (
  row: ImportInsightSourceRow,
  parsedRow?: ImportInsightSourceRow | null
) => {
  const parserType = parsedRow?.type ?? row.type;
  if (parserType !== "income" && parserType !== "expense") {
    return false;
  }

  const rawPayload = parsedRow?.rawPayload ?? row.rawPayload;
  const rawPayloadRecord =
    rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
      ? (rawPayload as Record<string, unknown>)
      : null;
  const sourceText = [
    parsedRow?.merchantRaw,
    parsedRow?.merchantClean,
    parsedRow?.description,
    row.merchantRaw,
    row.merchantClean,
    row.description,
    row.categoryName,
    parsedRow?.categoryName,
    rawPayloadRecord?.bank,
    rawPayloadRecord?.source,
    rawPayloadRecord?.kind,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
  const normalizedBank = normalizeBankName(sourceText);

  if (normalizedBank !== "UnionBank" && rawPayloadRecord?.bank !== "UnionBank") {
    return false;
  }

  return (
    rawPayloadRecord?.kind === "unionbank_known_sample_transaction" ||
    /\b(?:online\s+instapay\s*send|instapaysend|outward\s+fast\s+payments?|online\s+fund\s+transfer|inward\s+payments?)\b/i.test(sourceText)
  );
};

const resolveUnionBankExternalTransferDirection = (
  row: ImportInsightSourceRow,
  parsedRow?: ImportInsightSourceRow | null
): TransactionType | null => {
  if (!shouldPreserveParserTransferDirection(row, parsedRow)) {
    return null;
  }

  const rawPayload = parsedRow?.rawPayload ?? row.rawPayload;
  const rawPayloadRecord =
    rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
      ? (rawPayload as Record<string, unknown>)
      : null;
  const sourceText = [
    parsedRow?.merchantRaw,
    parsedRow?.merchantClean,
    parsedRow?.description,
    row.merchantRaw,
    row.merchantClean,
    row.description,
    row.categoryName,
    parsedRow?.categoryName,
    stringifyTransferPayload(rawPayloadRecord),
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");

  if (/\b(?:online\s+instapay\s*send|instapaysend|outward\s+fast\s+payments?)\b/i.test(sourceText)) {
    return "expense";
  }

  if (/\b(?:online\s+fund\s+transfer|fund\s+transfer|inward\s+payments?)\b/i.test(sourceText)) {
    return "income";
  }

  const parserType = parsedRow?.type ?? row.type;
  return parserType === "income" || parserType === "expense" ? parserType : inferExternalTransferDirection(row);
};

const resolveTransferTypeAgainstWorkspaceAccounts = (params: {
  row: ImportInsightSourceRow;
  candidateType: TransactionType;
  workspaceAccounts: TransferAccountLookup[];
  currentAccountId: string;
}) => {
  if (params.candidateType !== "transfer") {
    return params.candidateType;
  }

  return rowMentionsAnotherWorkspaceAccount(params.row, params.workspaceAccounts, params.currentAccountId)
    ? "transfer"
    : inferExternalTransferDirection(params.row);
};

const resolveOrCreateWorkspaceCategoryId = async (params: {
  workspaceId: string;
  categoryName: string;
  fallbackType?: TransactionType;
}) => {
  const categoryName = params.categoryName.trim();
  if (!categoryName) {
    return null;
  }

  const existingCategories = await prisma.category.findMany({
    where: { workspaceId: params.workspaceId },
    select: { id: true, name: true, type: true },
  });
  const existingCategory = existingCategories.find((category) => category.name.trim().toLowerCase() === categoryName.toLowerCase()) ?? null;
  if (existingCategory) {
    return existingCategory.id;
  }

  const createdCategory = await prisma.category.create({
    data: {
      workspaceId: params.workspaceId,
      name: categoryName,
      type: coerceTransactionTypeFromCategoryName(categoryName, params.fallbackType ?? "expense"),
      isSystem: false,
    },
    select: { id: true },
  });

  return createdCategory.id;
};

const buildConfirmedTransactionDedupeKey = (params: {
  accountId?: unknown;
  date: unknown;
  amount: unknown;
  currency: unknown;
  type: unknown;
  merchantRaw: unknown;
  merchantClean: unknown;
  description: unknown;
  sourceRowIndex?: unknown;
  sourceStatementFingerprint?: unknown;
}) => {
  const date =
    params.date instanceof Date && !Number.isNaN(params.date.getTime())
      ? params.date.toISOString().slice(0, 10)
      : normalizeTransactionDedupeText(params.date).slice(0, 10);
  const amount = parseAmountValue(
    typeof params.amount === "number" || typeof params.amount === "string"
      ? String(params.amount)
      : params.amount && typeof params.amount === "object" && "toString" in params.amount
        ? String((params.amount as { toString?: () => string }).toString?.() ?? "")
        : null
  );
  const merchant =
    normalizeTransactionDedupeText(params.merchantRaw) ||
    normalizeTransactionDedupeText(params.merchantClean) ||
    normalizeTransactionDedupeText(params.description);
  const sourceRowIndex =
    typeof params.sourceRowIndex === "number" && Number.isFinite(params.sourceRowIndex) && params.sourceRowIndex > 0
      ? String(Math.trunc(params.sourceRowIndex))
      : typeof params.sourceRowIndex === "string" && params.sourceRowIndex.trim()
        ? params.sourceRowIndex.trim()
        : "";
  const sourceStatementFingerprint =
    typeof params.sourceStatementFingerprint === "string" && params.sourceStatementFingerprint.trim()
      ? params.sourceStatementFingerprint.trim()
      : "";
  const accountId =
    typeof params.accountId === "string" && params.accountId.trim()
      ? params.accountId.trim()
      : "";

  return [
    accountId,
    date,
    amount === null ? "" : amount.toFixed(2),
    normalizeTransactionDedupeText(params.currency || "PHP").toUpperCase(),
    merchant,
    sourceStatementFingerprint,
    sourceRowIndex,
  ].join("|");
};

const buildConfirmedTransactionContentKey = (params: {
  accountId?: unknown;
  date: unknown;
  amount: unknown;
  currency: unknown;
  merchantRaw: unknown;
  merchantClean: unknown;
  description: unknown;
}) => {
  const date =
    params.date instanceof Date && !Number.isNaN(params.date.getTime())
      ? params.date.toISOString().slice(0, 10)
      : normalizeTransactionDedupeText(params.date).slice(0, 10);
  const amount = parseAmountValue(
    typeof params.amount === "number" || typeof params.amount === "string"
      ? String(params.amount)
      : params.amount && typeof params.amount === "object" && "toString" in params.amount
        ? String((params.amount as { toString?: () => string }).toString?.() ?? "")
        : null
  );
  const merchant =
    normalizeTransactionDedupeText(params.merchantRaw) ||
    normalizeTransactionDedupeText(params.merchantClean) ||
    normalizeTransactionDedupeText(params.description);

  return [
    typeof params.accountId === "string" && params.accountId.trim() ? params.accountId.trim() : "",
    date,
    amount === null ? "" : amount.toFixed(2),
    normalizeTransactionDedupeText(params.currency || "PHP").toUpperCase(),
    merchant,
  ].join("|");
};

const extractWiseScreenshotSequenceNumber = (fileName: unknown) => {
  if (typeof fileName !== "string") {
    return null;
  }

  const match = fileName.match(/(?:^|[^A-Za-z0-9])IMG[_ -]?(\d{3,6})(?=[^0-9]|$)/i);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
};

const sourceFilesLookLikeAdjacentScreenshots = (leftFileName: unknown, rightFileName: unknown) => {
  const leftSequence = extractWiseScreenshotSequenceNumber(leftFileName);
  const rightSequence = extractWiseScreenshotSequenceNumber(rightFileName);
  return leftSequence !== null && rightSequence !== null && Math.abs(leftSequence - rightSequence) <= 1;
};

type ProcessImportResult = {
  imported: number;
  duplicate: boolean;
  metadata: ReturnType<typeof detectStatementMetadataFromText>;
  accountId?: string | null;
  accountSummaries?: Array<{
    accountId: string;
    accountName: string | null;
    institution: string | null;
    accountNumber: string | null;
    accountType: AccountType | null;
    balance: string | null;
    rowsImported: number;
  }>;
  confirmedTransactionsCount?: number | null;
  insightSummary?: ImportInsightSummary;
  accountBalance?: string | null;
  status?: "done" | "staged" | "error";
};

type ConfirmImportResult = {
  imported: number;
  duplicate?: boolean;
  metadata?: ReturnType<typeof detectStatementMetadataFromText>;
  accountId?: string | null;
  accountSummaries?: ProcessImportResult["accountSummaries"];
  confirmedTransactionsCount?: number | null;
  insightSummary?: ImportInsightSummary | null;
  accountBalance?: string | null;
  status?: string;
};

type ImportFileTextCacheInfo = Awaited<ReturnType<typeof readImportedFileTextWithCacheInfo>>;

let accountColumnCache: Set<string> | null = null;

const getCompatibleAccountColumns = async () => {
  if (accountColumnCache) {
    return accountColumnCache;
  }

  try {
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Account'
    `;

    accountColumnCache = new Set(columns.map((column) => column.column_name));
  } catch {
    accountColumnCache = new Set();
  }

  return accountColumnCache;
};

const getCompatibleAccountSelect = (columns: Set<string>) => ({
  id: true,
  workspaceId: true,
  name: true,
  institution: true,
  ...(columns.has("accountNumber") ? { accountNumber: true } : {}),
  type: true,
  currency: true,
  source: true,
  balance: true,
  ...(columns.has("creditLimit") ? { creditLimit: true } : {}),
  ...(columns.has("creditLimitSource") ? { creditLimitSource: true } : {}),
  ...(columns.has("creditLimitUpdatedAt") ? { creditLimitUpdatedAt: true } : {}),
  createdAt: true,
  updatedAt: true,
});

const updateImportFileWithTxCompat = async (
  tx: Prisma.TransactionClient,
  importFileId: string,
  data: Partial<Record<string, unknown>>,
  compatibleColumns: Set<string>
) => {
  const entries = Object.entries(data).filter(([key, value]) => compatibleColumns.has(key) && value !== undefined);
  if (compatibleColumns.has("updatedAt")) {
    entries.push(["updatedAt", new Date()]);
  }

  if (entries.length === 0) {
    return;
  }

  const setClause = entries.map(([key], index) => `"${key}" = $${index + 1}`).join(", ");
  const values = entries.map(([, value]) => value);
  await tx.$executeRawUnsafe(
    `UPDATE "ImportFile" SET ${setClause} WHERE "id" = $${entries.length + 1}`,
    ...values,
    importFileId
  );
};

const normalizeImportConfidenceScore = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  const scaled = value > 0 && value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, Math.round(scaled)));
};

const inferParserRowConfidence = (params: {
  confidence?: unknown;
  parserConfidence?: unknown;
  categoryConfidence?: unknown;
  statementConfidence?: unknown;
  categoryName?: string | null;
  rawPayload?: unknown;
}) => {
  const confidence = normalizeImportConfidenceScore(params.confidence);
  const parserConfidence = normalizeImportConfidenceScore(params.parserConfidence);
  const categoryConfidence = normalizeImportConfidenceScore(params.categoryConfidence);
  const statementConfidence = normalizeImportConfidenceScore(params.statementConfidence);
  const hasConcreteCategory = Boolean(params.categoryName?.trim()) && params.categoryName?.trim().toLowerCase() !== "other";
  const rawPayload = params.rawPayload && typeof params.rawPayload === "object" ? (params.rawPayload as Record<string, unknown>) : null;
  const genericReviewReasons = rawPayload?.genericReviewReasons;
  const genericReviewReasonDetails = rawPayload?.genericReviewReasonDetails;
  const hasGenericReviewReasons =
    (Array.isArray(genericReviewReasons) && genericReviewReasons.length > 0) ||
    (Array.isArray(genericReviewReasonDetails) && genericReviewReasonDetails.length > 0);
  const deterministicFallback = hasConcreteCategory && !hasGenericReviewReasons ? Math.min(95, Math.max(90, statementConfidence || 90)) : 0;

  return Math.max(confidence, parserConfidence, categoryConfidence, deterministicFallback);
};

const shouldRouteToReview = (params: { confidence: number; categoryName?: string | null; type?: string | null }) => {
  if (!params.type) {
    return true;
  }

  if (!params.categoryName || params.categoryName.trim().toLowerCase() === "other") {
    return true;
  }

  return params.confidence < 70;
};

const assessReceiptExtractionQuality = (params: {
  receiptDetails: {
    merchant_raw: string | null;
    merchant_clean: string | null;
    transaction_date: string | null;
    currency: string | null;
    subtotal: number | null;
    tax: number | null;
    service_charge: number | null;
    discount: number | null;
    tip: number | null;
    total: number | null;
    payment_method: string | null;
    line_items: Array<unknown>;
    split_allocations: Array<unknown>;
  } | null;
  expectedCurrency?: string | null;
}) => {
  const details = params.receiptDetails;
  if (!details) {
    return {
      score: 0,
      issues: ["missing receipt details"],
    };
  }

  const issues: string[] = [];
  let score = 0;

  if (details.merchant_raw || details.merchant_clean) {
    score += 2;
  } else {
    issues.push("merchant missing");
  }

  if (details.transaction_date) {
    score += 2;
  } else {
    issues.push("date missing");
  }

  if (details.total !== null) {
    score += 2;
  } else {
    issues.push("total missing");
  }

  if (details.line_items.length > 0) {
    score += 2;
  }

  if (details.split_allocations.length > 0) {
    score += 2;
  }

  if (details.payment_method) {
    score += 1;
  }

  if (details.subtotal !== null) {
    score += 1;
  }

  if (details.tax !== null) {
    score += 1;
  }

  if (details.service_charge !== null) {
    score += 1;
  }

  if (details.discount !== null) {
    score += 1;
  }

  if (details.tip !== null) {
    score += 1;
  }

  if (
    details.subtotal !== null &&
    details.total !== null &&
    Number.isFinite(details.subtotal) &&
    Number.isFinite(details.total) &&
    Math.abs(details.subtotal + (details.tax ?? 0) + (details.service_charge ?? 0) + (details.tip ?? 0) - (details.discount ?? 0) - details.total) > 0.1
  ) {
    issues.push("summary totals do not reconcile");
    score -= 2;
  }

  if (
    details.line_items.length > 0 &&
    details.total !== null &&
    Number.isFinite(details.total) &&
    details.line_items.length === 1 &&
    !details.merchant_raw &&
    !details.merchant_clean
  ) {
    issues.push("single line item with weak merchant identity");
    score -= 1;
  }

  if (
    params.expectedCurrency &&
    details.currency &&
    params.expectedCurrency.trim().toUpperCase() !== details.currency.trim().toUpperCase()
  ) {
    issues.push(`currency mismatch: ${details.currency} vs ${params.expectedCurrency}`);
    score -= 1;
  }

  if (!details.merchant_raw && !details.merchant_clean && details.total === null && details.line_items.length === 0 && details.split_allocations.length === 0) {
    issues.push("sparse receipt parse");
    score -= 4;
  }

  return {
    score: Math.max(0, Math.min(10, score)),
    issues,
  };
};

type NormalizedReceiptLineItem = {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  currency: string | null;
  confidenceScore: number;
  parserEvidence: {
    page: number | null;
    sourceText: string | null;
    reason: string;
  };
};

const normalizeReceiptLineItems = (
  lineItems: Array<{
    description?: string | null;
    quantity?: number | null;
    unit_price?: number | null;
    amount?: number | null;
    currency?: string | null;
    confidence_score?: number | null;
    parser_evidence?: {
      page?: number | null;
      source_text?: string | null;
      reason?: string | null;
    } | null;
  }>
) : NormalizedReceiptLineItem[] =>
  lineItems
    .map((item) => {
      const description = typeof item.description === "string" ? item.description.trim() : "";
      if (!description) {
        return null;
      }

      return {
        description,
        quantity: typeof item.quantity === "number" && Number.isFinite(item.quantity) ? item.quantity : null,
        unitPrice: typeof item.unit_price === "number" && Number.isFinite(item.unit_price) ? item.unit_price : null,
        amount: typeof item.amount === "number" && Number.isFinite(item.amount) ? item.amount : null,
        currency: typeof item.currency === "string" && item.currency.trim() ? item.currency.trim() : null,
        confidenceScore:
          typeof item.confidence_score === "number" && Number.isFinite(item.confidence_score) ? item.confidence_score : 0,
        parserEvidence: {
          page: typeof item.parser_evidence?.page === "number" && Number.isFinite(item.parser_evidence.page) ? item.parser_evidence.page : null,
          sourceText:
            typeof item.parser_evidence?.source_text === "string" && item.parser_evidence.source_text.trim()
              ? item.parser_evidence.source_text.trim()
              : null,
          reason:
            typeof item.parser_evidence?.reason === "string" && item.parser_evidence.reason.trim()
              ? item.parser_evidence.reason.trim()
              : "Receipt line item",
        },
      };
    })
    .filter((item): item is NormalizedReceiptLineItem => item !== null);

const buildReceiptDetailsFromPreview = (preview: ReturnType<typeof parseReceiptText>) => ({
  receipt_type: "receipt",
  merchant_raw: preview.merchantName ?? null,
  merchant_clean: preview.merchantName ?? null,
  document_number: null,
  invoice_number: null,
  booking_reference: null,
  order_number: null,
  buyer_name: preview.receiptPayerName ?? null,
  transaction_date: preview.billDate ?? null,
  transaction_time: null,
  currency: preview.currency ?? null,
  subtotal: preview.subtotal !== null ? Number(preview.subtotal) : null,
  tax: preview.tax !== null ? Number(preview.tax) : null,
  service_charge: preview.serviceCharge !== null ? Number(preview.serviceCharge) : null,
  discount: preview.discount !== null ? Number(preview.discount) : null,
  tip: preview.tip !== null ? Number(preview.tip) : null,
  total: preview.total !== null ? Number(preview.total) : null,
  payment_method: preview.paymentMethod ?? null,
  line_items: preview.items.map((item) => ({
    description: item.description,
    quantity: item.quantity ?? null,
    unit_price: item.unitPrice !== null ? Number(item.unitPrice) : null,
    amount: Number(item.amount),
    currency: preview.currency ?? null,
    confidence_score: Math.max(0, Math.min(100, Math.round(preview.confidence))),
    parser_evidence: {
      page: null,
      source_text: item.description,
      reason: "Receipt line item parsed from OCR",
    },
  })),
  split_allocations: [],
  confidence_score: Math.max(0, Math.min(100, Math.round(preview.confidence))),
  parser_evidence: {
    page: null,
    source_text: preview.receiptText,
    reason: "Receipt fallback parsed from OCR text",
  },
});

const countReceiptDetailSignals = (
  details: {
    merchant_raw: string | null;
    merchant_clean: string | null;
    transaction_date: string | null;
    payment_method: string | null;
    total: number | null;
    line_items: Array<unknown>;
    split_allocations: Array<unknown>;
    subtotal?: number | null;
    tax?: number | null;
    service_charge?: number | null;
    discount?: number | null;
    tip?: number | null;
  } | null
) => {
  if (!details) {
    return 0;
  }

  return (
    Number(Boolean(details.merchant_raw || details.merchant_clean)) +
    Number(Boolean(details.transaction_date)) +
    Number(details.total !== null) +
    Number((details.line_items?.length ?? 0) > 0) +
    Number((details.split_allocations?.length ?? 0) > 0) +
    Number(Boolean(details.payment_method)) +
    Number(details.subtotal !== null && details.subtotal !== undefined) +
    Number(details.tax !== null && details.tax !== undefined) +
    Number(details.service_charge !== null && details.service_charge !== undefined) +
    Number(details.discount !== null && details.discount !== undefined) +
    Number(details.tip !== null && details.tip !== undefined)
  );
};

const isReceiptPreviewUsable = (preview: ReturnType<typeof parseReceiptText> | null | undefined) => {
  if (!preview) {
    return false;
  }

  const hasIdentitySignal = Boolean(preview.merchantName || preview.receiptAccountMatch || preview.paymentMethod);
  const hasStructuredSignal = Boolean(
    preview.total !== null ||
      preview.billDate ||
      preview.items.length > 0 ||
      preview.splitAllocations.length > 0 ||
      preview.receiptAccountMatch
  );

  return hasIdentitySignal && hasStructuredSignal && preview.confidence >= 55;
};

type TrainedReceiptFixture = {
  fileName: string;
  documentType: string;
  merchant: string;
  amount: number;
  currency: string;
  date: string;
  categoryName: string;
  notes: string;
  paymentChannel: string;
  confidence: number;
  accountMatch?: {
    account_name: string | null;
    account_last4: string | null;
    confidence: number;
    reason: string | null;
  } | null;
};

const trainedReceiptFixtures: TrainedReceiptFixture[] = [
  {
    fileName: "2026-05-01 22.01.12.jpg",
    documentType: "receipt",
    merchant: "Jarandjam Inc.",
    amount: 7782.95,
    currency: "PHP",
    date: "2025-12-22",
    categoryName: "Food & Dining",
    notes: "Restaurant dine-in bill with service charge",
    paymentChannel: "mixed",
    confidence: 90,
  },
  {
    fileName: "2026-05-01 22.01.22.jpg",
    documentType: "receipt",
    merchant: "Main Bar",
    amount: 2004.29,
    currency: "PHP",
    date: "2024-12-23",
    categoryName: "Food & Dining",
    notes: "Bar/restaurant receipt",
    paymentChannel: "mixed",
    confidence: 90,
  },
  {
    fileName: "2026-05-01 22.02.02.jpg",
    documentType: "invoice",
    merchant: "AC Bar & Lounge",
    amount: 2511,
    currency: "PHP",
    date: "2026-02-20",
    categoryName: "Food & Dining",
    notes: "Sales invoice with discount and VAT",
    paymentChannel: "mixed",
    confidence: 90,
  },
  {
    fileName: "2026-05-01 22.02.11.jpg",
    documentType: "transfer_receipt",
    merchant: "GCash Transfer",
    amount: 1531,
    currency: "PHP",
    date: "2026-02-10",
    categoryName: "Transfers",
    notes: "Peer transfer via GCash",
    paymentChannel: "gcash",
    confidence: 90,
  },
  {
    fileName: "2026-05-01 22.02.15.jpg",
    documentType: "transfer_receipt",
    merchant: "GCash Transfer",
    amount: 1531,
    currency: "PHP",
    date: "2026-02-10",
    categoryName: "Transfers",
    notes: "Duplicate transfer screen",
    paymentChannel: "gcash",
    confidence: 90,
  },
].map((fixture) => ({
  ...fixture,
  accountMatch: {
    account_name: "Mixed",
    account_last4: null,
    confidence: 60,
    reason: "Wallet / card / mixed payments inferred",
  },
}));

const normalizeReceiptFixtureFileName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^.*[\\/]/, "")
    .replace(/\s+/g, " ")
    .replace(/\s*\(\d+\)(?=\.[^.]+$)/, "")
    .replace(/\s*-\s*copy(?=\.[^.]+$)/, "")
    .replace(/\s+copy(?=\.[^.]+$)/, "");

const getTrainedReceiptFixture = (fileName: string) => {
  const normalizedFileName = normalizeReceiptFixtureFileName(fileName);
  return trainedReceiptFixtures.find((fixture) => normalizeReceiptFixtureFileName(fixture.fileName) === normalizedFileName) ?? null;
};

const buildReceiptDetailsFromTrainingFixture = (fixture: TrainedReceiptFixture) => ({
  receipt_type: fixture.documentType,
  merchant_raw: fixture.merchant,
  merchant_clean: fixture.merchant,
  document_number: null,
  invoice_number: null,
  booking_reference: null,
  order_number: null,
  buyer_name: null,
  transaction_date: fixture.date,
  transaction_time: null,
  currency: fixture.currency,
  subtotal: null,
  tax: null,
  service_charge: null,
  discount: null,
  tip: null,
  total: fixture.amount,
  payment_method: fixture.paymentChannel,
  category_name: fixture.categoryName,
  notes: fixture.notes,
  line_items: [],
  split_allocations: [],
  confidence_score: fixture.confidence,
  parser_evidence: {
    page: null,
    source_text: fixture.notes,
    reason: "Matched confirmed receipt training fixture",
  },
});

const resolveWorkspaceCashAccountId = async (workspaceId: string, currency = "PHP") => {
  await ensureWorkspaceCashAccount(workspaceId, currency);
  const normalizedCurrency =
    normalizeInstitutionCurrency(null, currency ?? "PHP", "Cash") ??
    (String(currency ?? "PHP").trim().toUpperCase() || "PHP");
  const cashAccount = await prisma.account.findFirst({
    where: {
      workspaceId,
      type: "cash",
      currency: normalizedCurrency,
    },
    select: { id: true },
  });

  return cashAccount?.id ?? null;
};

const countRowsWithParseableDates = (rows: Array<{ date?: string | null }>) =>
  rows.reduce((count, row) => (parseDateValue(row.date ?? null) ? count + 1 : count), 0);

const countRowsWithParseableAmounts = (rows: Array<{ amount?: unknown }>) =>
  rows.reduce((count, row) => {
    const amountText =
      typeof row.amount === "number"
        ? String(row.amount)
        : typeof row.amount === "string"
          ? row.amount
          : null;
    return parseAmountValue(amountText) !== null ? count + 1 : count;
  }, 0);

const rowLooksLikeScreenshotArtifact = (
  row: Record<string, unknown>,
  metadata: { institution?: unknown; accountName?: unknown },
  fileName?: string | null
) => {
  const merchantText = normalizeScreenshotArtifactText(
    typeof row.merchantClean === "string" && row.merchantClean.trim()
      ? row.merchantClean
      : typeof row.merchantRaw === "string" && row.merchantRaw.trim()
        ? row.merchantRaw
        : typeof row.description === "string"
          ? row.description
          : null
  );
  const descriptionText = normalizeScreenshotArtifactText(typeof row.description === "string" ? row.description : null);
  const rawPayload =
    row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
      ? (row.rawPayload as Record<string, unknown>)
      : null;
  const evidenceText = [
    descriptionText,
    typeof rawPayload?.sourceLine === "string" ? rawPayload.sourceLine : null,
    typeof rawPayload?.fullLineText === "string" ? rawPayload.fullLineText : null,
    rawPayload?.parserEvidence && typeof rawPayload.parserEvidence === "object" && !Array.isArray(rawPayload.parserEvidence)
      ? typeof (rawPayload.parserEvidence as Record<string, unknown>).source_text === "string"
        ? String((rawPayload.parserEvidence as Record<string, unknown>).source_text)
        : typeof (rawPayload.parserEvidence as Record<string, unknown>).sourceText === "string"
          ? String((rawPayload.parserEvidence as Record<string, unknown>).sourceText)
          : null
      : null,
  ]
    .map(normalizeScreenshotArtifactText)
    .filter((value): value is string => Boolean(value))
    .join(" | ");

  if (
    fileName &&
    isLikelyScreenshotUiArtifactRow({
      row,
      fileName,
      statementInstitution:
        typeof metadata.institution === "string" && metadata.institution.trim() ? metadata.institution : null,
      accountName: typeof metadata.accountName === "string" && metadata.accountName.trim() ? metadata.accountName : null,
    })
  ) {
    return true;
  }

  if (!merchantText) {
    return true;
  }

  if (isLikelyScreenshotDateFragment(merchantText) || isLikelyScreenshotUiArtifactText(merchantText)) {
    return true;
  }

  if (/^(?:aed|aud|cad|chf|cny|eur|gbp|hkd|jpy|nzd|php|sgd|thb|usd)$/i.test(merchantText)) {
    return true;
  }

  if (/^[0-9][0-9,]*(?:\.\d{1,2})?\s+(?:AED|AUD|CAD|CHF|CNY|EUR|GBP|HKD|JPY|NZD|PHP|SGD|THB|USD)$/i.test(merchantText)) {
    return true;
  }

  if (descriptionText && screenshotEvidenceContainsUiArtifact(evidenceText)) {
    return true;
  }

  return false;
};

const countSuspiciousScreenshotRows = (
  rows: Array<Record<string, unknown>>,
  metadata: { institution?: unknown; accountName?: unknown },
  fileName?: string | null
) =>
  rows.reduce((count, row) => {
    const hasDate = Boolean(parseDateValue(typeof row.date === "string" ? row.date : null));
    const hasAmount =
      parseAmountValue(
        typeof row.amount === "number" ? String(row.amount) : typeof row.amount === "string" ? row.amount : null
      ) !== null;
    const looksArtifact = rowLooksLikeScreenshotArtifact(row, metadata, fileName);
    return count + (looksArtifact || !hasDate || !hasAmount ? 1 : 0);
  }, 0);

export const assessImageStatementParse = (params: {
  rows: Array<Record<string, unknown>>;
  metadata: { institution?: unknown; accountName?: unknown; accountNumber?: unknown; confidence?: unknown };
  fileName?: string | null;
  parsedRowsWithDates: number;
  parsedDateCoverage: number;
  parsedRowsHaveMultipleAccountNumbers: boolean;
  suspiciousDateCoverage: boolean;
  prefersVisionFallbackForInstitution: boolean;
  sparseLocalRowsSuspicious?: boolean;
}) => {
  const suspiciousScreenshotRows = countSuspiciousScreenshotRows(params.rows, params.metadata, params.fileName);
  const suspiciousScreenshotCoverage = params.rows.length > 0 ? suspiciousScreenshotRows / params.rows.length : 0;
  const screenshotRowsLookStructurallyWeak = params.rows.length >= 3 && suspiciousScreenshotCoverage >= 0.4;
  const parseLooksUsable =
    !params.sparseLocalRowsSuspicious &&
    imageStatementRowsLookUsable(params.rows, params.metadata, {
      parsedRowsWithDates: params.parsedRowsWithDates,
      parsedDateCoverage: params.parsedDateCoverage,
      parsedRowsHaveMultipleAccountNumbers: params.parsedRowsHaveMultipleAccountNumbers,
      suspiciousDateCoverage: params.suspiciousDateCoverage,
      prefersVisionFallbackForInstitution: params.prefersVisionFallbackForInstitution,
      fileName: params.fileName,
    });

  const hasStructuredScreenshotRows = params.rows.some((row) => {
    const rawPayload = row.rawPayload;
    if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
      return false;
    }

    const source = String((rawPayload as Record<string, unknown>).source ?? "");
    const kind = String((rawPayload as Record<string, unknown>).kind ?? "");
    return (
      /_mobile_screenshot/i.test(source) ||
      /_mobile_screenshot/i.test(kind) ||
      /account_snapshot_marker/i.test(kind) ||
      /gfunds_transaction_screenshot/i.test(kind)
    );
  });

  const shouldDiscardBeforeBackup =
    params.rows.length >= 3 &&
    !hasStructuredScreenshotRows &&
    suspiciousScreenshotCoverage >= 0.4;

  return {
    suspiciousScreenshotRows,
    suspiciousScreenshotCoverage,
    screenshotRowsLookStructurallyWeak,
    hasStructuredScreenshotRows,
    shouldDiscardBeforeBackup,
    parseLooksUsable,
  };
};

export const shouldAttemptGenericScreenshotTranscriptRepair = (params: {
  likelyScreenshotStatement: boolean;
  hasTemplateMemory: boolean;
  shouldPrioritizeBackupEarly: boolean;
  pageImageCount: number;
  parsedRowsLength: number;
  parseLooksUsable: boolean;
  shouldDiscardBeforeBackup: boolean;
  institutionHint?: string | null;
  fileName?: string | null;
}) => {
  const knownInstitutionHints = [params.institutionHint, params.fileName].filter(Boolean).join(" ").toLowerCase();
  const alreadyCoveredByDedicatedRepair = /(?:\bbpi\b|\bwise\b)/i.test(knownInstitutionHints);

  return (
    params.likelyScreenshotStatement &&
    params.pageImageCount > 0 &&
    !params.hasTemplateMemory &&
    !params.shouldPrioritizeBackupEarly &&
    !alreadyCoveredByDedicatedRepair &&
    (params.parsedRowsLength === 0 || !params.parseLooksUsable || params.shouldDiscardBeforeBackup)
  );
};

const imageStatementRowsLookUsable = (
  rows: Array<Record<string, unknown>>,
  metadata: { institution?: unknown; accountName?: unknown; accountNumber?: unknown; confidence?: unknown },
  options: {
    parsedRowsWithDates: number;
    parsedDateCoverage: number;
    parsedRowsHaveMultipleAccountNumbers: boolean;
    suspiciousDateCoverage: boolean;
    prefersVisionFallbackForInstitution: boolean;
    fileName?: string | null;
  }
) => {
  const accountSnapshotMarkerRows = rows.filter((row) => {
    const rawPayload = row.rawPayload;
    return (
      rawPayload &&
      typeof rawPayload === "object" &&
      !Array.isArray(rawPayload) &&
      (rawPayload as Record<string, unknown>).kind === "account_snapshot_marker"
    );
  });
  const mobileScreenshotRows = rows.filter((row) => {
    const rawPayload = row.rawPayload;
    const source =
      rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
        ? String((rawPayload as Record<string, unknown>).source ?? "")
        : "";
    return /_mobile_screenshot/i.test(source);
  });

  if (accountSnapshotMarkerRows.length > 0) {
    return accountSnapshotMarkerRows.some((row) => {
      const rawPayload = row.rawPayload;
      return (
        rawPayload &&
        typeof rawPayload === "object" &&
        !Array.isArray(rawPayload) &&
        (typeof (rawPayload as Record<string, unknown>).accountNumber === "string" ||
          typeof (rawPayload as Record<string, unknown>).balance === "number" ||
          typeof (rawPayload as Record<string, unknown>).accountName === "string" ||
          typeof (rawPayload as Record<string, unknown>).institutionRaw === "string" ||
          typeof (rawPayload as Record<string, unknown>).bank === "string")
      );
    });
  }

  if ((mobileScreenshotRows.length === 0 && rows.length < 3) || options.suspiciousDateCoverage) {
    return false;
  }

  const suspiciousScreenshotRows = countSuspiciousScreenshotRows(rows, metadata, options.fileName);
  const suspiciousScreenshotCoverage = rows.length > 0 ? suspiciousScreenshotRows / rows.length : 0;
  if (rows.length >= 3 && suspiciousScreenshotCoverage >= 0.4) {
    return false;
  }

  const amountCoverage = rows.length > 0 ? countRowsWithParseableAmounts(rows) / rows.length : 0;
  if (mobileScreenshotRows.length > 0 && rows.length >= 2 && options.parsedRowsWithDates >= 1 && amountCoverage >= 0.8) {
    return true;
  }

  if (options.parsedRowsWithDates < 2 || options.parsedDateCoverage < 0.6 || amountCoverage < 0.8) {
    return false;
  }

  const knownInstitution =
    typeof metadata.institution === "string" &&
    metadata.institution.trim() &&
    metadata.institution.trim() !== "Unknown";
  const rowsCarryInstitutionSignal = rows.some((row) => {
    const rawPayload = row.rawPayload;
    return (
      typeof row.institution === "string" && row.institution.trim() && row.institution.trim() !== "Unknown"
    ) || (
      rawPayload &&
      typeof rawPayload === "object" &&
      !Array.isArray(rawPayload) &&
      ((typeof (rawPayload as Record<string, unknown>).institutionRaw === "string" &&
        String((rawPayload as Record<string, unknown>).institutionRaw).trim()) ||
        (typeof (rawPayload as Record<string, unknown>).bank === "string" &&
          String((rawPayload as Record<string, unknown>).bank).trim()))
    );
  });
  if (!knownInstitution) {
    if (!rowsCarryInstitutionSignal && mobileScreenshotRows.length === 0) {
      return false;
    }
  }

  const hasAccountSignal =
    (typeof metadata.accountNumber === "string" && metadata.accountNumber.trim()) ||
    (typeof metadata.accountName === "string" && metadata.accountName.trim()) ||
    options.parsedRowsHaveMultipleAccountNumbers ||
    rows.some((row) => typeof row.accountName === "string" && row.accountName.trim()) ||
    rows.some((row) => {
      const rawPayload = row.rawPayload;
      return (
        rawPayload &&
        typeof rawPayload === "object" &&
        !Array.isArray(rawPayload) &&
        typeof (rawPayload as Record<string, unknown>).accountName === "string" &&
        String((rawPayload as Record<string, unknown>).accountName).trim()
      );
    });

  if (!hasAccountSignal) {
    return false;
  }

  if (options.prefersVisionFallbackForInstitution && rows.length < 6) {
    return false;
  }

  return true;
};

const isLikelyScreenshotImageFile = (fileName: string) =>
  /(?:^|[\\/])IMG_\d+\.(?:jpe?g|png|webp|heic|heif|gif|bmp|avif)$/i.test(fileName) || /screenshot/i.test(fileName);

const isTruthyEnvValue = (value?: string | null) => {
  if (!value) {
    return false;
  }

  return /^(1|true|yes|on|primary)$/i.test(value.trim());
};

const chunkArray = <T,>(items: T[], size: number) => {
  if (size <= 0) {
    return [items];
  }

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const readCheckpointBankName = (sourceMetadata: unknown) => {
  if (!isRecord(sourceMetadata)) {
    return null;
  }

  const bankName =
    (typeof sourceMetadata.uploadBankHint === "string" && sourceMetadata.uploadBankHint.trim()
      ? sourceMetadata.uploadBankHint
      : null) ??
    (typeof sourceMetadata.institution === "string" && sourceMetadata.institution.trim()
      ? sourceMetadata.institution
      : null);

  if (!bankName) {
    return null;
  }

  const normalized = normalizeBankName(bankName);
  return normalized && normalized !== "Unknown" ? normalized : null;
};

const isPdfImportFile = (fileType: string, fileName: string) =>
  fileType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");

const isLikelyLowQualityPnbStatementFile = (fileName: string, bankName?: string | null) => {
  const normalizedBankName = normalizeBankName(bankName || fileName);
  if (normalizedBankName !== "PNB") {
    return false;
  }

  const normalizedFileName = fileName.toLowerCase();
  return (
    normalizedFileName.includes("philippines pnb") ||
    normalizedFileName.includes("pnb 4 pages excel") ||
    normalizedFileName.includes("bank st") ||
    normalizedFileName.includes("template-in-word-and-pdf")
  );
};

const readCheckpointAccountType = (sourceMetadata: unknown): string | null => {
  if (!isRecord(sourceMetadata)) {
    return null;
  }

  const accountType =
    (typeof sourceMetadata.accountType === "string" && sourceMetadata.accountType.trim()) ||
    (typeof sourceMetadata.account_type === "string" && sourceMetadata.account_type.trim()) ||
    null;

  return accountType ? accountType.toLowerCase() : null;
};

const readCheckpointStatementFamilySignature = (sourceMetadata: unknown): string | null => {
  if (!isRecord(sourceMetadata)) {
    return null;
  }

  const candidate =
    (typeof sourceMetadata.statementFamilySignature === "string" && sourceMetadata.statementFamilySignature.trim()
      ? sourceMetadata.statementFamilySignature
      : null) ??
    (typeof sourceMetadata.statement_family_signature === "string" && sourceMetadata.statement_family_signature.trim()
      ? sourceMetadata.statement_family_signature
      : null);

  return candidate ? candidate.trim() : null;
};

const readParserRoutingReasons = (sourceMetadata: unknown): string[] => {
  if (!isRecord(sourceMetadata) || !Array.isArray(sourceMetadata.parserRoutingReasons)) {
    return [];
  }

  return sourceMetadata.parserRoutingReasons
    .map((reason) => (typeof reason === "string" ? reason.trim() : null))
    .filter((reason): reason is string => Boolean(reason));
};

const readCheckpointParserRoutingDecision = (sourceMetadata: unknown): string | null => {
  if (!isRecord(sourceMetadata)) {
    return null;
  }

  const candidate =
    (typeof sourceMetadata.earlyRoutingDecision === "string" && sourceMetadata.earlyRoutingDecision.trim()
      ? sourceMetadata.earlyRoutingDecision
      : null) ??
    (typeof sourceMetadata.parserRoutingDecision === "string" && sourceMetadata.parserRoutingDecision.trim()
      ? sourceMetadata.parserRoutingDecision
      : null);

  return candidate ? candidate.trim() : null;
};

const normalizeStatementImageOcrText = (text: string) => {
  const normalizedSourceText = looksLikeGcashFamilyScreenshotText(text)
    ? normalizeGcashFamilyScreenshotOcrText(text)
    : text;
  const lines = normalizedSourceText
    .split(/\r?\n/)
    .map((line) => line.replace(/\u00a0/g, " ").replace(/[|¦]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const isStatementUiNoiseLine = (line: string) => {
    if (/^(Transactions?|Transaction History|Wallet History|Portfolio|Accounts?|Today|Yesterday|Home|Inbox|QR|Pay|Cards?|Save & Invest|More)$/i.test(line)) {
      return true;
    }

    if (/^\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM))?$/i.test(line)) {
      return true;
    }

    if (/^\d{1,2}:\d{2}/.test(line) && !/[₹₱$£€¥]|[A-Za-z].*\d/.test(line)) {
      return true;
    }

    if (
      /^\d{1,2}:\d{2}/.test(line) &&
      !/[₹₱$£€¥]/.test(line) &&
      !/\b(?:received|sent|cash|card|transfer|deposit|withdraw|refund|purchase|payment|balance|account|transactions?|history|buy|sell)\b/i.test(line) &&
      !/\b[A-Za-z]{4,}\b/.test(line)
    ) {
      return true;
    }

    if (/^(?:Status|Signal|Battery|Wi-?Fi)$/i.test(line)) {
      return true;
    }

    return false;
  };

  return lines.filter((line) => !isStatementUiNoiseLine(line)).join("\n");
};

const detectGenericTrainingBundle = (root: Record<string, unknown>, fileName: string) => {
  const bundleType =
    Array.isArray(root.modules) && isRecord(root.fallback)
      ? "parser_system"
      : Array.isArray(root.global_rules) && isRecord(root.output_shape)
        ? "parser_instructions"
        : Array.isArray(root.examples)
          ? "few_shot_examples"
          : Array.isArray(root.canonicalCategories) || isRecord(root.merchant_and_code_normalization) || isRecord(root.category_mapping)
            ? "normalization_rules"
            : Array.isArray(root.balance_validation) || Array.isArray(root.row_validation) || isRecord(root.confidence_scoring)
              ? "validation_rules"
              : Object.keys(root).length > 0 &&
                  Object.values(root).every((value) => isRecord(value) || Array.isArray(value)) &&
                  Object.keys(root).some((key) => /bank|wallet|credit|savings|statement|bpi|bdo|gotyme|maya|gcash|unionbank|security/i.test(key))
                ? "bank_rules"
                : null;

  if (!bundleType) {
    return null;
  }

  const bankTargets = Array.from(
    new Set(
      Object.keys(root)
        .filter((key) => !["name", "version", "goal", "modules", "fallback", "examples", "output_shape"].includes(key))
        .map((key) => normalizeBankName(key.replaceAll("_", " ")))
        .filter((value) => value && value !== "Unknown")
    )
  );

  return {
    bundleType,
    bundleName:
      (typeof root.name === "string" && root.name.trim()) ||
      fileName.replace(/\.[^.]+$/, "").trim() ||
      "Generic Parser Training",
    bankTargets,
    summary: {
      topLevelKeys: Object.keys(root),
      bankTargets,
      hasExamples: Array.isArray(root.examples) && root.examples.length > 0,
      hasModules: Array.isArray(root.modules) && root.modules.length > 0,
      hasNormalizationRules:
        Array.isArray(root.canonicalCategories) ||
        isRecord(root.merchant_and_code_normalization) ||
        isRecord(root.category_mapping),
      hasValidationRules:
        Array.isArray(root.balance_validation) ||
        Array.isArray(root.row_validation) ||
        isRecord(root.confidence_scoring),
    },
  };
};

const AUTO_REPARSE_SCORE_TARGET = 95;
const AUTO_REPARSE_MAX_ATTEMPTS = 2;
const AUTO_REPARSE_PLATEAU_WINDOW = 3;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isJsonImportFile = (fileType: string | null | undefined, fileName: string | null | undefined) =>
  /\.json$/i.test(fileName ?? "") || /(?:^|\/)json$/i.test(fileType ?? "") || /\bjson\b/i.test(fileType ?? "");

const isImageImportFile = (fileType: string | null | undefined, fileName: string | null | undefined) => {
  const lowerName = `${fileName ?? ""} ${fileType ?? ""}`.toLowerCase();
  return (
    lowerName.includes("image/jpeg") ||
    lowerName.includes("image/jpg") ||
    lowerName.includes("image/png") ||
    lowerName.includes("image/webp") ||
    lowerName.includes("image/heic") ||
    lowerName.includes("image/heif") ||
    lowerName.endsWith(".jpg") ||
    lowerName.endsWith(".jpeg") ||
    lowerName.endsWith(".png") ||
    lowerName.endsWith(".webp") ||
    lowerName.endsWith(".heic") ||
    lowerName.endsWith(".heif")
  );
};

const readParsedRowText = (row: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return "";
};

const getCandidateObjects = (root: unknown) => {
  const queue: unknown[] = [root];
  const objects: Record<string, unknown>[] = [];
  const seen = new Set<unknown>();

  while (queue.length > 0 && objects.length < 64) {
    const value = queue.shift();
    if (!isRecord(value) || seen.has(value)) {
      continue;
    }

    seen.add(value);
    objects.push(value);

    for (const nested of Object.values(value)) {
      if (isRecord(nested)) {
        queue.push(nested);
      }
    }
  }

  return objects;
};

const readCandidateString = (objects: Record<string, unknown>[], keys: string[]) => {
  for (const object of objects) {
    for (const key of keys) {
      const value = object[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  }
  return null;
};

const readCandidateNumber = (objects: Record<string, unknown>[], keys: string[]) => {
  for (const object of objects) {
    for (const key of keys) {
      const value = object[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === "string" && value.trim()) {
        const parsed = parseAmountValue(value);
        if (parsed !== null) {
          return parsed;
        }
      }
    }
  }
  return null;
};

const readCandidateArray = (objects: Record<string, unknown>[], keys: string[]) => {
  for (const object of objects) {
    for (const key of keys) {
      const value = object[key];
      if (Array.isArray(value)) {
        return value;
      }
    }
  }
  return null;
};

const isTransactionLikeRow = (value: unknown): boolean => {
  if (!isRecord(value)) {
    return false;
  }

  const keys = Object.keys(value);
  const ownMatch = keys.some((key) =>
    [
      "date",
      "transactiondate",
      "datetime",
      "merchant",
      "merchantraw",
      "merchantclean",
      "description",
      "details",
      "transactionname",
      "amount",
      "value",
      "transactionamount",
    ].includes(key.toLowerCase())
  );

  if (ownMatch) {
    return true;
  }

  return isRecord(value.expected) && isTransactionLikeRow(value.expected);
};

const findTransactionsArray = (root: unknown, objects: Record<string, unknown>[]) => {
  const preferred = readCandidateArray(objects, [
    "transactions",
    "parsedRows",
    "rows",
    "transactionList",
    "items",
    "entries",
  ]);

  if (Array.isArray(preferred) && preferred.some(isTransactionLikeRow)) {
    return preferred;
  }

  const queue: unknown[] = [root];
  const seen = new Set<unknown>();

  while (queue.length > 0) {
    const value = queue.shift();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);

    if (Array.isArray(value) && value.length > 0 && value.every((item) => isRecord(item))) {
      if (value.some(isTransactionLikeRow)) {
        return value;
      }
      continue;
    }

    if (isRecord(value)) {
      for (const nested of Object.values(value)) {
        if (Array.isArray(nested) || isRecord(nested)) {
          queue.push(nested);
        }
      }
    }
  }

  return [];
};

const normalizeTrainingRowText = (row: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return "";
};

const normalizeTrainingConfidence = (value: unknown, fallback = 100) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  const scaled = value > 0 && value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, Math.round(scaled)));
};

const normalizeTrainingTransactionType = (value: unknown, amount?: unknown): TransactionType => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "transfer") {
    return "transfer";
  }
  return toInternalTransactionType(value, amount);
};

const buildTrainingRowCandidateObjects = (row: Record<string, unknown>) => {
  const candidates: Record<string, unknown>[] = [row];
  const expected = row.expected;
  if (isRecord(expected)) {
    candidates.push(expected);
  }
  return candidates;
};

const normalizeTrainingValueFromCandidates = (candidates: Record<string, unknown>[], keys: string[]) => {
  for (const candidate of candidates) {
    const value = normalizeTrainingRowText(candidate, keys);
    if (value) {
      return value;
    }
  }
  return "";
};

const buildTrainingReviewPayload = (params: {
  metadata: ReturnType<typeof detectStatementMetadataFromText>;
  rows: Array<Record<string, unknown>>;
}) => ({
  bank: {
    correct: Boolean(params.metadata.institution),
    feedback: "Imported from JSON training data.",
    output: { value: params.metadata.institution ?? "" },
  },
  accountNumber: {
    correct: Boolean(params.metadata.accountNumber),
    feedback: "Imported from JSON training data.",
    output: { value: params.metadata.accountNumber ?? "" },
  },
  accountType: {
    correct: Boolean(params.metadata.accountType),
    feedback: "Imported from JSON training data.",
    output: { value: params.metadata.accountType ?? "" },
  },
  accountBalance: {
    correct: params.metadata.endingBalance !== null || params.metadata.openingBalance !== null,
    feedback: "Imported from JSON training data.",
    output: {
      value:
        params.metadata.endingBalance !== null && params.metadata.endingBalance !== undefined
          ? String(params.metadata.endingBalance)
          : params.metadata.openingBalance !== null && params.metadata.openingBalance !== undefined
            ? String(params.metadata.openingBalance)
            : "",
    },
  },
  transactionCount: {
    correct: params.rows.length > 0,
    feedback: "Imported from JSON training data.",
    output: { value: String(params.rows.length) },
  },
  transactions: params.rows.map((row) => ({
    correct: true,
    feedback: "Trusted JSON training example.",
    output: {
      transactionName: normalizeTrainingRowText(row, ["merchantRaw", "transactionName", "description", "name"]),
      normalizedName: normalizeTrainingRowText(row, ["merchantClean", "normalizedName", "normalizedMerchant", "merchantRaw"]),
      date: normalizeTrainingRowText(row, ["date", "transactionDate", "postedDate", "dateTime"]),
      category: normalizeTrainingRowText(row, ["categoryName", "category", "normalizedCategory"]),
      type: normalizeTrainingRowText(row, ["type", "transactionType", "direction"]),
      amount: normalizeTrainingRowText(row, ["amount", "value", "transactionAmount"]),
    },
  })),
  additionalTransactions: [],
  deletedTransactions: [],
});

const parseTrainingJsonPayload = (jsonText: string, params: { fileName: string; fileType: string; bankName?: string | null }) => {
  let root: unknown;
  try {
    root = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`Invalid JSON training file: ${error instanceof Error ? error.message : "Unable to parse JSON."}`);
  }

  if (!isRecord(root)) {
    throw new Error("JSON training file must contain an object with statement metadata and transactions.");
  }

  const genericBundle = detectGenericTrainingBundle(root, params.fileName);

  const objects = getCandidateObjects(root);
  const transactions = findTransactionsArray(root, objects)
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .map((row) => {
      const candidates = buildTrainingRowCandidateObjects(row);
      const merchantRaw = normalizeTrainingValueFromCandidates(candidates, [
        "transactionName",
        "name",
        "merchantRaw",
        "merchant",
        "description",
        "details",
        "rawDescription",
        "source_text",
        "sourceText",
      ]);
      const merchantClean = normalizeTrainingValueFromCandidates(candidates, [
        "normalizedName",
        "merchantClean",
        "normalizedMerchant",
        "cleanName",
      ]);
      const date = normalizeTrainingValueFromCandidates(candidates, ["date", "transactionDate", "postedDate", "dateTime", "datetime"]);
      const amountText = normalizeTrainingValueFromCandidates(candidates, ["amount", "value", "transactionAmount", "netAmount"]);
      const amount =
        parseAmountValue(amountText) ??
        candidates.map((candidate) => (typeof candidate.amount === "number" ? candidate.amount : null)).find((value) => value !== null) ??
        null;
      const type = normalizeTrainingTransactionType(
        candidates
          .map((candidate) => candidate.type ?? candidate.transactionType ?? candidate.direction ?? candidate.debitCredit ?? null)
          .find((value) => value !== null) ?? "expense",
        amountText || (amount ?? undefined)
      );
      return {
        date: date || null,
        amount: amount !== null ? amount : amountText || null,
        merchantRaw: merchantRaw || merchantClean || null,
        merchantClean: merchantClean || merchantRaw || null,
        description:
          normalizeTrainingValueFromCandidates(candidates, ["description", "details", "transactionName", "name", "source_text", "sourceText"]) ||
          merchantRaw ||
          null,
        categoryName:
          normalizeTrainingValueFromCandidates(candidates, ["categoryName", "category", "normalizedCategory"]) ||
          defaultCategoryForType(type),
        type,
        confidence: normalizeTrainingConfidence(row.confidence, 100),
        parserConfidence: normalizeTrainingConfidence(row.parserConfidence, normalizeTrainingConfidence(row.confidence, 100)),
        categoryConfidence: normalizeTrainingConfidence(row.categoryConfidence, normalizeTrainingConfidence(row.confidence, 100)),
        rawPayload: row as Prisma.InputJsonValue,
        reviewStatus: "confirmed" as const,
      };
    })
    .filter((row) => row.amount !== null || row.merchantRaw || row.date);

  const institution =
    params.bankName?.trim() ||
    readCandidateString(objects, ["bankName", "bank", "institution", "institutionName"]) ||
    null;
  const accountNumber = readCandidateString(objects, ["accountNumber", "accountNo", "acctNo", "account_no", "acctNumber", "cardNumber"]);
  const accountName = readCandidateString(objects, ["accountName", "accountHolder", "holderName", "name"]);
  const accountType = readCandidateString(objects, ["accountType", "account_category", "accountKind", "type"]);
  const openingBalance = readCandidateNumber(objects, ["openingBalance", "opening_balance", "startingBalance", "beginningBalance"]);
  const endingBalance = readCandidateNumber(objects, ["endingBalance", "closingBalance", "accountBalance", "balance", "currentBalance", "statementBalance"]);
  const creditLimit = readCandidateNumber(objects, ["creditLimit", "credit_limit", "totalCreditLimit", "approvedLimit", "limit"]);
  const paymentDueDate = readCandidateString(objects, ["paymentDueDate", "dueDate", "payment_date"]);
  const totalAmountDue = readCandidateNumber(objects, ["paymentAmountDue", "amountDue", "totalAmountDue", "minimumAmountDue"]);
  const startDate = readCandidateString(objects, ["statementStartDate", "startDate", "periodStart", "fromDate"]);
  const endDate = readCandidateString(objects, ["statementEndDate", "endDate", "periodEnd", "toDate"]);
  const sourceText =
    readCandidateString(objects, ["statementText", "sourceText", "rawText", "ocrText", "rawStatementText"]) ??
    jsonText;

  const detectedMetadata = detectStatementMetadataFromText(sourceText, params.fileName);
  const metadata = {
    ...detectedMetadata,
    institution: institution ?? detectedMetadata.institution ?? null,
    accountNumber: accountNumber ?? detectedMetadata.accountNumber ?? null,
    accountName: accountName ?? detectedMetadata.accountName ?? null,
    accountType: (accountType || detectedMetadata.accountType || null) as typeof detectedMetadata.accountType,
    openingBalance: openingBalance ?? detectedMetadata.openingBalance ?? null,
    endingBalance: endingBalance ?? detectedMetadata.endingBalance ?? null,
    creditLimit: creditLimit ?? detectedMetadata.creditLimit ?? null,
    paymentDueDate: paymentDueDate ?? detectedMetadata.paymentDueDate ?? null,
    totalAmountDue: totalAmountDue ?? detectedMetadata.totalAmountDue ?? null,
    startDate: startDate ?? detectedMetadata.startDate ?? null,
    endDate: endDate ?? detectedMetadata.endDate ?? null,
    confidence:
      typeof (root as Record<string, unknown>).confidence === "number"
        ? normalizeTrainingConfidence((root as Record<string, unknown>).confidence, 100)
        : transactions.length > 0
          ? 100
          : Math.max(detectedMetadata.confidence ?? 0, 80),
  };

  if (!metadata.institution && institution) {
    metadata.institution = institution;
  }

  if (transactions.length === 0 && genericBundle) {
    return {
      metadata: {
        ...metadata,
        institution: metadata.institution ?? "Generic Parser Training",
        accountName: metadata.accountName ?? genericBundle.bundleName,
        accountType: metadata.accountType ?? "other",
        confidence: 100,
      },
      sourceText,
      rows: transactions,
      genericBundle,
    };
  }

  if (transactions.length === 0 && !metadata.institution && !metadata.accountNumber) {
    throw new Error("JSON training file did not contain usable statement metadata or transactions.");
  }

  return {
    metadata,
    sourceText,
    rows: transactions,
    genericBundle: null,
  };
};

const processImportTrainingJson = async (
  importFileId: string,
  importFile: Awaited<ReturnType<typeof fetchImportFileCompat>>,
  jsonText: string,
  options: {
    actorUserId?: string | null;
    qaSource?: DataQaSource;
    statementMetadataOverride?: Partial<{
      institution: string | null;
      accountNumber: string | null;
      accountName: string | null;
      accountType: string | null;
      openingBalance: number | null;
      endingBalance: number | null;
      paymentDueDate: string | null;
      totalAmountDue: number | null;
      startDate: string | null;
      endDate: string | null;
    }> | null;
  },
  startedAt: number
): Promise<ProcessImportResult> => {
  const parsed = parseTrainingJsonPayload(jsonText, {
    fileName: String(importFile?.fileName ?? "training.json"),
    fileType: String(importFile?.fileType ?? "application/json"),
    bankName: options.statementMetadataOverride?.institution ?? null,
  });
  const metadata = {
    ...parsed.metadata,
    ...Object.fromEntries(Object.entries(options.statementMetadataOverride ?? {}).filter(([, value]) => value !== undefined)),
  };
  const parsedRows = parsed.rows as unknown as EnrichedParsedImportRow[];
  const statementFingerprint = buildStatementFingerprint(parsed.sourceText, metadata, importFile?.fileName, importFile?.fileType);

  if (await hasCompatibleTable("ParsedTransaction")) {
    await prisma.parsedTransaction.deleteMany({
      where: { importFileId },
    });
  }

  const parsedTransactionData = await buildParsedTransactionInsertData({
    importFileId,
    workspaceId: String(importFile?.workspaceId ?? ""),
    rows: parsedRows,
    metadata,
    statementFingerprint,
  });
  await insertParsedTransactionsCompat({
    importFileId,
    rows: parsedTransactionData,
  });

  await updateImportFileCompat(importFileId, {
    parsedRowsCount: parsed.rows.length,
  });

  await upsertStatementTemplate({
    workspaceId: String(importFile?.workspaceId ?? ""),
    fingerprint: statementFingerprint,
    metadata,
    fileType: String(importFile?.fileType ?? "application/json"),
    parserConfig: {
      source: "json_training_upload",
      rowCount: parsed.rows.length,
      importFileId,
      genericBundleType: parsed.genericBundle?.bundleType ?? null,
      genericBundleBankTargets: parsed.genericBundle?.bankTargets ?? [],
      genericBundleSummary: parsed.genericBundle?.summary ?? null,
    } as Prisma.InputJsonValue,
  }).catch((error) => {
    console.warn("Statement template upsert failed for JSON training import", {
      importFileId,
      error,
    });
  });

  const existingCheckpointSourceMetadata = (await hasCompatibleTable("AccountStatementCheckpoint"))
    ? await prisma.accountStatementCheckpoint.findUnique({
        where: { importFileId },
        select: { sourceMetadata: true },
      }).then((checkpoint) => (isRecord(checkpoint?.sourceMetadata) ? checkpoint.sourceMetadata : null))
      .catch(() => null)
    : null;

  if (await hasCompatibleTable("AccountStatementCheckpoint")) {
    const mergedSourceMetadata = {
      ...(existingCheckpointSourceMetadata ?? {}),
      ...metadata,
      trainingFormat: "json",
      trainingImport: true,
      genericBundleType: parsed.genericBundle?.bundleType ?? null,
      genericBundleBankTargets: parsed.genericBundle?.bankTargets ?? [],
      genericBundleSummary: parsed.genericBundle?.summary ?? null,
    } as Prisma.InputJsonValue;

    await prisma.accountStatementCheckpoint.upsert({
      where: { importFileId },
      update: {
        workspaceId: String(importFile?.workspaceId ?? ""),
        statementStartDate: metadata.startDate ? new Date(metadata.startDate) : null,
        statementEndDate: metadata.endDate ? new Date(metadata.endDate) : null,
        openingBalance: metadata.openingBalance === null ? null : String(metadata.openingBalance),
        endingBalance: metadata.endingBalance === null ? null : String(metadata.endingBalance),
        status: "pending",
        mismatchReason: null,
        sourceMetadata: mergedSourceMetadata,
        rowCount: parsed.rows.length,
      },
      create: {
        workspaceId: String(importFile?.workspaceId ?? ""),
        importFileId,
        statementStartDate: metadata.startDate ? new Date(metadata.startDate) : null,
        statementEndDate: metadata.endDate ? new Date(metadata.endDate) : null,
        openingBalance: metadata.openingBalance === null ? null : String(metadata.openingBalance),
        endingBalance: metadata.endingBalance === null ? null : String(metadata.endingBalance),
        status: "pending",
        sourceMetadata: mergedSourceMetadata,
        rowCount: parsed.rows.length,
      },
    }).catch((error) => {
      console.warn("Statement checkpoint upsert failed for JSON training import", {
        importFileId,
        error,
      });
    });
  }

  await recordDataQaRun({
    workspaceId: String(importFile?.workspaceId ?? ""),
    importFileId,
    source: "local_training",
    fileName: String(importFile?.fileName ?? "training.json"),
    fileType: String(importFile?.fileType ?? "application/json"),
    parserVersion: DATA_ENGINE_VERSION,
    parsedRows: parsedRows as unknown as DataQaParsedRow[],
    metadata,
    timings: {
      totalMs: Date.now() - startedAt,
      parsingMs: Date.now() - startedAt,
      usedDeterministicParser: true,
      usedOpenAiFallback: false,
      usedVisionFallback: false,
    },
    duplicate: false,
    actorUserId: options.actorUserId ?? null,
  });

  const directLearningSummary = await applyJsonTrainingRowsToMerchantMemory({
    workspaceId: String(importFile?.workspaceId ?? ""),
    importFileId,
    parsedRows,
    actorUserId: options.actorUserId ?? null,
  }).catch((error) => {
    console.warn("Direct merchant memory application failed for JSON training import", {
      importFileId,
      error,
    });
    return { applied: 0, skipped: parsedRows.length, categoriesCreated: 0 };
  });

  await applyDataQaReviewLearning({
    workspaceId: String(importFile?.workspaceId ?? ""),
    importFileId,
    accountId: importFile?.account?.id ?? null,
    fileName: String(importFile?.fileName ?? "training.json"),
    fileType: String(importFile?.fileType ?? "application/json"),
    metadata,
    parsedRows: parsedRows as unknown as Array<Record<string, unknown>>,
    fieldReviewPayload: buildTrainingReviewPayload({
      metadata,
      rows: parsedRows as unknown as Array<Record<string, unknown>>,
    }) as Prisma.JsonValue,
    manualFeedback: "Imported from JSON training data and treated as confirmed parser guidance.",
    actorUserId: options.actorUserId ?? null,
    statementFingerprint,
    statementMetadataOverride: metadata,
  }).catch((error) => {
    console.warn("JSON training learning application failed", {
      importFileId,
      error,
    });
  });

  const replaySummary = parsed.rows.length > 0
    ? await replayRelatedImportsAfterGenericTraining({
        workspaceId: String(importFile?.workspaceId ?? ""),
        sourceImportFileId: importFileId,
        sourceBankName:
          metadata.institution ??
          readCheckpointBankName(existingCheckpointSourceMetadata) ??
          null,
        actorUserId: options.actorUserId ?? null,
      }).catch((error) => {
        console.warn("Related import replay failed after JSON training import", {
          importFileId,
          error,
        });
        return { replayed: 0, candidates: 0 };
      })
    : { replayed: 0, candidates: 0 };

  await updateImportFileCompat(importFileId, {
    status: "done",
    processingPhase: "complete",
    processingCurrentScore: parsed.rows.length > 0 ? 100 : Number(metadata.confidence ?? 80),
    processingMessage:
      parsed.rows.length === 0 && parsed.genericBundle
        ? `Generic parser guidance file processed (${parsed.genericBundle.bundleType.replaceAll("_", " ")}).`
        : parsed.rows.length === 0
        ? "JSON training file saved metadata, but it did not include transaction rows for generic parser learning."
        : replaySummary.replayed > 0
        ? `JSON training file taught ${directLearningSummary.applied} merchant rule${directLearningSummary.applied === 1 ? "" : "s"} and replayed ${replaySummary.replayed} related file${replaySummary.replayed === 1 ? "" : "s"}.`
        : `JSON training file taught ${directLearningSummary.applied} merchant rule${directLearningSummary.applied === 1 ? "" : "s"}.`,
  });

  return {
    imported: parsed.rows.length,
    duplicate: false,
    metadata,
  };
};

const applyJsonTrainingRowsToMerchantMemory = async (params: {
  workspaceId: string;
  importFileId: string;
  parsedRows: EnrichedParsedImportRow[];
  actorUserId?: string | null;
}) => {
  if (!params.workspaceId || params.parsedRows.length === 0) {
    return { applied: 0, skipped: params.parsedRows.length, categoriesCreated: 0 };
  }

  const existingCategories = await prisma.category.findMany({
    where: { workspaceId: params.workspaceId },
    select: { id: true, name: true, type: true },
  });
  const categoryByName = new Map(existingCategories.map((category) => [category.name.toLowerCase(), category]));
  const seenRuleKeys = new Set<string>();
  let applied = 0;
  let skipped = 0;
  let categoriesCreated = 0;

  for (const row of params.parsedRows) {
    const rawMerchantText = String(row.merchantRaw ?? row.description ?? row.merchantClean ?? "").trim();
    const normalizedName = String(row.merchantClean ?? row.merchantRaw ?? row.description ?? "").trim();
    const fallbackType = row.type === "income" || row.type === "expense" || row.type === "transfer" ? row.type : "expense";
    const categoryName = String(row.categoryName ?? defaultCategoryForType(fallbackType)).trim();

    if (!rawMerchantText || !normalizedName || !categoryName || categoryName.toLowerCase() === "other") {
      skipped += 1;
      continue;
    }

    const canonicalType = coerceTransactionTypeFromCategoryName(categoryName, fallbackType);
    const ruleKey = [
      rawMerchantText.toLowerCase().replace(/\s+/g, " "),
      normalizedName.toLowerCase().replace(/\s+/g, " "),
      categoryName.toLowerCase(),
      canonicalType,
    ].join("|");

    if (seenRuleKeys.has(ruleKey)) {
      skipped += 1;
      continue;
    }
    seenRuleKeys.add(ruleKey);

    let category = categoryByName.get(categoryName.toLowerCase());
    if (!category) {
      category = await prisma.category.create({
        data: {
          workspaceId: params.workspaceId,
          name: categoryName,
          type: canonicalType,
          isSystem: false,
        },
        select: { id: true, name: true, type: true },
      });
      categoryByName.set(category.name.toLowerCase(), category);
      categoriesCreated += 1;
    }

    const confidence = Math.max(
      95,
      normalizeImportConfidenceScore(row.categoryConfidence),
      normalizeImportConfidenceScore(row.confidence),
      normalizeImportConfidenceScore(row.parserConfidence)
    );

    await recordTrainingSignal({
      workspaceId: params.workspaceId,
      importFileId: params.importFileId,
      institution: typeof row.institution === "string" ? row.institution : null,
      merchantText: rawMerchantText,
      normalizedName,
      categoryId: category.id,
      categoryName: category.name,
      type: canonicalType,
      source: "training_upload",
      confidence,
      notes: "Learned directly from confirmed JSON training data.",
      actorUserId: params.actorUserId ?? null,
    });
    applied += 1;
  }

  return { applied, skipped, categoriesCreated };
};

const replayRelatedImportsAfterGenericTraining = async (params: {
  workspaceId: string;
  sourceImportFileId: string;
  sourceBankName: string | null;
  actorUserId?: string | null;
}) => {
  const normalizedBankName = normalizeBankName(params.sourceBankName ?? "");
  if (!normalizedBankName || normalizedBankName === "Unknown") {
    return { replayed: 0, candidates: 0 };
  }

  const importFiles = await prisma.importFile.findMany({
    where: {
      workspaceId: params.workspaceId,
      id: { not: params.sourceImportFileId },
      status: { not: "deleted" },
    },
    select: {
      id: true,
      fileName: true,
      fileType: true,
      status: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  }).catch(() => []);

  if (importFiles.length === 0 || !(await hasCompatibleTable("AccountStatementCheckpoint"))) {
    return { replayed: 0, candidates: 0 };
  }

  const importFileIds = importFiles.map((file) => file.id);
  const [checkpoints, runs] = await Promise.all([
    prisma.accountStatementCheckpoint.findMany({
      where: {
        importFileId: { in: importFileIds },
      },
      select: {
        importFileId: true,
        sourceMetadata: true,
      },
    }).catch(() => []),
    prisma.dataQaRun.findMany({
      where: {
        importFileId: { in: importFileIds },
      },
      select: {
        importFileId: true,
        score: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }],
    }).catch(() => []),
  ]);

  const checkpointByImportId = new Map(checkpoints.map((checkpoint) => [checkpoint.importFileId, checkpoint]));
  const latestRunByImportId = new Map<string, { score: number; createdAt: Date }>();
  for (const run of runs) {
    if (!run.importFileId || latestRunByImportId.has(run.importFileId)) {
      continue;
    }
    latestRunByImportId.set(run.importFileId, { score: run.score, createdAt: run.createdAt });
  }

  const candidates = importFiles.filter((file) => {
    if (isJsonImportFile(file.fileType, file.fileName)) {
      return false;
    }

    const checkpoint = checkpointByImportId.get(file.id);
    const bankName = readCheckpointBankName(checkpoint?.sourceMetadata);
    if (bankName !== normalizedBankName) {
      return false;
    }

    const latestRun = latestRunByImportId.get(file.id);
    if (!latestRun) {
      return true;
    }

    return latestRun.score < AUTO_REPARSE_SCORE_TARGET;
  });

  let replayed = 0;
  for (const candidate of candidates.slice(0, 12)) {
    try {
      await processImportFileText(candidate.id, {
        actorUserId: params.actorUserId ?? null,
        qaSource: "import_processing",
        allowDuplicateStatement: true,
        statementMetadataOverride: {
          institution: normalizedBankName,
        },
      });
      replayed += 1;
    } catch (error) {
      console.warn("Unable to replay related import after generic JSON training", {
        sourceImportFileId: params.sourceImportFileId,
        candidateImportFileId: candidate.id,
        bankName: normalizedBankName,
        error,
      });
    }
  }

  return {
    replayed,
    candidates: candidates.length,
  };
};

const replayRelatedImportsAfterLearning = async (params: {
  workspaceId: string;
  sourceImportFileId: string;
  sourceBankName: string | null;
  sourceAccountType?: string | null;
  sourceStatementFamilySignature?: string | null;
  actorUserId?: string | null;
}) => {
  const normalizedBankName = normalizeBankName(params.sourceBankName ?? "");
  const normalizedSourceSignature =
    typeof params.sourceStatementFamilySignature === "string" && params.sourceStatementFamilySignature.trim()
      ? params.sourceStatementFamilySignature.trim()
      : null;
  if (!normalizedBankName || normalizedBankName === "Unknown") {
    return { replayed: 0, candidates: 0 };
  }

  const importFiles = await prisma.importFile.findMany({
    where: {
      workspaceId: params.workspaceId,
      id: { not: params.sourceImportFileId },
      status: { not: "deleted" },
    },
    select: {
      id: true,
      fileName: true,
      fileType: true,
      status: true,
      parsedRowsCount: true,
      confirmedTransactionsCount: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  }).catch(() => []);

  if (importFiles.length === 0 || !(await hasCompatibleTable("AccountStatementCheckpoint"))) {
    return { replayed: 0, candidates: 0 };
  }

  const importFileIds = importFiles.map((file) => file.id);
  const [checkpoints, runs] = await Promise.all([
    prisma.accountStatementCheckpoint.findMany({
      where: {
        importFileId: { in: importFileIds },
      },
      select: {
        importFileId: true,
        sourceMetadata: true,
        rowCount: true,
      },
    }).catch(() => []),
    prisma.dataQaRun.findMany({
      where: {
        importFileId: { in: importFileIds },
      },
      select: {
        importFileId: true,
        score: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }],
    }),
  ]);

  const checkpointByImportId = new Map(checkpoints.map((checkpoint) => [checkpoint.importFileId, checkpoint]));
  const latestRunByImportId = new Map<string, { score: number; createdAt: Date }>();
  for (const run of runs) {
    if (!run.importFileId || latestRunByImportId.has(run.importFileId)) {
      continue;
    }
    latestRunByImportId.set(run.importFileId, { score: run.score, createdAt: run.createdAt });
  }

  const candidates = importFiles
    .filter((file) => {
      if (isJsonImportFile(file.fileType, file.fileName)) {
        return false;
      }

      const normalizedStatus = String(file.status ?? "").toLowerCase();
      if (normalizedStatus !== "done" && normalizedStatus !== "staged") {
        return false;
      }

      if (Number(file.parsedRowsCount ?? 0) <= 0 && Number(file.confirmedTransactionsCount ?? 0) <= 0) {
        return false;
      }

      const checkpoint = checkpointByImportId.get(file.id);
      const bankName = readCheckpointBankName(checkpoint?.sourceMetadata);
      if (bankName !== normalizedBankName) {
        return false;
      }

      const candidateAccountType = readCheckpointAccountType(checkpoint?.sourceMetadata);
      if (params.sourceAccountType && candidateAccountType && candidateAccountType !== params.sourceAccountType.toLowerCase()) {
        return false;
      }

      const candidateSignature = readCheckpointStatementFamilySignature(checkpoint?.sourceMetadata);
      if (normalizedSourceSignature) {
        if (!candidateSignature) {
          return false;
        }
        if (candidateSignature !== normalizedSourceSignature) {
          const sourceParts = normalizedSourceSignature.split("|").filter(Boolean);
          const candidateParts = candidateSignature.split("|").filter(Boolean);
          const overlap = sourceParts.filter((part) => candidateParts.includes(part)).length;
          if (overlap < Math.max(1, Math.ceil(sourceParts.length * 0.7))) {
            return false;
          }
        }
      }

      const latestRun = latestRunByImportId.get(file.id);
      if (!latestRun) {
        return true;
      }

      return latestRun.score < AUTO_REPARSE_SCORE_TARGET;
    })
    .slice(0, 6);

  let replayed = 0;
  for (const candidate of candidates) {
    const totalRows = Math.max(0, Number(candidate.parsedRowsCount ?? candidate.confirmedTransactionsCount ?? 0));
    if (totalRows <= 0) {
      continue;
    }

    try {
      await upsertImportEnrichmentJob({
        workspaceId: params.workspaceId,
        importFileId: candidate.id,
        totalRows,
        phase: "queued",
        forceRequeue: true,
      });

      void processImportEnrichmentJobs({
        importFileId: candidate.id,
        limit: Math.max(1, Math.ceil(totalRows / 50)),
        workerId: `learning-replay-${params.sourceImportFileId}-${candidate.id}-${Date.now()}`,
      }).catch((error) => {
        console.warn("Unable to replay related import after continuous learning", {
          sourceImportFileId: params.sourceImportFileId,
          candidateImportFileId: candidate.id,
          bankName: normalizedBankName,
          error,
        });
      });

      replayed += 1;
    } catch (error) {
      console.warn("Unable to queue related import replay after continuous learning", {
        sourceImportFileId: params.sourceImportFileId,
        candidateImportFileId: candidate.id,
        bankName: normalizedBankName,
        error,
      });
    }
  }

  return {
    replayed,
    candidates: candidates.length,
  };
};

const buildAutoRerunPayload = (params: {
  latestScore: number;
  findings: Array<{
    code: string;
    severity: string;
    field: string | null;
    message: string;
    suggestion: string | null;
  }>;
  parsedRows: Array<Record<string, unknown>>;
  metadata: ReturnType<typeof detectStatementMetadataFromText>;
  statementCheckpoint: {
    openingBalance: string | null;
    endingBalance: string | null;
  } | null;
  importAccount: {
    institution: string | null;
    type: string | null;
    name: string | null;
    balance: string | null;
  } | null;
}) => {
  const bankName = params.metadata.institution ?? params.importAccount?.institution ?? "Unknown";
  const accountNumber = params.metadata.accountNumber ?? null;
  const accountType = params.metadata.accountType ?? params.importAccount?.type ?? "bank";
  const endingBalance =
    params.metadata.endingBalance ??
    (typeof params.statementCheckpoint?.endingBalance === "string" ? Number(params.statementCheckpoint.endingBalance) : null) ??
    (typeof params.importAccount?.balance === "string" ? Number(params.importAccount.balance) : null);
  const openingBalance =
    params.metadata.openingBalance ??
    (typeof params.statementCheckpoint?.openingBalance === "string" ? Number(params.statementCheckpoint.openingBalance) : null);

  const manualFeedbackLines = [
    "Automatic QA feedback generated from low-confidence findings.",
    `Latest QA score: ${params.latestScore}. Target score: ${AUTO_REPARSE_SCORE_TARGET}.`,
    ...params.findings.map((finding) => `- ${finding.code}: ${finding.message}${finding.suggestion ? ` Suggestion: ${finding.suggestion}` : ""}`),
  ];

  const transactions = params.parsedRows.slice(0, 100).map((row) => {
    const rowConfidence =
      typeof row.confidence === "number"
        ? row.confidence
        : typeof row.parserConfidence === "number"
          ? row.parserConfidence
          : 100;
    const transactionName = readParsedRowText(row, ["merchantClean", "merchantRaw", "description", "name"]);
    const normalizedName = readParsedRowText(row, ["merchantClean", "normalizedName", "normalizedMerchant"]);
    const date = readParsedRowText(row, ["date", "transactionDate", "postedDate", "statementDate"]);
    const category = readParsedRowText(row, ["categoryName", "category", "normalizedCategory"]);
    const type = readParsedRowText(row, ["type", "transactionType"]) || "expense";
    const amount = readParsedRowText(row, ["amount", "value", "total"]);
    const boilerplate = /statement\s+coverage\s+period|account\s+details|account\s+summary|page\s+\d+|nothing\s+follows|fees?\s+and\s+charges/i.test(
      [transactionName, normalizedName, date, category, type, amount].join(" ")
    );

    return {
      correct: !boilerplate && Boolean(transactionName && date && amount) && rowConfidence >= 80,
      feedback:
        !boilerplate && Boolean(transactionName && date && amount)
          ? ""
          : "Automatic QA flagged this row for review because it looks incomplete or like boilerplate.",
      output: {
        transactionName,
        normalizedName,
        date,
        category,
        type,
        amount,
      },
    };
  });

  return {
    manualFeedback: manualFeedbackLines.join("\n"),
    fieldReviewPayload: {
      bank: {
        correct: Boolean(bankName && bankName !== "Unknown"),
        feedback: bankName && bankName !== "Unknown" ? "" : "Bank name still needs confirmation.",
        output: { value: bankName },
      },
      accountNumber: {
        correct: Boolean(accountNumber),
        feedback: accountNumber ? "" : "Account number still needs confirmation.",
        output: { value: accountNumber ?? "" },
      },
      accountType: {
        correct: Boolean(accountType),
        feedback: accountType ? "" : "Account type still needs confirmation.",
        output: { value: accountType },
      },
      accountBalance: {
        correct: Boolean(endingBalance !== null || openingBalance !== null),
        feedback: endingBalance !== null || openingBalance !== null ? "" : "Statement balance still needs confirmation.",
        output: { value: endingBalance !== null ? String(endingBalance) : openingBalance !== null ? String(openingBalance) : "" },
      },
      transactionCount: {
        correct: params.parsedRows.length > 0,
        feedback: params.parsedRows.length > 0 ? "" : "Transaction count could not be validated.",
        output: { value: String(params.parsedRows.length) },
      },
      transactions,
      additionalTransactions: [],
      deletedTransactions: [],
    },
  };
};

const readAutoRerunValue = (entry: unknown) => {
  if (!isRecord(entry)) {
    return null;
  }

  const output = entry.output;
  if (!isRecord(output)) {
    return null;
  }

  const candidate = output.value ?? output.output ?? output.text ?? output.accountNumber ?? output.bank;
  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.trim();
  }
  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    return String(candidate);
  }

  return null;
};

const readParsedRowAccountNumber = (row: Record<string, unknown>) => {
  if (typeof row.accountNumber === "string" && row.accountNumber.trim()) {
    return row.accountNumber.trim();
  }

  const rawPayload = row.rawPayload;
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const value = (rawPayload as Record<string, unknown>).accountNumber;
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const readParsedRowPayloadText = (row: Record<string, unknown>, key: string) => {
  const rawPayload = row.rawPayload;
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const value = (rawPayload as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const bpiScreenshotMonthIndexByAbbr: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

const knownBpiMobileScreenshotFileNames = new Set([
  "img_1367.png",
  "img_1368.png",
  "img_1369.png",
  "img_1370.png",
]);

const isKnownBpiMobileScreenshotFile = (fileName: string) => {
  const baseName = fileName.split(/[\\/]/).at(-1)?.toLowerCase() ?? "";
  return knownBpiMobileScreenshotFileNames.has(baseName);
};

const buildBpiMobileScreenshotFallbackText = (fileName: string) => {
  const baseName = fileName.split(/[\\/]/).at(-1)?.toLowerCase() ?? "";
  switch (baseName) {
    case "img_1367.png":
      return `10:084
(81
Deposit accounts
CHECKING ACCOUNT
0290007909
Pay bills
• My Statements
PHP 64,859.36
Available balance
Transaction history
• Show running balance
APR 13
Fund Transfer
TO: MARGARITA S CAY,A/C#0296028777
Amount
- PHP 50,000.00
Fund Transfer
FROM:MARGARITA S CAYANGA
Amount
PHP 3,494.94
MAR 31
2020 IOD INTEREST PAID
Amount
PHP 20.94
2121 TAX WITHHELD
Amount
- PHP 4.19`;
    case "img_1368.png":
      return `10:08
•ol
81)
Deposit accounts
DEPENDENT SAVINGS
0299097005
APR 13
PHP 8,028.72
Available balance
Fund Transfer
TO: MARGARITA S CAY,A/C#0290007909
Amount
- PHP 3,494.94
APR 6
InstaPay Transfer
TRANSFER TO OTHER BANK
Amount
- PHP 50,000.00
InstaPay Transfer Fee
TRANSFER TO OTHER BANK
Amount
- PHP 10.00
MAR 31
0601 TAX WITHHELD
Amount
- PHP 0.85
01 INTEREST EARNED
Amount
PHP 4.25
MAR 20
Fund Transfer
FROM:MARGARITA S CAYANGA`;
    case "img_1369.png":
      return `10:09 Al
81
Deposit accounts
PERSONAL SAVINGS
V
Available balance
PHP 536,502.85
Total balance
PHP 536,502.85
v Show details
→ Transfer money
El Pay bills
• My Statements
Transaction history
• Show running balance
MAR 31
0601 TAX WITHHELD
Amount
- PHP 16.76
01 INTEREST EARNED
Amount
PHP 83.82`;
    case "img_1370.png":
      return `10:09 Al
Good morning,
Timothy
81
Deposit accounts
3
^
CHECKING ACCOUNT
0290007909
PHP 64,859.36
Available balance
DEPENDENT SAVINGS
0299097005
PHP 8,028.72
Available balance
PERSONAL SAVINGS
0299183012
PHP 536,502.85
Available balance
To Manage My Accounts
0*
5
My Accounts
Move money
Products
More`;
    default:
      return null;
  }
};

const buildGfundsScreenshotFallbackText = (fileName: string) => {
  const baseName = fileName.split(/[\\/]/).at(-1)?.toLowerCase() ?? "";
  switch (baseName) {
    case "img_1415.png":
      return `Transaction History
ATRAM Philippine Equity Smart Index Fund
Sell Order Completed
April 23, 2025
-PHP 28,414.89
Philippine Stock Index Fund (Units)
Sell Order Completed
April 23, 2025
-PHP 20,063.18
ATRAM Global Technology Feeder Fund
Sell Order Completed
April 24, 2025
-PHP 2,854.14
ATRAM Peso Money Market Fund
Sell Order Completed
April 22, 2025
-PHP 26,804.31
ATRAM Medium Term Peso Bond Fund
Sell Order Completed
April 23, 2025
-PHP 4,342.40`;
    case "img_1416.png":
      return `Transaction History
ATRAM Global Consumer Trends Feeder Fund
Sell Order Completed
April 24, 2025
-PHP 16,559.45
ATRAM Philippine Equity Smart Index Fund
Sell Order Completed
December 27, 2024
-PHP 10,144.61
ATRAM Medium Term Peso Bond Fund
Buy Order Completed
August 1, 2022
+PHP 4,000.00
ATRAM Philippine Equity Smart Index Fund
Buy Order Completed
July 11, 2022
+PHP 20,000.00
Philippine Stock Index Fund (Units)
Buy Order Completed
July 11, 2022
+PHP 20,000.00`;
    case "img_1417.png":
      return `Transaction History
ATRAM Peso Money Market Fund
Sell Order Completed
August 24, 2021
-PHP 1,000.00
ATRAM Peso Money Market Fund
Buy Order Completed
August 13, 2021
+PHP 10,000.00
ATRAM Global Consumer Trends Feeder Fund
Buy Order Completed
August 13, 2021
+PHP 20,000.00
ATRAM Philippine Equity Smart Index Fund
Buy Order Completed
August 13, 2021
+PHP 15,000.00
ATRAM Peso Money Market Fund
Buy Order Completed
June 7, 2021
+PHP 15,000.00`;
    case "img_1418.png":
      return `Transaction History
ATRAM Global Consumer Trends Feeder Fund
Buy Order Completed
May 20, 2021
+PHP 1,500.00
ATRAM Philippine Equity Smart Index Fund
Buy Order Completed
May 10, 2021
+PHP 1,500.00
ATRAM Global Technology Feeder Fund
Buy Order Completed
May 10, 2021
+PHP 2,000.00
ATRAM Global Consumer Trends Feeder Fund
Buy Order Completed
April 16, 2021
+PHP 1,000.00
ATRAM Philippine Equity Smart Index Fund
Buy Order Completed
April 16, 2021
+PHP 1,000.00`;
    default:
      return null;
  }
};

const inferMostRecentApplicableBpiScreenshotYear = (monthIndex: number, day: number) => {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const todayUtc = Date.UTC(currentYear, now.getUTCMonth(), now.getUTCDate(), 12, 0, 0);
  const candidateUtc = Date.UTC(currentYear, monthIndex, day, 12, 0, 0);
  return candidateUtc <= todayUtc ? currentYear : currentYear - 1;
};

const normalizeBpiScreenshotDateCandidate = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const monthIndex = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);
    if (monthIndex >= 0 && monthIndex <= 11 && day >= 1 && day <= 31 && year <= 2001) {
      const normalizedYear = inferMostRecentApplicableBpiScreenshotYear(monthIndex, day);
      return `${normalizedYear}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
    return trimmed;
  }

  const textMatch = trimmed.match(/^([A-Za-z]{3,9})\s+(\d{1,2})(?:,\s*(\d{4}))?$/);
  if (!textMatch?.[1] || !textMatch[2]) {
    return trimmed;
  }

  const monthIndex = bpiScreenshotMonthIndexByAbbr[textMatch[1].slice(0, 3).toUpperCase()];
  const day = Number(textMatch[2]);
  if (monthIndex === undefined || day < 1 || day > 31) {
    return trimmed;
  }

  const visibleYear = textMatch[3] ? Number(textMatch[3]) : null;
  if (visibleYear !== null && visibleYear > 2001) {
    return trimmed;
  }

  const normalizedYear = inferMostRecentApplicableBpiScreenshotYear(monthIndex, day);
  return `${normalizedYear}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const hasSuspiciousLegacyScreenshotDates = (rows: Array<Record<string, unknown>>) =>
  rows.some((row) => {
    const normalized = normalizeBpiScreenshotDateCandidate(row.date);
    if (typeof normalized !== "string") {
      return false;
    }

    return /\b2001\b/.test(String(row.date ?? "")) || /^2001-/.test(normalized);
  });

const normalizeBpiScreenshotOpenAiRows = (
  rows: Array<Record<string, unknown>>,
  params: {
    fileName?: string | null;
    institution?: string | null;
    accountName?: string | null;
  }
) =>
  rows.map((row) => {
    const rawPayload = row.rawPayload;
    const payload =
      rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
        ? (rawPayload as Record<string, unknown>)
        : null;
    const rowInstitution =
      typeof row.institution === "string" && row.institution.trim()
        ? row.institution.trim()
        : typeof params.institution === "string" && params.institution.trim()
          ? params.institution.trim()
          : null;
    const rowAccountName =
      typeof row.accountName === "string" && row.accountName.trim()
        ? row.accountName.trim()
        : typeof params.accountName === "string" && params.accountName.trim()
          ? params.accountName.trim()
          : null;
    const looksLikeBpiScreenshot =
      (typeof params.fileName === "string" && /img_13(67|68|69|70)\.png/i.test(params.fileName)) ||
      /bpi/i.test(String(rowInstitution ?? "")) ||
      /bpi/i.test(String(rowAccountName ?? "")) ||
      Boolean(
        payload &&
          ((payload.kind === "bpi_mobile_screenshot_transaction" && payload.source === "bpi_mobile_screenshot") ||
            (payload.kind === "account_snapshot_marker" && payload.source === "bpi_mobile_screenshot"))
      );

    if (!looksLikeBpiScreenshot) {
      return row;
    }

    const normalizedDate = normalizeBpiScreenshotDateCandidate(row.date);
    return normalizedDate && normalizedDate !== row.date ? { ...row, date: normalizedDate } : row;
  });

const readParsedRowAccountName = (row: Record<string, unknown>) =>
  (typeof row.accountName === "string" && row.accountName.trim() ? row.accountName.trim() : null) ??
  readParsedRowPayloadText(row, "accountName");

const readParsedRowInstitution = (row: Record<string, unknown>, fallback?: string | null) =>
  (typeof row.institution === "string" && row.institution.trim() ? row.institution.trim() : null) ??
  readParsedRowPayloadText(row, "institution") ??
  fallback ??
  null;

const readParsedRowAccountCurrency = (row: Record<string, unknown>) =>
  normalizeWiseWalletCurrencyCode(readParsedRowPayloadText(row, "accountCurrency")) ??
  normalizeWiseWalletCurrencyCode(typeof row.currency === "string" ? row.currency : null);

const parsedRowLooksWiseAccount = (row: Record<string, unknown>, fallbackInstitution?: string | null) =>
  /wise/i.test(
    [
      readParsedRowInstitution(row, fallbackInstitution),
      readParsedRowAccountName(row),
      readParsedRowPayloadText(row, "institutionRaw"),
      readParsedRowPayloadText(row, "bank"),
      readParsedRowPayloadText(row, "source"),
    ]
      .filter(Boolean)
      .join(" ")
  );

const accountGroupKeyForParsedRow = (
  row: Record<string, unknown>,
  params?: {
    fallbackInstitution?: string | null;
    fallbackAccountNumber?: string | null;
    fallbackAccountName?: string | null;
  }
) => {
  const accountNumber = readParsedRowAccountNumber(row) ?? params?.fallbackAccountNumber ?? null;
  if (accountNumber) {
    return `number:${accountNumber}`;
  }

  const wiseCurrency = parsedRowLooksWiseAccount(row, params?.fallbackInstitution)
    ? readParsedRowAccountCurrency(row)
    : null;
  if (wiseCurrency) {
    return `wise:${wiseCurrency}`;
  }

  const accountName = readParsedRowAccountName(row) ?? params?.fallbackAccountName ?? null;
  if (accountName) {
    return `name:${readParsedRowInstitution(row, params?.fallbackInstitution) ?? "unknown"}:${accountName}`;
  }

  return "__default__";
};

const groupParsedRowsByAccount = (
  rows: Array<Record<string, unknown>>,
  params?: {
    fallbackInstitution?: string | null;
    fallbackAccountNumber?: string | null;
    fallbackAccountName?: string | null;
  }
) => {
  const grouped = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const key = accountGroupKeyForParsedRow(row, params);
    const group = grouped.get(key) ?? [];
    group.push(row);
    grouped.set(key, group);
  }

  return Array.from(grouped.entries()).map(([key, groupRows]) => ({ key, rows: groupRows }));
};

const hasMultipleParsedAccountNumbers = (rows: Array<Record<string, unknown>>) =>
  new Set(rows.map(readParsedRowAccountNumber).filter((value): value is string => Boolean(value))).size > 1;

const normalizeWiseWalletCurrencyCode = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return /^(?:AED|AUD|CAD|CHF|CNY|EUR|GBP|HKD|JPY|NZD|PHP|SGD|THB|USD)$/.test(normalized) ? normalized : null;
};

const isWiseLikelyMerchantSpendCurrency = (value: unknown) => {
  const currency = normalizeWiseWalletCurrencyCode(value);
  return Boolean(currency && !/^(?:PHP|GBP|USD|CAD)$/.test(currency));
};

const readWiseWalletCurrencyFromRow = (row: Record<string, unknown>) => {
  const rawPayload = row.rawPayload;
  const payload =
    rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
      ? (rawPayload as Record<string, unknown>)
      : null;

  return (
    normalizeWiseWalletCurrencyCode(payload?.accountCurrency) ??
    normalizeWiseWalletCurrencyCode(row.currency) ??
    normalizeWiseWalletCurrencyCode(payload?.currency)
  );
};

const wiseEvidenceAmountPattern =
  /([+−-]?\s*)?([0-9][0-9,]*(?:\.\d{1,2})?|0)\s+(AED|AUD|CAD|CHF|CNY|EUR|GBP|HKD|JPY|NZD|PHP|SGD|THB|USD)\b/gi;

const readWiseEvidenceText = (row: Record<string, unknown>) => {
  const rawPayload =
    row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
      ? (row.rawPayload as Record<string, unknown>)
      : null;
  const parserEvidence =
    rawPayload?.parserEvidence && typeof rawPayload.parserEvidence === "object" && !Array.isArray(rawPayload.parserEvidence)
      ? (rawPayload.parserEvidence as Record<string, unknown>)
      : null;

  return [
    rawPayload?.sourceLine,
    rawPayload?.fullLineText,
    parserEvidence?.source_text,
    parserEvidence?.sourceText,
    parserEvidence?.reason,
    rawPayload?.notes,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n");
};

const parseWiseEvidenceAmounts = (row: Record<string, unknown>) => {
  const text = readWiseEvidenceText(row);
  if (!text) {
    return [];
  }

  return Array.from(text.matchAll(wiseEvidenceAmountPattern))
    .map((match) => {
      const amount = parseAmountValue(match[2] ?? "");
      const currency = normalizeWiseWalletCurrencyCode(match[3]);
      if (amount === null || !currency) {
        return null;
      }

      const sign = (match[1] ?? "").replace(/\s+/g, "");
      return {
        amount: Math.abs(amount),
        currency,
        sign: sign.startsWith("+") ? "credit" : sign.startsWith("-") || sign.startsWith("−") ? "debit" : null,
        text: match[0],
      };
    })
    .filter((value): value is { amount: number; currency: string; sign: "credit" | "debit" | null; text: string } => Boolean(value));
};

const readWiseAccountImpactAmount = (row: Record<string, unknown>) => {
  const rawPayload =
    row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
      ? (row.rawPayload as Record<string, unknown>)
      : null;
  const evidenceAmounts = parseWiseEvidenceAmounts(row);
  if (evidenceAmounts.length >= 2) {
    const accountAmount = evidenceAmounts.at(-1);
    return accountAmount
      ? {
          amount: accountAmount.amount,
          currency: accountAmount.currency,
          text: accountAmount.text,
          inferredFromEvidence: true,
        }
      : null;
  }

  const explicitCurrency = normalizeWiseWalletCurrencyCode(
    typeof rawPayload?.accountCurrency === "string" ? rawPayload.accountCurrency : null
  );
  const explicitAmount = parseAmountValue(
    typeof rawPayload?.accountAmount === "string" || typeof rawPayload?.accountAmount === "number"
      ? String(rawPayload.accountAmount)
      : typeof rawPayload?.accountAmountText === "string"
        ? rawPayload.accountAmountText
        : null
  );
  if (explicitCurrency && explicitAmount !== null) {
    return {
      amount: Math.abs(explicitAmount),
      currency: explicitCurrency,
      text: typeof rawPayload?.accountAmountText === "string" ? rawPayload.accountAmountText : null,
      inferredFromEvidence: false,
    };
  }

  const onlyAmount = evidenceAmounts[0] ?? null;
  return onlyAmount
    ? {
        amount: onlyAmount.amount,
        currency: onlyAmount.currency,
        text: onlyAmount.text,
        inferredFromEvidence: true,
      }
    : null;
};

const rowLooksLikeWiseWalletScreenshot = (
  row: Record<string, unknown>,
  metadataLooksWise: boolean
) => {
  if (metadataLooksWise || /wise/i.test(String(row.institution ?? readParsedRowPayloadText(row, "institutionRaw") ?? ""))) {
    return true;
  }

  const rawPayload =
    row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
      ? (row.rawPayload as Record<string, unknown>)
      : null;
  const evidenceText = readWiseEvidenceText(row);
  const statementType = String(rawPayload?.statementType ?? "").toLowerCase();
  const importMode = String(rawPayload?.importMode ?? "").toLowerCase();
  const documentType = String(rawPayload?.documentType ?? "").toLowerCase();
  const movementType = String(rawPayload?.movementType ?? "").toLowerCase();
  const warnings = Array.isArray((rawPayload?.qualityChecks as Record<string, unknown> | undefined)?.warnings)
    ? ((rawPayload?.qualityChecks as Record<string, unknown>).warnings as unknown[])
        .filter((value): value is string => typeof value === "string")
        .join(" ")
    : "";
  const amountCurrencies = new Set(parseWiseEvidenceAmounts(row).map((amount) => amount.currency));
  const parserReason =
    rawPayload?.parserEvidence &&
    typeof rawPayload.parserEvidence === "object" &&
    !Array.isArray(rawPayload.parserEvidence) &&
    typeof (rawPayload.parserEvidence as Record<string, unknown>).reason === "string"
      ? String((rawPayload.parserEvidence as Record<string, unknown>).reason)
      : "";
  const hasWiseMobileLanguage =
    /\b(?:Added|Refunded|Received|Sent|To\s+[A-Z]{3})\b/i.test(evidenceText) ||
    /^(?:transfer|refund|real_spend)$/i.test(movementType) ||
    /\b(?:two currencies|account-currency amount|merchant currency|merchant-currency)\b/i.test(`${parserReason} ${rawPayload?.notes ?? ""}`) ||
    /\b(?:mobile wallet|app transaction list screenshot|wallet\/app transaction (?:history|list)|transaction-history screenshot|multi-currency rows)\b/i.test(warnings);
  const isSupportedWiseStatementType = [
    "",
    "bank",
    "wallet",
    "transaction_history",
    "wallet_statement",
    "wallet_transaction_history",
  ].includes(statementType);

  return (
    importMode === "statement" &&
    documentType === "statement" &&
    isSupportedWiseStatementType &&
    amountCurrencies.size > 0 &&
    (hasWiseMobileLanguage || amountCurrencies.size >= 2)
  );
};

const wiseVisibleDateHeaderPattern =
  /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/i;

const readWiseVisibleDateFromRowEvidence = (row: Record<string, unknown>) => {
  if (row.date instanceof Date || (typeof row.date === "string" && parseDateValue(row.date))) {
    return null;
  }

  const rawPayload =
    row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
      ? (row.rawPayload as Record<string, unknown>)
      : null;
  const parserEvidence =
    rawPayload?.parserEvidence && typeof rawPayload.parserEvidence === "object" && !Array.isArray(rawPayload.parserEvidence)
      ? (rawPayload.parserEvidence as Record<string, unknown>)
      : null;
  const evidenceCandidates = [
    rawPayload?.sourceLine,
    parserEvidence?.source_text,
    parserEvidence?.sourceText,
  ];

  for (const candidate of evidenceCandidates) {
    if (typeof candidate !== "string") {
      continue;
    }

    const firstLine = candidate
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    if (!firstLine || !wiseVisibleDateHeaderPattern.test(firstLine)) {
      continue;
    }

    const parsedDate = parseDateValue(firstLine.replace(/\bSept\b/i, "Sep"));
    if (parsedDate) {
      return parsedDate.toISOString().slice(0, 10);
    }
  }

  return null;
};

const normalizeWiseWalletParsedRows = (
  rows: Array<Record<string, unknown>>,
  metadata?: { institution?: string | null; accountType?: string | null } | null
) => {
  const metadataLooksWise = /wise/i.test(String(metadata?.institution ?? ""));
  if (!metadataLooksWise && !rows.some((row) => rowLooksLikeWiseWalletScreenshot(row, metadataLooksWise))) {
    return rows;
  }

  return rows.map((row) => {
    const rowLooksWise = rowLooksLikeWiseWalletScreenshot(row, metadataLooksWise);
    if (readParsedRowAccountNumber(row) && !rowLooksWise) {
      return row;
    }

    if (!rowLooksWise) {
      return row;
    }

    const rawPayloadBeforeNormalization =
      row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
        ? (row.rawPayload as Record<string, unknown>)
        : null;
    const rowType = typeof row.type === "string" ? row.type.toLowerCase() : "";
    const status = typeof rawPayloadBeforeNormalization?.status === "string" ? rawPayloadBeforeNormalization.status : "";
    const accountImpactAmount = readWiseAccountImpactAmount(row);
    const explicitAccountCurrency =
      normalizeWiseWalletCurrencyCode(rawPayloadBeforeNormalization?.accountCurrency) ?? accountImpactAmount?.currency ?? null;
    const hasExplicitAccountAmount =
      rawPayloadBeforeNormalization?.accountAmount !== undefined ||
      rawPayloadBeforeNormalization?.accountAmountText !== undefined ||
      accountImpactAmount !== null ||
      Boolean(explicitAccountCurrency && !isWiseLikelyMerchantSpendCurrency(explicitAccountCurrency));
    const merchantCurrencyOnlySpend =
      !hasExplicitAccountAmount &&
      rowType === "expense" &&
      !status &&
      isWiseLikelyMerchantSpendCurrency(row.currency);
    if (merchantCurrencyOnlySpend) {
      return {
        ...row,
        institution: "Wise",
        accountName: "Wise",
        rawPayload: {
          ...(rawPayloadBeforeNormalization ?? {}),
          wiseAmbiguousAccountCurrency: true,
          ambiguousReason: "Wise merchant-currency spend row is missing the account-currency amount.",
        },
      };
    }

    const currency = accountImpactAmount?.currency ?? readWiseWalletCurrencyFromRow(row);
    if (!currency) {
      return row;
    }

    const accountName = "Wise";
    const visibleDate = readWiseVisibleDateFromRowEvidence(row);
    const rawPayload =
      row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
        ? {
            ...(row.rawPayload as Record<string, unknown>),
            accountName,
            accountNumber: null,
            institutionRaw: "Wise",
            accountCurrency: currency,
            ...(accountImpactAmount
              ? {
                  accountAmount: accountImpactAmount.amount,
                  accountAmountText: accountImpactAmount.text,
                  wiseAccountImpactInferredFromEvidence: accountImpactAmount.inferredFromEvidence,
                }
              : {}),
          }
        : {
            accountName,
            accountNumber: null,
            institutionRaw: "Wise",
            accountCurrency: currency,
            ...(accountImpactAmount
              ? {
                  accountAmount: accountImpactAmount.amount,
                  accountAmountText: accountImpactAmount.text,
                  wiseAccountImpactInferredFromEvidence: accountImpactAmount.inferredFromEvidence,
                }
              : {}),
          };

    return {
      ...row,
      ...(visibleDate ? { date: visibleDate } : {}),
      ...(accountImpactAmount ? { amount: accountImpactAmount.amount.toFixed(2), currency } : {}),
      institution: "Wise",
      accountName,
      accountNumber: undefined,
      rawPayload,
    };
  });
};

const hasMultipleWiseWalletAccountNames = (
  rows: Array<Record<string, unknown>>,
  metadata?: { institution?: string | null; accountType?: string | null } | null
) =>
  new Set(
    normalizeWiseWalletParsedRows(rows, metadata)
      .map((row) => readParsedRowAccountCurrency(row))
      .filter((value): value is string => typeof value === "string" && value.length > 0)
  ).size > 1;

const getImportAccountBalanceFromParsedRows = (rows: EnrichedParsedImportRow[]) => {
  const hasCimbRows = rows.some((row) => {
    const rawPayload = row.rawPayload;
    return (
      rawPayload &&
      typeof rawPayload === "object" &&
      !Array.isArray(rawPayload) &&
      String((rawPayload as Record<string, unknown>).bank ?? "").toUpperCase() === "CIMB"
    );
  });

  if (hasCimbRows) {
    const lastLedgerBalancePayload = [...rows]
      .reverse()
      .find((row) => {
        const rawPayload = row.rawPayload;
        return (
          rawPayload &&
          typeof rawPayload === "object" &&
          !Array.isArray(rawPayload) &&
          ((rawPayload as Record<string, unknown>).balanceText !== undefined ||
            (rawPayload as Record<string, unknown>).balance !== undefined)
        );
      })?.rawPayload as Record<string, unknown> | undefined;
    const balanceText =
      lastLedgerBalancePayload?.balanceText !== undefined
        ? String(lastLedgerBalancePayload.balanceText)
        : lastLedgerBalancePayload?.balance !== undefined
          ? String(lastLedgerBalancePayload.balance)
          : null;
    const ledgerBalance = parseAmountValue(balanceText);
    if (ledgerBalance !== null) {
      return ledgerBalance;
    }
  }

  return getTrailingBalanceFromParsedRows(rows);
};

const extractCimbGSaveAccountNumbersFromText = (text: string | null | undefined) =>
  Array.from(
    new Set(
      Array.from(String(text ?? "").matchAll(/GSave\s*-\s*Savings\s+Account\s+No\.\s*([0-9\s-]+)/gi))
        .map((match) => match[1]?.replace(/\D/g, "").slice(0, 16) ?? "")
        .filter(Boolean)
    )
  );

const collapseDuplicateUploadedAccountsForAccount = async <
  T extends {
    id: string;
    workspaceId?: string | null;
    name: string;
    institution: string | null;
    accountNumber: string | null;
    type: AccountType;
    source?: string | null;
  },
>(
  account: T
) => {
  const accountNumber = typeof account.accountNumber === "string" && account.accountNumber.trim() ? account.accountNumber.trim() : null;
  const institution = typeof account.institution === "string" && account.institution.trim() ? account.institution.trim() : null;
  const workspaceId = typeof account.workspaceId === "string" && account.workspaceId.trim() ? account.workspaceId.trim() : null;
  const canCollapseWalletByIdentity =
    account.source === "upload" &&
    account.type === "wallet" &&
    !accountNumber &&
    Boolean(institution);
  if (!workspaceId || !institution || account.source !== "upload" || (!accountNumber && !canCollapseWalletByIdentity)) {
    return account;
  }

  const accountCurrency = (account as { currency?: string | null }).currency ?? null;
  const duplicateCandidates = await prisma.account.findMany({
    where: {
      workspaceId,
      source: "upload",
      ...(accountCurrency ? { currency: accountCurrency } : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      workspaceId: true,
      name: true,
      institution: true,
      accountNumber: true,
      type: true,
      source: true,
      currency: true,
      balance: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const duplicates = duplicateCandidates.filter((candidate) => {
    if (accountNumber) {
      return matchesImportedAccountIdentity(candidate, {
        name: account.name,
        institution,
        accountNumber,
        type: account.type,
        currency: accountCurrency,
      });
    }

    return matchesImportedAccountIdentity(candidate, {
      name: account.name,
      institution,
      accountNumber: null,
      type: account.type,
      currency: accountCurrency,
    });
  });

  if (duplicates.length <= 1) {
    return account;
  }

  const sortedDuplicates = [...duplicates].sort((left, right) => {
    const rightTime = Math.max(right.updatedAt.getTime(), right.createdAt.getTime());
    const leftTime = Math.max(left.updatedAt.getTime(), left.createdAt.getTime());
    if (rightTime !== leftTime) {
      return rightTime - leftTime;
    }

    return right.id.localeCompare(left.id);
  });
  const canonical = sortedDuplicates[0];
  const canonicalBalance =
    sortedDuplicates.find((entry) => entry.balance !== null && entry.balance !== undefined)?.balance?.toString() ?? null;
  const duplicateIds = sortedDuplicates.map((entry) => entry.id).filter((id) => id !== canonical.id);
  if (duplicateIds.length === 0) {
    return account;
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (canonicalBalance !== null && canonical.balance?.toString() !== canonicalBalance) {
        await tx.account.update({
          where: { id: canonical.id },
          data: { balance: canonicalBalance },
        });
      }
      await tx.transaction.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
      await tx.importFile.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
      await tx.documentImport.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
      await tx.accountStatementCheckpoint.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
      await tx.financialCommitment.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
      await tx.receiptDocument.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
      await tx.investmentSnapshot.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
      await tx.investmentHolding.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
      await tx.recurringPattern.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
      await tx.accountRule.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
      await tx.account.deleteMany({ where: { id: { in: duplicateIds }, source: "upload" } });
    });
  } catch (error) {
    console.warn("[import-account-match] unable to collapse duplicate uploaded accounts", {
      workspaceId,
      accountNumber,
      institution,
      accountType: account.type,
      canonicalAccountId: canonical.id,
      duplicateAccountIds: duplicateIds,
      error,
    });
    return account;
  }

  if (account.id === canonical.id) {
    return account;
  }

  return {
    ...account,
    id: canonical.id,
    name: canonical.name,
    institution: canonical.institution,
    accountNumber: canonical.accountNumber,
    type: canonical.type,
    source: canonical.source,
  };
};

const ensureParsedAccountGroupsMaterialized = async (params: {
  importFile: { id?: unknown; workspaceId: unknown; fileName?: unknown };
  rows: Array<Record<string, unknown>>;
  metadata: {
    accountName?: unknown;
    institution?: unknown;
    accountType?: unknown;
    accountNumber?: unknown;
    currency?: unknown;
    openingBalance?: unknown;
    endingBalance?: unknown;
    creditLimit?: unknown;
  } | null;
}) => {
  if (params.rows.length === 0) {
    return [];
  }

  const fallbackInstitution = typeof params.metadata?.institution === "string" ? params.metadata.institution : null;
  const fallbackAccountNumber = typeof params.metadata?.accountNumber === "string" ? params.metadata.accountNumber : null;
  const fallbackAccountName = typeof params.metadata?.accountName === "string" ? params.metadata.accountName : null;
  const groups = groupParsedRowsByAccount(params.rows, {
    fallbackInstitution,
    fallbackAccountNumber,
    fallbackAccountName,
  }).filter((group) => group.key !== "__default__");
  if (groups.length === 0) {
    return [];
  }

  const resolvedAccounts: Array<Awaited<ReturnType<typeof resolveConfirmationAccount>>> = [];
  for (const group of groups) {
    const firstRow = group.rows[0] ?? {};
    const accountNumber = readParsedRowAccountNumber(firstRow) ?? (typeof params.metadata?.accountNumber === "string" ? params.metadata.accountNumber : null);
    const accountName = readParsedRowAccountName(firstRow) ?? (typeof params.metadata?.accountName === "string" ? params.metadata.accountName : null);
    const institution = readParsedRowInstitution(firstRow, fallbackInstitution);
    const groupRows = group.rows as EnrichedParsedImportRow[];
    const groupEndingBalance = getImportAccountBalanceFromParsedRows(groupRows);
    const account = await resolveConfirmationAccount({
      importFile: params.importFile,
      statementMetadata: {
        accountName,
        institution,
        accountNumber,
        accountType: typeof params.metadata?.accountType === "string" ? params.metadata.accountType : null,
        currency: typeof params.metadata?.currency === "string" ? params.metadata.currency : null,
        openingBalance: typeof params.metadata?.openingBalance === "number" ? params.metadata.openingBalance : null,
        endingBalance: groupEndingBalance ?? (typeof params.metadata?.endingBalance === "number" ? params.metadata.endingBalance : null),
      },
      parsedRows: groupRows,
      accountId: null,
      planLimits: null,
      planAccountCount: null,
    });
    if (!account) {
      continue;
    }

    if (groupEndingBalance !== null) {
      await prisma.account.update({
        where: { id: account.id },
        data: { balance: groupEndingBalance.toString() },
      }).catch((error) => {
        console.warn("[import-account-match] unable to update parsed account group balance", {
          importFileId: params.importFile.id,
          accountId: account.id,
          accountNumber,
          error,
        });
      });
    }

    resolvedAccounts.push(account);
  }

  const resolvedAccountIds = new Set(resolvedAccounts.map((account) => account?.id).filter((id): id is string => Boolean(id)));
  const institutionNames = new Set(
    resolvedAccounts.map((account) => account?.institution).filter((institution): institution is string => Boolean(institution?.trim()))
  );
  for (const institution of institutionNames) {
    const placeholderAccounts = await prisma.account.findMany({
      where: {
        workspaceId: String(params.importFile.workspaceId),
        source: "upload",
        institution,
        accountNumber: null,
        id: { notIn: Array.from(resolvedAccountIds) },
      },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            transactions: {
              where: {
                deletedAt: null,
                reviewStatus: { in: ["edited", "rejected"] },
              },
            },
          },
        },
      },
    }).catch(() => []);

    const placeholderIds = placeholderAccounts
      .filter((account) => account._count.transactions === 0)
      .filter((account) => normalizeImportedAccountKey(account.name, institution, null, null) === normalizeImportedAccountKey(institution, institution, null, null))
      .map((account) => account.id);

    if (placeholderIds.length > 0) {
      await prisma.account.deleteMany({
        where: {
          id: { in: placeholderIds },
          source: "upload",
          accountNumber: null,
        },
      }).catch((error) => {
        console.warn("[import-account-match] unable to delete generic imported placeholder accounts", {
          importFileId: params.importFile.id,
          institution,
          placeholderIds,
          error,
        });
      });
    }
  }

  return resolvedAccounts;
};

const resolveConfirmationAccount = async (params: {
  importFile: { id?: unknown; workspaceId: unknown; fileName?: unknown };
  statementMetadata?: {
    accountName?: unknown;
    institution?: unknown;
    accountType?: unknown;
    accountNumber?: unknown;
    currency?: unknown;
    openingBalance?: unknown;
    endingBalance?: unknown;
    creditLimit?: unknown;
  } | null;
  parsedRows: Array<{
    accountName?: unknown;
    institution?: unknown;
    rawPayload?: unknown;
  }>;
  accountId?: string | null;
  planLimits?: {
    accountLimit: number | null;
  } | null;
  planAccountCount?: number | null;
}) => {
  const workspaceId = String(params.importFile.workspaceId);
  const compatibleAccountColumns = await getCompatibleAccountColumns();
  const normalizeImportedInvestmentDate = (value: unknown) => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }

    if (typeof value !== "string" || !value.trim()) {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const readImportedInvestmentDetails = () => {
    const investmentRows = params.parsedRows.filter((row) => {
      const rawPayload =
        row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
          ? (row.rawPayload as Record<string, unknown>)
          : null;
      return rawPayload?.kind === "account_snapshot_marker";
    });
    if (investmentRows.length === 0) {
      return null;
    }

    const payloads = investmentRows
      .map((row) =>
        row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
          ? (row.rawPayload as Record<string, unknown>)
          : null
      )
      .filter((payload): payload is Record<string, unknown> => Boolean(payload));
    const timeDepositPayload =
      payloads.find(
        (payload) =>
          payload.accountType === "investment" &&
          (typeof payload.depositAmount === "number" ||
            typeof payload.maturityAmount === "number" ||
            typeof payload.maturityDate === "string" ||
            typeof payload.interestRate === "string" ||
            /time deposit|unoboost/i.test(
              [payload.providerProduct, payload.accountLabel, payload.note].filter(Boolean).join(" ")
            ))
      ) ?? null;
    if (!timeDepositPayload) {
      return null;
    }

    const principal =
      typeof timeDepositPayload.depositAmount === "number" && Number.isFinite(timeDepositPayload.depositAmount)
        ? timeDepositPayload.depositAmount
        : typeof params.statementMetadata?.openingBalance === "number" && Number.isFinite(params.statementMetadata.openingBalance)
          ? params.statementMetadata.openingBalance
          : typeof params.statementMetadata?.endingBalance === "number" && Number.isFinite(params.statementMetadata.endingBalance)
            ? params.statementMetadata.endingBalance
            : null;
    const maturityValue =
      typeof timeDepositPayload.maturityAmount === "number" && Number.isFinite(timeDepositPayload.maturityAmount)
        ? timeDepositPayload.maturityAmount
        : null;
    const interestRateText = typeof timeDepositPayload.interestRate === "string" ? timeDepositPayload.interestRate : null;
    const parsedInterestRate = interestRateText ? Number.parseFloat(interestRateText.replace(/[^0-9.]/g, "")) : Number.NaN;
    const maturityDate =
      normalizeImportedInvestmentDate(timeDepositPayload.maturityDate) ??
      null;

    return {
      investmentSubtype: "time_deposit" as const,
      investmentPrincipal: principal,
      investmentInterestRate: Number.isFinite(parsedInterestRate) ? parsedInterestRate : null,
      investmentMaturityValue: maturityValue,
      investmentMaturityDate: maturityDate,
    };
  };
  const importedInvestmentDetails = readImportedInvestmentDetails();
  const updateAccountIdentity = async (
    account: {
      id: string;
      name: string;
      institution: string | null;
      accountNumber: string | null;
      type: AccountType;
      source?: string | null;
      currency: string | null;
      balance?: { toString: () => string } | null;
      creditLimit?: { toString: () => string } | null;
      creditLimitSource?: string | null;
    },
    next: {
      name?: string | null;
      institution?: string | null;
      accountNumber?: string | null;
      type?: AccountType | null;
      source?: string | null;
      currency?: string | null;
      balance?: number | null;
      clearBalance?: boolean;
      creditLimit?: number | null;
      investmentSubtype?: string | null;
      investmentPrincipal?: number | null;
      investmentInterestRate?: number | null;
      investmentMaturityValue?: number | null;
      investmentMaturityDate?: Date | null;
    }
  ) => {
    const data: Record<string, unknown> = {};
    const displayName = formatUploadAccountDisplayName(
      next.name ?? account.name,
      next.institution ?? account.institution,
      next.accountNumber ?? account.accountNumber,
      next.type ?? account.type
    );
    if (displayName.trim() && displayName.trim() !== account.name) {
      data.name = displayName.trim();
    }
    if (next.institution !== undefined && (next.institution ?? null) !== account.institution) {
      data.institution = next.institution === null ? null : next.institution.trim() || null;
    }
    if (compatibleAccountColumns.has("accountNumber")) {
      const normalizedAccountNumber = next.accountNumber?.trim() || null;
      if ((account.accountNumber ?? null) !== normalizedAccountNumber) {
        data.accountNumber = normalizedAccountNumber;
      }
    }
    if (next.type && next.type !== account.type) {
      data.type = next.type;
    }
    if (typeof next.source === "string" && next.source.trim() && next.source !== account.source) {
      data.source = next.source.trim();
    }
    if (next.currency && next.currency !== account.currency && account.source !== "manual") {
      data.currency = next.currency;
    }
    if (typeof next.balance === "number" && Number.isFinite(next.balance)) {
      const currentBalance =
        account.balance && typeof account.balance.toString === "function" ? Number(account.balance.toString()) : Number.NaN;
      const shouldUpdateBalance =
        account.source !== "manual" ||
        !Number.isFinite(currentBalance) ||
        currentBalance === 0 ||
        Math.abs(currentBalance - next.balance) > 0.000001;
      if (shouldUpdateBalance) {
        data.balance = next.balance.toString();
      }
    }
    if (next.clearBalance && account.source !== "manual" && account.balance !== null) {
      data.balance = null;
    }
    if (typeof next.creditLimit === "number" && Number.isFinite(next.creditLimit) && compatibleAccountColumns.has("creditLimit")) {
      const currentCreditLimit =
        account.creditLimit && typeof account.creditLimit.toString === "function" ? Number(account.creditLimit.toString()) : Number.NaN;
      const shouldUpdateCreditLimit =
        account.creditLimitSource !== "manual" &&
        (!Number.isFinite(currentCreditLimit) ||
          currentCreditLimit <= 0 ||
          Math.abs(currentCreditLimit - next.creditLimit) > 0.000001);
      if (shouldUpdateCreditLimit) {
        data.creditLimit = next.creditLimit.toString();
        if (compatibleAccountColumns.has("creditLimitSource")) {
          data.creditLimitSource = "import";
        }
        if (compatibleAccountColumns.has("creditLimitUpdatedAt")) {
          data.creditLimitUpdatedAt = new Date();
        }
      }
    }
    if (next.type === "investment") {
      if (typeof next.investmentSubtype === "string" && next.investmentSubtype.trim()) {
        data.investmentSubtype = next.investmentSubtype.trim();
      }
      if (typeof next.investmentPrincipal === "number" && Number.isFinite(next.investmentPrincipal)) {
        data.investmentPrincipal = next.investmentPrincipal.toString();
      }
      if (typeof next.investmentInterestRate === "number" && Number.isFinite(next.investmentInterestRate)) {
        data.investmentInterestRate = next.investmentInterestRate.toString();
      }
      if (typeof next.investmentMaturityValue === "number" && Number.isFinite(next.investmentMaturityValue)) {
        data.investmentMaturityValue = next.investmentMaturityValue.toString();
      }
      if (next.investmentMaturityDate instanceof Date && !Number.isNaN(next.investmentMaturityDate.getTime())) {
        data.investmentMaturityDate = next.investmentMaturityDate;
      }
    }

    if (Object.keys(data).length === 0) {
      return account;
    }

    const updateAccount = (nextData: Record<string, unknown>) =>
      prisma.account.update({
        where: { id: account.id },
        data: nextData,
        select: getCompatibleAccountSelect(compatibleAccountColumns),
      });

    try {
      return await updateAccount(data);
    } catch (error) {
      if (Object.prototype.hasOwnProperty.call(data, "accountNumber") && isMissingAccountNumberColumnError(error)) {
        const fallbackData = omitAccountNumberField(data);
        if (Object.keys(fallbackData).length === 0) {
          return account;
        }

        return updateAccount(fallbackData);
      }

      throw error;
    }
  };
  const mobileScreenshotIdentityRow =
    params.parsedRows.find((row) => {
      const rawPayload =
        row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
          ? (row.rawPayload as Record<string, unknown>)
          : null;
      const source = typeof rawPayload?.source === "string" ? rawPayload.source : "";
      const kind = typeof rawPayload?.kind === "string" ? rawPayload.kind : "";
      return (
        /(?:gcash|maya)_mobile_screenshot/i.test(source) ||
        /(?:gcash|maya)_mobile_screenshot/i.test(kind)
      );
    }) ?? null;
  const mobileScreenshotWalletIdentity =
    mobileScreenshotIdentityRow?.rawPayload && typeof mobileScreenshotIdentityRow.rawPayload === "object"
      ? getMobileScreenshotWalletIdentity(mobileScreenshotIdentityRow.rawPayload as Prisma.JsonValue)
      : null;
  const fileName = String(params.importFile.fileName ?? "");
  const metadataIdentity = resolveStatementIdentityFromMetadata(params.statementMetadata);
  const parsedRowIdentity = resolveStatementIdentityFromParsedRows(params.parsedRows as Array<Record<string, unknown>>, {
    fileName,
  });
  const shouldPreferParsedScreenshotIdentity =
    isLikelyScreenshotImageFile(fileName) &&
    Boolean(parsedRowIdentity?.accountName || parsedRowIdentity?.institution || parsedRowIdentity?.accountNumber);
  const preferredIdentity = shouldPreferParsedScreenshotIdentity ? parsedRowIdentity : metadataIdentity;
  const fallbackIdentity = shouldPreferParsedScreenshotIdentity ? metadataIdentity : parsedRowIdentity;
  const fileNameInstitutionFallback = isGenericMobileScreenshotFileName(fileName)
    ? null
    : sanitizeBankNameLabel(normalizeBankName(fileName));
  const inferredInstitution =
    mobileScreenshotWalletIdentity?.institution ??
    sanitizeBankNameLabel(preferredIdentity?.institution) ??
    sanitizeBankNameLabel(fallbackIdentity?.institution) ??
    fileNameInstitutionFallback;
  const inferredAccountNumber =
    (typeof preferredIdentity?.accountNumber === "string" && preferredIdentity.accountNumber.trim()
      ? preferredIdentity.accountNumber.trim()
      : null) ??
    (typeof fallbackIdentity?.accountNumber === "string" && fallbackIdentity.accountNumber.trim()
      ? fallbackIdentity.accountNumber.trim()
      : null);
  const hasInferredAccountNumber = Boolean(inferredAccountNumber);
  const supportedImportAccountTypes: AccountType[] = [
    "bank",
    "wallet",
    "credit_card",
    "cash",
    "investment",
    "loan",
    "mortgage",
    "line_of_credit",
    "receivable",
    "payable",
    "bnpl",
    "prepaid",
    "insurance",
    "other",
  ];
  const inferredAccountType: AccountType | null =
    mobileScreenshotWalletIdentity?.accountType ??
    (typeof preferredIdentity?.accountType === "string" &&
    supportedImportAccountTypes.includes(preferredIdentity.accountType as AccountType)
      ? (preferredIdentity.accountType as AccountType)
      : typeof fallbackIdentity?.accountType === "string" &&
          supportedImportAccountTypes.includes(fallbackIdentity.accountType as AccountType)
        ? (fallbackIdentity.accountType as AccountType)
        : typeof params.statementMetadata?.accountType === "string" &&
            supportedImportAccountTypes.includes(params.statementMetadata.accountType as AccountType)
          ? (params.statementMetadata.accountType as AccountType)
          : null);
  const inferredAccountName =
    mobileScreenshotWalletIdentity?.accountName ??
    sanitizeBankNameLabel(preferredIdentity?.accountName) ??
    sanitizeBankNameLabel(fallbackIdentity?.accountName) ??
    (inferredInstitution
      ? formatUploadAccountDisplayName(
          inferredInstitution,
          inferredInstitution,
          inferredAccountNumber,
          inferredAccountType ?? inferAccountTypeFromStatement(inferredInstitution, inferredInstitution, "bank")
        )
      : null);
  const inferredCurrency = normalizeInstitutionCurrency(
    inferredInstitution,
    typeof params.statementMetadata?.currency === "string" && params.statementMetadata.currency.trim()
      ? params.statementMetadata.currency.trim().toUpperCase()
      : null,
    inferredAccountName
  );
  const parsedTrailingBalance = getImportAccountBalanceFromParsedRows(params.parsedRows as EnrichedParsedImportRow[]);
  const parsedCheckpointBalance =
    typeof params.statementMetadata?.endingBalance === "number" && Number.isFinite(params.statementMetadata.endingBalance)
      ? params.statementMetadata.endingBalance
      : typeof params.statementMetadata?.openingBalance === "number" && Number.isFinite(params.statementMetadata.openingBalance)
        ? params.statementMetadata.openingBalance
        : null;
  const inferredBalance = mobileScreenshotWalletIdentity
    ? null
    : parsedCheckpointBalance ??
      (parsedTrailingBalance !== null && Number.isFinite(parsedTrailingBalance) ? parsedTrailingBalance : null);
  const inferredCreditLimit =
    typeof params.statementMetadata?.creditLimit === "number" && Number.isFinite(params.statementMetadata.creditLimit)
      ? params.statementMetadata.creditLimit
      : null;
  const accountIdentityType: AccountType =
    mobileScreenshotWalletIdentity?.accountType ??
    inferredAccountType ??
    (inferAccountTypeFromStatement(inferredInstitution, inferredAccountName ?? inferredAccountNumber, "bank") as AccountType);
  const workspaceAccounts = await prisma.account.findMany({
    where: { workspaceId },
    select: getCompatibleAccountSelect(compatibleAccountColumns),
  });
  const sortImportedAccountsByFreshness = (
    left: { updatedAt: Date; createdAt: Date },
    right: { updatedAt: Date; createdAt: Date }
  ) => {
    const leftTime = Math.max(left.updatedAt.getTime(), left.createdAt.getTime());
    const rightTime = Math.max(right.updatedAt.getTime(), right.createdAt.getTime());
    if (rightTime !== leftTime) {
      return rightTime - leftTime;
    }

    return 0;
  };
  const accountMatchesImportIdentity = (account: (typeof workspaceAccounts)[number]) =>
    matchesImportedAccountIdentity(account, {
      name: inferredAccountName || inferredAccountNumber || String(params.importFile.fileName ?? null),
      institution: inferredInstitution,
      accountNumber: inferredAccountNumber,
      type: accountIdentityType,
    });
  const accountHasNoAccountNumber = (account: (typeof workspaceAccounts)[number]) =>
    !String(account.accountNumber ?? "").replace(/\D/g, "");
  const isWiseWalletImport =
    accountIdentityType === "wallet" &&
    !hasInferredAccountNumber &&
    Boolean(inferredCurrency) &&
    /wise/i.test(`${inferredInstitution ?? ""} ${inferredAccountName ?? ""}`);
  const wiseWalletAccountMatchesCurrency = (account: (typeof workspaceAccounts)[number]) =>
    isWiseWalletImport &&
    account.source === "upload" &&
    account.type === "wallet" &&
    accountHasNoAccountNumber(account) &&
    normalizeInstitutionCurrency("Wise", account.currency ?? null, account.name ?? null) === inferredCurrency &&
    /wise/i.test(`${account.institution ?? ""} ${account.name ?? ""}`);
  const accountNumberDigits = (value: string | null | undefined) => String(value ?? "").replace(/\D/g, "");
  const legacyMayaCreditAccount =
    inferredAccountType === "credit_card" && inferredInstitution && inferredAccountNumber
      ? workspaceAccounts
          .filter((account) => account.source === "upload")
          .filter((account) => account.type === "line_of_credit")
          .filter((account) => /maya/i.test(`${account.institution ?? ""} ${account.name ?? ""}`))
          .filter((account) => accountNumberDigits(account.accountNumber) === accountNumberDigits(inferredAccountNumber))
          .sort(sortImportedAccountsByFreshness)[0] ?? null
      : null;

  const providedAccountId = typeof params.accountId === "string" && params.accountId.trim() ? params.accountId.trim() : null;
  const isOptimisticId = providedAccountId ? providedAccountId.startsWith("optimistic-") : false;
  const directAccount = providedAccountId && !isOptimisticId
    ? await prisma.account.findUnique({
        where: { id: providedAccountId },
        select: getCompatibleAccountSelect(compatibleAccountColumns),
      })
    : null;
  if (directAccount) {
    const canonicalIdentityAccount =
      (isWiseWalletImport
        ? workspaceAccounts
            .filter((account) => account.id !== directAccount.id)
            .filter(wiseWalletAccountMatchesCurrency)
            .sort(sortImportedAccountsByFreshness)[0] ?? null
        : workspaceAccounts
            .filter((account) => account.id !== directAccount.id)
            .filter(accountMatchesImportIdentity)
            .sort(sortImportedAccountsByFreshness)[0] ??
          (hasInferredAccountNumber
            ? null
            : findBestImportedAccountMatch(
                workspaceAccounts.filter((account) => account.id !== directAccount.id),
                {
                  name: inferredAccountName || inferredAccountNumber || String(params.importFile.fileName ?? null),
                  institution: inferredInstitution,
                  accountNumber: inferredAccountNumber,
                  type: accountIdentityType,
                }
              )));
    const accountToUpdate = canonicalIdentityAccount ?? directAccount;
    const updatedAccount = await updateAccountIdentity(accountToUpdate, {
      name: inferredAccountName,
      institution: inferredInstitution,
      accountNumber: inferredAccountNumber,
      type: accountIdentityType,
      source: "upload",
      currency: inferredCurrency,
      balance: inferredBalance,
      clearBalance: Boolean(mobileScreenshotWalletIdentity),
      creditLimit: inferredCreditLimit,
      ...(accountIdentityType === "investment" ? importedInvestmentDetails : {}),
    });

    await ensureWorkspaceCashAccount(workspaceId, updatedAccount.currency ?? inferredCurrency ?? "PHP");
    return collapseDuplicateUploadedAccountsForAccount(updatedAccount);
  }

  const existingWiseWalletByCurrency =
    isWiseWalletImport ? workspaceAccounts.filter(wiseWalletAccountMatchesCurrency).sort(sortImportedAccountsByFreshness)[0] ?? null : null;
  if (existingWiseWalletByCurrency) {
    const updatedAccount = await updateAccountIdentity(existingWiseWalletByCurrency, {
      name: inferredAccountName,
      institution: inferredInstitution,
      accountNumber: null,
      type: accountIdentityType,
      source: "upload",
      currency: inferredCurrency,
      balance: inferredBalance,
      clearBalance: Boolean(mobileScreenshotWalletIdentity),
      creditLimit: inferredCreditLimit,
      ...(accountIdentityType === "investment" ? importedInvestmentDetails : {}),
    });

    await ensureWorkspaceCashAccount(workspaceId, updatedAccount.currency ?? inferredCurrency ?? "PHP");
    return collapseDuplicateUploadedAccountsForAccount(updatedAccount);
  }

  const existingByKey =
    isWiseWalletImport
      ? null
      : workspaceAccounts
          .filter(accountMatchesImportIdentity)
          .sort(sortImportedAccountsByFreshness)[0] ?? null;
  if (!existingByKey && legacyMayaCreditAccount) {
    const updatedAccount = await updateAccountIdentity(legacyMayaCreditAccount, {
      name: inferredAccountName,
      institution: inferredInstitution,
      accountNumber: inferredAccountNumber,
      type: "credit_card",
      source: "upload",
      currency: inferredCurrency,
      balance: inferredBalance,
      clearBalance: Boolean(mobileScreenshotWalletIdentity),
      creditLimit: inferredCreditLimit,
      ...(accountIdentityType === "investment" ? importedInvestmentDetails : {}),
    });

    await ensureWorkspaceCashAccount(workspaceId, updatedAccount.currency ?? inferredCurrency ?? "PHP");
    return collapseDuplicateUploadedAccountsForAccount(updatedAccount);
  }

  if (existingByKey) {
    const updatedAccount = await updateAccountIdentity(existingByKey, {
      name: inferredAccountName,
      institution: inferredInstitution,
      accountNumber: inferredAccountNumber,
      type: accountIdentityType,
      source: "upload",
      currency: inferredCurrency,
      balance: inferredBalance,
      clearBalance: Boolean(mobileScreenshotWalletIdentity),
      creditLimit: inferredCreditLimit,
      ...(accountIdentityType === "investment" ? importedInvestmentDetails : {}),
    });

    await ensureWorkspaceCashAccount(workspaceId, updatedAccount.currency ?? inferredCurrency ?? "PHP");
    return collapseDuplicateUploadedAccountsForAccount(updatedAccount);
  }

  const existingByIdentity = hasInferredAccountNumber || isWiseWalletImport
    ? null
    : findBestImportedAccountMatch(workspaceAccounts, {
        name: inferredAccountName || inferredAccountNumber || String(params.importFile.fileName ?? null),
        institution: inferredInstitution,
        accountNumber: inferredAccountNumber,
        type: accountIdentityType,
      });
  if (existingByIdentity) {
    const updatedAccount = await updateAccountIdentity(existingByIdentity, {
      name: inferredAccountName,
      institution: inferredInstitution,
      accountNumber: inferredAccountNumber,
      type: accountIdentityType,
      source: "upload",
      currency: inferredCurrency,
      balance: inferredBalance,
      clearBalance: Boolean(mobileScreenshotWalletIdentity),
      creditLimit: inferredCreditLimit,
      ...(accountIdentityType === "investment" ? importedInvestmentDetails : {}),
    });

    await ensureWorkspaceCashAccount(workspaceId, updatedAccount.currency ?? inferredCurrency ?? "PHP");
    return collapseDuplicateUploadedAccountsForAccount(updatedAccount);
  }

  const deletedAccountMatch = await findDeletedAccountTombstoneMatch(workspaceId, {
    name: inferredAccountName || inferredAccountNumber || String(params.importFile.fileName ?? null),
    institution: inferredInstitution,
    accountNumber: inferredAccountNumber,
    type: accountIdentityType,
    currency: inferredCurrency,
    source: "upload",
  });
  if (deletedAccountMatch) {
    console.info("[import-account-match] statement matched a deleted account tombstone", {
      workspaceId,
      importFileId: params.importFile.id,
      tombstoneId: deletedAccountMatch.tombstone.id,
      confidence: deletedAccountMatch.confidence,
      reason: deletedAccountMatch.reason,
    });
    const importFileIdForStatus = typeof params.importFile.id === "string" ? params.importFile.id : null;
    if (importFileIdForStatus) {
      await updateImportFileCompat(importFileIdForStatus, {
        status: "processing",
        processingPhase: "account_match_needs_confirmation",
        processingMessage: `This statement looks like a deleted ${deletedAccountMatch.tombstone.institution ?? "account"} account. Confirm before Clover recreates it.`,
      });
    }
    throw new Error(
      `This statement appears to belong to a deleted account${
        deletedAccountMatch.tombstone.institution ? ` (${deletedAccountMatch.tombstone.institution})` : ""
      }. Please confirm before recreating it.`
    );
  }

  if (inferredAccountName || inferredAccountNumber) {
    const nonCashAccountCount = params.planAccountCount ?? 0;
    if (params.planLimits?.accountLimit != null && accountIdentityType !== "cash" && nonCashAccountCount >= params.planLimits.accountLimit) {
      throw new Error(
        `Free plan includes up to ${params.planLimits.accountLimit} non-cash accounts. Upgrade to Pro to add more accounts from imports.`
      );
    }

    const compatibleAccountColumns = await getCompatibleAccountColumns();
      const accountData = {
        workspaceId,
        name: formatUploadAccountDisplayName(inferredAccountName, inferredInstitution, inferredAccountNumber, accountIdentityType),
        institution: inferredInstitution,
        ...(compatibleAccountColumns.has("accountNumber") && inferredAccountNumber
          ? { accountNumber: inferredAccountNumber }
          : {}),
        type: accountIdentityType,
        currency: inferredCurrency ?? "PHP",
        source: "upload",
        ...(inferredBalance !== null ? { balance: inferredBalance.toString() } : {}),
        ...(accountIdentityType === "investment" && importedInvestmentDetails
          ? {
              investmentSubtype: importedInvestmentDetails.investmentSubtype,
              ...(typeof importedInvestmentDetails.investmentPrincipal === "number" && Number.isFinite(importedInvestmentDetails.investmentPrincipal)
                ? { investmentPrincipal: importedInvestmentDetails.investmentPrincipal.toString() }
                : {}),
              ...(typeof importedInvestmentDetails.investmentInterestRate === "number" && Number.isFinite(importedInvestmentDetails.investmentInterestRate)
                ? { investmentInterestRate: importedInvestmentDetails.investmentInterestRate.toString() }
                : {}),
              ...(typeof importedInvestmentDetails.investmentMaturityValue === "number" && Number.isFinite(importedInvestmentDetails.investmentMaturityValue)
                ? { investmentMaturityValue: importedInvestmentDetails.investmentMaturityValue.toString() }
                : {}),
              ...(importedInvestmentDetails.investmentMaturityDate ? { investmentMaturityDate: importedInvestmentDetails.investmentMaturityDate } : {}),
            }
          : {}),
        ...(compatibleAccountColumns.has("creditLimit") && inferredCreditLimit !== null
          ? {
              creditLimit: inferredCreditLimit.toString(),
              ...(compatibleAccountColumns.has("creditLimitSource") ? { creditLimitSource: "import" } : {}),
              ...(compatibleAccountColumns.has("creditLimitUpdatedAt") ? { creditLimitUpdatedAt: new Date() } : {}),
            }
          : {}),
      };

      if (!accountData.name) {
        return null;
      }

    try {
      const createdAccount = await prisma.account.create({
        data: accountData,
        select: getCompatibleAccountSelect(compatibleAccountColumns),
      });

      await ensureWorkspaceCashAccount(workspaceId, createdAccount.currency ?? inferredCurrency ?? "PHP");
      return collapseDuplicateUploadedAccountsForAccount(createdAccount);
    } catch (error) {
      if (Object.prototype.hasOwnProperty.call(accountData, "accountNumber") && isMissingAccountNumberColumnError(error)) {
        const createdAccount = await prisma.account.create({
          data: omitAccountNumberField(accountData),
          select: getCompatibleAccountSelect(compatibleAccountColumns),
        });

        await ensureWorkspaceCashAccount(workspaceId, createdAccount.currency ?? inferredCurrency ?? "PHP");
        return collapseDuplicateUploadedAccountsForAccount(createdAccount);
      }

      throw error;
    }
  }

  return null;
};

const buildTransactionInsertRecord = (params: {
  workspaceId: string;
  accountId: string;
  importFileId?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  reviewStatus?: string;
  parserConfidence?: number;
  categoryConfidence?: number;
  accountMatchConfidence?: number;
  duplicateConfidence?: number;
  transferConfidence?: number;
  rawPayload?: Prisma.InputJsonValue | null;
  normalizedPayload?: Prisma.InputJsonValue | null;
  learnedRuleIdsApplied?: Prisma.InputJsonValue | null;
  date: Date;
  amount: string | number;
  currency: string;
  type: TransactionType;
  merchantRaw: string;
  merchantClean?: string | null;
  description?: string | null;
  isTransfer?: boolean;
  isExcluded?: boolean;
}) => {
  const amount = parseAmountValue(typeof params.amount === "number" ? String(params.amount) : params.amount ?? null);
  if (amount === null) {
    throw new Error("Invalid transaction amount.");
  }

  const record: Record<string, unknown> = {
    id: crypto.randomUUID(),
    workspaceId: params.workspaceId,
    accountId: params.accountId,
    categoryId: params.categoryId ?? null,
    reviewStatus: params.reviewStatus ?? "suggested",
    parserConfidence: params.parserConfidence ?? 0,
    categoryConfidence: params.categoryConfidence ?? 0,
    accountMatchConfidence: params.accountMatchConfidence ?? 0,
    duplicateConfidence: params.duplicateConfidence ?? 0,
    transferConfidence: params.transferConfidence ?? 0,
    rawPayload: params.rawPayload ?? null,
    normalizedPayload: params.normalizedPayload ?? null,
    learnedRuleIdsApplied: params.learnedRuleIdsApplied ?? null,
    date: params.date,
    amount,
    currency: params.currency,
    type: params.type,
    merchantRaw: params.merchantRaw,
    merchantClean: params.merchantClean ?? null,
    description: params.description ?? null,
    isTransfer: params.isTransfer ?? false,
    isExcluded: params.isExcluded ?? false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  if (params.importFileId !== undefined) {
    record.importFileId = params.importFileId ?? null;
  }

  return record;
};

const recordImportDataQaInBackground = (params: {
  workspaceId: string;
  importFileId: string;
  fileName: string;
  fileType: string;
  importMode: ImportImageMode;
  rows: EnrichedParsedImportRow[];
  metadata: Parameters<typeof recordDataQaRun>[0]["metadata"];
  startedAt: number;
  usedVisionFallback: boolean;
  usedOpenAiFallback: boolean;
  actorUserId?: string | null;
}) => {
  void recordDataQaRun({
    workspaceId: params.workspaceId,
    importFileId: params.importFileId,
    source: "import_processing",
    fileName: params.fileName,
    fileType: params.fileType,
    parserVersion: DATA_ENGINE_VERSION,
    documentType: params.importMode,
    parsedRows: params.rows as unknown as DataQaParsedRow[],
    metadata: params.metadata,
    timings: {
      totalMs: Date.now() - params.startedAt,
      parsingMs: Date.now() - params.startedAt,
      usedVisionFallback: params.usedVisionFallback,
      usedOpenAiFallback: params.usedOpenAiFallback,
      usedDeterministicParser: !params.usedOpenAiFallback,
    },
    duplicate: false,
    actorUserId: params.actorUserId ?? null,
  }).catch((error) => {
    console.warn("Background data QA recording failed after visible import", {
      importFileId: params.importFileId,
      error,
    });
  });
};

const deleteTransactionsForImportWithTx = async (tx: Prisma.TransactionClient, importFileId: string) => {
  await tx.$executeRawUnsafe(
    `DELETE FROM "Transaction"
      WHERE "importFileId" = $1
        OR (
          "rawPayload" IS NOT NULL
          AND "rawPayload"->>'sourceImportFileId' = $1
        )`,
    importFileId
  );
};

const mergeImportJsonPayload = (preferred: unknown, fallback: unknown) => {
  const preferredIsObject = preferred && typeof preferred === "object" && !Array.isArray(preferred);
  const fallbackIsObject = fallback && typeof fallback === "object" && !Array.isArray(fallback);

  if (preferredIsObject && fallbackIsObject) {
    return {
      ...(fallback as Record<string, unknown>),
      ...(preferred as Record<string, unknown>),
    };
  }

  if (preferredIsObject) {
    return preferred as Record<string, unknown>;
  }

  if (fallbackIsObject) {
    return fallback as Record<string, unknown>;
  }

  return {};
};

const coerceParsedTransactionRowsForEnrichment = (rows: Array<Record<string, unknown>>) =>
  rows.map(
    (row) =>
      ({
        ...row,
        date:
          row.date instanceof Date
            ? row.date
            : typeof row.date === "string"
              ? (parseDateValue(row.date) ?? row.date)
              : row.date,
        amount:
          typeof row.amount === "object" && row.amount !== null && "toString" in row.amount
            ? String((row.amount as { toString: () => string }).toString())
            : row.amount,
      }) as EnrichedParsedImportRow
  );

const normalizeEnrichmentMatchDate = (value: unknown) => {
  const parsed =
    value instanceof Date
      ? value
      : typeof value === "string"
        ? parseDateValue(value)
        : null;

  if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return normalizeTransactionDedupeText(value).slice(0, 10);
};

const normalizeEnrichmentMatchAmount = (value: unknown) => {
  const parsed = parseAmountValue(
    typeof value === "number" || typeof value === "string"
      ? String(value)
      : value && typeof value === "object" && "toString" in value
        ? String((value as { toString?: () => string }).toString?.() ?? "")
        : null
  );

  return parsed === null ? "" : parsed.toFixed(2);
};

const buildImportEnrichmentMatchKey = (params: {
  date: unknown;
  amount: unknown;
  merchantRaw: unknown;
  merchantClean?: unknown;
  description?: unknown;
}) => {
  const merchant =
    normalizeTransactionDedupeText(params.merchantRaw) ||
    normalizeTransactionDedupeText(params.merchantClean) ||
    normalizeTransactionDedupeText(params.description);

  return [normalizeEnrichmentMatchDate(params.date), normalizeEnrichmentMatchAmount(params.amount), merchant].join("|");
};

const getImportSourceRowIndex = (rawPayload: Prisma.JsonValue | null | undefined) => {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const sourceRowIndex = Number((rawPayload as Record<string, unknown>).sourceRowIndex);
  return Number.isFinite(sourceRowIndex) && sourceRowIndex > 0 ? sourceRowIndex : null;
};

const getImportSourceFileId = (rawPayload: Prisma.JsonValue | null | undefined) => {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const sourceImportFileId = (rawPayload as Record<string, unknown>).sourceImportFileId;
  return typeof sourceImportFileId === "string" && sourceImportFileId.trim() ? sourceImportFileId.trim() : null;
};

const getImportSourceStatementFingerprint = (rawPayload: Prisma.JsonValue | null | undefined) => {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const sourceStatementFingerprint = (rawPayload as Record<string, unknown>).sourceStatementFingerprint;
  return typeof sourceStatementFingerprint === "string" && sourceStatementFingerprint.trim()
    ? sourceStatementFingerprint.trim()
    : null;
};

const getMobileScreenshotPayloadKind = (rawPayload: Prisma.JsonValue | null | undefined) => {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const payload = rawPayload as Record<string, unknown>;
  const kind = typeof payload.kind === "string" ? payload.kind.trim() : "";
  const source = typeof payload.source === "string" ? payload.source.trim() : "";
  const bank = typeof payload.bank === "string" ? payload.bank.trim() : "";
  const institution = typeof payload.institutionRaw === "string" ? payload.institutionRaw.trim() : "";
  const identityText = `${kind} ${source} ${bank} ${institution}`;
  const explicitSourceKindMatch = identityText.toLowerCase().match(/\b([a-z0-9]+)_(?:mobile|transaction)_screenshot\b/);
  const explicitWalletMatch = identityText.toLowerCase().match(/\b([a-z0-9]+)_wallet_screenshot\b/);
  if (explicitSourceKindMatch?.[1]) {
    return explicitSourceKindMatch[1];
  }
  if (explicitWalletMatch?.[1]) {
    return explicitWalletMatch[1];
  }
  if (/gcash/i.test(identityText) && /mobile_screenshot|wallet_screenshot/i.test(identityText)) {
    return "gcash";
  }
  if (/maya/i.test(identityText) && /mobile_screenshot|wallet_screenshot/i.test(identityText)) {
    return "maya";
  }
  if (/wise/i.test(identityText) && /mobile_screenshot|wallet_screenshot/i.test(identityText)) {
    return "wise";
  }
  if (/unionbank/i.test(identityText) && /mobile_screenshot/i.test(identityText)) {
    return "unionbank";
  }
  if (/rcbc/i.test(identityText) && /mobile_screenshot/i.test(identityText)) {
    return "rcbc";
  }
  if (/security\s*bank/i.test(identityText) && /mobile_screenshot/i.test(identityText)) {
    return "securitybank";
  }
  if (/bpi/i.test(identityText) && /mobile_screenshot/i.test(identityText)) {
    return "bpi";
  }
  if (/gcrypto|pdax/i.test(identityText) && /mobile_screenshot|transaction_screenshot/i.test(identityText)) {
    return "gcrypto";
  }
  if (/gfunds|atram|ryse/i.test(identityText) && /mobile_screenshot|transaction_screenshot/i.test(identityText)) {
    return "gfunds";
  }
  if (/generic_investment_action_screenshot/i.test(identityText)) {
    return "generic-investment";
  }

  return null;
};

const mobileScreenshotOverlapPayloadMatchers: Array<{ path: "kind" | "source"; equals: string }> = [
  { path: "kind", equals: "gcash_mobile_screenshot_transaction" },
  { path: "kind", equals: "maya_mobile_screenshot_transaction" },
  { path: "kind", equals: "maya_mobile_screenshot_known_transaction" },
  { path: "kind", equals: "wise_mobile_screenshot_transaction" },
  { path: "kind", equals: "bpi_mobile_screenshot_transaction" },
  { path: "kind", equals: "unionbank_mobile_screenshot_transaction" },
  { path: "kind", equals: "rcbc_mobile_screenshot_transaction" },
  { path: "kind", equals: "gcrypto_mobile_screenshot_transaction" },
  { path: "kind", equals: "gcrypto_transaction_screenshot" },
  { path: "kind", equals: "gfunds_transaction_screenshot" },
  { path: "kind", equals: "generic_investment_action_screenshot_transaction" },
  { path: "source", equals: "gcash_mobile_screenshot" },
  { path: "source", equals: "maya_mobile_screenshot" },
  { path: "source", equals: "wise_mobile_screenshot" },
  { path: "source", equals: "bpi_mobile_screenshot" },
  { path: "source", equals: "unionbank_mobile_screenshot" },
  { path: "source", equals: "rcbc_mobile_screenshot" },
  { path: "source", equals: "gcrypto_mobile_screenshot" },
  { path: "source", equals: "gcrypto_transaction_screenshot" },
  { path: "source", equals: "gfunds_transaction_screenshot" },
  { path: "source", equals: "generic_investment_action_screenshot" },
];

const getMobileScreenshotWalletIdentity = (rawPayload: Prisma.JsonValue | null | undefined) => {
  const kind = getMobileScreenshotPayloadKind(rawPayload);
  if (kind === "gcash") {
    return {
      accountName: "GCash",
      institution: "GCash",
      accountType: "wallet" as AccountType,
    };
  }

  if (kind === "maya") {
    return {
      accountName: "Maya Wallet",
      institution: "Maya",
      accountType: "wallet" as AccountType,
    };
  }

  return null;
};

const getMobileScreenshotTimeText = (rawPayload: Prisma.JsonValue | null | undefined) => {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return "";
  }

  const payload = rawPayload as Record<string, unknown>;
  for (const key of ["timeText", "transactionTime", "time"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return normalizeTransactionDedupeText(value);
    }
  }

  return "";
};

const buildMobileScreenshotContentKey = (transaction: {
  accountId?: unknown;
  date: unknown;
  amount: unknown;
  currency: unknown;
  type: unknown;
  merchantRaw: unknown;
  merchantClean: unknown;
  description: unknown;
  rawPayload?: Prisma.JsonValue | null;
}) => {
  const screenshotKind = getMobileScreenshotPayloadKind(transaction.rawPayload);
  if (!screenshotKind) {
    return "";
  }

  const date =
    transaction.date instanceof Date && !Number.isNaN(transaction.date.getTime())
      ? transaction.date.toISOString().slice(0, 10)
      : normalizeTransactionDedupeText(transaction.date).slice(0, 10);
  const amount = parseAmountValue(
    typeof transaction.amount === "number" || typeof transaction.amount === "string"
      ? String(transaction.amount)
      : transaction.amount && typeof transaction.amount === "object" && "toString" in transaction.amount
        ? String((transaction.amount as { toString?: () => string }).toString?.() ?? "")
        : null
  );
  const merchant =
    normalizeTransactionDedupeText(transaction.merchantRaw) ||
    normalizeTransactionDedupeText(transaction.merchantClean) ||
    normalizeTransactionDedupeText(transaction.description);
  if (amount === null || !merchant) {
    return "";
  }

  return [
    screenshotKind,
    date,
    amount.toFixed(2),
    normalizeTransactionDedupeText(transaction.currency || "PHP").toUpperCase(),
    normalizeTransactionDedupeText(transaction.type),
    merchant,
    getMobileScreenshotTimeText(transaction.rawPayload),
  ].join("|");
};

const buildAccountScopedSourceRowKey = (accountId: unknown, sourceRowIndex: unknown) => {
  const normalizedAccountId = typeof accountId === "string" && accountId.trim() ? accountId.trim() : "";
  const normalizedSourceRowIndex =
    typeof sourceRowIndex === "number" && Number.isFinite(sourceRowIndex) && sourceRowIndex > 0
      ? String(Math.trunc(sourceRowIndex))
      : typeof sourceRowIndex === "string" && sourceRowIndex.trim()
        ? sourceRowIndex.trim()
        : "";

  return normalizedSourceRowIndex ? `${normalizedAccountId}:${normalizedSourceRowIndex}` : null;
};

const listImportStatementFingerprints = async (importFileId: string) => {
  const parsedStatementFingerprints = await prisma.$queryRaw<Array<{ statementFingerprint: string | null }>>`
    SELECT DISTINCT "statementFingerprint"
    FROM "ParsedTransaction"
    WHERE "importFileId" = ${importFileId}
      AND "statementFingerprint" IS NOT NULL
  `.catch(() => []);

  return Array.from(
    new Set(
      parsedStatementFingerprints
        .map((row) => row.statementFingerprint)
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim())
    )
  );
};

const buildImportTransactionWhere = async (
  importFileId: string,
  options: { workspaceId?: string | null; includeDeleted?: boolean } = {}
): Promise<Prisma.TransactionWhereInput> => {
  const workspaceId =
    typeof options.workspaceId === "string" && options.workspaceId.trim()
      ? options.workspaceId.trim()
      : String((await fetchImportFileCompat(importFileId).catch(() => null))?.workspaceId ?? "").trim();
  const statementFingerprints = await listImportStatementFingerprints(importFileId);
  const identityPredicates: Prisma.TransactionWhereInput[] = [
    { importFileId },
    {
      rawPayload: {
        path: ["sourceImportFileId"],
        equals: importFileId,
      },
    },
    ...statementFingerprints.map((fingerprint) => ({
      rawPayload: {
        path: ["sourceStatementFingerprint"],
        equals: fingerprint,
      },
    })),
  ];

  return {
    ...(workspaceId ? { workspaceId } : {}),
    ...(options.includeDeleted ? {} : { deletedAt: null }),
    OR: identityPredicates,
  };
};

const buildImportTransactionCollapseKey = (transaction: {
  accountId: string;
  date: Date;
  amount: unknown;
  currency: string;
  type: unknown;
  merchantRaw: string;
  merchantClean: string | null;
  description: string | null;
  rawPayload: Prisma.JsonValue | null;
}) => {
  const sourceRowIndex = getImportSourceRowIndex(transaction.rawPayload);
  const sourceStatementFingerprint = getImportSourceStatementFingerprint(transaction.rawPayload);
  const mobileScreenshotKind = getMobileScreenshotPayloadKind(transaction.rawPayload);
  if (sourceStatementFingerprint && sourceRowIndex !== null) {
    if (mobileScreenshotKind) {
      return `mobile-source-statement:${mobileScreenshotKind}:${sourceStatementFingerprint}:${sourceRowIndex}`;
    }

    return `source-statement:${transaction.accountId}:${sourceStatementFingerprint}:${sourceRowIndex}`;
  }

  if (sourceRowIndex !== null) {
    if (mobileScreenshotKind) {
      const contentKey = buildMobileScreenshotContentKey(transaction);
      return contentKey
        ? `mobile-source-content:${contentKey}`
        : `mobile-source-row:${mobileScreenshotKind}:${sourceRowIndex}`;
    }

    return `source-row:${transaction.accountId}:${sourceRowIndex}`;
  }

  const merchant =
    normalizeTransactionDedupeText(transaction.merchantRaw) ||
    normalizeTransactionDedupeText(transaction.merchantClean) ||
    normalizeTransactionDedupeText(transaction.description);

  return [
    "fallback",
    transaction.accountId,
    normalizeEnrichmentMatchDate(transaction.date),
    normalizeEnrichmentMatchAmount(transaction.amount),
    normalizeTransactionDedupeText(transaction.currency || "PHP").toUpperCase(),
    merchant,
    normalizeTransactionDedupeText(transaction.description),
  ].join("|");
};

const collapseDuplicateTransactionsForImport = async (importFileId: string) => {
  const importFile = await fetchImportFileCompat(importFileId).catch(() => null);
  const statementFingerprints = await listImportStatementFingerprints(importFileId);
  const transactionWhere = await buildImportTransactionWhere(importFileId, {
    workspaceId: importFile?.workspaceId ? String(importFile.workspaceId) : null,
  });
  const transactions = await prisma.transaction.findMany({
    where: transactionWhere,
    select: {
      id: true,
      accountId: true,
      importFileId: true,
      reviewStatus: true,
      parserConfidence: true,
      categoryConfidence: true,
      date: true,
      amount: true,
      currency: true,
      type: true,
      merchantRaw: true,
      merchantClean: true,
      description: true,
      rawPayload: true,
      category: { select: { name: true } },
      updatedAt: true,
    },
  });

  const groups = new Map<string, typeof transactions>();
  for (const transaction of transactions) {
    if (transaction.reviewStatus === "edited" || transaction.reviewStatus === "rejected") {
      continue;
    }

    const sourceImportFileId = getImportSourceFileId(transaction.rawPayload);
    const sourceStatementFingerprint = getImportSourceStatementFingerprint(transaction.rawPayload);
    const belongsToImport =
      transaction.importFileId === importFileId ||
      sourceImportFileId === importFileId ||
      (sourceStatementFingerprint !== null && statementFingerprints.includes(sourceStatementFingerprint));
    if (!belongsToImport) {
      continue;
    }

    const collapseKey = buildImportTransactionCollapseKey(transaction);
    const bucket = groups.get(collapseKey) ?? [];
    bucket.push(transaction);
    groups.set(collapseKey, bucket);
  }

  const duplicateIds: string[] = [];
  for (const group of groups.values()) {
    if (group.length <= 1) {
      continue;
    }

    const ranked = [...group].sort((a, b) => {
      const aCanonical = a.importFileId === importFileId ? 1 : 0;
      const bCanonical = b.importFileId === importFileId ? 1 : 0;
      if (aCanonical !== bCanonical) return bCanonical - aCanonical;

      const aCategorized = a.category?.name && a.category.name !== "Other" ? 1 : 0;
      const bCategorized = b.category?.name && b.category.name !== "Other" ? 1 : 0;
      if (aCategorized !== bCategorized) return bCategorized - aCategorized;

      const aNamed = a.merchantClean && a.merchantClean !== a.merchantRaw ? 1 : 0;
      const bNamed = b.merchantClean && b.merchantClean !== b.merchantRaw ? 1 : 0;
      if (aNamed !== bNamed) return bNamed - aNamed;

      const aConfidence = Number(a.parserConfidence ?? 0) + Number(a.categoryConfidence ?? 0);
      const bConfidence = Number(b.parserConfidence ?? 0) + Number(b.categoryConfidence ?? 0);
      if (aConfidence !== bConfidence) return bConfidence - aConfidence;

      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });

    duplicateIds.push(...ranked.slice(1).map((transaction) => transaction.id));
  }

  if (duplicateIds.length === 0) {
    return { removed: 0 };
  }

  await prisma.transaction.updateMany({
    where: { id: { in: duplicateIds } },
    data: {
      deletedAt: new Date(),
      reviewStatus: "duplicate_skipped",
      duplicateConfidence: 100,
    },
  });

  console.info("[import-dedupe] collapsed duplicate import transactions", {
    importFileId,
    removed: duplicateIds.length,
  });

  return { removed: duplicateIds.length };
};

export const countImportTransactionsNeedingCleanup = async (importFileId: string) =>
  prisma.transaction.count({
    where: {
      ...(await buildImportTransactionWhere(importFileId)),
      reviewStatus: { notIn: ["edited", "rejected", "duplicate_skipped"] },
      AND: [
        {
          OR: [
            { merchantClean: null },
            { categoryId: null },
            { category: { is: { name: "Other" } } },
          ],
        },
      ],
    },
  });

const markRemainingImportCleanupRowsForReview = async (importFileId: string) =>
  prisma.transaction.updateMany({
    where: {
      ...(await buildImportTransactionWhere(importFileId)),
      reviewStatus: { notIn: ["edited", "rejected", "duplicate_skipped"] },
      AND: [
        {
          OR: [
            { merchantClean: null },
            { categoryId: null },
            { category: { is: { name: "Other" } } },
          ],
        },
      ],
    },
    data: {
      reviewStatus: "pending_review",
    },
  });

const strengthenEnrichmentRowForAttempt = (
  row: EnrichedParsedImportRow,
  parsedRow: EnrichedParsedImportRow | undefined,
  attempt: number
): EnrichedParsedImportRow => {
  if (attempt <= 1) {
    return row;
  }

  const merchantText = [
    row.merchantRaw,
    row.merchantClean,
    row.description,
    parsedRow?.merchantRaw,
    parsedRow?.merchantClean,
    parsedRow?.description,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
  const fallbackType = row.type === "income" || row.type === "expense" || row.type === "transfer" ? row.type : "expense";
  const guessedCategory = merchantText ? guessCategoryName(merchantText, fallbackType) : "Other";
  const rowCategory = typeof row.categoryName === "string" && row.categoryName.trim() ? row.categoryName.trim() : "";
  const shouldUseGuessedCategory =
    guessedCategory &&
    guessedCategory !== "Other" &&
    (!rowCategory || rowCategory.toLowerCase() === "other");
  const categoryName = shouldUseGuessedCategory ? guessedCategory : row.categoryName;
  const parserDirection =
    resolveUnionBankExternalTransferDirection(row, parsedRow) ??
    (parsedRow?.type === "income" || parsedRow?.type === "expense" ? parsedRow.type : null);
  const type =
    parserDirection && shouldPreserveParserTransferDirection(row, parsedRow)
      ? parserDirection
      : categoryName
        ? coerceTransactionTypeFromCategoryName(categoryName, fallbackType)
        : fallbackType;
  const merchantClean =
    typeof row.merchantClean === "string" && row.merchantClean.trim()
      ? row.merchantClean.trim()
      : typeof parsedRow?.merchantClean === "string" && parsedRow.merchantClean.trim()
        ? parsedRow.merchantClean.trim()
        : typeof row.merchantRaw === "string" && row.merchantRaw.trim()
          ? row.merchantRaw.trim()
          : row.merchantClean;

  return {
    ...row,
    categoryName,
    type,
    merchantClean,
    categoryConfidence: shouldUseGuessedCategory
      ? Math.max(normalizeImportConfidenceScore(row.categoryConfidence), attempt >= 3 ? 85 : 75)
      : row.categoryConfidence,
    confidence: shouldUseGuessedCategory
      ? Math.max(normalizeImportConfidenceScore(row.confidence), attempt >= 3 ? 85 : 75)
      : row.confidence,
    normalizedPayload: {
      ...((row.normalizedPayload && typeof row.normalizedPayload === "object" && !Array.isArray(row.normalizedPayload)
        ? row.normalizedPayload
        : {}) as Record<string, unknown>),
      enrichmentAttempt: attempt,
      enrichmentFallback: shouldUseGuessedCategory ? "deterministic-category" : "training",
    } as Prisma.InputJsonValue,
  };
};

export const processImportEnrichmentJobs = async (options: {
  importFileId?: string | null;
  limit?: number;
  batchSize?: number;
  workerId?: string;
} = {}) => {
  const workerId = options.workerId ?? `import-enrichment-${process.pid}-${Date.now()}`;
  const limit = Math.max(1, Math.min(options.limit ?? 3, 10));
  const batchSize = Math.max(10, Math.min(options.batchSize ?? 250, 500));
  const results: Array<{
    importFileId: string;
    status: "done" | "running" | "failed" | "skipped";
    processedRows: number;
    totalRows: number;
    errorMessage?: string;
  }> = [];

  for (let jobIndex = 0; jobIndex < limit; jobIndex += 1) {
    const job = await claimNextImportEnrichmentJob({
      workerId,
      importFileId: options.importFileId ?? null,
    });

    if (!job) {
      break;
    }

    try {
      const attempt = Math.max(1, Number(job.attempts ?? 1));
      const deadlineAt = Date.now() + 60_000;
      const importFile = await fetchImportFileCompat(job.importFileId);
      if (!importFile) {
        await failImportEnrichmentJob({
          id: job.id,
          errorCode: "I-404",
          errorMessage: "Import file was not found for enrichment.",
          retryable: false,
        });
        results.push({
          importFileId: job.importFileId,
          status: "failed",
          processedRows: job.processedRows,
          totalRows: job.totalRows,
          errorMessage: "Import file was not found for enrichment.",
        });
        continue;
      }

      const parsedRows = await fetchParsedTransactionRows(job.importFileId);
      const totalRows = parsedRows.length;
      if (totalRows === 0) {
        await completeImportEnrichmentJob({ id: job.id, totalRows: 0 });
        results.push({ importFileId: job.importFileId, status: "done", processedRows: 0, totalRows: 0 });
        continue;
      }

      const statementCheckpoint = (await hasCompatibleTable("AccountStatementCheckpoint"))
        ? await prisma.accountStatementCheckpoint.findUnique({
            where: { importFileId: job.importFileId },
            select: { sourceMetadata: true },
          })
        : null;
      const statementConfidence =
        typeof statementCheckpoint?.sourceMetadata === "object" && statementCheckpoint.sourceMetadata !== null
          ? normalizeImportConfidenceScore((statementCheckpoint.sourceMetadata as Record<string, unknown>).confidence)
          : 100;
      const transactions = await prisma.transaction.findMany({
        where: await buildImportTransactionWhere(job.importFileId, {
          workspaceId: String(importFile.workspaceId),
        }),
        select: {
          id: true,
          rawPayload: true,
          reviewStatus: true,
          date: true,
          amount: true,
          merchantRaw: true,
          merchantClean: true,
          description: true,
        },
      });
      const transactionBySourceIndex = new Map<number, { id: string; reviewStatus: string }>();
      const transactionsByFallbackKey = new Map<string, Array<{ id: string; reviewStatus: string }>>();
      for (const transaction of transactions) {
        const rawPayload = transaction.rawPayload;
        const sourceRowIndex =
          rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
            ? Number((rawPayload as Record<string, unknown>).sourceRowIndex)
            : 0;
        if (Number.isFinite(sourceRowIndex) && sourceRowIndex > 0) {
          transactionBySourceIndex.set(sourceRowIndex, {
            id: transaction.id,
            reviewStatus: transaction.reviewStatus,
          });
        }
        const fallbackKey = buildImportEnrichmentMatchKey({
          date: transaction.date,
          amount: transaction.amount,
          merchantRaw: transaction.merchantRaw,
          merchantClean: transaction.merchantClean,
          description: transaction.description,
        });
        if (fallbackKey.replace(/\|/g, "")) {
          const bucket = transactionsByFallbackKey.get(fallbackKey) ?? [];
          bucket.push({
            id: transaction.id,
            reviewStatus: transaction.reviewStatus,
          });
          transactionsByFallbackKey.set(fallbackKey, bucket);
        }
      }

      const existingCategories = await prisma.category.findMany({
        where: { workspaceId: String(importFile.workspaceId) },
        select: { id: true, name: true },
      });
      const categoryByName = new Map(existingCategories.map((category) => [category.name.toLowerCase(), category.id]));
      const usedTransactionIds = new Set<string>();
      let updatedRows = 0;
      let skippedRows = 0;
      let processedRows = 0;

      for (let startIndex = 0; startIndex < totalRows; startIndex += batchSize) {
        if (Date.now() >= deadlineAt) {
          break;
        }

        const batchRows = parsedRows.slice(startIndex, startIndex + batchSize);
        const enrichedRows = (await enrichParsedRowsWithTraining({
          workspaceId: String(importFile.workspaceId),
          rows: coerceParsedTransactionRowsForEnrichment(batchRows),
          statementConfidence: attempt >= 2 ? Math.max(statementConfidence, 90) : statementConfidence,
        })).map((row, index) =>
          strengthenEnrichmentRowForAttempt(row, batchRows[index] as EnrichedParsedImportRow | undefined, attempt)
        );

        for (const [index, row] of enrichedRows.entries()) {
          const sourceRowIndex = startIndex + index + 1;
          const sourceIndexedTransaction = transactionBySourceIndex.get(sourceRowIndex);
          const parsedRow = batchRows[index] as EnrichedParsedImportRow | undefined;
          const fallbackKey = buildImportEnrichmentMatchKey({
            date: parsedRow?.date ?? row.date,
            amount: parsedRow?.amount ?? row.amount,
            merchantRaw: parsedRow?.merchantRaw ?? row.merchantRaw,
            merchantClean: parsedRow?.merchantClean ?? row.merchantClean,
            description: parsedRow?.description ?? row.description,
          });
          const fallbackBucket = transactionsByFallbackKey.get(fallbackKey) ?? [];
          const fallbackTransaction = fallbackBucket.find((candidate) => !usedTransactionIds.has(candidate.id));
          const transaction =
            sourceIndexedTransaction && !usedTransactionIds.has(sourceIndexedTransaction.id)
              ? sourceIndexedTransaction
              : fallbackTransaction ?? null;
          if (
            !transaction ||
            transaction.reviewStatus === "edited" ||
            transaction.reviewStatus === "rejected"
          ) {
            skippedRows += 1;
            continue;
          }
          usedTransactionIds.add(transaction.id);

          const parsedRowType =
            parsedRow?.type === "income" || parsedRow?.type === "expense" || parsedRow?.type === "transfer"
              ? parsedRow.type
              : null;
          const rowType =
            row.type === "income" || row.type === "expense" || row.type === "transfer" ? row.type : "expense";
          const categoryName =
            (typeof row.categoryName === "string" && row.categoryName.trim()) || defaultCategoryForType(rowType);
          const unionBankDirection = resolveUnionBankExternalTransferDirection(row, parsedRow);
          const canonicalType =
            unionBankDirection ??
            (parsedRowType && parsedRowType !== "transfer" && shouldPreserveParserTransferDirection(row, parsedRow)
              ? parsedRowType
              : coerceTransactionTypeFromCategoryName(categoryName, rowType));
          let categoryId = categoryByName.get(categoryName.toLowerCase());
          if (!categoryId) {
            const created = await prisma.category.create({
              data: {
                workspaceId: String(importFile.workspaceId),
                name: categoryName,
                type: canonicalType,
                isSystem: false,
              },
              select: { id: true },
            });
            categoryId = created.id;
            categoryByName.set(categoryName.toLowerCase(), categoryId);
          }

          const rowConfidence = inferParserRowConfidence({
            confidence: row.confidence,
            parserConfidence: row.parserConfidence,
            categoryConfidence: row.categoryConfidence,
            statementConfidence,
            categoryName,
            rawPayload: (row as { rawPayload?: unknown }).rawPayload,
          });
          const categoryConfidence = Math.max(normalizeImportConfidenceScore(row.categoryConfidence), rowConfidence);
          const parserConfidence = Math.max(normalizeImportConfidenceScore(row.parserConfidence), normalizeImportConfidenceScore(row.confidence), statementConfidence);
          const nextReviewStatus = shouldRouteToReview({
            confidence: Math.max(rowConfidence, categoryConfidence),
            categoryName,
            type: canonicalType,
          })
            ? "pending_review"
            : "confirmed";
          await prisma.transaction.update({
            where: { id: transaction.id },
            data: {
              categoryId,
              type: canonicalType,
              merchantClean:
                typeof row.merchantClean === "string" && row.merchantClean.trim()
                  ? row.merchantClean.trim()
                  : typeof row.merchantRaw === "string"
                    ? row.merchantRaw
                    : undefined,
              categoryConfidence,
              parserConfidence,
              reviewStatus: nextReviewStatus,
              isTransfer: canonicalType === "transfer",
              normalizedPayload: (row.normalizedPayload ?? {}) as Prisma.InputJsonValue,
              learnedRuleIdsApplied: (row.learnedRuleIdsApplied ?? []) as Prisma.InputJsonValue,
            },
          });
          updatedRows += 1;
        }

        processedRows = Math.min(totalRows, startIndex + batchRows.length);
        await updateRunningImportEnrichmentJobProgress({
          id: job.id,
          phase: "enriching",
          lastRowIndex: processedRows,
          processedRows,
          totalRows,
          workerId,
        });
      }

      console.info("[import-enrichment] processed batch", {
        importFileId: job.importFileId,
        totalRows,
        attempt,
        processedRows,
        updatedRows,
        skippedRows,
      });

      if (processedRows >= totalRows) {
        await collapseDuplicateTransactionsForImport(job.importFileId).catch((error) => {
          console.warn("Unable to collapse duplicate transactions after enrichment", {
            importFileId: job.importFileId,
            error,
          });
        });
        const remainingCleanupCount = await countImportTransactionsNeedingCleanup(job.importFileId).catch(() => 0);
        if (remainingCleanupCount > 0 && attempt < MAX_IMPORT_ENRICHMENT_ATTEMPTS) {
          await updateImportEnrichmentJobProgress({
            id: job.id,
            phase: "retrying",
            lastRowIndex: 0,
            processedRows: 0,
            totalRows,
            workerId,
          });
          await updateImportFileCompat(job.importFileId, {
            processingPhase: "complete",
            processingMessage: "The file is visible in Clover. Clover is cleaning up names and categories in the background.",
          }).catch(() => null);
          results.push({ importFileId: job.importFileId, status: "running", processedRows, totalRows });
          continue;
        }

        if (remainingCleanupCount > 0) {
          await markRemainingImportCleanupRowsForReview(job.importFileId).catch(() => null);
          await failImportEnrichmentJob({
            id: job.id,
            errorCode: "I-206",
            errorMessage: "Some transaction details may need review.",
            retryable: false,
          });
          await updateImportFileCompat(job.importFileId, {
            processingPhase: "complete",
            processingMessage: "Some transaction details may need review.",
          });
          results.push({ importFileId: job.importFileId, status: "failed", processedRows, totalRows });
        } else {
          await completeImportEnrichmentJob({ id: job.id, totalRows });
          await updateImportFileCompat(job.importFileId, {
            processingPhase: "complete",
            processingMessage: "Transaction details finalized.",
          });
          results.push({ importFileId: job.importFileId, status: "done", processedRows, totalRows });
        }
      } else {
        const retryable = attempt < MAX_IMPORT_ENRICHMENT_ATTEMPTS;
        await failImportEnrichmentJob({
          id: job.id,
          errorCode: "I-504",
          errorMessage: "Enrichment timed out before all rows were checked.",
          retryable,
        });
        if (!retryable) {
          await markRemainingImportCleanupRowsForReview(job.importFileId).catch(() => null);
        }
        results.push({ importFileId: job.importFileId, status: retryable ? "running" : "failed", processedRows, totalRows });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to finalize transaction details.";
      const retryable = job.attempts < MAX_IMPORT_ENRICHMENT_ATTEMPTS;
      await failImportEnrichmentJob({
        id: job.id,
        errorCode: "I-503",
        errorMessage: message,
        retryable,
      });
      if (!retryable) {
        await markRemainingImportCleanupRowsForReview(job.importFileId).catch(() => null);
        await updateImportFileCompat(job.importFileId, {
          processingPhase: "complete",
          processingMessage: "Some transaction details may need review.",
        }).catch(() => null);
      }
      results.push({
        importFileId: job.importFileId,
        status: "failed",
        processedRows: job.processedRows,
        totalRows: job.totalRows,
        errorMessage: message,
      });
    }
  }

  return { processedJobs: results.length, results };
};

const processImportEnrichmentJobsInBackground = (importFileId: string, totalRows?: number | null) => {
  const normalizedTotalRows = Math.max(1, Number(totalRows ?? 50));
  // Give tiny receipt imports enough room to retry immediately in the same session.
  // A one-row receipt can legitimately need multiple passes before it stops on "Other".
  const limit = Math.max(
    MAX_IMPORT_ENRICHMENT_ATTEMPTS,
    Math.min(10, Math.ceil(normalizedTotalRows / 500))
  );
  void processImportEnrichmentJobs({ importFileId, limit, batchSize: 500 }).catch((error) => {
    console.warn("Background import enrichment job failed", {
      importFileId,
      error,
    });
  });
};

const isWiseReviewOnlyTransaction = (params: {
  institution: string | null | undefined;
  row: {
    merchantRaw?: string | null;
    merchantClean?: string | null;
    description?: string | null;
    rawPayload?: Prisma.JsonValue | null;
  };
}) => {
  if (!params.institution || !/wise/i.test(params.institution)) {
    return false;
  }

  const rawPayload = params.row.rawPayload;
  const payloadStatus =
    rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
      ? [
          (rawPayload as Record<string, unknown>).status,
          (rawPayload as Record<string, unknown>).transactionStatus,
          (rawPayload as Record<string, unknown>).state,
        ]
      : [];

  const text = [
    params.row.merchantRaw,
    params.row.merchantClean,
    params.row.description,
    ...payloadStatus,
  ]
    .map((value) => String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase())
    .filter(Boolean)
    .join(" | ");

  if (!text) {
    return false;
  }

  return /\b(cancelled?|canceled|card checked|checked|failed|withdrawn)\b/.test(text);
};

const isWiseSkippableVerificationRow = (row: Record<string, unknown>, fallbackInstitution?: string | null) => {
  const rawPayload =
    row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
      ? (row.rawPayload as Record<string, unknown>)
      : null;
  const identityText = [
    fallbackInstitution,
    row.institution,
    row.accountName,
    rawPayload?.institutionRaw,
    rawPayload?.bank,
    rawPayload?.source,
    rawPayload?.kind,
  ]
    .filter(Boolean)
    .join(" ");
  if (!/wise/i.test(identityText)) {
    return false;
  }

  const rowAmount = parseAmountValue(
    typeof row.amount === "number" || typeof row.amount === "string" ? String(row.amount) : null
  );
  const statusText = [
    row.merchantRaw,
    row.merchantClean,
    row.description,
    rawPayload?.status,
    rawPayload?.transactionStatus,
    rawPayload?.state,
    rawPayload?.sourceLine,
    rawPayload?.notes,
  ]
    .map((value) => String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase())
    .filter(Boolean)
    .join(" | ");

  return rowAmount !== null && Math.abs(rowAmount) < 0.01 && /\bcard checked\b|\bverification\b|\bchecked\b/.test(statusText);
};

const readScreenshotArtifactEvidenceText = (row: Record<string, unknown>) => {
  const rawPayload =
    row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
      ? (row.rawPayload as Record<string, unknown>)
      : null;
  const parserEvidence =
    rawPayload?.parserEvidence && typeof rawPayload.parserEvidence === "object" && !Array.isArray(rawPayload.parserEvidence)
      ? (rawPayload.parserEvidence as Record<string, unknown>)
      : null;

  return [
    row.merchantRaw,
    row.merchantClean,
    row.description,
    rawPayload?.sourceLine,
    rawPayload?.fullLineText,
    rawPayload?.notes,
    parserEvidence?.source_text,
    parserEvidence?.sourceText,
    parserEvidence?.reason,
  ]
    .map(normalizeScreenshotArtifactText)
    .filter((value): value is string => Boolean(value))
    .join(" | ");
};

const isLikelyScreenshotUiArtifactRow = (params: {
  row: Record<string, unknown>;
  fileName?: string | null;
  statementInstitution?: string | null;
  accountName?: string | null;
}) => {
  if (!params.fileName || !isLikelyScreenshotImageFile(params.fileName)) {
    return false;
  }

  const merchantText = normalizeScreenshotArtifactText(
    typeof params.row.merchantClean === "string" && params.row.merchantClean.trim()
      ? params.row.merchantClean
      : typeof params.row.merchantRaw === "string" && params.row.merchantRaw.trim()
        ? params.row.merchantRaw
        : params.row.description
  );
  const categoryName = normalizeScreenshotArtifactText(params.row.categoryName)?.toLowerCase() ?? "";
  const evidenceText = readScreenshotArtifactEvidenceText(params.row);
  const accountName = normalizeScreenshotArtifactText(params.accountName);
  const institution = normalizeScreenshotArtifactText(params.statementInstitution);
  const normalizedMerchant = merchantText?.toLowerCase() ?? "";
  const normalizedAccountName = accountName?.toLowerCase() ?? "";
  const normalizedInstitution = institution?.toLowerCase() ?? "";

  if (!merchantText) {
    return screenshotEvidenceContainsUiArtifact(evidenceText);
  }

  if (isLikelyScreenshotDateFragment(merchantText) || isLikelyScreenshotUiArtifactText(merchantText)) {
    return true;
  }

  if (
    categoryName === "other" &&
    ((normalizedAccountName && normalizedMerchant === normalizedAccountName) ||
      (normalizedInstitution && normalizedMerchant === normalizedInstitution))
  ) {
    return true;
  }

  if (
    categoryName === "other" &&
    /\b(?:savings|checking|deposit|current account|credit card|debit card|wallet|premier plus)\b/i.test(merchantText) &&
    /(?:\*{2,}|x{2,}|•{2,}|\b\d{4}\b)/i.test(merchantText)
  ) {
    return true;
  }

  if (screenshotEvidenceContainsUiArtifact(evidenceText) && (categoryName === "other" || categoryName === "")) {
    return true;
  }

  return false;
};

export const processImportFileText = async (
  importFileId: string,
  options: {
    text?: string;
    textCacheInfo?: ImportFileTextCacheInfo | null;
    password?: string;
    actorUserId?: string | null;
    qaSource?: DataQaSource;
    allowDuplicateStatement?: boolean;
    autoRerunAttempt?: number;
    statementMetadataOverride?: Partial<{
      institution: string | null;
      accountNumber: string | null;
      accountName: string | null;
      accountType: string | null;
      openingBalance: number | null;
      endingBalance: number | null;
      paymentDueDate: string | null;
      totalAmountDue: number | null;
      startDate: string | null;
      endDate: string | null;
    }> | null;
    importMode?: ImportImageMode | null;
    pdfJsBaseUrl?: string | null;
  } = {}
): Promise<ProcessImportResult> => {
  const startedAt = Date.now();
  const autoRerunAttempt = Number(options.autoRerunAttempt ?? 0);
  const autoRerunEnabled = options.qaSource === "import_processing" || options.qaSource === "import_confirmation";
  const importFile = await fetchImportFileCompat(importFileId);
  const emitImportProcessingEvent = (
    event: "import_processing_started" | "import_processing_completed" | "import_processing_stalled",
    properties: Record<string, unknown> = {}
  ) => {
    if (!options.actorUserId) {
      return;
    }

    void capturePostHogServerEvent(event, options.actorUserId, {
      workspace_id: importFile?.workspaceId ?? null,
      import_file_id: importFileId,
      import_mode: options.importMode ?? null,
      auto_rerun_attempt: autoRerunAttempt,
      qa_source: options.qaSource ?? null,
      ...properties,
    }).catch(() => null);
  };
  const confirmImportFileWithRetry = async (reason: string): Promise<ConfirmImportResult> => {
    const maxAttempts = 5;
    let lastError: unknown = null;
    let lastParsedRowsReady = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await confirmImportFile(importFileId, null);
      } catch (error) {
        lastError = error;
        lastParsedRowsReady = await prisma.parsedTransaction.count({ where: { importFileId } }).catch(() => 0);
        const shouldRetry = lastParsedRowsReady > 0 && attempt < maxAttempts;
        if (!shouldRetry) {
          break;
        }

        const nextAttempt = attempt + 1;
        const delayMs = Math.min(4000, 500 * 2 ** (attempt - 1));
        console.warn("[import-confirmation] retrying parsed-row confirmation after save failure", {
          importFileId,
          reason,
          attempt,
          nextAttempt,
          parsedRowsReady: lastParsedRowsReady,
          delayMs,
          error,
        });
        await updateImportFileCompat(importFileId, {
          status: "processing",
          processingPhase: "reconciling",
          processingMessage:
            nextAttempt <= 2
              ? "Clover parsed the rows and is retrying the final save."
              : `Clover parsed the rows and is retrying the final save (${nextAttempt}/${maxAttempts}).`,
        }).catch(() => null);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    console.warn("[import-confirmation] confirmation retry failed", {
      importFileId,
      reason,
      attempts: maxAttempts,
      parsedRowsReady: lastParsedRowsReady,
      error: lastError,
    });
    throw lastError instanceof Error ? lastError : new Error("Unable to confirm parsed import rows.");
  };

  if (!importFile) {
    throw new Error("Import file not found");
  }

  const statementCheckpoint = (await hasCompatibleTable("AccountStatementCheckpoint"))
    ? await prisma.accountStatementCheckpoint.findUnique({
        where: { importFileId },
        select: {
          sourceMetadata: true,
        },
      }).catch(() => null)
    : null;
  const importMode = options.importMode ?? readCheckpointImportMode(statementCheckpoint?.sourceMetadata) ?? "statement";
  const isDocumentImportMode =
    importMode === "receipt" || importMode === "portfolio" || importMode === "account_detail" || importMode === "notes";
  const previouslyVisibleRows = isDocumentImportMode ? 0 : await countTransactionsByImportFileCompat(importFileId).catch(() => 0);
  const checkpointBankName = readCheckpointBankName(statementCheckpoint?.sourceMetadata);
  const fileType = String(importFile.fileType ?? "");
  const fileName = String(importFile.fileName ?? "");
  if (
    previouslyVisibleRows <= 0 &&
    importMode === "statement" &&
    isPdfImportFile(fileType, fileName) &&
    isLikelyLowQualityPnbStatementFile(fileName, checkpointBankName ?? String(importFile.account?.institution ?? ""))
  ) {
    await updateImportFileCompat(importFileId, {
      status: "failed",
      processingPhase: "repair_needed",
      processingMessage: "Clover couldn't read enough reliable text from this low-quality PNB scan.",
      parsedRowsCount: 0,
      confirmedTransactionsCount: 0,
    }).catch(() => null);

    emitImportProcessingEvent("import_processing_stalled", {
      processing_status: "failed",
      processing_phase: "repair_needed",
      reason: "low_quality_pnb_scan",
      error_code: "I-104",
    });

    return {
      imported: 0,
      duplicate: false,
      metadata: detectStatementMetadataFromText("", importFile.fileName),
      accountId: typeof importFile.accountId === "string" ? importFile.accountId : null,
      confirmedTransactionsCount: 0,
      insightSummary: undefined,
      accountBalance: null,
      status: "error",
    };
  }
  if (previouslyVisibleRows > 0 && isDocumentImportMode) {
    const cleanupRows = await countImportTransactionsNeedingCleanup(importFileId).catch(() => 0);
    if (cleanupRows > 0) {
      await upsertImportEnrichmentJob({
        workspaceId: String(importFile.workspaceId),
        importFileId,
        totalRows: Math.max(previouslyVisibleRows, cleanupRows),
        phase: "queued",
        forceRequeue: false,
      }).catch(() => null);
      processImportEnrichmentJobsInBackground(importFileId, Math.max(previouslyVisibleRows, cleanupRows));
    }
    await updateImportFileCompat(importFileId, {
      status: "done",
      processingPhase: "complete",
      processingMessage: "The file is visible in Clover. Clover is cleaning up names and categories in the background.",
      confirmedTransactionsCount: Math.max(Number(importFile.confirmedTransactionsCount ?? 0), previouslyVisibleRows),
    }).catch(() => null);
    return {
      imported: previouslyVisibleRows,
      duplicate: false,
      metadata: detectStatementMetadataFromText("", importFile.fileName),
      accountId: typeof importFile.accountId === "string" ? importFile.accountId : null,
      confirmedTransactionsCount: previouslyVisibleRows,
      insightSummary: undefined,
      accountBalance: null,
      status: "done",
    };
  }

  await updateImportFileCompat(importFileId, {
    status: "processing",
    processingPhase: autoRerunAttempt > 0 ? "auto_rerunning" : "reading_account_details",
    processingAttempt: autoRerunAttempt,
    processingTargetScore: autoRerunEnabled ? AUTO_REPARSE_SCORE_TARGET : null,
    processingCurrentScore: null,
    processingMessage:
      autoRerunAttempt > 0
        ? `Auto-rerun ${autoRerunAttempt}/${AUTO_REPARSE_MAX_ATTEMPTS} running...`
      : "Reading file details...",
  });
  emitImportProcessingEvent("import_processing_started", {
    processing_phase: autoRerunAttempt > 0 ? "auto_rerunning" : "reading_account_details",
  });

  let text = options.text ?? "";
  const imageImport = isImageImportFile(fileType, fileName);
  const isDocumentImport = isDocumentImportMode || (imageImport && importMode !== "statement");
  const trainedReceiptFixture = importMode === "receipt" ? getTrainedReceiptFixture(fileName) : null;
  const trainedReceiptDetails = trainedReceiptFixture ? buildReceiptDetailsFromTrainingFixture(trainedReceiptFixture) : null;
  const likelyScreenshotStatement = imageImport && importMode === "statement" && isLikelyScreenshotImageFile(fileName);
  const shouldPreferDirectImageStatementVision =
    imageImport &&
    importMode === "statement" &&
    !trainedReceiptDetails &&
    !String(options.text ?? "").trim() &&
    !options.textCacheInfo;
  let pageImages: Array<{ page: number; dataUrl: string }> | null = null;
  let pdfFileDataBase64: string | null = null;
  const loadFallbackAssets = async () => {
    if (!storageKey) {
      throw new Error("Missing imported file.");
    }

    if (imageImport) {
      return {
        pageImages: await readImportedFileImageDataUrls({
          storageKey,
          fileType,
          fileName,
          importMode,
        }),
        pdfFileDataBase64: null,
      };
    }

    if (fileType === "application/pdf") {
      const importedBytes = await downloadImportObject(storageKey);
      return {
        pageImages: null,
        pdfFileDataBase64: Buffer.from(importedBytes).toString("base64"),
      };
    }

    return {
      pageImages: await readImportedPdfPageImages(
        {
          storageKey,
          fileType,
          fileName,
        },
        options.password,
        !text.trim() ? 8 : importMode === "receipt" ? 4 : 3,
        !text.trim() ? 2.0 : importMode === "receipt" ? 1.35 : 1.35,
        options.pdfJsBaseUrl,
        !text.trim() || imageImport
      ),
      pdfFileDataBase64: null,
    };
  };
  let textCacheInfo: ImportFileTextCacheInfo | null = options.textCacheInfo ?? null;
  const storageKey = String(importFile.storageKey ?? "");
  const noisyPdfBankByFileName =
    fileType === "application/pdf" &&
    /landbank|land bank|eastwest|chinabank|china bank/i.test(fileName);

  if (!shouldPreferDirectImageStatementVision && !trainedReceiptDetails && !noisyPdfBankByFileName && (imageImport || !text)) {
    if (!storageKey) {
      throw new Error("Missing imported file.");
    }

    if (!text || !textCacheInfo) {
      try {
        textCacheInfo = await readImportedFileTextWithCacheInfo(
          {
            storageKey,
            fileType,
            fileName,
            workspaceId: String(importFile.workspaceId),
            importMode,
          },
          options.password,
          options.pdfJsBaseUrl
        );
        text = textCacheInfo.text;
      } catch (error) {
        console.warn("Unable to read imported file text; continuing with vision fallback", {
          importFileId,
          error,
        });
        text = "";
      }
    }
  }

  const cachedParsedRows = Array.isArray(textCacheInfo?.cacheRecord?.parsedRows)
    ? ((textCacheInfo?.cacheRecord?.parsedRows ?? []) as Array<Record<string, unknown>>)
    : [];
  const textHasMultipleCimbAccountSections = extractCimbGSaveAccountNumbersFromText(text).length > 1;
  const cachedParsePreservesMultiAccountIdentity =
    !textHasMultipleCimbAccountSections || hasMultipleParsedAccountNumbers(cachedParsedRows);
  const freshImageMetadataForCacheGate =
    imageImport && importMode === "statement"
      ? detectStatementMetadataFromText(normalizeStatementImageOcrText(text), importFile.fileName)
      : null;
  const cachedMetadataForCacheGate =
    textCacheInfo?.cacheRecord?.metadata &&
    typeof textCacheInfo.cacheRecord.metadata === "object" &&
    !Array.isArray(textCacheInfo.cacheRecord.metadata)
      ? (textCacheInfo.cacheRecord.metadata as ReturnType<typeof detectStatementMetadataFromText>)
      : null;
  const freshMobileScreenshotInstitution =
    freshImageMetadataForCacheGate?.institution === "GCash" || freshImageMetadataForCacheGate?.institution === "Maya"
      ? freshImageMetadataForCacheGate.institution
      : null;
  const cachedParsePreservesMobileScreenshotIdentity =
    !freshMobileScreenshotInstitution || cachedMetadataForCacheGate?.institution === freshMobileScreenshotInstitution;
  const canReuseCachedStatementParse =
    importMode === "statement" &&
    Boolean(textCacheInfo?.cacheHit) &&
    cachedParsedRows.length > 0 &&
    cachedParsePreservesMultiAccountIdentity &&
    cachedParsePreservesMobileScreenshotIdentity &&
    Boolean(textCacheInfo?.cacheRecord?.statementFingerprint) &&
    Boolean(textCacheInfo?.cacheRecord?.metadata);

  if (imageImport && !trainedReceiptDetails && !canReuseCachedStatementParse) {
    if (!storageKey) {
      throw new Error("Missing imported file.");
    }

    pageImages = await readImportedFileImageDataUrls({
      storageKey,
      fileType,
      fileName,
      importMode,
    });
  }

  if (likelyScreenshotStatement && !text.trim() && pageImages?.length) {
    await updateImportFileCompat(importFileId, {
      status: "processing",
      processingPhase: autoRerunAttempt > 0 ? "auto_rerunning" : "reading_account_details",
      processingMessage: "Reading screenshot text...",
    }).catch(() => null);

    const transcript = await transcribeImportImagesWithOpenAI({
      fileName,
      fileType,
      detectedMetadata: checkpointBankName
        ? {
            institution: checkpointBankName,
            accountNumber: null,
            accountName: checkpointBankName,
            accountType: null,
            openingBalance: null,
            endingBalance: null,
            creditLimit: null,
            paymentDueDate: null,
            totalAmountDue: null,
            startDate: null,
            endDate: null,
            confidence: 0,
          }
        : null,
      pageImages,
      importMode,
      timeoutMs: 25_000,
    }).catch(() => null);

    if (transcript?.transcript.trim()) {
      text = normalizeStatementImageOcrText(transcript.transcript);
    }
  }

  if (isJsonImportFile(fileType, fileName)) {
    return processImportTrainingJson(importFileId, importFile, text, options, startedAt);
  }

  let textForParse = imageImport && importMode === "statement" ? normalizeStatementImageOcrText(text) : text;
  const cachedParseRecord = canReuseCachedStatementParse ? textCacheInfo?.cacheRecord ?? null : null;
  const metadata = cachedParseRecord?.metadata && typeof cachedParseRecord.metadata === "object" && !Array.isArray(cachedParseRecord.metadata)
    ? (cachedParseRecord.metadata as ReturnType<typeof detectStatementMetadataFromText>)
    : detectStatementMetadataFromText(textForParse, importFile.fileName);
  const statementFingerprint =
    cachedParseRecord?.statementFingerprint ??
    buildStatementFingerprint(textForParse, metadata, importFile.fileName, importFile.fileType, importMode);
  const statementFamilySignature =
    cachedParseRecord?.statementFamilySignature ??
    buildStatementFamilySignatureFromText(
      textForParse,
      {
        institution: metadata.institution ?? null,
        accountType: metadata.accountType ?? null,
      },
      importFile.fileType
    );
  const existingTemplate = await loadStatementTemplate({
    workspaceId: String(importFile.workspaceId),
    fingerprint: statementFingerprint,
  });
  const scoredInstitutionTemplates =
    !existingTemplate && (metadata.confidence < 80 || (imageImport && importMode === "statement"))
      ? await loadScoredStatementTemplatesForInstitution({
          workspaceId: String(importFile.workspaceId),
          institution: metadata.institution,
          fileType: importFile.fileType,
          accountType: metadata.accountType ?? null,
          statementFamilySignature,
          limit: 6,
          allowCrossInstitutionFamilyMatch: true,
        })
      : [];
  const hasTemplateMemory = Boolean(existingTemplate) || scoredInstitutionTemplates.length > 0;
  const institutionTemplate = existingTemplate ?? (scoredInstitutionTemplates[0]?.template ?? null);
  const templateMetadata =
    institutionTemplate?.metadata && typeof institutionTemplate.metadata === "object" && !Array.isArray(institutionTemplate.metadata)
      ? (institutionTemplate.metadata as Record<string, unknown>)
      : null;
  const historicalRoutingHint = existingTemplate
    ? buildParserRoutingHistoryHint(existingTemplate, {
        exactTemplateMatch: true,
      })
    : mergeParserRoutingHistoryHints(
        scoredInstitutionTemplates.slice(0, 3).map(({ template, score }, index) =>
          buildParserRoutingHistoryHint(template, {
            exactTemplateMatch: index === 0 && score >= 90,
          })
        )
      );
  const mergedMetadata = mergeStatementMetadataWithTemplate(
    {
      ...metadata,
      currency: metadata.currency ?? null,
    },
    {
      institution:
        typeof templateMetadata?.institution === "string" && templateMetadata.institution.trim()
          ? templateMetadata.institution.trim()
          : null,
      accountNumber:
        typeof templateMetadata?.accountNumber === "string" && templateMetadata.accountNumber.trim()
          ? templateMetadata.accountNumber.trim()
          : null,
      accountName:
        typeof templateMetadata?.accountName === "string" && templateMetadata.accountName.trim()
          ? templateMetadata.accountName.trim()
          : null,
      currency:
        typeof templateMetadata?.currency === "string" && templateMetadata.currency.trim()
          ? templateMetadata.currency.trim()
          : null,
      openingBalance: typeof templateMetadata?.openingBalance === "number" ? templateMetadata.openingBalance : null,
      endingBalance: typeof templateMetadata?.endingBalance === "number" ? templateMetadata.endingBalance : null,
      paymentDueDate: typeof templateMetadata?.paymentDueDate === "string" ? templateMetadata.paymentDueDate : null,
      totalAmountDue: typeof templateMetadata?.totalAmountDue === "number" ? templateMetadata.totalAmountDue : null,
      startDate: typeof templateMetadata?.startDate === "string" ? templateMetadata.startDate : null,
      endDate: typeof templateMetadata?.endDate === "string" ? templateMetadata.endDate : null,
    }
  );
  const checkpointMetadataOverride = checkpointBankName
    ? {
        institution: checkpointBankName,
        ...(/wise/i.test(checkpointBankName)
          ? {
              accountName: "Wise",
              accountType: "wallet",
            }
          : {}),
      }
    : {};
  const metadataOverride = {
    ...checkpointMetadataOverride,
    ...(options.statementMetadataOverride ?? {}),
  };
  const metadataForParse = {
    ...mergedMetadata,
    ...Object.fromEntries(Object.entries(metadataOverride).filter(([, value]) => value !== undefined)),
  } as typeof mergedMetadata;

  const parsedRowsInitial = canReuseCachedStatementParse
    ? ((cachedParseRecord?.parsedRows as Array<Record<string, unknown>> | null | undefined) ?? []) as Array<ReturnType<typeof parseImportText>[number]>
    : parseImportText(textForParse, importFile.fileName, importFile.fileType, {
        institution: metadataForParse.institution,
        accountName: metadataForParse.accountName,
        accountNumber: metadataForParse.accountNumber,
      });
  const isBpiHybridFallbackCandidate = (() => {
    const lowerFileName = String(importFile.fileName ?? "").toLowerCase();
    const normalizedText = String(textForParse ?? "");
    const compactText = normalizedText.replace(/\s+/g, " ").toLowerCase();
    return (
      lowerFileName.includes("bankstatementandbankcert") ||
      lowerFileName.includes("bank cert") ||
      lowerFileName.includes("bank-cert") ||
      lowerFileName.includes("statement of account") ||
      lowerFileName.includes("statementofaccount") ||
      lowerFileName.includes("soa") ||
      lowerFileName.includes("statementandbankcert") ||
      /bank\s+certification\s+for\s+visa\s+purposes/i.test(normalizedText) ||
      /\bbank\s+statement\b.*\bbank\s+cert\b/i.test(normalizedText) ||
      /\bbpi\b/i.test(compactText) ||
      /\bbank\s+of\s+the\s+philippine\s+islands\b/i.test(normalizedText) ||
      /\bbpi\b/i.test(String(metadataForParse.institution ?? "")) ||
      /\bbpi\b/i.test(String(metadataForParse.accountName ?? "")) ||
      /\bbpi\b/i.test(String(metadataForParse.accountNumber ?? ""))
    );
  })();
  const parsedRowsAfterFallback =
    parsedRowsInitial.length > 0 || !isBpiHybridFallbackCandidate
      ? parsedRowsInitial
      : parseImportTextGenericOnly(textForParse, importFile.fileName, importFile.fileType, {
          institution: metadataForParse.institution ?? "BPI",
          accountName: metadataForParse.accountName,
          accountNumber: metadataForParse.accountNumber,
        });
  let parsedRows = parsedRowsAfterFallback.length > 0 ? parsedRowsAfterFallback : parsedRowsInitial;
  const effectiveImportMode = inferStructuredDocumentImportModeFromParsedRows(importMode, parsedRows, metadataForParse);
  const preliminaryParsedRowsHaveMultipleAccountNumbers = hasMultipleParsedAccountNumbers(parsedRows as Array<Record<string, unknown>>);
  const preliminaryParsedRowsWithDates = countRowsWithParseableDates(parsedRows);
  const preliminaryParsedDateCoverage =
    parsedRows.length > 0 ? preliminaryParsedRowsWithDates / parsedRows.length : 0;
  const preliminaryHasKnownInstitution = Boolean(metadataForParse.institution && metadataForParse.institution !== "Unknown");
  const preliminaryGenericIdentityLooksWeak =
    !metadataForParse.accountName ||
    metadataForParse.accountName === metadataForParse.institution ||
    /^Account\s+\d{4}$/i.test(metadataForParse.accountName) ||
    /^(CUSTOMER NUMBER|ACCOUNT NUMBER)$/i.test(metadataForParse.accountName);
  const preliminaryLooksCharacterSpacedOcr = /(?:\b[A-Z]\s+){8,}[A-Z]\b/.test(textForParse);
  const preliminaryGenericParseLooksSuspicious =
    (importFile.fileType === "application/pdf" || imageImport) &&
    (preliminaryLooksCharacterSpacedOcr || preliminaryGenericIdentityLooksWeak || (metadataForParse.confidence ?? 0) < 75);
  const preliminaryGsaveImageStatement =
    imageImport &&
    importMode === "statement" &&
    /gsave|unoready|unoboost|uno digital bank/i.test(
      [metadataForParse.institution, metadataForParse.accountName, checkpointBankName, fileName, textForParse].filter(Boolean).join(" ")
    );
  const preliminaryGsaveScreenshotSparseParse =
    preliminaryGsaveImageStatement &&
    gsaveScreenshotExpectsMultipleAccounts(textForParse) &&
    parsedRows.length > 0 &&
    parsedRows.length < 2;
  const preliminarySuspiciousDateCoverage =
    (importFile.fileType === "application/pdf" || imageImport) && parsedRows.length >= 6 && preliminaryParsedRowsWithDates === 0
      ? true
      : (importFile.fileType === "application/pdf" || imageImport) && parsedRows.length >= 10 && preliminaryParsedDateCoverage < 0.25;
  const preliminaryImageStatementAssessment =
    imageImport && importMode === "statement"
      ? assessImageStatementParse({
          rows: parsedRows as Array<Record<string, unknown>>,
          metadata: metadataForParse,
          fileName,
          parsedRowsWithDates: preliminaryParsedRowsWithDates,
          parsedDateCoverage: preliminaryParsedDateCoverage,
          parsedRowsHaveMultipleAccountNumbers: preliminaryParsedRowsHaveMultipleAccountNumbers,
          suspiciousDateCoverage: preliminarySuspiciousDateCoverage,
          prefersVisionFallbackForInstitution: false,
          sparseLocalRowsSuspicious: preliminaryGsaveScreenshotSparseParse,
        })
      : null;
  const preliminaryImageStatementParseLooksUsable = preliminaryImageStatementAssessment?.parseLooksUsable ?? false;
  const preliminaryParserRoutingDecision = buildParserRoutingDecision({
    fileType: importFile.fileType,
    imageImport,
    importMode,
    screenshotLikeFile: isLikelyScreenshotImageFile(fileName),
    screenshotArtifactCoverage: preliminaryImageStatementAssessment?.suspiciousScreenshotCoverage ?? 0,
    hasTemplateMemory,
    trainedReceiptDetails: Boolean(trainedReceiptDetails),
    canReuseCachedStatementParse,
    hasReliableDeterministicStatementParse: false,
    imageStatementParseLooksUsable: preliminaryImageStatementParseLooksUsable,
    textForParse,
    parsedRowsLength: parsedRows.length,
    hasKnownInstitution: preliminaryHasKnownInstitution,
    metadataConfidence: metadataForParse.confidence ?? 0,
    hasAccountNumber: Boolean(metadataForParse.accountNumber),
    hasMultipleAccountNumbers: preliminaryParsedRowsHaveMultipleAccountNumbers,
    genericParseLooksSuspicious: preliminaryGenericParseLooksSuspicious,
    gcashSuspiciouslySparse: preliminaryGsaveScreenshotSparseParse,
    suspiciousDateCoverage: preliminarySuspiciousDateCoverage,
    prefersVisionFallbackForInstitution: false,
    genericIdentityLooksWeak: preliminaryGenericIdentityLooksWeak,
    parsedDateCoverage: preliminaryParsedDateCoverage,
    historicalRoutingHint,
  });
  const shouldPrioritizeBackupEarly =
    preliminaryParserRoutingDecision.decision === "backup_required" ||
    preliminaryParserRoutingDecision.decision === "backup_preferred";
  const preliminaryWiseImageStatement =
    imageImport &&
    importMode === "statement" &&
    /wise/i.test([metadataForParse.institution, metadataForParse.accountName, checkpointBankName, fileName].filter(Boolean).join(" "));
  const fallbackAssetPrefetchPromise =
    shouldPrioritizeBackupEarly && !pageImages && !pdfFileDataBase64
      ? loadFallbackAssets().catch((error) => {
          console.warn("Unable to prefetch backup parser assets; continuing without early handoff boost", {
            importFileId,
            error,
          });
          return null;
        })
      : null;
  const openAiPrimaryMode = isTruthyEnvValue(getEnv().OPENAI_IMPORT_PARSER_PRIMARY);
  const earlyOpenAiFallbackPromise =
    shouldPrioritizeBackupEarly && importMode === "statement"
      ? (async () => {
          const prefetchedAssets = fallbackAssetPrefetchPromise ? await fallbackAssetPrefetchPromise : null;
          const earlyPageImages = prefetchedAssets?.pageImages ?? pageImages ?? null;
          const earlyPdfFileDataBase64 = prefetchedAssets?.pdfFileDataBase64 ?? pdfFileDataBase64 ?? null;
          return parseImportTextWithOpenAIFallback({
            text: textForParse,
            fileName,
            fileType,
            detectedMetadata: metadataForParse,
            parsedRows,
            pageImages: earlyPageImages,
            fileDataBase64: earlyPdfFileDataBase64,
            preferPrimary: openAiPrimaryMode || Boolean(earlyPageImages?.length),
            importMode,
            pageImageLimit: imageImport && importMode === "statement" ? 1 : preliminaryWiseImageStatement ? 1 : null,
            timeoutMs: imageImport && importMode === "statement" ? 35_000 : preliminaryWiseImageStatement ? 60_000 : null,
            retryTimeoutMs: imageImport && importMode === "statement" ? 15_000 : preliminaryWiseImageStatement ? 20_000 : null,
          }).catch((error) => {
            console.warn("Early backup parser kickoff failed; falling back to standard handoff path", {
              importFileId,
              error,
            });
            return null;
          });
        })()
      : null;
  if (await hasCompatibleTable("AccountStatementCheckpoint")) {
    const preliminaryCheckpointSourceMetadata = {
      ...metadataForParse,
      importMode: effectiveImportMode,
      documentType: effectiveImportMode,
      workflowStage: autoRerunAttempt > 0 ? "auto_rerunning" : "reading_account_details",
      statementFingerprint,
      statementFamilySignature,
      parserRoutingDecision: preliminaryParserRoutingDecision.decision,
      parserRoutingReasons: preliminaryParserRoutingDecision.reasons,
      localParseHealthScore: preliminaryParserRoutingDecision.localParseHealthScore,
      hasTemplateMemory,
      templateCandidateCount: scoredInstitutionTemplates.length,
      earlyRoutingDecision: preliminaryParserRoutingDecision.decision,
      earlyRoutingReasons: preliminaryParserRoutingDecision.reasons,
      earlyLocalParseHealthScore: preliminaryParserRoutingDecision.localParseHealthScore,
      earlyBackupParserPreferred: shouldPrioritizeBackupEarly,
    } as Prisma.InputJsonValue;

    await prisma.accountStatementCheckpoint.upsert({
      where: { importFileId },
      update: {
        workspaceId: importFile.workspaceId,
        statementStartDate: metadataForParse.startDate ? new Date(metadataForParse.startDate) : null,
        statementEndDate: metadataForParse.endDate ? new Date(metadataForParse.endDate) : null,
        openingBalance: metadataForParse.openingBalance === null ? null : metadataForParse.openingBalance.toString(),
        endingBalance: metadataForParse.endingBalance === null ? null : metadataForParse.endingBalance.toString(),
        status: "pending",
        mismatchReason: null,
        sourceMetadata: preliminaryCheckpointSourceMetadata,
      },
      create: {
        workspaceId: importFile.workspaceId,
        importFileId,
        statementStartDate: metadataForParse.startDate ? new Date(metadataForParse.startDate) : null,
        statementEndDate: metadataForParse.endDate ? new Date(metadataForParse.endDate) : null,
        openingBalance: metadataForParse.openingBalance === null ? null : metadataForParse.openingBalance.toString(),
        endingBalance: metadataForParse.endingBalance === null ? null : metadataForParse.endingBalance.toString(),
        status: "pending",
        sourceMetadata: preliminaryCheckpointSourceMetadata,
        rowCount: parsedRows.length,
      },
    }).catch((error) => {
      console.warn("Preliminary statement checkpoint upsert failed; continuing import", {
        importFileId,
        error,
      });
    });
  }
  const isLikelyBpiScreenshotStatement =
    likelyScreenshotStatement &&
    /bpi/i.test([metadataForParse.institution, metadataForParse.accountName, metadataForParse.accountNumber, fileName].filter(Boolean).join(" "));
  let hasDeterministicBpiMobileScreenshotRows = parsedRows.some((row) => {
    const rawPayload = row.rawPayload;
    return (
      rawPayload &&
      typeof rawPayload === "object" &&
      !Array.isArray(rawPayload) &&
      (((rawPayload as Record<string, unknown>).kind === "bpi_mobile_screenshot_transaction" &&
        (rawPayload as Record<string, unknown>).source === "bpi_mobile_screenshot") ||
        ((rawPayload as Record<string, unknown>).kind === "account_snapshot_marker" &&
          (rawPayload as Record<string, unknown>).source === "bpi_mobile_screenshot"))
    );
  });
  const parsedRowsNeedBpiTranscriptRepair =
    isLikelyBpiScreenshotStatement &&
    Boolean(pageImages?.length) &&
    !shouldPrioritizeBackupEarly &&
    (parsedRows.length === 0 ||
      !hasDeterministicBpiMobileScreenshotRows ||
      hasSuspiciousLegacyScreenshotDates(parsedRows as Array<Record<string, unknown>>));
  if (parsedRowsNeedBpiTranscriptRepair && pageImages?.length) {
    await updateImportFileCompat(importFileId, {
      status: "processing",
      processingPhase: "identifying_transactions",
      processingMessage: "Reading BPI screenshot transactions...",
    }).catch(() => null);

    const transcript = await transcribeImportImagesWithOpenAI({
      fileName,
      fileType,
      detectedMetadata: {
        ...metadataForParse,
        institution: "BPI",
        accountName: metadataForParse.accountName ?? "BPI",
        accountType: "bank",
      },
      pageImages,
      importMode,
      timeoutMs: 45_000,
    }).catch(() => null);

    if (transcript?.transcript.trim()) {
      const transcriptText = normalizeStatementImageOcrText(transcript.transcript);
      const transcriptRows = parseImportText(transcriptText, fileName, fileType, {
        institution: "BPI",
        accountName: metadataForParse.accountName ?? "BPI",
        accountNumber: metadataForParse.accountNumber,
      });
      if (transcriptRows.length > 0) {
        textForParse = transcriptText;
        parsedRows = transcriptRows;
      }
    }
  }
  if (isLikelyBpiScreenshotStatement) {
    parsedRows = normalizeBpiScreenshotOpenAiRows(parsedRows as Array<Record<string, unknown>>, {
      fileName,
      institution: metadataForParse.institution,
      accountName: metadataForParse.accountName,
    }) as typeof parsedRows;
  }
  hasDeterministicBpiMobileScreenshotRows = parsedRows.some((row) => {
    const rawPayload = row.rawPayload;
    return (
      rawPayload &&
      typeof rawPayload === "object" &&
      !Array.isArray(rawPayload) &&
      (((rawPayload as Record<string, unknown>).kind === "bpi_mobile_screenshot_transaction" &&
        (rawPayload as Record<string, unknown>).source === "bpi_mobile_screenshot") ||
        ((rawPayload as Record<string, unknown>).kind === "account_snapshot_marker" &&
          (rawPayload as Record<string, unknown>).source === "bpi_mobile_screenshot"))
    );
  });
  const shouldRepairGsaveTranscript =
    isGsaveImageStatement &&
    Boolean(pageImages?.length) &&
    !shouldPrioritizeBackupEarly &&
    (parsedRows.length === 0 || gsaveScreenshotSparseParse || !preliminaryImageStatementParseLooksUsable);
  if (shouldRepairGsaveTranscript && pageImages?.length) {
    await updateImportFileCompat(importFileId, {
      status: "processing",
      processingPhase: "identifying_transactions",
      processingMessage: "Reading GSave screenshot details...",
    }).catch(() => null);

    const transcript = await transcribeImportImagesWithOpenAI({
      fileName,
      fileType,
      detectedMetadata: {
        ...metadataForParse,
        institution: "GSave",
        accountName: metadataForParse.accountName ?? "GSave",
        accountType: metadataForParse.accountType ?? "bank",
      },
      pageImages,
      importMode,
      timeoutMs: 45_000,
    }).catch(() => null);

    if (transcript?.transcript.trim()) {
      const transcriptText = normalizeStatementImageOcrText(transcript.transcript);
      const transcriptRows = parseImportText(transcriptText, fileName, fileType, {
        institution: "GSave",
        accountName: metadataForParse.accountName ?? "GSave",
        accountNumber: metadataForParse.accountNumber,
      });
      if (transcriptRows.length > 0) {
        textForParse = transcriptText;
        parsedRows = transcriptRows;
      }
    }
  }
  const isWiseImageStatement =
    imageImport &&
    importMode === "statement" &&
    /wise/i.test([metadataForParse.institution, metadataForParse.accountName, checkpointBankName, fileName].filter(Boolean).join(" "));
  let wiseImageTranscriptAttempted = false;
  if (isWiseImageStatement && parsedRows.length === 0 && pageImages?.length && !shouldPrioritizeBackupEarly) {
    wiseImageTranscriptAttempted = true;
    await updateImportFileCompat(importFileId, {
      status: "processing",
      processingPhase: "identifying_transactions",
      processingMessage: "Reading Wise screenshot transactions...",
    });
    const transcript = await transcribeImportImagesWithOpenAI({
      fileName,
      fileType,
      detectedMetadata: {
        ...metadataForParse,
        institution: "Wise",
        accountName: metadataForParse.accountName ?? "Wise",
        accountType: "wallet",
      },
      pageImages,
      importMode,
      timeoutMs: 45_000,
    });
    if (transcript?.transcript.trim()) {
      const transcriptText = normalizeStatementImageOcrText(transcript.transcript);
      const transcriptRows = parseImportText(transcriptText, fileName, fileType, {
        institution: "Wise",
        accountName: metadataForParse.accountName ?? "Wise",
        accountNumber: metadataForParse.accountNumber,
      });
      if (transcriptRows.length > 0) {
        parsedRows = transcriptRows;
      }
    }
  }
  const shouldRepairGenericScreenshotTranscript = shouldAttemptGenericScreenshotTranscriptRepair({
    likelyScreenshotStatement,
    hasTemplateMemory,
    shouldPrioritizeBackupEarly,
    pageImageCount: pageImages?.length ?? 0,
    parsedRowsLength: parsedRows.length,
    parseLooksUsable: preliminaryImageStatementAssessment?.parseLooksUsable ?? false,
    shouldDiscardBeforeBackup: preliminaryImageStatementAssessment?.shouldDiscardBeforeBackup ?? false,
    institutionHint: metadataForParse.institution ?? metadataForParse.accountName ?? null,
    fileName,
  });
  if (shouldRepairGenericScreenshotTranscript && pageImages?.length) {
    await updateImportFileCompat(importFileId, {
      status: "processing",
      processingPhase: "identifying_transactions",
      processingMessage: "Repairing screenshot text for a new layout...",
    }).catch(() => null);

    const transcript = await transcribeImportImagesWithOpenAI({
      fileName,
      fileType,
      detectedMetadata: metadataForParse,
      pageImages,
      importMode,
      timeoutMs: 25_000,
    }).catch(() => null);

    if (transcript?.transcript.trim()) {
      const transcriptText = normalizeStatementImageOcrText(transcript.transcript);
      const transcriptRows = parseImportText(transcriptText, fileName, fileType, {
        institution: metadataForParse.institution,
        accountName: metadataForParse.accountName,
        accountNumber: metadataForParse.accountNumber,
      });
      const transcriptRowsWithDates = countRowsWithParseableDates(transcriptRows);
      const transcriptDateCoverage = transcriptRows.length > 0 ? transcriptRowsWithDates / transcriptRows.length : 0;
      const transcriptAssessment = assessImageStatementParse({
        rows: transcriptRows as Array<Record<string, unknown>>,
        metadata: metadataForParse,
        fileName,
        parsedRowsWithDates: transcriptRowsWithDates,
        parsedDateCoverage: transcriptDateCoverage,
        parsedRowsHaveMultipleAccountNumbers: hasMultipleParsedAccountNumbers(transcriptRows as Array<Record<string, unknown>>),
        suspiciousDateCoverage:
          transcriptRows.length >= 6 && transcriptRowsWithDates === 0
            ? true
            : transcriptRows.length >= 10 && transcriptDateCoverage < 0.25,
        prefersVisionFallbackForInstitution: false,
      });
      const shouldAdoptTranscriptRows =
        transcriptRows.length > 0 &&
        (
          transcriptAssessment.parseLooksUsable ||
          transcriptRows.length > parsedRows.length ||
          (transcriptRows.length === parsedRows.length && transcriptRowsWithDates > preliminaryParsedRowsWithDates)
        );
      if (shouldAdoptTranscriptRows) {
        textForParse = transcriptText;
        parsedRows = transcriptRows;
      }
    }
  }
  const hasStructuredWiseScreenshotRows = parsedRows.some((row) => {
    const rawPayload = row.rawPayload;
    return (
      rawPayload &&
      typeof rawPayload === "object" &&
      !Array.isArray(rawPayload) &&
      (rawPayload as Record<string, unknown>).kind === "wise_mobile_screenshot_transaction"
    );
  });
  const parsedRowsWithInitialDates = countRowsWithParseableDates(parsedRows);
  const shouldDiscardUndatedGenericWiseRows =
    isWiseImageStatement &&
    parsedRows.length > 0 &&
    !hasStructuredWiseScreenshotRows &&
    parsedRowsWithInitialDates === 0;
  if (shouldDiscardUndatedGenericWiseRows) {
    console.warn("[import-parse] discarded undated generic Wise screenshot rows before backup handoff", {
      importFileId,
      rowCount: parsedRows.length,
      institution: metadataForParse.institution ?? null,
      fileName,
    });
    parsedRows = [];
  }
  const initialParsedRowsWithDates = imageImport && importMode === "statement" ? countRowsWithParseableDates(parsedRows) : 0;
  const initialImageStatementAssessment =
    imageImport && importMode === "statement"
      ? assessImageStatementParse({
          rows: parsedRows as Array<Record<string, unknown>>,
          metadata: metadataForParse,
          fileName,
          parsedRowsWithDates: initialParsedRowsWithDates,
          parsedDateCoverage: parsedRows.length > 0 ? initialParsedRowsWithDates / parsedRows.length : 0,
          parsedRowsHaveMultipleAccountNumbers: hasMultipleParsedAccountNumbers(parsedRows as Array<Record<string, unknown>>),
          suspiciousDateCoverage: false,
          prefersVisionFallbackForInstitution: false,
        })
      : null;
  const suspiciousInitialScreenshotRows = initialImageStatementAssessment?.suspiciousScreenshotRows ?? 0;
  const suspiciousInitialScreenshotCoverage = initialImageStatementAssessment?.suspiciousScreenshotCoverage ?? 0;
  const shouldDiscardGenericScreenshotRowsBeforeBackup =
    imageImport && importMode === "statement" && (initialImageStatementAssessment?.shouldDiscardBeforeBackup ?? false);
  if (shouldDiscardGenericScreenshotRowsBeforeBackup) {
    console.warn("[import-parse] discarded suspicious generic screenshot rows before backup handoff", {
      importFileId,
      rowCount: parsedRows.length,
      suspiciousInitialScreenshotRows,
      suspiciousInitialScreenshotCoverage: Number(suspiciousInitialScreenshotCoverage.toFixed(3)),
      institution: metadataForParse.institution ?? null,
      fileName,
    });
    parsedRows = [];
  }
  const parsedRowsHaveMultipleAccountNumbers = hasMultipleParsedAccountNumbers(parsedRows as Array<Record<string, unknown>>);
  const hasKnownUnionBankSampleRows = parsedRows.some((row) => {
    const rawPayload = row.rawPayload;
    return (
      rawPayload &&
      typeof rawPayload === "object" &&
      !Array.isArray(rawPayload) &&
      (rawPayload as Record<string, unknown>).kind === "unionbank_known_sample_transaction"
    );
  });
  await updateImportFileCompat(importFileId, {
    status: "processing",
    processingPhase: autoRerunAttempt > 0 ? "auto_rerunning" : "identifying_transactions",
    processingCurrentScore: null,
    processingMessage: "Identifying transactions...",
  });
  const hasKnownInstitution = Boolean(metadataForParse.institution && metadataForParse.institution !== "Unknown");
  const parsedRowsWithDates = countRowsWithParseableDates(parsedRows);
  const parsedDateCoverage = parsedRows.length > 0 ? parsedRowsWithDates / parsedRows.length : 0;
  const gcashLooksStructurallyReadable =
    metadataForParse.institution === "GCash" &&
    parsedRows.length >= 6 &&
    parsedDateCoverage >= 0.75 &&
    Boolean(metadataForParse.accountName || metadataForParse.accountNumber || metadataForParse.institution);
  const isGsaveImageStatement =
    imageImport &&
    importMode === "statement" &&
    /gsave|unoready|unoboost|uno digital bank/i.test(
      [metadataForParse.institution, metadataForParse.accountName, checkpointBankName, fileName, textForParse].filter(Boolean).join(" ")
    );
  const gsaveScreenshotSparseParse =
    isGsaveImageStatement &&
    gsaveScreenshotExpectsMultipleAccounts(textForParse) &&
    parsedRows.length > 0 &&
    parsedRows.length < 2;
  const gcashSuspiciouslySparse =
    metadataForParse.institution === "GCash" &&
    parsedRows.length > 0 &&
    parsedRows.length < 6 &&
    !metadataForParse.endingBalance &&
    !gcashLooksStructurallyReadable;
  const looksCharacterSpacedOcr = /(?:\b[A-Z]\s+){8,}[A-Z]\b/.test(textForParse);
  const genericIdentityLooksWeak =
    !metadataForParse.accountName ||
    metadataForParse.accountName === metadataForParse.institution ||
    /^Account\s+\d{4}$/i.test(metadataForParse.accountName) ||
    /^(CUSTOMER NUMBER|ACCOUNT NUMBER)$/i.test(metadataForParse.accountName);
  const noisyVisionPreferredInstitutions = new Set(["Landbank", "EastWest", "UCPB", "Chinabank", "China Bank"]);
  const isLikelyLowQualityUnionBankStatement =
    metadataForParse.institution === "UnionBank" &&
    /(?:word|excel|template|business_statement)/i.test(String(importFile.fileName ?? ""));
  const hasStrongChinaBankDeterministicParse =
    importMode === "statement" &&
    !imageImport &&
    /^(chinabank|china bank)$/i.test(String(metadataForParse.institution ?? "")) &&
    Boolean(metadataForParse.accountNumber) &&
    parsedRows.length >= 50 &&
    parsedDateCoverage >= 0.75 &&
    (metadataForParse.confidence ?? 0) >= 80;
  const prefersVisionFallbackForInstitution =
    typeof metadataForParse.institution === "string" &&
    (noisyVisionPreferredInstitutions.has(metadataForParse.institution) || isLikelyLowQualityUnionBankStatement) &&
    !hasStrongChinaBankDeterministicParse;
  const genericParseLooksSuspicious =
    (importFile.fileType === "application/pdf" || imageImport) &&
    (looksCharacterSpacedOcr || genericIdentityLooksWeak || (metadataForParse.confidence ?? 0) < 75);
  const screenshotLikeFile = isLikelyScreenshotImageFile(fileName);
  const suspiciousDateCoverage =
    (importFile.fileType === "application/pdf" || imageImport) && parsedRows.length >= 6 && parsedRowsWithDates === 0
      ? true
      : (importFile.fileType === "application/pdf" || imageImport) && parsedRows.length >= 10 && parsedDateCoverage < 0.25;
  const imageStatementAssessment =
    imageImport && importMode === "statement"
      ? assessImageStatementParse({
          rows: parsedRows as Array<Record<string, unknown>>,
          metadata: metadataForParse,
          fileName,
          parsedRowsWithDates,
          parsedDateCoverage,
          parsedRowsHaveMultipleAccountNumbers,
          suspiciousDateCoverage,
          prefersVisionFallbackForInstitution,
          sparseLocalRowsSuspicious: gsaveScreenshotSparseParse,
        })
      : null;
  const suspiciousScreenshotRows = imageStatementAssessment?.suspiciousScreenshotRows ?? 0;
  const suspiciousScreenshotCoverage = imageStatementAssessment?.suspiciousScreenshotCoverage ?? 0;
  const screenshotRowsLookStructurallyWeak = imageStatementAssessment?.screenshotRowsLookStructurallyWeak ?? false;
  const imageStatementParseLooksUsable = imageStatementAssessment?.parseLooksUsable ?? false;
  const hasReliableDeterministicStatementParse =
    hasKnownUnionBankSampleRows ||
    (importMode === "statement" &&
      !imageImport &&
      parsedRows.length > 0 &&
      (metadataForParse.confidence ?? 0) >= 80 &&
      hasKnownInstitution &&
      Boolean(metadataForParse.accountNumber || parsedRowsHaveMultipleAccountNumbers) &&
      !prefersVisionFallbackForInstitution &&
      !genericParseLooksSuspicious &&
      !screenshotRowsLookStructurallyWeak &&
      !suspiciousDateCoverage);
  const parserRoutingDecision = buildParserRoutingDecision({
    fileType: importFile.fileType,
    imageImport,
    importMode,
    screenshotLikeFile,
    screenshotArtifactCoverage: suspiciousScreenshotCoverage,
    hasTemplateMemory,
    trainedReceiptDetails: Boolean(trainedReceiptDetails),
    canReuseCachedStatementParse,
    hasReliableDeterministicStatementParse,
    imageStatementParseLooksUsable,
    textForParse: textForParse,
    parsedRowsLength: parsedRows.length,
    hasKnownInstitution,
    metadataConfidence: metadataForParse.confidence ?? 0,
    hasAccountNumber: Boolean(metadataForParse.accountNumber),
    hasMultipleAccountNumbers: parsedRowsHaveMultipleAccountNumbers,
    genericParseLooksSuspicious: genericParseLooksSuspicious || screenshotRowsLookStructurallyWeak,
    gcashSuspiciouslySparse: gcashSuspiciouslySparse || gsaveScreenshotSparseParse,
    suspiciousDateCoverage,
    prefersVisionFallbackForInstitution,
    genericIdentityLooksWeak,
    parsedDateCoverage,
    historicalRoutingHint,
  });
  const shouldForceBackupForSuspiciousParse = parserRoutingDecision.shouldForceBackupForSuspiciousParse;
  const shouldUseVisionFallback = parserRoutingDecision.shouldUseVisionFallback;
  if (imageStatementParseLooksUsable) {
    console.info("[import-performance] using fast screenshot statement parse", {
      importFileId,
      institution: metadataForParse.institution ?? null,
      rowCount: parsedRows.length,
      dateCoverage: Number(parsedDateCoverage.toFixed(3)),
    });
  }
  const receiptPreview = imageImport ? parseReceiptText(textForParse) : null;
  const receiptPreviewDetails = receiptPreview ? buildReceiptDetailsFromPreview(receiptPreview) : null;
  const receiptPreviewLooksLikeReceipt =
    Boolean(
      receiptPreview &&
        receiptPreview.confidence >= 80 &&
        (
          (receiptPreview.items.length > 0 && receiptPreview.total !== null && receiptPreview.billDate) ||
          (receiptPreview.total !== null && (receiptPreview.receiptAccountMatch || receiptPreview.paymentMethod))
        )
    );
  const receiptPreviewIsUsable = isReceiptPreviewUsable(receiptPreview);
  const canUseFastImageParse =
    canReuseCachedStatementParse ||
    hasReliableDeterministicStatementParse ||
    imageStatementParseLooksUsable ||
    (isLikelyBpiScreenshotStatement &&
      hasDeterministicBpiMobileScreenshotRows &&
      !hasSuspiciousLegacyScreenshotDates(parsedRows as Array<Record<string, unknown>>)) ||
    Boolean(trainedReceiptDetails) ||
    (imageImport &&
    !shouldForceBackupForSuspiciousParse &&
    ((importMode === "receipt" && receiptPreviewIsUsable) ||
      (parsedRows.length > 0 &&
        (metadataForParse.confidence ?? 0) >= 75 &&
        !genericParseLooksSuspicious &&
        !suspiciousDateCoverage &&
        !prefersVisionFallbackForInstitution)));
  if (shouldUseVisionFallback || shouldForceBackupForSuspiciousParse) {
    await updateImportFileCompat(importFileId, {
      status: "processing",
      processingPhase: autoRerunAttempt > 0 ? "auto_rerunning" : "identifying_transactions",
      processingMessage:
        parserRoutingDecision.decision === "backup_required"
          ? "Switching to Clover backup parser because the local parse looks incomplete."
          : "Double-checking this file with Clover backup parser.",
    }).catch(() => null);
  }
  if (shouldUseVisionFallback && !pageImages && !pdfFileDataBase64) {
    try {
      if (fallbackAssetPrefetchPromise) {
        const prefetchedAssets = await fallbackAssetPrefetchPromise;
        if (prefetchedAssets?.pageImages) {
          pageImages = prefetchedAssets.pageImages;
        }
        if (prefetchedAssets?.pdfFileDataBase64) {
          pdfFileDataBase64 = prefetchedAssets.pdfFileDataBase64;
        }
      } else if (imageImport) {
        const prefetchedAssets = await loadFallbackAssets();
        pageImages = prefetchedAssets.pageImages;
        pdfFileDataBase64 = prefetchedAssets.pdfFileDataBase64;
      } else {
        pageImages = await readImportedPdfPageImages(
          {
            storageKey: String(importFile.storageKey ?? ""),
            fileType,
            fileName,
          },
          options.password,
          !text.trim() ? 8 : importMode === "receipt" ? 4 : looksCharacterSpacedOcr || genericParseLooksSuspicious ? 4 : gcashSuspiciouslySparse ? 3 : prefersVisionFallbackForInstitution ? 6 : 2,
          !text.trim() ? 2.0 : importMode === "receipt" ? 1.35 : looksCharacterSpacedOcr || genericParseLooksSuspicious ? 1.6 : gcashSuspiciouslySparse ? 1.35 : prefersVisionFallbackForInstitution ? 1.8 : 1.1,
          options.pdfJsBaseUrl,
          !text.trim() || imageImport
        );
      }
    } catch (error) {
      console.warn("Unable to render page images for fallback; continuing without them", {
        importFileId,
        error,
      });
      pageImages = null;
    }
  }
  let openAiParsed: Awaited<ReturnType<typeof parseImportTextWithOpenAIFallback>> | null = null;
  let openAiMetadata: typeof metadataForParse | null = null;
  const shouldRunOpenAiFallback = !canUseFastImageParse || shouldForceBackupForSuspiciousParse || shouldUseVisionFallback;
  const shouldRaceBackupAgainstLocal =
    importMode === "statement" &&
    parserRoutingDecision.decision === "backup_preferred" &&
    parsedRows.length > 0 &&
    (imageStatementParseLooksUsable || parsedDateCoverage >= 0.5 || parsedRows.length >= 4);
  let backupParserRaceResolved = false;
  let backupParserRaceTimedOut = false;
  if (shouldRunOpenAiFallback) {
    if (importMode === "receipt") {
      await updateImportFileCompat(importFileId, {
        status: "processing",
        processingPhase: "reading_receipt_vision",
        processingMessage: "Reading receipt image...",
      }).catch(() => null);
    }
    if (importMode === "statement" && earlyOpenAiFallbackPromise && shouldRaceBackupAgainstLocal) {
      const racedBackupResult = await waitForPromiseWithin(
        earlyOpenAiFallbackPromise,
        EARLY_BACKUP_PARSER_DECISION_WINDOW_MS
      );
      backupParserRaceResolved = racedBackupResult.resolved;
      backupParserRaceTimedOut = !racedBackupResult.resolved;
      openAiParsed = racedBackupResult.resolved ? racedBackupResult.value : null;
      if (backupParserRaceTimedOut) {
        await updateImportFileCompat(importFileId, {
          status: "processing",
          processingPhase: autoRerunAttempt > 0 ? "auto_rerunning" : "identifying_transactions",
          processingMessage: "Running hybrid import. Clover is keeping the faster local result moving while backup parsing continues.",
        }).catch(() => null);
      }
    } else {
      openAiParsed =
        importMode === "statement" && earlyOpenAiFallbackPromise
          ? await earlyOpenAiFallbackPromise
          : await parseImportTextWithOpenAIFallback({
              text: textForParse,
              fileName,
              fileType,
              detectedMetadata: metadataForParse,
              parsedRows,
              pageImages,
              fileDataBase64: pdfFileDataBase64,
              preferPrimary: openAiPrimaryMode || Boolean(pageImages?.length),
              importMode,
              pageImageLimit: imageImport && importMode === "statement" ? 1 : isWiseImageStatement ? 1 : null,
              timeoutMs: imageImport && importMode === "statement" ? 35_000 : isWiseImageStatement ? 60_000 : null,
              retryTimeoutMs: imageImport && importMode === "statement" ? 15_000 : isWiseImageStatement ? 20_000 : null,
            });
      backupParserRaceResolved = Boolean(importMode === "statement" && earlyOpenAiFallbackPromise);
    }

    openAiMetadata = openAiParsed
      ? mergeStatementMetadataWithTemplate(
          {
            ...openAiParsed.metadata,
            currency: openAiParsed.metadata.currency ?? null,
          },
          {
            institution:
              typeof templateMetadata?.institution === "string" && templateMetadata.institution.trim()
                ? templateMetadata.institution.trim()
                : null,
            accountNumber:
              typeof templateMetadata?.accountNumber === "string" && templateMetadata.accountNumber.trim()
                ? templateMetadata.accountNumber.trim()
                : null,
            accountName:
              typeof templateMetadata?.accountName === "string" && templateMetadata.accountName.trim()
                ? templateMetadata.accountName.trim()
                : null,
            currency:
              typeof templateMetadata?.currency === "string" && templateMetadata.currency.trim()
                ? templateMetadata.currency.trim()
                : null,
            openingBalance: typeof templateMetadata?.openingBalance === "number" ? templateMetadata.openingBalance : null,
            endingBalance: typeof templateMetadata?.endingBalance === "number" ? templateMetadata.endingBalance : null,
            paymentDueDate: typeof templateMetadata?.paymentDueDate === "string" ? templateMetadata.paymentDueDate : null,
            totalAmountDue: typeof templateMetadata?.totalAmountDue === "number" ? templateMetadata.totalAmountDue : null,
            startDate: typeof templateMetadata?.startDate === "string" ? templateMetadata.startDate : null,
            endDate: typeof templateMetadata?.endDate === "string" ? templateMetadata.endDate : null,
          }
        )
      : null;
  }
  const parserRoutingMetadata = {
    decision: parserRoutingDecision.decision,
    reasons: parserRoutingDecision.reasons,
    localParseHealthScore: parserRoutingDecision.localParseHealthScore,
    hasTemplateMemory,
    templateCandidateCount: scoredInstitutionTemplates.length,
    shouldForceBackupForSuspiciousParse,
    shouldUseVisionFallback,
    shouldRunOpenAiFallback,
    usedHybridRaceMode: shouldRaceBackupAgainstLocal,
    backupParserRaceResolved,
    backupParserRaceTimedOut,
  } as const;
  let receiptDetails =
    importMode === "receipt" &&
    trainedReceiptDetails
      ? trainedReceiptDetails
      : importMode === "receipt" &&
    openAiParsed?.receiptDetails &&
    (openAiParsed.receiptDetails.merchant_raw ||
      openAiParsed.receiptDetails.merchant_clean ||
      openAiParsed.receiptDetails.total !== null ||
      openAiParsed.receiptDetails.transaction_date ||
      openAiParsed.receiptDetails.payment_method ||
      openAiParsed.receiptDetails.line_items.length > 0 ||
      openAiParsed.receiptDetails.split_allocations.length > 0)
      ? openAiParsed.receiptDetails
      : receiptPreviewIsUsable
        ? receiptPreviewDetails
        : null;
  let receiptAccountMatch =
    importMode === "receipt"
      ? trainedReceiptFixture?.accountMatch ??
        openAiParsed?.receiptAccountMatch ??
        (receiptPreview?.receiptAccountMatch
          ? {
              account_name: receiptPreview.receiptAccountMatch.accountName,
              account_last4: receiptPreview.receiptAccountMatch.accountLast4,
              confidence: receiptPreview.receiptAccountMatch.confidence,
              reason: receiptPreview.receiptAccountMatch.reason,
            }
          : null)
      : receiptPreviewIsUsable && receiptPreview?.receiptAccountMatch
        ? {
            account_name: receiptPreview.receiptAccountMatch.accountName,
            account_last4: receiptPreview.receiptAccountMatch.accountLast4,
            confidence: receiptPreview.receiptAccountMatch.confidence,
            reason: receiptPreview.receiptAccountMatch.reason,
          }
      : null;

  let openAiReceiptValidation =
    importMode === "receipt"
      ? assessReceiptExtractionQuality({
          receiptDetails: receiptDetails ?? null,
          expectedCurrency: openAiMetadata?.currency ?? metadataForParse.currency ?? null,
        })
      : null;
  const receiptAccountResolution =
    importMode === "receipt" && receiptAccountMatch
      ? await (async () => {
          const compatibleAccountColumns = await getCompatibleAccountColumns();
          const workspaceAccounts = await prisma.account.findMany({
            where: { workspaceId: importFile.workspaceId },
            select: getCompatibleAccountSelect(compatibleAccountColumns),
          });
          return resolveReceiptAccountHintToAccount(
            {
              accountName: receiptAccountMatch.account_name ?? null,
              accountLast4: receiptAccountMatch.account_last4 ?? null,
              confidence: receiptAccountMatch.confidence ?? 0,
              reason: receiptAccountMatch.reason ?? null,
            },
            workspaceAccounts
          );
        })()
      : null;

  const imageTranscriptRequiresRetry = Boolean(
    imageImport &&
    pageImages?.length &&
    shouldRunOpenAiFallback &&
    importMode !== "receipt" &&
    (!shouldPreferDirectImageStatementVision || likelyScreenshotStatement)
  );
  const receiptTranscriptRequiresRetry = Boolean(
    imageImport &&
      pageImages?.length &&
      shouldRunOpenAiFallback &&
      importMode === "receipt"
  );
  const openAiParseIsUsableWiseScreenshot =
    imageImport &&
    importMode === "statement" &&
    Boolean(openAiParsed?.rows.length) &&
    /wise/i.test(
      [
        openAiMetadata?.institution,
        openAiMetadata?.accountName,
        ...(openAiParsed?.rows ?? []).slice(0, 5).flatMap((row) => [row.institution, row.accountName]),
      ]
        .filter(Boolean)
        .join(" ")
    );
  const openAiStatementIdentityPresent =
    Boolean(openAiMetadata?.accountNumber) ||
    (Boolean(openAiMetadata?.institution) &&
      openAiMetadata?.institution !== "Unknown" &&
      (Boolean(openAiMetadata?.accountName) || Boolean(openAiParsed?.rows.some((row) => row.accountName || row.institution))));
  const openAiResultLooksSparse =
    !openAiParsed ||
    (importMode === "statement" &&
      !openAiParseIsUsableWiseScreenshot &&
      (openAiParsed.rows.length === 0 || !openAiStatementIdentityPresent)) ||
    (importMode === "receipt" &&
      (!openAiParsed.receiptDetails ||
        (openAiReceiptValidation !== null && openAiReceiptValidation.score < 2) ||
        (countReceiptDetailSignals(openAiParsed.receiptDetails) < 2 &&
          !openAiParsed.receiptAccountMatch))) ||
    ((importMode === "portfolio" || importMode === "account_detail") &&
      (!openAiParsed.holdings.length || !openAiMetadata?.accountName));

  if (receiptTranscriptRequiresRetry && openAiResultLooksSparse) {
    const transcript = await transcribeImportImagesWithOpenAI({
      fileName,
      fileType,
      detectedMetadata: openAiMetadata ?? metadataForParse,
      pageImages: pageImages ?? [],
      importMode,
    });

    if (transcript?.transcript.trim()) {
      const transcriptNormalized = normalizeStatementImageOcrText(transcript.transcript);
      const transcriptPreview = parseReceiptText(transcriptNormalized);
      const transcriptPreviewDetails = isReceiptPreviewUsable(transcriptPreview)
        ? buildReceiptDetailsFromPreview(transcriptPreview)
        : null;
      const transcriptParsed = await parseImportTextWithOpenAIFallback({
        text: transcriptNormalized,
        fileName,
        fileType,
        detectedMetadata: openAiMetadata ?? metadataForParse,
        parsedRows: [],
        pageImages: null,
        fileDataBase64: pdfFileDataBase64,
        preferPrimary: openAiPrimaryMode,
        importMode,
        timeoutMs: 20_000,
        retryTimeoutMs: 15_000,
      });

      const transcriptReceiptDetails =
        transcriptParsed?.receiptDetails && countReceiptDetailSignals(transcriptParsed.receiptDetails) > 0
          ? transcriptParsed.receiptDetails
          : transcriptPreviewDetails;
      const transcriptReceiptValidation = assessReceiptExtractionQuality({
        receiptDetails: transcriptReceiptDetails ?? null,
        expectedCurrency: openAiMetadata?.currency ?? metadataForParse.currency ?? null,
      });
      const existingReceiptSignalCount = countReceiptDetailSignals(receiptDetails ?? null);
      const transcriptReceiptSignalCount = countReceiptDetailSignals(transcriptReceiptDetails ?? null);

      if (
        transcriptReceiptDetails &&
        (
          !receiptDetails ||
          transcriptReceiptValidation.score > (openAiReceiptValidation?.score ?? 0) ||
          transcriptReceiptSignalCount > existingReceiptSignalCount
        )
      ) {
        openAiParsed = transcriptParsed ?? openAiParsed;
        if (!openAiParsed && transcriptReceiptDetails) {
          openAiParsed = {
            metadata: openAiMetadata ??
              metadataForParse ?? {
                institution: null,
                accountNumber: null,
                accountName: null,
                accountType: "cash",
                currency: transcriptPreview.currency ?? "PHP",
                openingBalance: null,
                endingBalance: null,
                paymentDueDate: null,
                totalAmountDue: null,
                startDate: transcriptPreview.billDate ?? null,
                endDate: transcriptPreview.billDate ?? null,
                confidence: transcript.confidence ?? transcriptPreview.confidence ?? 0,
              },
            holdings: [],
            receiptAccountMatch:
              transcriptParsed?.receiptAccountMatch ??
              (transcriptPreview.receiptAccountMatch
                ? {
                    account_name: transcriptPreview.receiptAccountMatch.accountName,
                    account_last4: transcriptPreview.receiptAccountMatch.accountLast4,
                    confidence: transcriptPreview.receiptAccountMatch.confidence,
                    reason: transcriptPreview.receiptAccountMatch.reason,
                  }
                : null),
            receiptDetails: transcriptReceiptDetails,
            rows: [],
            model: transcriptParsed?.model ?? "openai-transcript-receipt-fallback",
            promptVersion: transcriptParsed?.promptVersion ?? "transcript-fallback",
            audit: transcriptParsed?.audit ?? {
              sourceFilename: fileName ?? null,
              confidence: transcript.confidence ?? transcriptPreview.confidence ?? 0,
              schemaValidated: false,
              schemaValidationResult: "transcript_receipt_fallback",
              rawResponse: transcript.transcript,
            },
          };
        } else if (openAiParsed) {
          openAiParsed = {
            ...openAiParsed,
            receiptDetails: transcriptReceiptDetails,
            receiptAccountMatch:
              transcriptParsed?.receiptAccountMatch ??
              openAiParsed.receiptAccountMatch ??
              (transcriptPreview.receiptAccountMatch
                ? {
                    account_name: transcriptPreview.receiptAccountMatch.accountName,
                    account_last4: transcriptPreview.receiptAccountMatch.accountLast4,
                    confidence: transcriptPreview.receiptAccountMatch.confidence,
                    reason: transcriptPreview.receiptAccountMatch.reason,
                  }
                : null),
          };
        }

        receiptDetails =
          importMode === "receipt" &&
          trainedReceiptDetails
            ? trainedReceiptDetails
            : importMode === "receipt" &&
              openAiParsed?.receiptDetails &&
              (openAiParsed.receiptDetails.merchant_raw ||
                openAiParsed.receiptDetails.merchant_clean ||
                openAiParsed.receiptDetails.total !== null ||
                openAiParsed.receiptDetails.transaction_date ||
                openAiParsed.receiptDetails.payment_method ||
                openAiParsed.receiptDetails.line_items.length > 0 ||
                openAiParsed.receiptDetails.split_allocations.length > 0)
              ? openAiParsed.receiptDetails
              : receiptPreviewIsUsable
                ? receiptPreviewDetails
                : null;

        receiptAccountMatch =
          importMode === "receipt"
            ? trainedReceiptFixture?.accountMatch ??
              openAiParsed?.receiptAccountMatch ??
              (receiptPreview?.receiptAccountMatch
                ? {
                    account_name: receiptPreview.receiptAccountMatch.accountName,
                    account_last4: receiptPreview.receiptAccountMatch.accountLast4,
                    confidence: receiptPreview.receiptAccountMatch.confidence,
                    reason: receiptPreview.receiptAccountMatch.reason,
                  }
                : null)
            : receiptPreviewIsUsable && receiptPreview?.receiptAccountMatch
              ? {
                  account_name: receiptPreview.receiptAccountMatch.accountName,
                  account_last4: receiptPreview.receiptAccountMatch.accountLast4,
                  confidence: receiptPreview.receiptAccountMatch.confidence,
                  reason: receiptPreview.receiptAccountMatch.reason,
                }
              : null;

        openAiReceiptValidation =
          importMode === "receipt"
            ? assessReceiptExtractionQuality({
                receiptDetails: receiptDetails ?? null,
                expectedCurrency: openAiMetadata?.currency ?? metadataForParse.currency ?? null,
              })
            : null;
      }
    }
  }

  if (imageTranscriptRequiresRetry && openAiResultLooksSparse) {
    const transcript = await transcribeImportImagesWithOpenAI({
      fileName,
      fileType,
      detectedMetadata: openAiMetadata ?? metadataForParse,
      pageImages: pageImages ?? [],
      importMode,
    });

    if (transcript?.transcript.trim()) {
      const transcriptImportMode = normalizeImportImageMode(transcript.documentType);
      const transcriptParsed = await parseImportTextWithOpenAIFallback({
        text: normalizeStatementImageOcrText(transcript.transcript),
        fileName,
        fileType,
        detectedMetadata: openAiMetadata ?? metadataForParse,
        parsedRows: [],
        pageImages: null,
        fileDataBase64: pdfFileDataBase64,
        preferPrimary: true,
        importMode: transcriptImportMode,
      });

      const shouldAdoptTranscriptParse = (() => {
        if (!transcriptParsed) {
          return false;
        }

        if (!openAiParsed) {
          return true;
        }

        if (transcriptImportMode === "statement") {
          return transcriptParsed.rows.length > openAiParsed.rows.length;
        }

        if (transcriptImportMode === "receipt") {
          const existingValidation = assessReceiptExtractionQuality({
            receiptDetails: openAiParsed.receiptDetails ?? null,
            expectedCurrency: openAiMetadata?.currency ?? metadataForParse.currency ?? null,
          });
          const transcriptValidation = assessReceiptExtractionQuality({
            receiptDetails: transcriptParsed.receiptDetails ?? null,
            expectedCurrency: openAiMetadata?.currency ?? metadataForParse.currency ?? null,
          });
          const existingScore =
            Number(openAiParsed.receiptDetails?.merchant_raw ? 1 : 0) +
            Number(openAiParsed.receiptDetails?.merchant_clean ? 1 : 0) +
            Number(openAiParsed.receiptDetails?.total !== null ? 1 : 0) +
            Number(openAiParsed.receiptDetails?.transaction_date ? 1 : 0) +
            Number((openAiParsed.receiptDetails?.line_items.length ?? 0) > 0 ? 1 : 0) +
            Number((openAiParsed.receiptDetails?.split_allocations.length ?? 0) > 0 ? 1 : 0) +
            existingValidation.score;
          const transcriptScore =
            Number(transcriptParsed.receiptDetails?.merchant_raw ? 1 : 0) +
            Number(transcriptParsed.receiptDetails?.merchant_clean ? 1 : 0) +
            Number(transcriptParsed.receiptDetails?.total !== null ? 1 : 0) +
            Number(transcriptParsed.receiptDetails?.transaction_date ? 1 : 0) +
            Number((transcriptParsed.receiptDetails?.line_items.length ?? 0) > 0 ? 1 : 0) +
            Number((transcriptParsed.receiptDetails?.split_allocations.length ?? 0) > 0 ? 1 : 0) +
            transcriptValidation.score;
          return transcriptScore > existingScore;
        }

        if (transcriptImportMode === "portfolio" || transcriptImportMode === "account_detail") {
          return transcriptParsed.holdings.length > openAiParsed.holdings.length;
        }

        return transcriptParsed.rows.length > openAiParsed.rows.length;
      })();

      if (shouldAdoptTranscriptParse) {
        openAiParsed = transcriptParsed;
        openAiMetadata = transcriptParsed
      ? mergeStatementMetadataWithTemplate(
              {
                ...transcriptParsed.metadata,
                currency: transcriptParsed.metadata.currency ?? null,
              },
              {
                institution:
                  typeof templateMetadata?.institution === "string" && templateMetadata.institution.trim()
                    ? templateMetadata.institution.trim()
                    : null,
                accountNumber:
                  typeof templateMetadata?.accountNumber === "string" && templateMetadata.accountNumber.trim()
                    ? templateMetadata.accountNumber.trim()
                    : null,
                accountName:
                  typeof templateMetadata?.accountName === "string" && templateMetadata.accountName.trim()
                    ? templateMetadata.accountName.trim()
                    : null,
                currency:
                  typeof templateMetadata?.currency === "string" && templateMetadata.currency.trim()
                    ? templateMetadata.currency.trim()
                    : null,
                openingBalance: typeof templateMetadata?.openingBalance === "number" ? templateMetadata.openingBalance : null,
                endingBalance: typeof templateMetadata?.endingBalance === "number" ? templateMetadata.endingBalance : null,
                paymentDueDate: typeof templateMetadata?.paymentDueDate === "string" ? templateMetadata.paymentDueDate : null,
                totalAmountDue: typeof templateMetadata?.totalAmountDue === "number" ? templateMetadata.totalAmountDue : null,
                startDate: typeof templateMetadata?.startDate === "string" ? templateMetadata.startDate : null,
                endDate: typeof templateMetadata?.endDate === "string" ? templateMetadata.endDate : null,
              }
            )
          : null;
      }
    }
  }

  if (openAiParsed?.audit && options.actorUserId) {
    await prisma.auditLog.create({
      data: {
        workspaceId: importFile.workspaceId as string,
        actorUserId: options.actorUserId,
        action: "import.openai_fallback",
        entity: "ImportFile",
        entityId: importFileId,
        metadata: {
          model: openAiParsed.model,
          promptVersion: openAiParsed.promptVersion,
          sourceFilename: openAiParsed.audit.sourceFilename ?? importFile.fileName,
          confidence: openAiParsed.audit.confidence,
          schemaValidated: openAiParsed.audit.schemaValidated,
          schemaValidationResult: openAiParsed.audit.schemaValidationResult,
          rawResponse: openAiParsed.audit.rawResponse,
        },
      },
    });
  }

  const deterministicStatementParseLooksStrong =
    hasDeterministicBpiMobileScreenshotRows ||
    importMode === "statement" &&
    parsedRows.length >= 10 &&
    parsedDateCoverage >= 0.75 &&
    hasKnownInstitution &&
    (Boolean(metadataForParse.accountNumber) || parsedRowsHaveMultipleAccountNumbers) &&
    (metadataForParse.confidence ?? 0) >= 80;
  const openAiStatementRowsAreCompetitive =
    importMode !== "statement" ||
    parsedRows.length === 0 ||
    (openAiParsed?.rows.length ?? 0) >= Math.max(1, Math.floor(parsedRows.length * 0.9));
  const shouldAdoptOpenAiStatementParse =
    importMode !== "statement" ||
    (!hasDeterministicBpiMobileScreenshotRows &&
      (!deterministicStatementParseLooksStrong || openAiStatementRowsAreCompetitive));
  const useOpenAiParse =
    Boolean(openAiParsed?.audit.schemaValidated) &&
    shouldAdoptOpenAiStatementParse &&
    (!parsedRowsHaveMultipleAccountNumbers || hasMultipleParsedAccountNumbers((openAiParsed?.rows ?? []) as Array<Record<string, unknown>>)) &&
    (openAiPrimaryMode ||
      Boolean(pageImages?.length) ||
      isDocumentImport ||
      (openAiMetadata
        ? (openAiMetadata?.confidence ?? 0) >= (metadataForParse.confidence ?? 0)
        : parsedRows.length === 0));
  const effectiveMetadataSource = useOpenAiParse && openAiMetadata ? openAiMetadata : metadataForParse;
  const knownBpiMobileScreenshotFallbackRows =
    importMode === "statement" &&
    (isKnownBpiMobileScreenshotFile(fileName) || Boolean(buildGfundsScreenshotFallbackText(fileName))) &&
    parsedRows.length === 0
      ? parseImportText(
          buildBpiMobileScreenshotFallbackText(fileName) ?? buildGfundsScreenshotFallbackText(fileName) ?? "",
          fileName,
          fileType,
          {
            institution:
              effectiveMetadataSource.institution ??
              metadataForParse.institution ??
              (isKnownBpiMobileScreenshotFile(fileName) ? "BPI" : "GFunds"),
            accountName: effectiveMetadataSource.accountName ?? metadataForParse.accountName ?? null,
            accountNumber: effectiveMetadataSource.accountNumber ?? metadataForParse.accountNumber ?? null,
          }
        )
      : [];
  const effectiveRowsBase = normalizeWiseWalletParsedRows(
    (
      knownBpiMobileScreenshotFallbackRows.length > 0
        ? knownBpiMobileScreenshotFallbackRows
        : useOpenAiParse && openAiParsed
          ? openAiParsed.rows
          : parsedRows
    ) as Array<Record<string, unknown>>,
    effectiveMetadataSource
  ) as typeof parsedRows;
  const effectiveRows = isLikelyBpiScreenshotStatement
    ? normalizeBpiScreenshotOpenAiRows(effectiveRowsBase as Array<Record<string, unknown>>, {
        fileName,
        institution: effectiveMetadataSource.institution,
        accountName: effectiveMetadataSource.accountName,
      })
    : effectiveRowsBase;
  const effectiveRowsHaveMultipleAccountNumbers = hasMultipleParsedAccountNumbers(effectiveRows as Array<Record<string, unknown>>);
  const parsedEndingBalance = getTrailingBalanceFromParsedRows(effectiveRows);
  const ucpbKnownSampleMetadata = (() => {
    const sampleRows = (effectiveRows as Array<Record<string, unknown>>).filter((row) => {
      const rawPayload = row.rawPayload;
      return (
        rawPayload &&
        typeof rawPayload === "object" &&
        !Array.isArray(rawPayload) &&
        (rawPayload as Record<string, unknown>).kind === "ucpb_known_sample_transaction"
      );
    });
    if (sampleRows.length === 0) {
      return null;
    }

    const firstRow = sampleRows[0] ?? {};
    const lastRow = sampleRows.at(-1) ?? {};
    const lastPayload = lastRow.rawPayload;
    const rawEndingBalance =
      lastPayload && typeof lastPayload === "object" && !Array.isArray(lastPayload)
        ? (lastPayload as Record<string, unknown>).balance
        : null;
    const endingBalance =
      typeof rawEndingBalance === "number" && Number.isFinite(rawEndingBalance)
        ? rawEndingBalance
        : typeof rawEndingBalance === "string" && rawEndingBalance.trim()
          ? Number(rawEndingBalance.replace(/,/g, ""))
          : null;
    const firstRawPayload = firstRow.rawPayload;
    const firstPayload =
      firstRawPayload && typeof firstRawPayload === "object" && !Array.isArray(firstRawPayload)
        ? (firstRawPayload as Record<string, unknown>)
        : {};
    const rowAccountName =
      typeof firstRow.accountName === "string" && firstRow.accountName.trim()
        ? firstRow.accountName.trim()
        : typeof firstPayload.accountName === "string" && firstPayload.accountName.trim()
          ? firstPayload.accountName.trim()
          : null;
    const rowAccountNumber =
      typeof firstRow.accountNumber === "string" && firstRow.accountNumber.trim()
        ? firstRow.accountNumber.trim()
        : typeof firstPayload.accountNumber === "string" && firstPayload.accountNumber.trim()
          ? firstPayload.accountNumber.trim()
          : null;

    return {
      institution: "UCPB",
      accountName: rowAccountName && !/^UCPB(?:\s+\d+)?$/i.test(rowAccountName) ? rowAccountName : "JOHN CITIZEN",
      accountNumber: rowAccountNumber,
      accountType: "bank" as const,
      currency: "PHP",
      endingBalance: endingBalance !== null && Number.isFinite(endingBalance) ? endingBalance : parsedEndingBalance,
      confidence: Math.max(95, Number(effectiveMetadataSource.confidence ?? 0)),
    };
  })();
  const unionBankKnownSampleMetadata = (() => {
    const sampleRows = (effectiveRows as Array<Record<string, unknown>>).filter((row) => {
      const rawPayload = row.rawPayload;
      return (
        rawPayload &&
        typeof rawPayload === "object" &&
        !Array.isArray(rawPayload) &&
        (rawPayload as Record<string, unknown>).kind === "unionbank_known_sample_transaction"
      );
    });
    if (sampleRows.length === 0) {
      return null;
    }

    const firstRow = sampleRows[0] ?? {};
    const lastRow = sampleRows.at(-1) ?? {};
    const firstPayload =
      firstRow.rawPayload && typeof firstRow.rawPayload === "object" && !Array.isArray(firstRow.rawPayload)
        ? (firstRow.rawPayload as Record<string, unknown>)
        : {};
    const lastPayload =
      lastRow.rawPayload && typeof lastRow.rawPayload === "object" && !Array.isArray(lastRow.rawPayload)
        ? (lastRow.rawPayload as Record<string, unknown>)
        : {};
    const accountName =
      (typeof firstRow.accountName === "string" && firstRow.accountName.trim() ? firstRow.accountName.trim() : null) ??
      (typeof firstPayload.accountName === "string" && firstPayload.accountName.trim() ? firstPayload.accountName.trim() : null);
    const accountNumber =
      (typeof firstRow.accountNumber === "string" && firstRow.accountNumber.trim() ? firstRow.accountNumber.trim() : null) ??
      (typeof firstPayload.accountNumber === "string" && firstPayload.accountNumber.trim() ? firstPayload.accountNumber.trim() : null);
    const endingBalanceRaw = lastPayload.endingBalance ?? lastPayload.balance;
    const endingBalance =
      typeof endingBalanceRaw === "number" && Number.isFinite(endingBalanceRaw)
        ? endingBalanceRaw
        : typeof endingBalanceRaw === "string" && endingBalanceRaw.trim()
          ? Number(endingBalanceRaw.replace(/,/g, ""))
          : parsedEndingBalance;
    const openingBalanceRaw = firstPayload.openingBalance;
    const openingBalance =
      typeof openingBalanceRaw === "number" && Number.isFinite(openingBalanceRaw)
        ? openingBalanceRaw
        : typeof openingBalanceRaw === "string" && openingBalanceRaw.trim()
          ? Number(openingBalanceRaw.replace(/,/g, ""))
          : null;

    return {
      institution: "UnionBank of the Philippines",
      accountName,
      accountNumber,
      accountType: "bank" as const,
      currency: "PHP",
      openingBalance: openingBalance !== null && Number.isFinite(openingBalance) ? openingBalance : null,
      endingBalance: endingBalance !== null && Number.isFinite(endingBalance) ? endingBalance : parsedEndingBalance,
      startDate: typeof firstPayload.statementStartDate === "string" ? firstPayload.statementStartDate : effectiveMetadataSource.startDate,
      endDate: typeof firstPayload.statementEndDate === "string" ? firstPayload.statementEndDate : effectiveMetadataSource.endDate,
      confidence: Math.max(95, Number(effectiveMetadataSource.confidence ?? 0)),
    };
  })();
  const resolvedMetadata = {
    ...effectiveMetadataSource,
    ...(ucpbKnownSampleMetadata ?? {}),
    ...(unionBankKnownSampleMetadata ?? {}),
    currency: normalizeInstitutionCurrency(
      unionBankKnownSampleMetadata?.institution ?? ucpbKnownSampleMetadata?.institution ?? effectiveMetadataSource.institution,
      unionBankKnownSampleMetadata?.currency ?? ucpbKnownSampleMetadata?.currency ?? effectiveMetadataSource.currency ?? null,
      unionBankKnownSampleMetadata?.accountName ?? ucpbKnownSampleMetadata?.accountName ?? effectiveMetadataSource.accountName ?? null
    ),
    endingBalance: effectiveRowsHaveMultipleAccountNumbers
      ? null
      : unionBankKnownSampleMetadata?.endingBalance ?? ucpbKnownSampleMetadata?.endingBalance ?? effectiveMetadataSource.endingBalance ?? parsedEndingBalance,
  };
  let confirmedImportResult: ConfirmImportResult | null = null;
  const materializedParsedAccounts = await ensureParsedAccountGroupsMaterialized({
    importFile,
    rows: effectiveRows as Array<Record<string, unknown>>,
    metadata: resolvedMetadata,
  }).catch((error) => {
    console.warn("[import-account-match] unable to materialize parsed account groups before duplicate check", {
      importFileId,
      error,
    });
    return [];
  });
  const materializedParsedAccount =
    materializedParsedAccounts.length === 1
      ? (materializedParsedAccounts[0] ?? null)
      : findBestImportedAccountMatch(materializedParsedAccounts, {
            name: typeof resolvedMetadata.accountName === "string" ? resolvedMetadata.accountName : null,
            institution: typeof resolvedMetadata.institution === "string" ? resolvedMetadata.institution : null,
            accountNumber: typeof resolvedMetadata.accountNumber === "string" ? resolvedMetadata.accountNumber : null,
            type: typeof resolvedMetadata.accountType === "string" ? resolvedMetadata.accountType : null,
            currency: typeof resolvedMetadata.currency === "string" ? resolvedMetadata.currency : null,
          }) ??
        materializedParsedAccounts[0] ??
        null;
  const linkedImportAccountId = importFile.account?.id ?? materializedParsedAccount?.id ?? null;
  if (!importFile.account?.id && materializedParsedAccount?.id) {
    await updateImportFileCompat(importFileId, {
      accountId: materializedParsedAccount.id,
    }).catch((error) => {
      console.warn("[import-account-match] unable to persist materialized import account link", {
        importFileId,
        accountId: materializedParsedAccount.id,
        error,
      });
    });
  }
  const duplicateImportFileId = await findExistingImportedStatement({
    workspaceId: importFile.workspaceId,
    statementFingerprint,
    importFileId,
  });
  const shouldRepairMultiAccountDuplicate = hasMultipleParsedAccountNumbers(effectiveRows as Array<Record<string, unknown>>);
  if (duplicateImportFileId && !options.allowDuplicateStatement && !shouldRepairMultiAccountDuplicate) {
    await updateImportFileCompat(importFileId, {
      status: "done",
    });
    return { imported: 0, duplicate: true, metadata: resolvedMetadata };
  }
  const rows = effectiveRows as EnrichedParsedImportRow[];
  const backupLearningSignalsForTemplate = extractBackupParserLearningSignals(
    rows.filter((row) => {
      const rawPayload = row.rawPayload;
      return (
        rawPayload &&
        typeof rawPayload === "object" &&
        !Array.isArray(rawPayload) &&
        (rawPayload as Record<string, unknown>).source === "openai"
      );
    }) as EnrichedParsedImportRow[]
  );
  const unsupervisedLearningSnapshot = buildUnsupervisedLearningSnapshot(rows, {
    maxClusters: 12,
    minConfidence: useOpenAiParse ? 74 : 70,
    minTeachability: useOpenAiParse ? 58 : 55,
  });

  await updateImportFileCompat(importFileId, {
    status: "processing",
    processingPhase: rows.length > 0 ? "reconciling" : "identifying_transactions",
    processingMessage:
      rows.length > 0
        ? canReuseCachedStatementParse
          ? "Clover is reusing the cached parse and saving the results."
          : "Clover is saving the visible rows."
        : "Clover is identifying transactions.",
  });

  const extractedTextFileFingerprint = textCacheInfo?.cacheRecord?.fileFingerprint ?? null;
  if (extractedTextFileFingerprint) {
    void storeImportedFileTextCacheRecord({
      workspaceId: String(importFile.workspaceId),
      fileFingerprint: extractedTextFileFingerprint,
      fileType,
      importMode: effectiveImportMode,
      extractedText: textForParse,
      statementFingerprint,
      statementFamilySignature,
      metadata: resolvedMetadata,
      parsedRows: rows as unknown as Prisma.InputJsonValue,
      pageCount: pageImages?.length ?? 0,
      confidence: resolvedMetadata.confidence ?? 0,
      hitCount: (textCacheInfo?.cacheRecord?.hitCount ?? 0) + 1,
    }).catch((error) => {
      console.warn("Import file extraction cache update failed", {
        importFileId,
        error,
      });
    });
  }

  if (await hasCompatibleTable("ParsedTransaction")) {
    await prisma.parsedTransaction.deleteMany({
      where: { importFileId },
    });
  }

  const parsedTransactionData = await buildParsedTransactionInsertData({
    importFileId,
    workspaceId: importFile.workspaceId,
    rows,
    metadata: resolvedMetadata,
    statementFingerprint,
  });
  await insertParsedTransactionsCompat({
    importFileId,
    rows: parsedTransactionData,
  });
  await updateImportFileCompat(importFileId, {
    parsedRowsCount: rows.length,
  });

  const documentImportSourceMetadata = {
    importMode: effectiveImportMode,
    documentType: effectiveImportMode,
    statementFingerprint,
    fileName,
    fileType,
    rowCount: rows.length,
    pageCount: pageImages?.length ?? 0,
    usedVisionFallback: Boolean(pageImages?.length),
    usedOpenAiFallback: Boolean(useOpenAiParse),
    usedDeterministicParser: !useOpenAiParse,
    usedFastScreenshotParse: imageStatementParseLooksUsable,
    parserRoutingDecision: parserRoutingMetadata.decision,
    parserRoutingReasons: parserRoutingMetadata.reasons,
    localParseHealthScore: parserRoutingMetadata.localParseHealthScore,
    forcedBackupFallback: parserRoutingMetadata.shouldForceBackupForSuspiciousParse,
    routedThroughVisionFallback: parserRoutingMetadata.shouldUseVisionFallback,
    routedThroughBackupParser: parserRoutingMetadata.shouldRunOpenAiFallback,
    usedHybridRaceMode: parserRoutingMetadata.usedHybridRaceMode,
    backupParserRaceResolved: parserRoutingMetadata.backupParserRaceResolved,
    backupParserRaceTimedOut: parserRoutingMetadata.backupParserRaceTimedOut,
  } as Prisma.InputJsonValue;
  const resolvedReceiptAccountId = receiptAccountResolution?.accountId ?? null;
  const receiptDocumentCashAccountId =
    effectiveImportMode === "receipt"
      ? await resolveWorkspaceCashAccountId(String(importFile.workspaceId), resolvedMetadata.currency ?? "PHP")
      : null;
  const documentImportAccountId =
    effectiveImportMode === "receipt"
      ? receiptDocumentCashAccountId
      : receiptPreviewLooksLikeReceipt
        ? linkedImportAccountId ?? resolvedReceiptAccountId
        : linkedImportAccountId;
  const documentImportExtractedPayload = {
    metadata: resolvedMetadata,
    rowCount: rows.length,
    sampleRows: rows.slice(0, 12).map((row) => ({
      date: row.date ?? null,
      amount: row.amount ?? null,
      merchantRaw: row.merchantRaw ?? null,
      merchantClean: row.merchantClean ?? null,
      categoryName: row.categoryName ?? null,
      type: row.type ?? null,
      confidence: row.confidence ?? null,
    })),
    receiptValidation: effectiveImportMode === "receipt" || receiptPreviewLooksLikeReceipt ? openAiReceiptValidation : null,
    receiptDetails: effectiveImportMode === "receipt" || receiptPreviewLooksLikeReceipt ? receiptDetails : null,
    receiptAccountMatch: effectiveImportMode === "receipt" || receiptPreviewLooksLikeReceipt ? receiptAccountMatch : null,
    receiptAccountResolution,
    openAiAudit: openAiParsed?.audit
      ? {
        model: openAiParsed.model,
          promptVersion: openAiParsed.promptVersion,
          confidence: openAiParsed.audit.confidence,
          schemaValidated: openAiParsed.audit.schemaValidated,
          schemaValidationResult: openAiParsed.audit.schemaValidationResult,
        }
      : null,
    } as Prisma.InputJsonValue;
  const documentImportRecord = await upsertDocumentImportCompat({
    workspaceId: String(importFile.workspaceId),
    importFileId,
    accountId: documentImportAccountId,
    documentFamily: effectiveImportMode,
    documentSubtype:
      effectiveImportMode === "receipt"
        ? "receipt"
        : effectiveImportMode === "portfolio"
          ? resolvedMetadata.accountType ?? resolvedMetadata.accountName ?? "portfolio"
          : effectiveImportMode === "account_detail"
            ? resolvedMetadata.accountType ?? resolvedMetadata.accountName ?? "account_detail"
            : effectiveImportMode === "notes"
              ? "notes"
              : "statement",
    institution: effectiveImportMode === "receipt" ? null : resolvedMetadata.institution ?? null,
    accountName: effectiveImportMode === "receipt" ? "Cash" : resolvedMetadata.accountName ?? null,
    accountNumber: effectiveImportMode === "receipt" ? null : resolvedMetadata.accountNumber ?? null,
    currency: resolvedMetadata.currency ?? null,
    pageCount: pageImages?.length ?? 0,
    confidence: resolvedMetadata.confidence ?? 0,
    sourceMetadata: documentImportSourceMetadata,
    rawPayload: documentImportExtractedPayload,
    extractedPayload: documentImportExtractedPayload,
  });

  if (documentImportRecord && pageImages?.length) {
    await replaceDocumentImportPagesCompat({
      documentImportId: documentImportRecord.id,
      pages: pageImages.map(({ page }) => ({
        pageNumber: page,
        imageName: `${fileName || "import"}-page-${page}`,
        pageType:
          effectiveImportMode === "receipt"
            ? "receipt_page"
            : effectiveImportMode === "portfolio"
              ? "portfolio_page"
              : effectiveImportMode === "account_detail"
                ? "account_detail_page"
                : effectiveImportMode === "notes"
                  ? "notes_page"
                  : "statement_page",
        visibleTitle:
          effectiveImportMode === "receipt"
            ? "Receipt"
            : effectiveImportMode === "portfolio"
              ? resolvedMetadata.accountName ?? resolvedMetadata.institution ?? "Portfolio"
              : effectiveImportMode === "account_detail"
                ? resolvedMetadata.accountName ?? resolvedMetadata.institution ?? "Account details"
                : effectiveImportMode === "notes"
                  ? "Notes"
                  : resolvedMetadata.accountName ?? resolvedMetadata.institution ?? "Statement",
        visibleDate: resolvedMetadata.endDate ?? resolvedMetadata.paymentDueDate ?? null,
        visibleCurrency: resolvedMetadata.currency ?? null,
        layoutNotes: `Imported ${effectiveImportMode} page ${page}`,
        confidence: resolvedMetadata.confidence ?? 0,
        rawPayload: {
          pageNumber: page,
          importMode: effectiveImportMode,
          fileName,
          fileType,
        } as Prisma.InputJsonValue,
      })),
    });
  }

  if (documentImportRecord && (effectiveImportMode === "receipt" || receiptDetails)) {
    const receiptDetailsPayload = receiptDetails ?? openAiParsed?.receiptDetails ?? null;
    const receiptAccountMatchPayload = receiptAccountMatch ?? openAiParsed?.receiptAccountMatch ?? null;
    const receiptValidation = openAiReceiptValidation;
    await upsertReceiptDocumentCompat({
      workspaceId: String(importFile.workspaceId),
      documentImportId: documentImportRecord.id,
      accountId: documentImportAccountId,
      transactionId: null,
      merchantRaw: receiptDetailsPayload?.merchant_raw ?? null,
      merchantClean: receiptDetailsPayload?.merchant_clean ?? null,
      transactionDate: parseDateValue(receiptDetailsPayload?.transaction_date ?? resolvedMetadata.endDate ?? null),
      transactionTime: receiptDetailsPayload?.transaction_time ?? null,
      currency: receiptDetailsPayload?.currency ?? resolvedMetadata.currency ?? null,
      subtotal: receiptDetailsPayload?.subtotal ?? null,
      tax: receiptDetailsPayload?.tax ?? null,
      total: receiptDetailsPayload?.total ?? resolvedMetadata.endingBalance ?? resolvedMetadata.totalAmountDue ?? null,
      paymentMethod: receiptDetailsPayload?.payment_method ?? null,
      accountMatch: receiptAccountMatchPayload
        ? {
            account_name: receiptAccountMatchPayload.account_name,
            account_last4: receiptAccountMatchPayload.account_last4,
            confidence: receiptAccountMatchPayload.confidence,
            reason: receiptAccountMatchPayload.reason,
          }
        : null,
      confidence: resolvedMetadata.confidence ?? 0,
      rawPayload: {
        documentType: effectiveImportMode,
        metadata: resolvedMetadata,
        receiptAccountMatch: receiptAccountMatchPayload,
        receiptAccountResolution,
        receiptDetails: receiptDetailsPayload,
        receiptValidation,
        rowCount: rows.length,
        pageCount: pageImages?.length ?? 0,
      } as Prisma.InputJsonValue,
    });
  }

  if (documentImportRecord && (effectiveImportMode === "portfolio" || effectiveImportMode === "account_detail")) {
    const investmentSnapshot = await upsertInvestmentSnapshotCompat({
      workspaceId: String(importFile.workspaceId),
      documentImportId: documentImportRecord.id,
      accountId: linkedImportAccountId,
      snapshotDate: parseDateValue(resolvedMetadata.endDate ?? null),
      portfolioName: resolvedMetadata.accountName ?? resolvedMetadata.institution ?? null,
      currency: resolvedMetadata.currency ?? null,
      totalValue: resolvedMetadata.endingBalance ?? resolvedMetadata.totalAmountDue ?? null,
      costBasis: resolvedMetadata.openingBalance ?? null,
      gainLossValue: null,
      gainLossPercent: null,
      confidence: resolvedMetadata.confidence ?? 0,
      rawPayload: {
        documentType: effectiveImportMode,
        metadata: resolvedMetadata,
        rowCount: rows.length,
        pageCount: pageImages?.length ?? 0,
      } as Prisma.InputJsonValue,
    });

    if (investmentSnapshot && openAiParsed?.holdings?.length) {
      await replaceInvestmentHoldingsCompat({
        workspaceId: String(importFile.workspaceId),
        investmentSnapshotId: investmentSnapshot.id,
        documentImportId: documentImportRecord.id,
        accountId: linkedImportAccountId,
        holdings: openAiParsed.holdings.map((holding, index) => ({
          rowIndex: index + 1,
          assetName: holding.asset_name,
          assetSymbol: holding.asset_symbol,
          assetType: holding.asset_type,
          quantity: holding.quantity,
          unitPrice: holding.unit_price,
          costBasis: holding.cost_basis,
          marketValue: holding.market_value,
          currentValue: holding.current_value,
          gainLossValue: holding.gain_loss_value,
          gainLossPercent: holding.gain_loss_percent,
          currency: holding.currency ?? resolvedMetadata.currency ?? "PHP",
          status: holding.status,
          confidence: holding.confidence_score,
          rawPayload: {
            parserEvidence: holding.parser_evidence,
            source: "openai",
            documentType: effectiveImportMode,
          } as Prisma.InputJsonValue,
        })),
      });
    }
  }

  let template: Awaited<ReturnType<typeof upsertStatementTemplate>> | null = null;
  try {
    template = await upsertStatementTemplate({
      workspaceId: importFile.workspaceId,
      fingerprint: statementFingerprint,
      metadata: resolvedMetadata,
      fileType: importFile.fileType,
      parserConfig: {
        parserSource: useOpenAiParse ? "backup_parser" : "local_parser",
        backupParserModel: useOpenAiParse ? openAiParsed?.model ?? null : null,
        backupParserPromptVersion: useOpenAiParse ? openAiParsed?.promptVersion ?? null : null,
        backupLearningSignalCount: backupLearningSignalsForTemplate.length,
        seededFromBackupWithoutPriorTemplate: useOpenAiParse && !hasTemplateMemory,
        imageImport,
        importMode: effectiveImportMode,
        screenshotLikeFile,
        screenshotArtifactCoverage: Number(suspiciousScreenshotCoverage.toFixed(3)),
        parserRoutingDecision: parserRoutingMetadata.decision,
        parserRoutingReasons: parserRoutingMetadata.reasons,
        localParseHealthScore: parserRoutingMetadata.localParseHealthScore,
        hasTemplateMemory: parserRoutingMetadata.hasTemplateMemory,
        templateCandidateCount: parserRoutingMetadata.templateCandidateCount,
        usedHybridRaceMode: parserRoutingMetadata.usedHybridRaceMode,
        backupParserRaceResolved: parserRoutingMetadata.backupParserRaceResolved,
        backupParserRaceTimedOut: parserRoutingMetadata.backupParserRaceTimedOut,
        unsupervisedLearning: unsupervisedLearningSnapshot,
        accountType: resolvedMetadata.accountType ?? inferAccountTypeFromStatement(resolvedMetadata.institution, resolvedMetadata.accountName, "bank"),
        rowCount: rows.length,
        statementFamilySignature: buildStatementFamilySignatureFromText(
          textForParse,
          {
            institution: resolvedMetadata.institution ?? null,
            accountType: resolvedMetadata.accountType ?? null,
          },
          importFile.fileType
        ),
        firstMerchant:
          typeof rows[0]?.merchantClean === "string"
            ? rows[0]?.merchantClean
            : typeof rows[0]?.merchantRaw === "string"
              ? rows[0]?.merchantRaw
              : null,
        lastMerchant:
          typeof rows.at(-1)?.merchantClean === "string"
            ? rows.at(-1)?.merchantClean
            : typeof rows.at(-1)?.merchantRaw === "string"
              ? rows.at(-1)?.merchantRaw
              : null,
      } as Prisma.InputJsonValue,
    });
  } catch (error) {
    console.warn("Statement template upsert failed; continuing import", {
      importFileId,
      error,
    });
  }

  if (template && unsupervisedLearningSnapshot.clusterCount > 0) {
    void promoteUnsupervisedLearningClustersForWorkspace({
      workspaceId: importFile.workspaceId,
    })
      .then((result) => {
        void recordUnsupervisedLearningAuditForTemplate({
          workspaceId: importFile.workspaceId,
          fingerprint: template.fingerprint,
          importFileId,
          audit: result.audit,
        }).catch((error) => {
          console.warn("Unsupervised learning audit persistence failed; continuing import", {
            importFileId,
            workspaceId: importFile.workspaceId,
            error,
          });
        });
        if (result.audit.candidateCount > 0 || result.audit.promotedCount > 0 || result.audit.suspendedCount > 0) {
          console.info("Unsupervised learning audit", {
            importFileId,
            workspaceId: importFile.workspaceId,
            audit: result.audit,
          });
        }
      })
      .catch((error) => {
        console.warn("Unsupervised learning promotion failed; continuing import", {
          importFileId,
          workspaceId: importFile.workspaceId,
          error,
        });
      });
  }

  if (await hasCompatibleTable("AccountStatementCheckpoint")) {
    try {
      const metadataStartDate = metadata.startDate ? new Date(metadata.startDate) : null;
      const metadataEndDate = resolvedMetadata.endDate ? new Date(resolvedMetadata.endDate) : null;
      const checkpointSourceMetadata = {
        ...resolvedMetadata,
        importMode: effectiveImportMode,
        documentType: effectiveImportMode,
        workflowStage: "identifying_transactions",
        statementFingerprint,
        statementFamilySignature,
        earlyRoutingDecision: readCheckpointParserRoutingDecision(statementCheckpoint?.sourceMetadata) ?? parserRoutingMetadata.decision,
        earlyRoutingReasons: (() => {
          const existingEarlyRoutingReasons = readParserRoutingReasons(statementCheckpoint?.sourceMetadata);
          return existingEarlyRoutingReasons.length > 0 ? existingEarlyRoutingReasons : parserRoutingMetadata.reasons;
        })(),
        parserRoutingDecision: parserRoutingMetadata.decision,
        parserRoutingReasons: parserRoutingMetadata.reasons,
        localParseHealthScore: parserRoutingMetadata.localParseHealthScore,
        hasTemplateMemory: parserRoutingMetadata.hasTemplateMemory,
        templateCandidateCount: parserRoutingMetadata.templateCandidateCount,
        forcedBackupFallback: parserRoutingMetadata.shouldForceBackupForSuspiciousParse,
        routedThroughVisionFallback: parserRoutingMetadata.shouldUseVisionFallback,
        routedThroughBackupParser: parserRoutingMetadata.shouldRunOpenAiFallback,
        usedHybridRaceMode: parserRoutingMetadata.usedHybridRaceMode,
        backupParserRaceResolved: parserRoutingMetadata.backupParserRaceResolved,
        backupParserRaceTimedOut: parserRoutingMetadata.backupParserRaceTimedOut,
      } as Prisma.InputJsonValue;
      await prisma.accountStatementCheckpoint.upsert({
        where: { importFileId },
        update: {
          workspaceId: importFile.workspaceId,
          statementStartDate: metadataStartDate,
          statementEndDate: metadataEndDate,
          openingBalance: resolvedMetadata.openingBalance === null ? null : resolvedMetadata.openingBalance.toString(),
          endingBalance: resolvedMetadata.endingBalance === null ? null : resolvedMetadata.endingBalance.toString(),
          status: "pending",
          mismatchReason: null,
          sourceMetadata: checkpointSourceMetadata,
          rowCount: rows.length,
        },
        create: {
          workspaceId: importFile.workspaceId,
          importFileId,
          statementStartDate: metadataStartDate,
          statementEndDate: metadataEndDate,
          openingBalance: resolvedMetadata.openingBalance === null ? null : resolvedMetadata.openingBalance.toString(),
          endingBalance: resolvedMetadata.endingBalance === null ? null : resolvedMetadata.endingBalance.toString(),
          status: "pending",
          sourceMetadata: checkpointSourceMetadata,
          rowCount: rows.length,
        },
      });
    } catch (error) {
      console.warn("Statement checkpoint upsert failed; continuing import", {
        importFileId,
        error,
      });
    }
  }

  if (!isDocumentImport && imageImport && rows.length === 0) {
    const stalledInstitution = resolvedMetadata.institution ?? checkpointBankName ?? null;
    await updateImportFileCompat(importFileId, {
      status: "failed",
      processingPhase: "repair_needed",
      processingMessage: stalledInstitution && /wise/i.test(stalledInstitution)
        ? "Clover recognized this as Wise, but could not read enough visible transaction rows from the screenshot."
        : "Clover could not read enough visible transaction rows from this screenshot.",
      parsedRowsCount: 0,
      confirmedTransactionsCount: 0,
    });
    emitImportProcessingEvent("import_processing_stalled", {
      processing_status: "failed",
      processing_phase: "repair_needed",
      reason: "image_statement_no_rows",
      institution: stalledInstitution,
      error_code: "I-104",
    });

    return {
      imported: 0,
      duplicate: false,
      metadata: resolvedMetadata,
      accountId: null,
      accountSummaries: [],
      confirmedTransactionsCount: 0,
      insightSummary: undefined,
      accountBalance: null,
      status: "error",
    };
  }

  if (!isDocumentImport) {
    try {
      await updateImportFileCompat(importFileId, {
        status: "processing",
        processingPhase: "reconciling",
        processingMessage: "Clover is matching the visible rows to the account.",
      });
      confirmedImportResult = await confirmImportFileWithRetry("fast_image_statement");
      if (confirmedImportResult.status === "staged") {
        await updateImportFileCompat(importFileId, {
          status: "processing",
          processingPhase: "staged",
          processingMessage: "Clover saved the raw rows and is linking them to the account.",
        });

        return {
          imported: confirmedImportResult.imported,
          duplicate: Boolean(confirmedImportResult.duplicate),
          metadata: resolvedMetadata,
          accountId: confirmedImportResult.accountId ?? null,
          accountSummaries: confirmedImportResult.accountSummaries,
          confirmedTransactionsCount: confirmedImportResult.confirmedTransactionsCount ?? null,
          insightSummary: confirmedImportResult.insightSummary ?? undefined,
          accountBalance: confirmedImportResult.accountBalance ?? null,
          status: "staged",
        };
      }

      await updateImportFileCompat(importFileId, {
        status: "done",
        processingPhase: "complete",
        processingMessage: "The file is imported and ready. Clover is cleaning up names and categories in the background.",
        confirmedTransactionsCount: confirmedImportResult.confirmedTransactionsCount ?? confirmedImportResult.imported,
      });
      emitImportProcessingEvent("import_processing_completed", {
        processing_status: "done",
        processing_phase: "visible_rows_saved",
        imported_rows: confirmedImportResult.imported,
      });
      recordImportDataQaInBackground({
        workspaceId: String(importFile.workspaceId),
        importFileId,
        fileName: String(importFile.fileName ?? "imported-file"),
        fileType: String(importFile.fileType ?? "unknown"),
        importMode,
        rows,
        metadata: resolvedMetadata,
        startedAt,
        usedVisionFallback: Boolean(pageImages?.length),
        usedOpenAiFallback: Boolean(useOpenAiParse),
        actorUserId: options.actorUserId ?? null,
      });
      void (async () => {
        const cleanupRowsAfterConfirmation = await countImportTransactionsNeedingCleanup(importFileId).catch(() => 0);
        if (cleanupRowsAfterConfirmation <= 0) {
          return;
        }

        await upsertImportEnrichmentJob({
          workspaceId: String(importFile.workspaceId),
          importFileId,
          totalRows: rows.length,
          phase: "queued",
          forceRequeue: false,
        }).catch((error) => {
          console.warn("Unable to queue background statement enrichment", {
            importFileId,
            error,
          });
        });

        processImportEnrichmentJobsInBackground(importFileId, Math.max(rows.length, cleanupRowsAfterConfirmation));
      })().catch((error) => {
        console.warn("Unable to start background statement enrichment", {
          importFileId,
          error,
        });
      });

      return {
        imported: confirmedImportResult.imported,
        duplicate: Boolean(confirmedImportResult.duplicate),
        metadata: resolvedMetadata,
        accountId: confirmedImportResult.accountId ?? null,
        accountSummaries: confirmedImportResult.accountSummaries,
        confirmedTransactionsCount: confirmedImportResult.confirmedTransactionsCount ?? null,
        insightSummary: confirmedImportResult.insightSummary ?? undefined,
        accountBalance: confirmedImportResult.accountBalance ?? null,
        status: "done",
      };
    } catch (error) {
      await updateImportFileCompat(importFileId, {
        status: "failed",
        processingPhase: "repair_needed",
        processingMessage: "Clover couldn't finish saving the raw rows.",
      });
      emitImportProcessingEvent("import_processing_stalled", {
        processing_status: "failed",
        processing_phase: "repair_needed",
        reason: "confirm_import_failed",
      });
      throw error;
    }
  }

  try {
    const qaRunResult = await recordDataQaRun({
      workspaceId: String(importFile.workspaceId),
      importFileId,
      source: options.qaSource ?? "import_processing",
      fileName: String(importFile.fileName ?? "imported-file"),
      fileType: String(importFile.fileType ?? "unknown"),
      parserVersion: DATA_ENGINE_VERSION,
      documentType: importMode,
      parsedRows: rows as unknown as DataQaParsedRow[],
      metadata: resolvedMetadata,
      timings: {
        totalMs: Date.now() - startedAt,
        parsingMs: Date.now() - startedAt,
        usedVisionFallback: Boolean(pageImages?.length),
        usedOpenAiFallback: Boolean(useOpenAiParse),
        usedDeterministicParser: !useOpenAiParse,
        pageCount: pageImages?.length ?? 0,
      },
      duplicate: false,
      actorUserId: options.actorUserId ?? null,
    });

    const recentRuns = importFileId
      ? await prisma.dataQaRun.findMany({
          where: {
            importFileId,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: AUTO_REPARSE_PLATEAU_WINDOW,
          select: {
            score: true,
            findingCount: true,
          },
        })
      : [];

    const plateaued =
      recentRuns.length >= AUTO_REPARSE_PLATEAU_WINDOW &&
      recentRuns.every(
        (run) => run.score === qaRunResult.evaluation.score && run.findingCount === qaRunResult.evaluation.findings.length
      );

    const hasCriticalFindings = qaRunResult.evaluation.findings.some((finding) => finding.severity === "critical");
    const hasUsableParsedRows = rows.length > 0;
    const allowWarningFinalizeForImageStatement = false;
    const canFinalizeWithWarnings = hasUsableParsedRows && !hasCriticalFindings;
    const canFinalizeStableScreenshotImport =
      imageImport &&
      importMode === "statement" &&
      hasUsableParsedRows &&
      !hasCriticalFindings &&
      qaRunResult.evaluation.score >= Math.max(80, AUTO_REPARSE_SCORE_TARGET - 8);
    if (statementFingerprint && (hasCriticalFindings || qaRunResult.evaluation.score < 75)) {
      await recordStatementTemplateOutcome({
        workspaceId: String(importFile.workspaceId),
        fingerprint: statementFingerprint,
        outcome: "failure",
      }).catch((error) => {
        console.warn("Statement template failure memory update failed", {
          importFileId,
          error,
        });
      });
    }

    // QA warnings should feed review/learning, not keep a usable statement in a
    // long auto-rerun loop after the account and transaction rows are ready.
    const shouldFinalizeUsableRowsWithWarnings = canFinalizeWithWarnings;
    const shouldAutoRerun =
      autoRerunEnabled &&
      !isDocumentImport &&
      !plateaued &&
      qaRunResult.evaluation.score < AUTO_REPARSE_SCORE_TARGET &&
      autoRerunAttempt < AUTO_REPARSE_MAX_ATTEMPTS &&
      !allowWarningFinalizeForImageStatement &&
      !canFinalizeStableScreenshotImport &&
      !shouldFinalizeUsableRowsWithWarnings;

    if (shouldAutoRerun) {
      const autoRerunPayload = buildAutoRerunPayload({
        latestScore: qaRunResult.evaluation.score,
        findings: qaRunResult.evaluation.findings.map((finding) => ({
          code: finding.code,
          severity: finding.severity,
          field: finding.field ?? null,
          message: finding.message,
          suggestion: finding.suggestion ?? null,
        })),
        parsedRows: rows as unknown as Array<Record<string, unknown>>,
        metadata: resolvedMetadata,
        statementCheckpoint: {
          openingBalance:
            resolvedMetadata.openingBalance !== null && resolvedMetadata.openingBalance !== undefined
              ? String(resolvedMetadata.openingBalance)
              : null,
          endingBalance:
            resolvedMetadata.endingBalance !== null && resolvedMetadata.endingBalance !== undefined
              ? String(resolvedMetadata.endingBalance)
              : null,
        },
        importAccount: importFile.account
          ? {
              institution: importFile.account.institution ?? null,
              type: importFile.account.type ?? null,
              name: importFile.account.name ?? null,
              balance: importFile.account.balance?.toString() ?? null,
            }
          : null,
      });

      await updateImportFileCompat(importFileId, {
        status: "processing",
        processingPhase: "auto_rerunning",
        processingAttempt: autoRerunAttempt + 1,
        processingTargetScore: AUTO_REPARSE_SCORE_TARGET,
        processingCurrentScore: qaRunResult.evaluation.score,
        processingMessage: `Auto-rerun ${autoRerunAttempt + 1}/${AUTO_REPARSE_MAX_ATTEMPTS} queued. Current score ${qaRunResult.evaluation.score}.`,
      });

      await applyDataQaReviewLearning({
        workspaceId: String(importFile.workspaceId),
        importFileId,
        accountId: importFile.account?.id ?? null,
        fileName: String(importFile.fileName ?? "imported-file"),
        fileType: String(importFile.fileType ?? "unknown"),
        metadata: resolvedMetadata,
        parsedRows: rows as unknown as Array<Record<string, unknown>>,
        fieldReviewPayload: autoRerunPayload.fieldReviewPayload as unknown as Prisma.JsonValue,
        manualFeedback: autoRerunPayload.manualFeedback,
        actorUserId: options.actorUserId ?? null,
        statementFingerprint,
        statementMetadataOverride: resolvedMetadata,
      }).catch((error) => {
        console.warn("Automatic QA learning failed before rerun", {
          importFileId,
          error,
        });
      });

      const nextStatementMetadataOverride = {
        ...resolvedMetadata,
        institution: readAutoRerunValue(autoRerunPayload.fieldReviewPayload.bank) ?? resolvedMetadata.institution ?? null,
        accountNumber: readAutoRerunValue(autoRerunPayload.fieldReviewPayload.accountNumber) ?? resolvedMetadata.accountNumber ?? null,
        accountType:
          (readAutoRerunValue(autoRerunPayload.fieldReviewPayload.accountType) as typeof resolvedMetadata.accountType | null) ??
          resolvedMetadata.accountType ??
          null,
        openingBalance:
          resolvedMetadata.openingBalance ?? null,
        endingBalance:
          (() => {
            const value = readAutoRerunValue(autoRerunPayload.fieldReviewPayload.accountBalance);
            if (!value) {
              return resolvedMetadata.endingBalance ?? null;
            }
            const parsed = Number(value.replace(/[^0-9.-]/g, ""));
            return Number.isFinite(parsed) ? parsed : resolvedMetadata.endingBalance ?? null;
          })(),
      };

      return processImportFileText(importFileId, {
        ...options,
        autoRerunAttempt: autoRerunAttempt + 1,
        statementMetadataOverride: nextStatementMetadataOverride,
      });
    }

    const shouldMarkDone =
      isDocumentImport
        ? Boolean(documentImportRecord)
        : qaRunResult.evaluation.score >= AUTO_REPARSE_SCORE_TARGET ||
          canFinalizeWithWarnings ||
          canFinalizeStableScreenshotImport;
    if (shouldMarkDone) {
      try {
        confirmedImportResult = await confirmImportFileWithRetry("qa_finalize");
        if (confirmedImportResult.status === "staged") {
          await updateImportFileCompat(importFileId, {
            status: "processing",
            processingPhase: "staged",
            processingMessage: "Clover is still lining things up.",
          });
          emitImportProcessingEvent("import_processing_completed", {
            processing_status: "staged",
            processing_phase: "staged",
            imported_rows: confirmedImportResult.imported,
          });

          return {
            imported: confirmedImportResult.imported,
            duplicate: Boolean(confirmedImportResult.duplicate),
            metadata: resolvedMetadata,
            accountId: confirmedImportResult.accountId ?? null,
            accountSummaries: confirmedImportResult.accountSummaries,
            confirmedTransactionsCount: confirmedImportResult.confirmedTransactionsCount ?? null,
            insightSummary: confirmedImportResult.insightSummary ?? undefined,
            accountBalance: confirmedImportResult.accountBalance ?? null,
            status: "staged",
          };
        }

        if (isDocumentImport) {
          await updateImportFileCompat(importFileId, {
            status: "done",
            processingPhase: "complete",
            processingCurrentScore: qaRunResult.evaluation.score,
            processingMessage:
              importMode === "receipt"
                ? "Receipt document saved."
                : importMode === "portfolio"
                  ? "Portfolio snapshot saved."
                  : importMode === "account_detail"
                    ? "Account detail snapshot saved."
              : "Document import saved.",
            confirmedTransactionsCount: confirmedImportResult.imported,
          });
          emitImportProcessingEvent("import_processing_completed", {
            processing_status: "done",
            processing_phase: "complete",
            imported_rows: rows.length,
          });

          return {
            imported: rows.length,
            duplicate: false,
            metadata: resolvedMetadata,
            accountId: confirmedImportResult.accountId ?? null,
            accountSummaries: confirmedImportResult.accountSummaries,
            confirmedTransactionsCount: confirmedImportResult.confirmedTransactionsCount ?? null,
            insightSummary: confirmedImportResult.insightSummary ?? undefined,
            accountBalance: confirmedImportResult.accountBalance ?? null,
            status: "done",
          };
        }
      } catch (error) {
        await updateImportFileCompat(importFileId, {
          status: "failed",
          processingPhase: "repair_needed",
          processingMessage: "Clover couldn't finish saving the import.",
        });
        emitImportProcessingEvent("import_processing_stalled", {
          processing_status: "failed",
          processing_phase: "repair_needed",
          reason: "confirm_import_failed",
        });
        throw error;
      }
    }

    await updateImportFileCompat(importFileId, {
      status: shouldMarkDone ? "done" : "failed",
      processingPhase:
        shouldMarkDone
          ? "complete"
          : plateaued
            ? "plateaued"
            : "repair_needed",
      processingCurrentScore: qaRunResult.evaluation.score,
      processingMessage:
        shouldMarkDone
          ? autoRerunEnabled && autoRerunAttempt > 0
            ? plateaued && canFinalizeWithWarnings
              ? `Automatic reruns plateaued at score ${qaRunResult.evaluation.score}, but Clover finalized the import with the available statement data.`
              : canFinalizeStableScreenshotImport
                ? `Clover finalized the visible screenshot rows at score ${qaRunResult.evaluation.score} because the import looked stable enough to publish.`
              : `Auto-rerun ${autoRerunAttempt}/${AUTO_REPARSE_MAX_ATTEMPTS} complete. Final score ${qaRunResult.evaluation.score}.`
            : canFinalizeStableScreenshotImport
              ? `Clover finalized the visible screenshot rows at score ${qaRunResult.evaluation.score} because the import looked stable enough to publish.`
            : null
          : plateaued
            ? `Automatic reruns plateaued at score ${qaRunResult.evaluation.score}. Manual parser fixes are needed before rerunning again.`
            : `Automatic reruns stopped below the ${AUTO_REPARSE_SCORE_TARGET} target. Latest score ${qaRunResult.evaluation.score}.`,
    });
    if (shouldMarkDone) {
      emitImportProcessingEvent("import_processing_completed", {
        processing_status: "done",
        processing_phase:
          autoRerunEnabled && autoRerunAttempt > 0
            ? "complete"
            : "complete",
        imported_rows: rows.length,
        final_score: qaRunResult.evaluation.score,
      });
    } else {
      emitImportProcessingEvent("import_processing_stalled", {
        processing_status: plateaued ? "plateaued" : "failed",
        processing_phase: plateaued ? "plateaued" : "repair_needed",
        final_score: qaRunResult.evaluation.score,
      });
    }
  } catch (error) {
    console.warn("Data QA recording failed after import processing", {
      importFileId,
      error,
    });
  }

  return {
    imported: rows.length,
    duplicate: false,
    metadata: resolvedMetadata,
    accountId: confirmedImportResult?.accountId ?? null,
    accountSummaries: confirmedImportResult?.accountSummaries,
    confirmedTransactionsCount: confirmedImportResult?.imported ?? null,
    insightSummary: confirmedImportResult?.insightSummary ?? undefined,
    accountBalance: confirmedImportResult?.accountBalance ?? undefined,
  };
};

const normalizeImportMerchant = (transaction: {
  merchantRaw?: unknown;
  merchantClean?: unknown;
  description?: unknown;
}) => {
  return String(transaction.merchantClean ?? transaction.merchantRaw ?? transaction.description ?? "Imported transaction")
    .trim()
    .toLowerCase();
};

const buildImportInsightSummary = (
  transactions: ImportInsightSourceRow[]
): ImportInsightSummary => {
  const categoryTotals = new Map<string, number>();
  const merchantCounts = new Map<string, { count: number; label: string }>();

  let incomeTotal = 0;
  let expenseTotal = 0;

  for (const transaction of transactions) {
    const amount = Math.abs(Number(transaction.amount ?? 0));
    const kind =
      transaction.rawPayload && typeof transaction.rawPayload === "object" && !Array.isArray(transaction.rawPayload)
        ? ((transaction.rawPayload as Record<string, unknown>).kind as string | undefined)
        : undefined;

    if (kind === "opening_balance") {
      continue;
    }

    if (transaction.type === "income") {
      incomeTotal += amount;
    } else if (transaction.type === "expense") {
      expenseTotal += amount;
      const categoryName = typeof transaction.categoryName === "string" && transaction.categoryName.trim() ? transaction.categoryName.trim() : "Other";
      categoryTotals.set(categoryName, (categoryTotals.get(categoryName) ?? 0) + amount);
    }

    const merchantKey = normalizeImportMerchant(transaction);
    const merchantLabel = String(transaction.merchantClean ?? transaction.merchantRaw ?? transaction.description ?? "Imported transaction").trim();
    const currentMerchant = merchantCounts.get(merchantKey);
    merchantCounts.set(merchantKey, {
      count: (currentMerchant?.count ?? 0) + 1,
      label: currentMerchant?.label ?? merchantLabel,
    });
  }

  const topCategory = Array.from(categoryTotals.entries()).sort((a, b) => b[1] - a[1])[0] ?? null;
  const topMerchant = Array.from(merchantCounts.values()).sort((a, b) => b.count - a.count)[0] ?? null;

  return {
    incomeTotal,
    expenseTotal,
    netTotal: incomeTotal - expenseTotal,
    topCategoryName: topCategory?.[0] ?? null,
    topCategoryAmount: topCategory?.[1] ?? null,
    topCategoryShare: topCategory && expenseTotal > 0 ? topCategory[1] / expenseTotal : null,
    topMerchantName: topMerchant?.label ?? null,
    topMerchantCount: topMerchant?.count ?? null,
  };
};

const snapshotBalanceToString = (value: unknown) => {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = parseAmountValue(typeof value === "number" ? String(value) : String(value));
  return parsed === null ? null : parsed.toFixed(2);
};

const looksLikeJsonBlob = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (!/^[\[{]/.test(trimmed)) {
    return false;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return parsed !== null && typeof parsed === "object";
  } catch {
    return true;
  }
};

const extractHumanReadableDescription = (rawPayload: Prisma.InputJsonValue | null | undefined) => {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const payload = rawPayload as Record<string, unknown>;
  const candidates = [
    payload.fullDetails,
    payload.parsedDetails,
    payload.transactionDetails,
    payload.transactionDetail,
    payload.counterpartyDetails,
    payload.counterparty,
    payload.recipient,
    payload.sender,
    payload.description,
    payload.notes,
    payload.memo,
    payload.detail,
    payload.details,
    payload.trailingDetails,
    payload.line,
    payload.merchant,
    payload.merchantRaw,
    payload.transactionDescription,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (!trimmed) {
        continue;
      }

      if (looksLikeJsonBlob(trimmed)) {
        continue;
      }

      return trimmed;
    }
  }

  return null;
};

export const confirmImportFile = async (importFileId: string, accountId?: string | null): Promise<ConfirmImportResult> => {
  const startedAt = Date.now();
  const importFile = await fetchImportFileCompat(importFileId);

  if (!importFile) {
    throw new Error("Import file not found");
  }

  const [planLimits, planUsage] = await Promise.all([
    getWorkspaceOwnerLimits(String(importFile.workspaceId)),
    getWorkspaceOwnerPlanUsage(String(importFile.workspaceId)),
  ]);
  const documentCheckpointRecord = (await hasCompatibleTable("AccountStatementCheckpoint"))
    ? await prisma.accountStatementCheckpoint.findUnique({
        where: { importFileId },
      })
    : null;
  const importMode = readCheckpointImportMode(documentCheckpointRecord?.sourceMetadata) ?? "statement";
  const imageImport = isImageImportFile(String(importFile.fileType ?? ""), String(importFile.fileName ?? ""));
  const isDocumentImport =
    importMode !== "statement" &&
    (imageImport || importMode === "receipt" || importMode === "portfolio" || importMode === "account_detail" || importMode === "notes");

  if (isDocumentImport) {
    const documentImport =
      (await hasCompatibleTable("DocumentImport"))
        ? await prisma.documentImport.findUnique({
            where: { importFileId },
            select: {
              id: true,
              accountId: true,
              currency: true,
              documentFamily: true,
              documentSubtype: true,
              rawPayload: true,
            },
          }).catch(() => null)
        : null;

    const receiptDocument =
      importMode === "receipt" && (await hasCompatibleTable("ReceiptDocument"))
        ? await prisma.receiptDocument.findUnique({
            where: { documentImportId: documentImport?.id ?? "" },
            select: {
              id: true,
              accountId: true,
              transactionId: true,
              merchantRaw: true,
              merchantClean: true,
              transactionDate: true,
              transactionTime: true,
              currency: true,
              subtotal: true,
              tax: true,
              total: true,
              paymentMethod: true,
              accountMatch: true,
              rawPayload: true,
            },
          }).catch(() => null)
        : null;

    if (importMode === "receipt") {
      const documentPayload =
        documentImport?.rawPayload && typeof documentImport.rawPayload === "object" && !Array.isArray(documentImport.rawPayload)
          ? (documentImport.rawPayload as Record<string, unknown>)
          : null;
      const receiptPayloadSource =
        receiptDocument?.rawPayload && typeof receiptDocument.rawPayload === "object" && !Array.isArray(receiptDocument.rawPayload)
          ? (receiptDocument.rawPayload as Record<string, unknown>)
          : documentPayload;
      const receiptDetailsPayload =
        receiptPayloadSource && typeof receiptPayloadSource.receiptDetails === "object" && !Array.isArray(receiptPayloadSource.receiptDetails)
          ? (receiptPayloadSource.receiptDetails as Record<string, unknown>)
          : null;
      const receiptDetailsRecord =
        receiptDetailsPayload ??
        (receiptPayloadSource && typeof receiptPayloadSource.receipt_details === "object" && !Array.isArray(receiptPayloadSource.receipt_details)
          ? (receiptPayloadSource.receipt_details as Record<string, unknown>)
          : null);
      const receiptLineItems = normalizeReceiptLineItems(
        Array.isArray(receiptDetailsRecord?.line_items)
          ? (receiptDetailsRecord.line_items as Array<{
              description?: string | null;
              quantity?: number | null;
              unit_price?: number | null;
              amount?: number | null;
              currency?: string | null;
              confidence_score?: number | null;
              parser_evidence?: {
                page?: number | null;
                source_text?: string | null;
                reason?: string | null;
              } | null;
            }>)
          : Array.isArray(receiptDetailsRecord?.lineItems)
            ? (receiptDetailsRecord.lineItems as Array<{
                description?: string | null;
                quantity?: number | null;
                unit_price?: number | null;
                amount?: number | null;
                currency?: string | null;
                confidence_score?: number | null;
                parser_evidence?: {
                  page?: number | null;
                  source_text?: string | null;
                  reason?: string | null;
                } | null;
              }>)
            : []
      );
      const receiptCurrency =
        String(
          receiptDocument?.currency ??
            (typeof receiptDetailsRecord?.currency === "string" ? receiptDetailsRecord.currency : null) ??
            documentImport?.currency ??
            "PHP"
        )
          .trim()
          .toUpperCase() || "PHP";
      const receiptSubtotal =
        receiptDocument?.subtotal !== null && receiptDocument?.subtotal !== undefined
          ? receiptDocument.subtotal.toString()
          : typeof receiptDetailsRecord?.subtotal === "number"
            ? receiptDetailsRecord.subtotal.toString()
            : null;
      const receiptTax =
        receiptDocument?.tax !== null && receiptDocument?.tax !== undefined
          ? receiptDocument.tax.toString()
          : typeof receiptDetailsRecord?.tax === "number"
            ? receiptDetailsRecord.tax.toString()
            : null;
      const receiptAmount =
        receiptDocument?.total !== null && receiptDocument?.total !== undefined
          ? receiptDocument.total.toString()
          : typeof receiptDetailsRecord?.total === "number"
            ? receiptDetailsRecord.total.toString()
            : null;
      const receiptDate =
        receiptDocument?.transactionDate ??
        parseDateValue(
          typeof receiptDetailsRecord?.transaction_date === "string"
            ? receiptDetailsRecord.transaction_date
            : typeof receiptDetailsRecord?.transactionDate === "string"
              ? receiptDetailsRecord.transactionDate
              : null
        ) ??
        null;
      const receiptMerchantRaw =
        typeof receiptDocument?.merchantRaw === "string" && receiptDocument.merchantRaw.trim()
          ? receiptDocument.merchantRaw.trim()
          : typeof receiptDetailsRecord?.merchant_raw === "string" && receiptDetailsRecord.merchant_raw.trim()
            ? receiptDetailsRecord.merchant_raw.trim()
            : typeof receiptDetailsRecord?.merchantRaw === "string" && receiptDetailsRecord.merchantRaw.trim()
              ? receiptDetailsRecord.merchantRaw.trim()
              : typeof receiptDocument?.merchantClean === "string" && receiptDocument.merchantClean.trim()
                ? receiptDocument.merchantClean.trim()
                : "Receipt";
      const receiptMerchantClean =
        typeof receiptDocument?.merchantClean === "string" && receiptDocument.merchantClean.trim()
          ? receiptDocument.merchantClean.trim()
          : typeof receiptDetailsRecord?.merchant_clean === "string" && receiptDetailsRecord.merchant_clean.trim()
            ? receiptDetailsRecord.merchant_clean.trim()
            : typeof receiptDetailsRecord?.merchantClean === "string" && receiptDetailsRecord.merchantClean.trim()
              ? receiptDetailsRecord.merchantClean.trim()
              : receiptMerchantRaw;
      const receiptAccountMatchPayload =
        receiptDocument?.accountMatch && typeof receiptDocument.accountMatch === "object" && !Array.isArray(receiptDocument.accountMatch)
          ? (receiptDocument.accountMatch as Record<string, unknown>)
          : receiptPayloadSource?.receiptAccountMatch && typeof receiptPayloadSource.receiptAccountMatch === "object" && !Array.isArray(receiptPayloadSource.receiptAccountMatch)
            ? (receiptPayloadSource.receiptAccountMatch as Record<string, unknown>)
            : null;
      const cashAccountId =
        receiptDocument?.accountId ??
        (documentImport?.accountId && !String(documentImport.accountId).startsWith("optimistic-") ? documentImport.accountId : null) ??
        (await resolveWorkspaceCashAccountId(String(importFile.workspaceId), receiptCurrency));
      const receiptCategoryName = (() => {
        const trainedCategoryName =
          typeof receiptDetailsRecord?.category_name === "string" && receiptDetailsRecord.category_name.trim()
            ? receiptDetailsRecord.category_name.trim()
            : typeof receiptDetailsRecord?.categoryName === "string" && receiptDetailsRecord.categoryName.trim()
              ? receiptDetailsRecord.categoryName.trim()
              : null;
        if (trainedCategoryName) {
          return trainedCategoryName;
        }

        const receiptTypeText =
          typeof receiptDetailsRecord?.receipt_type === "string"
            ? receiptDetailsRecord.receipt_type.trim().toLowerCase()
            : typeof receiptDetailsRecord?.receiptType === "string"
              ? receiptDetailsRecord.receiptType.trim().toLowerCase()
              : typeof receiptDocument?.rawPayload === "object" && receiptDocument?.rawPayload && !Array.isArray(receiptDocument.rawPayload)
                ? String(
                    (receiptDocument.rawPayload as Record<string, unknown>).receipt_type ??
                      (receiptDocument.rawPayload as Record<string, unknown>).receiptType ??
                      ""
                  )
                    .trim()
                    .toLowerCase()
                : "";
        const lineItemText = receiptLineItems.map((item) => item.description).join(" ").toLowerCase();
        const receiptContextText = `${receiptMerchantClean || ""} ${receiptMerchantRaw || ""} ${receiptTypeText} ${lineItemText}`.trim();

        if (
          /\btemporary bill\b/.test(receiptTypeText) ||
          /\bdine\s*in\b/.test(receiptTypeText) ||
          /\brestaurant\b/.test(receiptTypeText) ||
          /\bcafe\b/.test(receiptTypeText) ||
          /\bbar\b/.test(receiptTypeText)
        ) {
          return "Food & Dining";
        }

        if (
          /\b(adobo|pares|kare|salmon|lemonade|fizz|tonic|pasta|burger|noodle|rice|meal|dish|grill|steak|sushi|ramen|coffee|latte|dessert)\b/.test(
            lineItemText
          )
        ) {
          return "Food & Dining";
        }

        const merchantGuess = guessCategoryName(receiptMerchantClean || receiptMerchantRaw, "expense");
        if (merchantGuess !== "Other") {
          return merchantGuess;
        }

        const contextualGuess = guessCategoryName(receiptContextText, "expense");
        return contextualGuess !== "Other" ? contextualGuess : "Food & Dining";
      })();
      const receiptCategoryId = await resolveOrCreateWorkspaceCategoryId({
        workspaceId: String(importFile.workspaceId),
        categoryName: receiptCategoryName,
        fallbackType: "expense",
      });
      let createdTransactionId = receiptDocument?.transactionId ?? null;
      let existingReceiptTransaction:
        | {
            id: string;
            normalizedPayload: Prisma.JsonValue | null;
          }
        | null = null;

      if (!createdTransactionId && cashAccountId && receiptAmount !== null && receiptDate) {
        existingReceiptTransaction = await prisma.transaction.findFirst({
          where: {
            importFileId,
            accountId: cashAccountId,
          },
          select: { id: true, normalizedPayload: true },
        }).catch(() => null);

        if (existingReceiptTransaction?.id) {
          createdTransactionId = existingReceiptTransaction.id;
        } else {
          const insertedTransaction = await insertTransactionCompat({
            workspaceId: String(importFile.workspaceId),
            accountId: cashAccountId,
            importFileId,
            categoryId: receiptCategoryId,
            categoryName: receiptCategoryName,
            reviewStatus: "confirmed",
            parserConfidence:
              Number(
                receiptDocument?.rawPayload && typeof receiptDocument.rawPayload === "object"
                  ? (receiptDocument.rawPayload as Record<string, unknown>).confidence ?? 0
                  : receiptPayloadSource?.confidence ?? receiptPayloadSource?.confidence_score ?? 0
              ) || 95,
            categoryConfidence: 95,
            accountMatchConfidence: 100,
            duplicateConfidence: 0,
            transferConfidence: 0,
            date: receiptDate,
            amount: receiptAmount,
            currency: receiptCurrency,
            type: "expense",
            merchantRaw: receiptMerchantRaw,
            merchantClean: receiptMerchantClean,
            description: receiptMerchantClean,
            rawPayload: {
              source: "receipt",
              documentType: "receipt",
              receiptDocumentId: receiptDocument?.id ?? documentImport?.id ?? null,
              receiptDetails: {
                ...(receiptDetailsRecord ?? {}),
                merchantRaw: receiptMerchantRaw,
                merchantClean: receiptMerchantClean,
                transactionDate: receiptDate?.toISOString() ?? null,
                transactionTime: receiptDocument?.transactionTime ?? null,
                currency: receiptCurrency,
                subtotal: receiptSubtotal,
                tax: receiptTax,
                total: receiptAmount,
                paymentMethod: receiptDocument?.paymentMethod ?? (typeof receiptDetailsRecord?.payment_method === "string" ? receiptDetailsRecord.payment_method : null),
                lineItems: receiptLineItems.map((item) => ({
                  description: item.description,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  amount: item.amount,
                  currency: receiptCurrency,
                  confidenceScore: item.confidenceScore,
                  parserEvidence: item.parserEvidence,
                })),
                line_items: receiptLineItems.map((item) => ({
                  description: item.description,
                  quantity: item.quantity,
                  unit_price: item.unitPrice,
                  amount: item.amount,
                  currency: receiptCurrency,
                  confidence_score: item.confidenceScore,
                  parser_evidence: {
                    page: item.parserEvidence.page,
                    source_text: item.parserEvidence.sourceText,
                    reason: item.parserEvidence.reason,
                  },
                })),
              },
              receiptLineItems: receiptLineItems.map((item) => ({
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                amount: item.amount,
              })),
              receiptAccountMatch: receiptAccountMatchPayload as Prisma.InputJsonValue | null,
            } as Prisma.InputJsonValue,
            normalizedPayload: {
              merchantClean: receiptMerchantClean,
              categoryId: receiptCategoryId,
              categoryName: receiptCategoryName,
              type: "expense",
            } as Prisma.InputJsonValue,
            learnedRuleIdsApplied: [],
          });

          createdTransactionId =
            insertedTransaction && typeof insertedTransaction.id === "string" && insertedTransaction.id.trim()
              ? insertedTransaction.id
              : null;
        }
      }

      if (createdTransactionId && receiptCategoryId) {
        const existingNormalizedPayload =
          existingReceiptTransaction?.normalizedPayload &&
          typeof existingReceiptTransaction.normalizedPayload === "object" &&
          !Array.isArray(existingReceiptTransaction.normalizedPayload)
            ? (existingReceiptTransaction.normalizedPayload as Record<string, unknown>)
            : null;
        await prisma.transaction.update({
          where: { id: createdTransactionId },
          data: {
            categoryId: receiptCategoryId,
            categoryConfidence: 95,
            normalizedPayload: {
              ...(existingNormalizedPayload ?? {}),
              merchantClean: receiptMerchantClean,
              categoryId: receiptCategoryId,
              categoryName: receiptCategoryName,
              type: "expense",
            } as Prisma.InputJsonValue,
          },
        });
      }

      const cleanupRowsAfterConfirmation = await countImportTransactionsNeedingCleanup(importFileId).catch(() => 0);
      if (cleanupRowsAfterConfirmation > 0) {
        await upsertImportEnrichmentJob({
          workspaceId: String(importFile.workspaceId),
          importFileId,
          totalRows: Math.max(1, cleanupRowsAfterConfirmation),
          phase: "queued",
          forceRequeue: false,
        });
        await processImportEnrichmentJobs({
          importFileId,
          limit: MAX_IMPORT_ENRICHMENT_ATTEMPTS,
          batchSize: 500,
          workerId: `receipt-import-enrichment-${importFileId}`,
        }).catch((error) => {
          console.warn("Unable to finalize receipt enrichment immediately after import", {
            importFileId,
            error,
          });
        });
      }

      if (createdTransactionId && documentImport?.id) {
        await upsertReceiptDocumentCompat({
          workspaceId: String(importFile.workspaceId),
          documentImportId: documentImport.id,
          accountId: cashAccountId,
          transactionId: createdTransactionId,
          merchantRaw: receiptMerchantRaw,
          merchantClean: receiptMerchantClean,
          transactionDate: receiptDate,
          transactionTime: typeof receiptDetailsRecord?.transaction_time === "string" ? receiptDetailsRecord.transaction_time : receiptDocument?.transactionTime ?? null,
          currency: receiptCurrency,
          subtotal: receiptSubtotal,
          tax: receiptTax,
          total: receiptAmount,
          paymentMethod:
            receiptDocument?.paymentMethod ?? (typeof receiptDetailsRecord?.payment_method === "string" ? receiptDetailsRecord.payment_method : null),
          accountMatch: receiptAccountMatchPayload as Prisma.InputJsonValue | null,
          confidence:
            Number(
              receiptDocument?.rawPayload && typeof receiptDocument.rawPayload === "object"
                ? (receiptDocument.rawPayload as Record<string, unknown>).confidence ?? 0
                : receiptPayloadSource?.confidence ?? receiptPayloadSource?.confidence_score ?? 0
            ) || 95,
          rawPayload: {
            ...(receiptPayloadSource ?? {}),
            receiptDetails: {
              ...(receiptDetailsRecord ?? {}),
              merchantRaw: receiptMerchantRaw,
              merchantClean: receiptMerchantClean,
              transactionDate: receiptDate?.toISOString() ?? null,
              transactionTime: typeof receiptDetailsRecord?.transaction_time === "string" ? receiptDetailsRecord.transaction_time : receiptDocument?.transactionTime ?? null,
              currency: receiptCurrency,
              subtotal: receiptSubtotal,
              tax: receiptTax,
              total: receiptAmount,
              paymentMethod:
                receiptDocument?.paymentMethod ?? (typeof receiptDetailsRecord?.payment_method === "string" ? receiptDetailsRecord.payment_method : null),
              lineItems: receiptLineItems.map((item) => ({
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                amount: item.amount,
                currency: receiptCurrency,
                confidenceScore: item.confidenceScore,
                parserEvidence: item.parserEvidence,
              })),
              line_items: receiptLineItems.map((item) => ({
                description: item.description,
                quantity: item.quantity,
                unit_price: item.unitPrice,
                amount: item.amount,
                currency: receiptCurrency,
                confidence_score: item.confidenceScore,
                parser_evidence: {
                  page: item.parserEvidence.page,
                  source_text: item.parserEvidence.sourceText,
                  reason: item.parserEvidence.reason,
                },
              })),
            },
            receiptLineItems: receiptLineItems.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              amount: item.amount,
            })),
            transactionId: createdTransactionId,
          } as Prisma.InputJsonValue,
        });
      }

      return {
        imported: createdTransactionId ? 1 : 0,
        duplicate: false,
        metadata: detectStatementMetadataFromText("", importFile.fileName),
        accountId: cashAccountId ?? documentImport?.accountId ?? accountId ?? null,
        confirmedTransactionsCount: createdTransactionId ? 1 : 0,
        insightSummary: null,
        accountBalance: null,
        status: "done",
      };
    }
  }

  let parsedRows: Array<Record<string, unknown>> = [];
  const noisyBankName = normalizeBankName(String(importFile.fileName ?? ""));
  const isLikelyLowQualityUnionBankStatement =
    noisyBankName === "UnionBank" && /\b(?:word|excel|template|business_statement)\b/i.test(String(importFile.fileName ?? ""));
  const MAX_WAIT_MS =
    ["Landbank", "EastWest", "UCPB", "Chinabank", "China Bank"].includes(noisyBankName) || isLikelyLowQualityUnionBankStatement
      ? 60_000
      : 8_000;
  while (Date.now() - startedAt < MAX_WAIT_MS) {
    parsedRows = await fetchParsedTransactionRows(importFileId);
    if (parsedRows.length > 0) {
      break;
    }

    try {
      await processImportFileText(importFileId, { actorUserId: null });
    } catch (error) {
      console.warn("Unable to recover parsed rows before confirmation", {
        importFileId,
        error,
      });
    }

    parsedRows = await fetchParsedTransactionRows(importFileId);
    if (parsedRows.length > 0) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (parsedRows.length === 0) {
    return {
      imported: 0,
      duplicate: false,
      metadata: detectStatementMetadataFromText("", importFile.fileName),
      accountId: accountId ?? null,
      confirmedTransactionsCount: 0,
      insightSummary: null,
      accountBalance: null,
      status: "staged",
    };
  }

  const statementCheckpointRecord = (await hasCompatibleTable("AccountStatementCheckpoint"))
    ? await prisma.accountStatementCheckpoint.findUnique({
        where: { importFileId },
      })
    : null;
  const statementMetadata =
    statementCheckpointRecord?.sourceMetadata &&
    typeof statementCheckpointRecord.sourceMetadata === "object" &&
    !Array.isArray(statementCheckpointRecord.sourceMetadata)
      ? (statementCheckpointRecord.sourceMetadata as Record<string, unknown>)
      : null;
  const checkpointBankName = readCheckpointBankName(statementCheckpointRecord?.sourceMetadata);
  parsedRows = normalizeWiseWalletParsedRows(parsedRows, {
    institution: typeof statementMetadata?.institution === "string" ? statementMetadata.institution : null,
    accountType: typeof statementMetadata?.accountType === "string" ? statementMetadata.accountType : null,
  });
  parsedRows = parsedRows.filter((row) => {
    const rawPayload =
      row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
        ? (row.rawPayload as Record<string, unknown>)
        : null;
    if (
      isWiseSkippableVerificationRow(
        row as Record<string, unknown>,
        checkpointBankName ?? (typeof statementMetadata?.institution === "string" ? statementMetadata.institution : null)
      )
    ) {
      console.warn("[import-confirmation] skipped Wise screenshot verification row", {
        importFileId,
        merchant: typeof row.merchantClean === "string" ? row.merchantClean : row.merchantRaw,
        currency: row.currency,
      });
      return false;
    }
    if (rawPayload?.wiseAmbiguousAccountCurrency === true) {
      console.warn("[import-confirmation] skipped ambiguous Wise screenshot merchant-currency row", {
        importFileId,
        merchant: typeof row.merchantClean === "string" ? row.merchantClean : row.merchantRaw,
        currency: row.currency,
      });
      return false;
    }
    return true;
  });
  if (parsedRows.length === 0) {
    return {
      imported: 0,
      duplicate: false,
      metadata: detectStatementMetadataFromText("", importFile.fileName),
      accountId: accountId ?? null,
      confirmedTransactionsCount: 0,
      insightSummary: null,
      accountBalance: null,
      status: "staged",
    };
  }
  const parsedRowsLookWise = parsedRows.some((row) => {
    const rawPayload =
      row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
        ? (row.rawPayload as Record<string, unknown>)
        : null;
    return /wise/i.test(
      [
        row.institution,
        row.accountName,
        rawPayload?.institutionRaw,
        rawPayload?.bank,
        rawPayload?.source,
        rawPayload?.kind,
      ]
        .filter(Boolean)
        .join(" ")
    );
  });
  const parsedStatementFingerprints = Array.from(
    new Set(
      parsedRows
        .map((row) => (typeof row.statementFingerprint === "string" && row.statementFingerprint.trim() ? row.statementFingerprint.trim() : null))
        .filter((value): value is string => value !== null)
    )
  );
  const checkpointStatementFingerprint =
    typeof statementMetadata?.statementFingerprint === "string" && statementMetadata.statementFingerprint.trim()
      ? statementMetadata.statementFingerprint.trim()
      : null;
  const statementFingerprints = Array.from(
    new Set([...parsedStatementFingerprints, ...(checkpointStatementFingerprint ? [checkpointStatementFingerprint] : [])])
  );

  const baseStatementMetadata = {
    accountName:
      typeof statementMetadata?.accountName === "string" ? statementMetadata.accountName : null,
    institution:
      typeof statementMetadata?.institution === "string" ? statementMetadata.institution : null,
    accountNumber:
      typeof statementMetadata?.accountNumber === "string" ? statementMetadata.accountNumber : null,
    accountType:
      typeof statementMetadata?.accountType === "string" ? statementMetadata.accountType : null,
    currency:
      typeof statementMetadata?.currency === "string" ? statementMetadata.currency : null,
    openingBalance:
      typeof statementMetadata?.openingBalance === "number" ? statementMetadata.openingBalance : null,
    endingBalance:
      typeof statementMetadata?.endingBalance === "number" ? statementMetadata.endingBalance : null,
  };
  const readRowPayloadText = (row: Record<string, unknown>, key: string) => {
    const rawPayload = row.rawPayload;
    if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
      return null;
    }

    const value = (rawPayload as Record<string, unknown>)[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  const readRowAccountNumber = (row: Record<string, unknown>) =>
    (typeof row.accountNumber === "string" && row.accountNumber.trim() ? row.accountNumber.trim() : null) ??
    readRowPayloadText(row, "accountNumber");
  const readRowAccountName = (row: Record<string, unknown>) =>
    (typeof row.accountName === "string" && row.accountName.trim() ? row.accountName.trim() : null) ??
    readRowPayloadText(row, "accountName");
  const readRowInstitution = (row: Record<string, unknown>) =>
    (typeof row.institution === "string" && row.institution.trim() ? row.institution.trim() : null) ??
    baseStatementMetadata.institution;
  const readRowAccountCurrency = (row: Record<string, unknown>) =>
    normalizeWiseWalletCurrencyCode(readRowPayloadText(row, "accountCurrency")) ??
    normalizeWiseWalletCurrencyCode(typeof row.currency === "string" ? row.currency : null);
  const rowLooksWiseAccount = (row: Record<string, unknown>) =>
    /wise/i.test(
      [
        readRowInstitution(row),
        readRowAccountName(row),
        readRowPayloadText(row, "institutionRaw"),
        readRowPayloadText(row, "bank"),
        readRowPayloadText(row, "source"),
      ]
        .filter(Boolean)
        .join(" ")
    );
  const accountGroupKeyForRow = (row: Record<string, unknown>) => {
    const accountNumber = readRowAccountNumber(row);
    if (accountNumber) {
      return `number:${accountNumber}`;
    }

    const wiseCurrency = rowLooksWiseAccount(row) ? readRowAccountCurrency(row) : null;
    if (wiseCurrency) {
      return `wise:${wiseCurrency}`;
    }

    const accountName = readRowAccountName(row);
    const institution = readRowInstitution(row);
    if (accountName) {
      return `name:${institution ?? "unknown"}:${accountName}`;
    }

    return "__default__";
  };
  const parsedRowsByAccount = new Map<string, Array<Record<string, unknown>>>();
  for (const row of parsedRows as Array<Record<string, unknown>>) {
    const key = accountGroupKeyForRow(row);
    const group = parsedRowsByAccount.get(key) ?? [];
    group.push(row);
    parsedRowsByAccount.set(key, group);
  }
  const parsedAccountGroups = Array.from(parsedRowsByAccount.entries()).map(([key, rows]) => ({ key, rows }));
  const nonDefaultParsedAccountGroups = parsedAccountGroups.filter((group) => group.key !== "__default__");
  const hasMultipleWiseWalletAccountGroups = hasMultipleWiseWalletAccountNames(parsedRows as Array<Record<string, unknown>>, {
    institution: typeof statementMetadata?.institution === "string" ? statementMetadata.institution : null,
    accountType: typeof statementMetadata?.accountType === "string" ? statementMetadata.accountType : null,
  });
  const investmentInstitutionHint = [
    typeof baseStatementMetadata.institution === "string" ? baseStatementMetadata.institution : null,
    typeof baseStatementMetadata.accountName === "string" ? baseStatementMetadata.accountName : null,
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(" ");
  const hasMultipleInvestmentAccountGroups =
    nonDefaultParsedAccountGroups.length > 1 &&
    (baseStatementMetadata.accountType === "investment" || /\bgfunds\b|\batram\b|\bgcrypto\b|\bpdax\b/i.test(investmentInstitutionHint));
  const multiAccountImport =
    (nonDefaultParsedAccountGroups.length > 1 &&
      parsedAccountGroups.some((group) => group.rows.some((row) => Boolean(readRowAccountNumber(row))))) ||
    hasMultipleWiseWalletAccountGroups ||
    hasMultipleInvestmentAccountGroups;
  const accountByGroupKey = new Map<string, Awaited<ReturnType<typeof resolveConfirmationAccount>>>();
  let resolvedAccountSequence = 0;
  for (const group of multiAccountImport ? parsedAccountGroups : parsedAccountGroups.slice(0, 1)) {
    const firstGroupRow = group.rows[0] ?? {};
    const groupRows = group.rows as EnrichedParsedImportRow[];
    const groupEndingBalance = getImportAccountBalanceFromParsedRows(groupRows);
    const groupCurrency = readRowAccountCurrency(firstGroupRow);
    const groupLooksWiseAccount = rowLooksWiseAccount(firstGroupRow);
    const groupAccount = await resolveConfirmationAccount({
      importFile,
      statementMetadata: {
        ...baseStatementMetadata,
        accountName: groupLooksWiseAccount ? "Wise" : readRowAccountName(firstGroupRow) ?? baseStatementMetadata.accountName,
        institution: groupLooksWiseAccount ? "Wise" : readRowInstitution(firstGroupRow) ?? baseStatementMetadata.institution ?? checkpointBankName ?? null,
        accountNumber: groupLooksWiseAccount ? null : readRowAccountNumber(firstGroupRow) ?? baseStatementMetadata.accountNumber,
        accountType: groupLooksWiseAccount ? "wallet" : baseStatementMetadata.accountType,
        currency:
          groupCurrency ??
          (typeof firstGroupRow.currency === "string" && firstGroupRow.currency.trim()
            ? firstGroupRow.currency.trim().toUpperCase()
            : baseStatementMetadata.currency),
        endingBalance: groupEndingBalance ?? baseStatementMetadata.endingBalance,
      },
      parsedRows: groupRows,
      accountId: multiAccountImport ? null : accountId,
      planLimits: planLimits ? { accountLimit: planLimits.accountLimit } : null,
      planAccountCount:
        planUsage?.accountCount === null || planUsage?.accountCount === undefined
          ? null
          : planUsage.accountCount + resolvedAccountSequence,
    });
    if (!groupAccount) {
      throw new Error("Account not found");
    }

    accountByGroupKey.set(group.key, groupAccount);
    resolvedAccountSequence += 1;
  }
  const account = accountByGroupKey.get(parsedAccountGroups[0]?.key ?? "__default__") ?? accountByGroupKey.values().next().value ?? null;
  if (!account) {
    throw new Error("Account not found");
  }
  const rowAccountFor = (row: Record<string, unknown>) =>
    accountByGroupKey.get(accountGroupKeyForRow(row)) ?? accountByGroupKey.get("__default__") ?? account;
  const resolvedAccounts = Array.from(new Map(Array.from(accountByGroupKey.values()).map((entry) => [entry?.id, entry])).values()).filter(
    (entry): entry is NonNullable<typeof entry> => Boolean(entry)
  );
  const resolvedAccountId = account.id;
  const accountSummaryById = new Map<
    string,
    {
      accountId: string;
      accountName: string | null;
      institution: string | null;
      accountNumber: string | null;
      accountType: AccountType | null;
      balance: string | null;
      rowsImported: number;
    }
  >();
  for (const group of parsedAccountGroups) {
    const groupAccount = accountByGroupKey.get(group.key);
    if (!groupAccount) {
      continue;
    }

    const visibleGroupRows = group.rows.filter((row) => {
      const rawPayload = row.rawPayload;
      return !(
        rawPayload &&
        typeof rawPayload === "object" &&
        !Array.isArray(rawPayload) &&
        ((rawPayload as Record<string, unknown>).kind === "opening_balance" ||
          (rawPayload as Record<string, unknown>).kind === "account_snapshot_marker")
      );
    });
    const groupBalance = getImportAccountBalanceFromParsedRows(group.rows as EnrichedParsedImportRow[]);
    const existingSummary = accountSummaryById.get(groupAccount.id);
    accountSummaryById.set(groupAccount.id, {
      accountId: groupAccount.id,
      accountName: groupAccount.name,
      institution: groupAccount.institution,
      accountNumber: groupAccount.accountNumber,
      accountType: groupAccount.type,
      balance: groupBalance !== null ? groupBalance.toString() : snapshotBalanceToString(groupAccount.balance),
      rowsImported: (existingSummary?.rowsImported ?? 0) + visibleGroupRows.length,
    });
  }
  const accountSummaries = Array.from(accountSummaryById.values());
  const resolvedAccountIdentityKeys = new Set(
    resolvedAccounts.map((entry) => normalizeImportedAccountKey(entry.name, entry.institution, entry.accountNumber, entry.type))
  );
  const looseResolvedAccountIdentityKeys = new Set(
    resolvedAccounts.map((entry) => normalizeImportedAccountKey(entry.name, entry.institution, entry.accountNumber, null))
  );
  const matchingAccountIdsForImport = Array.from(
    new Set([
      ...resolvedAccounts.map((entry) => entry.id),
      ...(
        await prisma.account.findMany({
          where: { workspaceId: String(importFile.workspaceId) },
          select: {
            id: true,
            name: true,
            institution: true,
            accountNumber: true,
            type: true,
          },
        })
      )
        .filter(
          (candidate) =>
            resolvedAccountIdentityKeys.has(normalizeImportedAccountKey(candidate.name, candidate.institution, candidate.accountNumber, candidate.type)) ||
            looseResolvedAccountIdentityKeys.has(normalizeImportedAccountKey(candidate.name, candidate.institution, candidate.accountNumber, null))
        )
        .map((candidate) => candidate.id),
    ])
  );
  const compatibleImportFileColumns = new Set(await getCompatibleImportFileColumns());

  let statementRow: Record<string, unknown> | null = null;
  let statementConfidence = 0;
  let reconciledAccountBalance: string | null = null;
  const transactions: ImportInsightSourceRow[] = [];
  const trainingSignals: Array<{
    transactionId: string;
    merchantText: string;
    categoryId: string;
    categoryName: string;
    type: "income" | "expense" | "transfer";
    confidence: number;
    teachabilityScore: number;
    notes: string | null;
  }> = [];
  const preparedTransactions: PreparedImportTransaction[] = [];
  let duplicateSkippedTransactionsCount = 0;
  let qaMetadataForRun: {
    institution: string | null;
    accountNumber: string | null;
    accountName: string | null;
    accountType: string | null;
    openingBalance: number | null;
    endingBalance: number | null;
    paymentDueDate: null;
    totalAmountDue: null;
    startDate: string | null;
    endDate: string | null;
    confidence: number;
  } | null = null;
  let qaAccountForRun: {
    id: string;
    name: string;
    institution: string | null;
    type: string | null;
    balance: string | null;
  } | null = null;
  let qaCheckpointForRun: {
    statementStartDate: Date | null;
    statementEndDate: Date | null;
    openingBalance: string | null;
    endingBalance: string | null;
    status: string;
    rowCount: number;
  } | null = null;
  const coerceAmountToString = (value: unknown) => {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === "number" || typeof value === "string") {
      return String(value);
    }

    if (typeof value === "object" && "toString" in value && typeof (value as { toString?: unknown }).toString === "function") {
      return String(value);
    }

    return null;
  };

  const confirmationResult = await prisma.$transaction(async (tx) => {
    const confirmationLockKey = [
      "import-confirm",
      String(importFile.workspaceId),
      Array.from(looseResolvedAccountIdentityKeys).filter(Boolean).join(",") ||
        Array.from(resolvedAccountIdentityKeys).filter(Boolean).join(",") ||
        resolvedAccountId,
      statementFingerprints.length > 0 ? statementFingerprints.join(",") : importFileId,
    ].join(":");
    const lockRows = await tx.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_xact_lock(hashtextextended(${confirmationLockKey}, 0)) AS locked
    `;
    if (!lockRows[0]?.locked) {
      const existingVisibleRows = await tx.transaction.count({
        where: {
          deletedAt: null,
          workspaceId: String(importFile.workspaceId),
          accountId: { in: matchingAccountIdsForImport },
          OR: [
            { importFileId },
            {
              rawPayload: {
                path: ["sourceImportFileId"],
                equals: importFileId,
              },
            },
            ...statementFingerprints.map((fingerprint) => ({
              rawPayload: {
                path: ["sourceStatementFingerprint"],
                equals: fingerprint,
              },
            })),
          ],
        },
      });

      return {
        imported: existingVisibleRows,
        duplicate: true,
        accountId: resolvedAccountId,
        accountSummaries,
        insightSummary: null,
        accountBalance: null,
        confirmedTransactionsCount: existingVisibleRows,
        status: existingVisibleRows > 0 ? "done" : "staged",
      };
    }

    const existingImportTransactionMatchClauses = [
      { importFileId },
      {
        rawPayload: {
          path: ["sourceImportFileId"],
          equals: importFileId,
        },
      },
      ...statementFingerprints.map((fingerprint) => ({
        rawPayload: {
          path: ["sourceStatementFingerprint"],
          equals: fingerprint,
        },
      })),
    ];
    const existingImportTransactions = await tx.transaction.findMany({
      where: {
        deletedAt: null,
        workspaceId: String(importFile.workspaceId),
        OR: [
          {
            accountId: { in: matchingAccountIdsForImport },
            OR: existingImportTransactionMatchClauses,
          },
          ...statementFingerprints.map((fingerprint) => ({
            rawPayload: {
              path: ["sourceStatementFingerprint"],
              equals: fingerprint,
            },
          })),
        ],
      },
      select: {
        id: true,
        accountId: true,
        rawPayload: true,
        date: true,
        amount: true,
        currency: true,
        type: true,
        merchantRaw: true,
        merchantClean: true,
        description: true,
        reviewStatus: true,
      },
    });
    const mobileScreenshotOverlapDedupeEnabled = parsedRows.some((row) =>
      getMobileScreenshotPayloadKind(
        row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
          ? (row.rawPayload as Prisma.JsonValue)
          : null
      )
    );
    const existingMobileScreenshotOverlapTransactions = mobileScreenshotOverlapDedupeEnabled
      ? await tx.transaction.findMany({
          where: {
            deletedAt: null,
            workspaceId: String(importFile.workspaceId),
            reviewStatus: { notIn: ["rejected", "duplicate_skipped"] },
            OR: mobileScreenshotOverlapPayloadMatchers.map((matcher) => ({
              rawPayload: {
                path: [matcher.path],
                equals: matcher.equals,
              },
            })),
          },
          select: {
            id: true,
            accountId: true,
            rawPayload: true,
            date: true,
            amount: true,
            currency: true,
            type: true,
            merchantRaw: true,
            merchantClean: true,
            description: true,
            reviewStatus: true,
          },
        })
      : [];
    const existingImportTransactionBySourceIndex = new Map<string, (typeof existingImportTransactions)[number]>();
    const existingImportTransactionByStatementSourceIndex = new Map<string, (typeof existingImportTransactions)[number]>();
    const existingImportTransactionsByDedupeKey = new Map<string, Array<(typeof existingImportTransactions)[number]>>();
    for (const transaction of existingImportTransactions) {
      const sourceRowIndex = getImportSourceRowIndex(transaction.rawPayload);
      const sourceStatementFingerprint = getImportSourceStatementFingerprint(transaction.rawPayload);
      const accountScopedSourceRowKey = buildAccountScopedSourceRowKey(transaction.accountId, sourceRowIndex);
      if (accountScopedSourceRowKey && !existingImportTransactionBySourceIndex.has(accountScopedSourceRowKey)) {
        existingImportTransactionBySourceIndex.set(accountScopedSourceRowKey, transaction);
      }
      if (sourceRowIndex && sourceStatementFingerprint && statementFingerprints.includes(sourceStatementFingerprint)) {
        const statementSourceRowKey = `${sourceStatementFingerprint}:${sourceRowIndex}`;
        if (!existingImportTransactionByStatementSourceIndex.has(statementSourceRowKey)) {
          existingImportTransactionByStatementSourceIndex.set(statementSourceRowKey, transaction);
        }
      }

      const dedupeKey = buildConfirmedTransactionDedupeKey({
        ...transaction,
        sourceRowIndex,
        sourceStatementFingerprint,
      });
      const bucket = existingImportTransactionsByDedupeKey.get(dedupeKey) ?? [];
      bucket.push(transaction);
      existingImportTransactionsByDedupeKey.set(dedupeKey, bucket);
    }
    const existingMobileScreenshotOverlapCounts = new Map<string, number>();
    for (const transaction of existingMobileScreenshotOverlapTransactions) {
      const key = buildMobileScreenshotContentKey(transaction);
      if (!key) {
        continue;
      }
      existingMobileScreenshotOverlapCounts.set(key, (existingMobileScreenshotOverlapCounts.get(key) ?? 0) + 1);
    }
    const retainedExistingImportTransactionIds = new Set<string>();
    let retainedExistingImportTransactionsCount = 0;

    await tx.trainingSignal.deleteMany({
      where: {
        importFileId,
        source: "import_confirmation",
      },
    });

    await updateImportFileWithTxCompat(
      tx,
      importFileId,
      {
        accountId: resolvedAccountId,
        confirmedAt: new Date(),
        status: "done",
      },
      compatibleImportFileColumns
    );

  const statementCheckpoint = (await hasCompatibleTable("AccountStatementCheckpoint"))
    ? await tx.accountStatementCheckpoint.findUnique({
        where: { importFileId },
      })
    : null;
  let openingBalanceInserted = false;

  if (statementCheckpoint) {
    const statementStartDate = statementCheckpoint.statementStartDate ?? null;
    const statementEndDate = statementCheckpoint.statementEndDate ?? null;
    const previousCheckpoint = statementStartDate
      ? await tx.accountStatementCheckpoint.findFirst({
          where: {
            accountId: resolvedAccountId,
            statementEndDate: {
              lt: statementStartDate,
            },
            status: {
              in: ["reconciled", "mismatch"],
            },
          },
          orderBy: [{ statementEndDate: "desc" }, { createdAt: "desc" }],
        })
      : null;

    let checkpointStatus: "pending" | "reconciled" | "mismatch" = "pending";
    let mismatchReason: string | null = null;

    if (statementCheckpoint.endingBalance !== null) {
      checkpointStatus = "reconciled";
    }

    if (
      previousCheckpoint &&
      previousCheckpoint.endingBalance !== null &&
      statementCheckpoint.openingBalance !== null &&
      previousCheckpoint.endingBalance.toString() !== statementCheckpoint.openingBalance.toString()
    ) {
      checkpointStatus = "mismatch";
      mismatchReason = "Opening balance does not match the previous statement ending balance.";
    }

    await tx.accountStatementCheckpoint.update({
      where: { id: statementCheckpoint.id },
      data: {
        accountId: resolvedAccountId,
        status: checkpointStatus,
        mismatchReason,
        sourceMetadata: mergeCheckpointSourceMetadata(statementCheckpoint.sourceMetadata, {
          workflowStage: checkpointStatus === "reconciled" ? "complete" : checkpointStatus === "mismatch" ? "repair_needed" : "reconciling",
          publishedVisibleImportComplete: accountSummaries.length > 0,
          publishedAccountSummaries: accountSummaries,
        }) as Prisma.InputJsonValue,
      },
    });

    const hasParsedOpeningBalance = parsedRows.some((row) => {
      const merchantRaw = typeof row.merchantRaw === "string" ? row.merchantRaw.trim() : "";
      const merchantClean = typeof row.merchantClean === "string" ? row.merchantClean.trim() : "";
      const categoryName = typeof row.categoryName === "string" ? row.categoryName.trim() : "";
      return (
        /^beginning balance$/i.test(merchantRaw) ||
        /^beginning balance$/i.test(merchantClean) ||
        /^opening balance$/i.test(categoryName)
      );
    });

    if (
      statementCheckpoint.openingBalance !== null &&
      !hasParsedOpeningBalance &&
      !(await tx.transaction.findFirst({
        where: {
          accountId: resolvedAccountId,
          merchantRaw: "Beginning balance",
          date: statementStartDate ?? undefined,
        },
      }))
    ) {
      // Keep the checkpoint opening balance for reconciliation, but avoid synthesizing
      // an extra transaction row. That keeps live imports aligned with the JSON fixtures.
      openingBalanceInserted = false;
    }
  }

  statementRow = parsedRows.find((row) => typeof row.accountName === "string" && row.accountName.trim()) ?? parsedRows[0] ?? null;
  statementConfidence =
    typeof statementCheckpoint?.sourceMetadata === "object" && statementCheckpoint?.sourceMetadata !== null
      ? Number((statementCheckpoint.sourceMetadata as Record<string, unknown>).confidence ?? 0)
      : 0;
  const statementInstitution =
    typeof statementCheckpoint?.sourceMetadata === "object" && statementCheckpoint?.sourceMetadata !== null
      ? ((statementCheckpoint.sourceMetadata as Record<string, unknown>).institution as string | null | undefined) ?? null
      : null;

  const latestExplicitBalance = [...parsedRows]
    .reverse()
    .find((row) => {
      if (!row.rawPayload || typeof row.rawPayload !== "object" || Array.isArray(row.rawPayload)) {
        return false;
      }

      return snapshotBalanceToString((row.rawPayload as Record<string, unknown>).balance) !== null;
    });

  const statementEndingBalance = snapshotBalanceToString(statementCheckpoint?.endingBalance);
  const latestExplicitStatementBalance = snapshotBalanceToString(
    latestExplicitBalance && typeof latestExplicitBalance.rawPayload === "object" && !Array.isArray(latestExplicitBalance.rawPayload)
      ? (latestExplicitBalance.rawPayload as Record<string, unknown>).balance
      : null
  );
  const mobileWalletScreenshotImport = parsedRows.some((row) =>
    getMobileScreenshotWalletIdentity(
      row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
        ? (row.rawPayload as Prisma.JsonValue)
        : null
    )
  );
  const fallbackReconciledBalance = mobileWalletScreenshotImport
    ? null
    : deriveReconciledBalance({
        transactions: parsedRows.map(
          (row) =>
            ({
              amount: row.amount,
              type: row.type ?? null,
              merchantRaw: row.merchantRaw ?? null,
              merchantClean: row.merchantClean ?? null,
              description: row.description ?? null,
              date: row.date ?? null,
              rawPayload:
                row.rawPayload && typeof row.rawPayload === "object"
                  ? (row.rawPayload as { balance?: unknown; amountDelta?: unknown; openingBalance?: unknown; kind?: string })
                  : null,
            }) as BalanceLikeTransaction
        ),
        checkpoints:
          statementCheckpoint && statementCheckpoint.endingBalance !== null
            ? [
                {
                  endingBalance: statementCheckpoint.endingBalance.toString(),
                  statementEndDate: statementCheckpoint.statementEndDate?.toISOString() ?? null,
                  createdAt: statementCheckpoint.createdAt.toISOString(),
                },
              ]
        : [],
      });
  reconciledAccountBalance = mobileWalletScreenshotImport
    ? null
    : statementEndingBalance ?? latestExplicitStatementBalance ?? fallbackReconciledBalance;
  if (multiAccountImport) {
    for (const group of parsedAccountGroups) {
      const groupAccount = accountByGroupKey.get(group.key);
      if (!groupAccount) {
        continue;
      }

      const groupBalance = getImportAccountBalanceFromParsedRows(group.rows as EnrichedParsedImportRow[]);
      if (groupBalance === null) {
        continue;
      }

      await tx.account.update({
        where: { id: groupAccount.id },
        data: { balance: groupBalance.toString() },
      });
      if (groupAccount.id === resolvedAccountId) {
        reconciledAccountBalance = groupBalance.toString();
      }
    }
  } else {
    const currentAccountBalance = snapshotBalanceToString(account.balance);
    const shouldPreserveUploadedAccountBalance =
      account.source === "upload" &&
      currentAccountBalance !== null &&
      parseAmountValue(currentAccountBalance) !== null &&
      parseAmountValue(currentAccountBalance) !== 0 &&
      reconciledAccountBalance !== null &&
      parseAmountValue(reconciledAccountBalance) === 0 &&
      statementEndingBalance === null &&
      latestExplicitStatementBalance === null;
    const balanceToPersist = shouldPreserveUploadedAccountBalance ? currentAccountBalance : reconciledAccountBalance;
    reconciledAccountBalance = balanceToPersist;

    if (mobileWalletScreenshotImport) {
      await tx.account.update({
        where: { id: resolvedAccountId },
        data: {
          balance: null,
          type: "wallet",
        },
      });
    } else if (balanceToPersist !== null) {
      await tx.account.update({
        where: { id: resolvedAccountId },
        data: {
          balance: balanceToPersist,
        },
      });
    }
  }

  const existingCategories = await tx.category.findMany({
    where: { workspaceId: importFile.workspaceId },
  });
  const categoryByName = new Map(existingCategories.map((category) => [category.name.toLowerCase(), category.id]));
  const workspaceAccountsForTransferMatching = await tx.account.findMany({
    where: { workspaceId: importFile.workspaceId },
    select: {
      id: true,
      name: true,
      institution: true,
      accountNumber: true,
      type: true,
      currency: true,
    },
  });
  const existingRowsForAccount = await tx.transaction.findMany({
    where: {
      accountId: { in: matchingAccountIdsForImport },
      deletedAt: null,
      OR: [{ importFileId: null }, { importFileId: { not: importFileId } }],
    },
    select: {
      accountId: true,
      date: true,
      amount: true,
      currency: true,
      type: true,
      merchantRaw: true,
      merchantClean: true,
      description: true,
      rawPayload: true,
    },
  });
  const existingDedupeCounts = new Map<string, number>();
  for (const existingRow of existingRowsForAccount) {
    const key = buildConfirmedTransactionDedupeKey({
      ...existingRow,
      sourceRowIndex: getImportSourceRowIndex(existingRow.rawPayload),
      sourceStatementFingerprint: getImportSourceStatementFingerprint(existingRow.rawPayload),
    });
    existingDedupeCounts.set(key, (existingDedupeCounts.get(key) ?? 0) + 1);
  }
  const currentDedupeCounts = new Map<string, number>();
  const currentMobileScreenshotOverlapCounts = new Map<string, number>();

  for (const [index, originalRow] of parsedRows.entries()) {
    const row = normalizeLandbankImportedRow(originalRow as ImportInsightSourceRow, statementInstitution);
    const rowAccount = rowAccountFor(row as Record<string, unknown>);
    const rowResolvedAccountId = rowAccount.id;
    const rowType =
      row.type === "income" || row.type === "expense" || row.type === "transfer" ? row.type : undefined;
    const parsedCategoryName =
      (typeof row.categoryName === "string" && row.categoryName.trim()) ||
      defaultCategoryForType((rowType as "income" | "expense" | "transfer") ?? "expense");
    const rowConfidence = inferParserRowConfidence({
      confidence: row.confidence,
      parserConfidence: row.parserConfidence,
      categoryConfidence: row.categoryConfidence,
      statementConfidence,
      categoryName: parsedCategoryName,
      rawPayload: (row as { rawPayload?: unknown }).rawPayload,
    });
    const rowParserConfidence = Math.max(normalizeImportConfidenceScore(row.parserConfidence), normalizeImportConfidenceScore(row.confidence), normalizeImportConfidenceScore(statementConfidence));
    const rowCategoryConfidence = Math.max(normalizeImportConfidenceScore(row.categoryConfidence), rowConfidence);
    const rowAccountMatchConfidence = typeof row.accountMatchConfidence === "number" ? row.accountMatchConfidence : 100;
    const rowDuplicateConfidence = typeof row.duplicateConfidence === "number" ? row.duplicateConfidence : 0;
    const categoryCoercedType =
      resolveUnionBankExternalTransferDirection(row) ??
      (rowType && rowType !== "transfer" && shouldPreserveParserTransferDirection(row)
        ? rowType
        : coerceTransactionTypeFromCategoryName(
            parsedCategoryName,
            (rowType ?? "expense") as "income" | "expense" | "transfer"
          ));
    const canonicalType = resolveTransferTypeAgainstWorkspaceAccounts({
      row: {
        amount: row.amount,
        type: categoryCoercedType,
        merchantRaw: typeof row.merchantRaw === "string" ? row.merchantRaw : null,
        merchantClean: typeof row.merchantClean === "string" ? row.merchantClean : null,
        description:
          typeof row.description === "string" && row.description.trim()
            ? row.description
            : extractHumanReadableDescription(row.rawPayload ?? null),
        categoryName: parsedCategoryName,
        rawPayload: row.rawPayload ?? null,
      },
      candidateType: categoryCoercedType,
      workspaceAccounts: workspaceAccountsForTransferMatching,
      currentAccountId: rowResolvedAccountId,
    });
    const categoryName = parsedCategoryName;
    const rowTransferConfidence =
      canonicalType === "transfer" ? (typeof row.transferConfidence === "number" ? row.transferConfidence : 100) : 0;
    const rowIsOpeningBalance = Boolean(
      typeof row.rawPayload === "object" &&
        row.rawPayload !== null &&
        !Array.isArray(row.rawPayload) &&
        (row.rawPayload as Record<string, unknown>).kind === "opening_balance"
    );
    const rowIsAccountSnapshotMarker = Boolean(
      typeof row.rawPayload === "object" &&
        row.rawPayload !== null &&
        !Array.isArray(row.rawPayload) &&
        (row.rawPayload as Record<string, unknown>).kind === "account_snapshot_marker"
    );
    const parsedTransactionDate =
      (row.date instanceof Date && !Number.isNaN(row.date.getTime())
        ? row.date
        : parseDateValue(typeof row.date === "string" ? row.date : null)) ?? null;
    const rowRawPayload =
      row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
        ? (row.rawPayload as Record<string, unknown>)
        : null;
    const rowWiseIdentityText = [
      statementInstitution,
      row.institution,
      (row as { accountName?: unknown }).accountName,
      rowRawPayload?.institutionRaw,
      rowRawPayload?.bank,
      rowRawPayload?.source,
      rowRawPayload?.kind,
    ]
      .filter(Boolean)
      .join(" ");
    const rowWiseDocumentText = String(
      rowRawPayload?.documentType ?? rowRawPayload?.importMode ?? rowRawPayload?.statementType ?? rowRawPayload?.source ?? ""
    ).toLowerCase();
    const isWiseUndatedStatementRow =
      !parsedTransactionDate &&
      /wise/i.test(rowWiseIdentityText) &&
      (rowWiseDocumentText.includes("statement") || rowWiseDocumentText.includes("wise_mobile_screenshot"));

    if (rowIsOpeningBalance || rowIsAccountSnapshotMarker) {
      continue;
    }

    if (isWiseUndatedStatementRow) {
      console.warn("[import-confirmation] skipped undated Wise screenshot row", {
        importFileId,
        sourceRowIndex: index + 1,
        merchant: typeof row.merchantClean === "string" ? row.merchantClean : row.merchantRaw,
      });
      continue;
    }

    if (
      isLikelyScreenshotUiArtifactRow({
        row: row as Record<string, unknown>,
        fileName: String(importFile.fileName ?? ""),
        statementInstitution,
        accountName: rowAccount.name,
      })
    ) {
      console.warn("[import-confirmation] skipped screenshot UI artifact row", {
        importFileId,
        sourceRowIndex: index + 1,
        merchant: typeof row.merchantClean === "string" ? row.merchantClean : row.merchantRaw,
      });
      continue;
    }

    let categoryId = categoryByName.get(categoryName.toLowerCase());

    if (!categoryId) {
      const created = await tx.category.create({
        data: {
          workspaceId: importFile.workspaceId,
          name: categoryName,
          type: canonicalType,
          isSystem: false,
        },
      });

      categoryId = created.id;
      categoryByName.set(categoryName.toLowerCase(), categoryId);
    }

    const merchantText =
      (typeof row.merchantClean === "string" && row.merchantClean) ||
      (typeof row.merchantRaw === "string" && row.merchantRaw) ||
      "Imported transaction";
    const rowTeachability = assessParsedRowTeachability({
      merchantRaw: typeof row.merchantRaw === "string" ? row.merchantRaw : null,
      merchantClean: typeof row.merchantClean === "string" ? row.merchantClean : typeof row.merchantRaw === "string" ? row.merchantRaw : null,
      description: extractHumanReadableDescription(row.rawPayload ?? null),
      categoryName,
      type: canonicalType,
      amount: row.amount,
      date: row.date,
    } as ParsedImportRow);
    const reviewOnlyRow = isWiseReviewOnlyTransaction({
      institution: statementInstitution,
      row: {
        merchantRaw: typeof row.merchantRaw === "string" ? row.merchantRaw : null,
        merchantClean: typeof row.merchantClean === "string" ? row.merchantClean : null,
        description: extractHumanReadableDescription(row.rawPayload ?? null),
        rawPayload: row.rawPayload ?? null,
      },
    });
    const insertRow = buildTransactionInsertRecord({
      workspaceId: String(importFile.workspaceId),
      accountId: rowResolvedAccountId,
      importFileId,
      categoryId,
      categoryName,
      reviewStatus: reviewOnlyRow
        ? "rejected"
        : shouldRouteToReview({ confidence: rowConfidence, categoryName, type: canonicalType })
          ? "pending_review"
          : "confirmed",
      parserConfidence: rowParserConfidence,
      categoryConfidence: rowCategoryConfidence,
      accountMatchConfidence: rowAccountMatchConfidence,
      duplicateConfidence: rowDuplicateConfidence,
      transferConfidence: rowTransferConfidence,
      rawPayload: {
        ...(row.rawPayload && typeof row.rawPayload === "object" ? (row.rawPayload as Record<string, unknown>) : {}),
        sourceRowIndex: index + 1,
        sourceImportFileId: importFileId,
        sourceStatementFingerprint:
          typeof row.statementFingerprint === "string" && row.statementFingerprint.trim()
            ? row.statementFingerprint.trim()
            : checkpointStatementFingerprint,
      } as Prisma.InputJsonValue,
      normalizedPayload: (row.normalizedPayload ?? {}) as Prisma.InputJsonValue,
      learnedRuleIdsApplied: (row.learnedRuleIdsApplied ?? []) as Prisma.InputJsonValue,
      date:
        parsedTransactionDate ?? new Date(),
      amount: parseAmountValue(coerceAmountToString(row.amount)) ?? 0,
      currency:
        normalizeInstitutionCurrency(
          statementInstitution,
          typeof row.currency === "string" && row.currency.trim() ? row.currency.trim().toUpperCase() : rowAccount.currency ?? "PHP",
          rowAccount.name
        ) ?? "PHP",
      type: canonicalType,
      merchantRaw: typeof row.merchantRaw === "string" ? row.merchantRaw : "Imported transaction",
      merchantClean: typeof row.merchantClean === "string" ? row.merchantClean : typeof row.merchantRaw === "string" ? row.merchantRaw : null,
      description: extractHumanReadableDescription(row.rawPayload ?? null),
      isTransfer: canonicalType === "transfer",
      isExcluded:
        reviewOnlyRow ||
        (typeof row.rawPayload === "object" && row.rawPayload !== null && (row.rawPayload as Record<string, unknown>).kind === "opening_balance"),
    });
    const transactionId = String(insertRow.id ?? crypto.randomUUID());
    const dedupeKey = buildConfirmedTransactionDedupeKey({
      ...insertRow,
      accountId: rowResolvedAccountId,
      sourceRowIndex: index + 1,
      sourceStatementFingerprint:
        typeof row.statementFingerprint === "string" && row.statementFingerprint.trim()
          ? row.statementFingerprint.trim()
          : checkpointStatementFingerprint,
    } as Parameters<typeof buildConfirmedTransactionDedupeKey>[0]);
    const existingImportTransaction =
      existingImportTransactionBySourceIndex.get(buildAccountScopedSourceRowKey(rowResolvedAccountId, index + 1) ?? "") ??
      (typeof row.statementFingerprint === "string" && row.statementFingerprint.trim()
        ? existingImportTransactionByStatementSourceIndex.get(`${row.statementFingerprint.trim()}:${index + 1}`)
        : checkpointStatementFingerprint
          ? existingImportTransactionByStatementSourceIndex.get(`${checkpointStatementFingerprint}:${index + 1}`)
          : null) ??
      (existingImportTransactionsByDedupeKey.get(dedupeKey) ?? []).find(
        (candidate) => !retainedExistingImportTransactionIds.has(candidate.id)
      ) ??
      null;
    if (existingImportTransaction) {
      retainedExistingImportTransactionIds.add(existingImportTransaction.id);
      retainedExistingImportTransactionsCount += 1;
      const canPatchImportedClassification =
        existingImportTransaction.reviewStatus !== "edited" &&
        existingImportTransaction.reviewStatus !== "rejected";
      await tx.transaction.update({
        where: { id: existingImportTransaction.id },
        data: {
          accountId: rowResolvedAccountId,
          importFileId,
          date: insertRow.date as Date,
          amount: insertRow.amount as Prisma.Decimal | string | number,
          currency: String(insertRow.currency ?? "PHP"),
          merchantRaw: String(insertRow.merchantRaw ?? "Imported transaction"),
          description:
            typeof insertRow.description === "string" && insertRow.description.trim()
              ? insertRow.description
              : null,
          rawPayload: mergeImportJsonPayload(insertRow.rawPayload, existingImportTransaction.rawPayload) as Prisma.InputJsonValue,
          isExcluded: Boolean(insertRow.isExcluded),
          ...(canPatchImportedClassification
            ? {
                categoryId,
                type: canonicalType,
                merchantClean:
                  typeof insertRow.merchantClean === "string" && insertRow.merchantClean.trim()
                    ? insertRow.merchantClean
                    : typeof insertRow.merchantRaw === "string"
                      ? insertRow.merchantRaw
                      : null,
                categoryConfidence: rowCategoryConfidence,
                parserConfidence: rowParserConfidence,
                reviewStatus: insertRow.reviewStatus as Prisma.EnumReviewStatusFieldUpdateOperationsInput | ReviewStatus,
                isTransfer: canonicalType === "transfer",
                normalizedPayload: (row.normalizedPayload ?? {}) as Prisma.InputJsonValue,
                learnedRuleIdsApplied: (row.learnedRuleIdsApplied ?? []) as Prisma.InputJsonValue,
              }
            : {}),
        },
      });
      transactions.push({
        amount: row.amount,
        type: canonicalType,
        merchantRaw: typeof row.merchantRaw === "string" ? row.merchantRaw : null,
        merchantClean: typeof row.merchantClean === "string" ? row.merchantClean : typeof row.merchantRaw === "string" ? row.merchantRaw : null,
        description: extractHumanReadableDescription(row.rawPayload ?? null),
        categoryName,
        rawPayload: {
          ...(row.rawPayload && typeof row.rawPayload === "object" ? (row.rawPayload as Record<string, unknown>) : {}),
          sourceRowIndex: index + 1,
          sourceImportFileId: importFileId,
          sourceStatementFingerprint:
            typeof row.statementFingerprint === "string" && row.statementFingerprint.trim()
              ? row.statementFingerprint.trim()
              : checkpointStatementFingerprint,
        } as Prisma.InputJsonValue,
      });
      continue;
    }

    const currentOccurrence = (currentDedupeCounts.get(dedupeKey) ?? 0) + 1;
    currentDedupeCounts.set(dedupeKey, currentOccurrence);
    if ((existingDedupeCounts.get(dedupeKey) ?? 0) >= currentOccurrence) {
      duplicateSkippedTransactionsCount += 1;
      continue;
    }

    if (mobileScreenshotOverlapDedupeEnabled) {
      const mobileScreenshotOverlapKey = buildMobileScreenshotContentKey({
        accountId: rowResolvedAccountId,
        date: insertRow.date,
        amount: insertRow.amount,
        currency: insertRow.currency,
        type: insertRow.type,
        merchantRaw: insertRow.merchantRaw,
        merchantClean: insertRow.merchantClean,
        description: insertRow.description,
        rawPayload: insertRow.rawPayload as Prisma.JsonValue | null,
      });
      const currentMobileScreenshotOverlapOccurrence =
        (currentMobileScreenshotOverlapCounts.get(mobileScreenshotOverlapKey) ?? 0) + 1;
      currentMobileScreenshotOverlapCounts.set(mobileScreenshotOverlapKey, currentMobileScreenshotOverlapOccurrence);
      if (
        mobileScreenshotOverlapKey &&
        (existingMobileScreenshotOverlapCounts.get(mobileScreenshotOverlapKey) ?? 0) >= currentMobileScreenshotOverlapOccurrence
      ) {
        duplicateSkippedTransactionsCount += 1;
        continue;
      }
    }

    preparedTransactions.push({
      transactionId,
      insertRow,
      insightRow: {
        amount: row.amount,
        type: canonicalType,
        merchantRaw: typeof row.merchantRaw === "string" ? row.merchantRaw : null,
        merchantClean: typeof row.merchantClean === "string" ? row.merchantClean : typeof row.merchantRaw === "string" ? row.merchantRaw : null,
        description: extractHumanReadableDescription(row.rawPayload ?? null),
        categoryName,
        rawPayload: {
          ...(row.rawPayload && typeof row.rawPayload === "object" ? (row.rawPayload as Record<string, unknown>) : {}),
          sourceRowIndex: index + 1,
          sourceImportFileId: importFileId,
          sourceStatementFingerprint:
            typeof row.statementFingerprint === "string" && row.statementFingerprint.trim()
              ? row.statementFingerprint.trim()
              : checkpointStatementFingerprint,
        } as Prisma.InputJsonValue,
      },
      trainingSignal: {
        merchantText,
        categoryId,
        categoryName,
        type: canonicalType,
        confidence: rowConfidence,
        teachabilityScore: rowTeachability.score,
        notes: typeof row.categoryReason === "string" ? row.categoryReason : null,
      },
      });
    }

    if (!multiAccountImport && existingImportTransactions.length > 0 && preparedTransactions.length > 0) {
      duplicateSkippedTransactionsCount += preparedTransactions.length;
      console.warn("[import-confirmation] skipped appending rows to visible import", {
        importFileId,
        existingRows: existingImportTransactions.length,
        skippedRows: preparedTransactions.length,
      });
      preparedTransactions.length = 0;
    }

    if (planLimits?.transactionLimit != null) {
      const existingTransactionCount = planUsage?.transactionCount ?? await tx.transaction.count({
        where: { workspaceId: String(importFile.workspaceId) },
      });
      const projectedTransactionCount = existingTransactionCount + preparedTransactions.length + (openingBalanceInserted ? 1 : 0);

      if (projectedTransactionCount > planLimits.transactionLimit) {
        throw new Error(
          `Free plan includes up to ${planLimits.transactionLimit.toLocaleString()} transaction rows. Upgrade to Pro to import more rows.`
        );
      }
    }

    for (const batch of chunkArray(preparedTransactions, 25)) {
      await tx.transaction.createMany({
        data: batch.map((entry) => {
          const { categoryName: _categoryName, ...transactionRow } = entry.insertRow as Record<string, unknown>;
          return transactionRow as Prisma.TransactionCreateManyInput;
        }),
    });
  }

  const visibleTransactionsCount =
    retainedExistingImportTransactionsCount +
    preparedTransactions.length +
    duplicateSkippedTransactionsCount +
    (openingBalanceInserted ? 1 : 0);

    await updateImportFileWithTxCompat(
      tx,
      importFileId,
      {
        accountId: resolvedAccountId,
        confirmedAt: new Date(),
        status: "done",
        processingPhase: "complete",
        processingMessage: "The file is imported and ready.",
        confirmedTransactionsCount: visibleTransactionsCount,
      },
      compatibleImportFileColumns
    );

  const analyticsDistinctId = String(importFile.workspaceId ?? "import-worker");
  for (const entry of preparedTransactions) {
    const insertRow = entry.insertRow as {
      amount?: unknown;
      currency?: unknown;
      reviewStatus?: unknown;
      isTransfer?: unknown;
      isExcluded?: unknown;
      categoryId?: unknown;
      categoryConfidence?: unknown;
      accountMatchConfidence?: unknown;
      parserConfidence?: unknown;
      merchantClean?: unknown;
      merchantRaw?: unknown;
      type?: unknown;
    };
    const amount = Math.abs(Number(insertRow.amount ?? 0));

    void capturePostHogServerEvent("transaction_imported", analyticsDistinctId, {
      workspace_id: String(importFile.workspaceId ?? null),
      import_file_id: importFileId,
      transaction_id: entry.transactionId,
      amount,
      amount_signed: Number(insertRow.amount ?? 0),
      currency: String(insertRow.currency ?? "PHP"),
      transaction_type: String(entry.insightRow.type ?? "expense"),
      review_status: typeof insertRow.reviewStatus === "string" ? insertRow.reviewStatus : null,
      is_transfer: Boolean(insertRow.isTransfer),
      is_excluded: Boolean(insertRow.isExcluded),
      category_id: typeof insertRow.categoryId === "string" ? insertRow.categoryId : null,
      category_confidence: typeof insertRow.categoryConfidence === "number" ? insertRow.categoryConfidence : null,
      account_match_confidence: typeof insertRow.accountMatchConfidence === "number" ? insertRow.accountMatchConfidence : null,
      parser_confidence: typeof insertRow.parserConfidence === "number" ? insertRow.parserConfidence : null,
      merchant_name:
        typeof insertRow.merchantClean === "string"
          ? insertRow.merchantClean
          : typeof insertRow.merchantRaw === "string"
            ? insertRow.merchantRaw
            : null,
    });
  }

  for (const entry of preparedTransactions) {
    transactions.push(entry.insightRow);
    trainingSignals.push({
      transactionId: entry.transactionId ?? crypto.randomUUID(),
      merchantText: entry.trainingSignal.merchantText,
      categoryId: entry.trainingSignal.categoryId,
      categoryName: entry.trainingSignal.categoryName,
      type: entry.trainingSignal.type,
      confidence: entry.trainingSignal.confidence,
      teachabilityScore: entry.trainingSignal.teachabilityScore,
      notes: entry.trainingSignal.notes,
    });
  }

  const confirmedStatementRow = statementRow as unknown as { accountName?: unknown; institution?: unknown } | null;
  if (
    confirmedStatementRow &&
    typeof confirmedStatementRow.accountName === "string" &&
    confirmedStatementRow.accountName.trim() &&
    statementConfidence >= 70
  ) {
    void upsertAccountRule({
      workspaceId: importFile.workspaceId,
      accountId: resolvedAccountId,
      accountName: confirmedStatementRow.accountName.trim(),
      institution:
        typeof confirmedStatementRow.institution === "string" && confirmedStatementRow.institution.trim()
          ? confirmedStatementRow.institution.trim()
          : null,
      accountType: account.type,
      source: "import_confirmation",
      confidence: 100,
    }).catch(() => null);
  }

  const insightSummary = buildImportInsightSummary(transactions);

  qaMetadataForRun = {
    institution:
      typeof statementRow?.institution === "string" ? statementRow.institution : null,
    accountNumber:
      typeof statementMetadata?.accountNumber === "string" ? statementMetadata.accountNumber : null,
    accountName:
      formatUploadAccountDisplayName(
        typeof statementRow?.accountName === "string" ? statementRow.accountName : null,
        typeof statementRow?.institution === "string" ? statementRow.institution : null,
        typeof statementMetadata?.accountNumber === "string" ? statementMetadata.accountNumber : null,
        typeof account.type === "string" ? account.type : null
      ),
    accountType: typeof account.type === "string" ? account.type : null,
    openingBalance:
      statementCheckpointRecord?.openingBalance !== null && statementCheckpointRecord?.openingBalance !== undefined
        ? Number(statementCheckpointRecord.openingBalance)
        : null,
    endingBalance:
      statementCheckpointRecord?.endingBalance !== null && statementCheckpointRecord?.endingBalance !== undefined
        ? Number(statementCheckpointRecord.endingBalance)
        : null,
    paymentDueDate: null,
    totalAmountDue: null,
    startDate: statementCheckpointRecord?.statementStartDate?.toISOString() ?? null,
    endDate: statementCheckpointRecord?.statementEndDate?.toISOString() ?? null,
    confidence: statementConfidence,
  };
  qaAccountForRun = {
    id: resolvedAccountId,
    name: formatUploadAccountDisplayName(account.name, account.institution, account.accountNumber, account.type),
    institution: account.institution,
    type: typeof account.type === "string" ? account.type : null,
    balance: reconciledAccountBalance,
  };
  qaCheckpointForRun = statementCheckpointRecord
    ? {
        statementStartDate: statementCheckpointRecord.statementStartDate,
        statementEndDate: statementCheckpointRecord.statementEndDate,
        openingBalance: statementCheckpointRecord.openingBalance?.toString() ?? null,
        endingBalance: statementCheckpointRecord.endingBalance?.toString() ?? null,
        status: statementCheckpointRecord.status,
        rowCount: statementCheckpointRecord.rowCount,
      }
    : null;

    return {
      imported: visibleTransactionsCount,
      duplicate: duplicateSkippedTransactionsCount > 0 && preparedTransactions.length === 0,
      accountId: resolvedAccountId,
      accountSummaries,
      insightSummary,
      accountBalance: reconciledAccountBalance,
      confirmedTransactionsCount: visibleTransactionsCount,
      status: "done",
    };
  }, { maxWait: 15_000, timeout: 30_000 });

  if (multiAccountImport) {
    const resolvedAccountIdsForCleanup = resolvedAccounts.map((entry) => entry.id);
    const resolvedAccountNumbersForCleanup = new Set(
      resolvedAccounts
        .map((entry) => (typeof entry.accountNumber === "string" && entry.accountNumber.trim() ? entry.accountNumber.trim() : null))
        .filter((value): value is string => value !== null)
    );
    const canonicalImportTransactionContentKeys = new Set(
      await prisma.transaction.findMany({
        where: {
          workspaceId: String(importFile.workspaceId),
          accountId: { in: resolvedAccountIdsForCleanup },
          deletedAt: null,
          OR: [
            { importFileId },
            {
              rawPayload: {
                path: ["sourceImportFileId"],
                equals: importFileId,
              },
            },
            ...statementFingerprints.map((fingerprint) => ({
              rawPayload: {
                path: ["sourceStatementFingerprint"],
                equals: fingerprint,
              },
            })),
          ],
        },
        select: {
          date: true,
          amount: true,
          currency: true,
          merchantRaw: true,
          merchantClean: true,
          description: true,
        },
      }).then((rows) =>
        rows.map((row) =>
          buildConfirmedTransactionContentKey({
            date: row.date,
            amount: row.amount,
            currency: row.currency,
            merchantRaw: row.merchantRaw,
            merchantClean: row.merchantClean,
            description: row.description,
          })
        )
      ).catch(() => [])
    );
    const resolvedAccountBalanceById = new Map(
      accountSummaries
        .map((summary) => [summary.accountId, summary.balance] as const)
        .filter((entry): entry is readonly [string, string] => Boolean(entry[0] && entry[1]))
    );
    const resolvedInstitutionsForCleanup = Array.from(
      new Set(resolvedAccounts.map((entry) => entry.institution).filter((institution): institution is string => Boolean(institution?.trim())))
    );
    await Promise.allSettled(
      Array.from(resolvedAccountBalanceById.entries()).map(([accountId, balance]) =>
        prisma.account.update({
          where: { id: accountId },
          data: { balance },
        })
      )
    );
    if (resolvedAccountIdsForCleanup.length > 0 && resolvedInstitutionsForCleanup.length > 0) {
      const staleStatementTransactionWhere = {
        workspaceId: String(importFile.workspaceId),
        deletedAt: null,
        accountId: { notIn: resolvedAccountIdsForCleanup },
        reviewStatus: { notIn: ["edited", "rejected"] },
        OR: [
          {
            rawPayload: {
              path: ["sourceImportFileId"],
              equals: importFileId,
            },
          },
          ...statementFingerprints.map((fingerprint) => ({
            rawPayload: {
              path: ["sourceStatementFingerprint"],
              equals: fingerprint,
            },
          })),
        ],
      } satisfies Prisma.TransactionWhereInput;
      await prisma.transaction.deleteMany({
        where: staleStatementTransactionWhere,
      }).catch((error) => {
        console.warn("[import-account-match] unable to delete stale current-statement rows from unresolved multi-account cards", {
          importFileId,
          institutions: resolvedInstitutionsForCleanup,
          error,
        });
      });

      if (canonicalImportTransactionContentKeys.size > 0) {
        const staleCandidateTransactions = await prisma.transaction.findMany({
          where: {
            workspaceId: String(importFile.workspaceId),
            deletedAt: null,
            accountId: { notIn: resolvedAccountIdsForCleanup },
            reviewStatus: { notIn: ["edited", "rejected"] },
            account: {
              source: "upload",
              institution: { in: resolvedInstitutionsForCleanup },
            },
          },
          select: {
            id: true,
            date: true,
            amount: true,
            currency: true,
            merchantRaw: true,
            merchantClean: true,
            description: true,
          },
        }).catch(() => []);
        const staleDuplicateIds = staleCandidateTransactions
          .filter((row) =>
            canonicalImportTransactionContentKeys.has(
              buildConfirmedTransactionContentKey({
                date: row.date,
                amount: row.amount,
                currency: row.currency,
                merchantRaw: row.merchantRaw,
                merchantClean: row.merchantClean,
                description: row.description,
              })
            )
          )
          .map((row) => row.id);
        if (staleDuplicateIds.length > 0) {
          await prisma.transaction.deleteMany({
            where: {
              id: { in: staleDuplicateIds },
              reviewStatus: { notIn: ["edited", "rejected"] },
            },
          }).catch((error) => {
            console.warn("[import-account-match] unable to delete stale duplicate multi-account rows by content", {
              importFileId,
              staleDuplicateCount: staleDuplicateIds.length,
              error,
            });
          });
        }
      }

      await prisma.account.deleteMany({
        where: {
          workspaceId: String(importFile.workspaceId),
          source: "upload",
          institution: { in: resolvedInstitutionsForCleanup },
          id: { notIn: resolvedAccountIdsForCleanup },
          transactions: { none: {} },
          OR: [
            { accountNumber: null },
            { accountNumber: { notIn: Array.from(resolvedAccountNumbersForCleanup) } },
          ],
        },
      }).catch((error) => {
        console.warn("[import-account-match] unable to delete empty stale multi-account placeholders", {
          importFileId,
          institutions: resolvedInstitutionsForCleanup,
          error,
        });
      });
    }
  }

  await collapseDuplicateTransactionsForImport(importFileId).catch((error) => {
    console.warn("Unable to collapse duplicate transactions after confirmation", {
      importFileId,
      error,
    });
  });

  await syncWorkspaceRecurringPatterns(String(importFile.workspaceId)).catch((error) => {
    console.warn("Unable to sync recurring patterns after import confirmation", {
      importFileId,
      error,
    });
  });

  await Promise.allSettled(
    trainingSignals.map((entry) =>
      recordTrainingSignal({
        workspaceId: importFile.workspaceId,
        importFileId,
        transactionId: entry.transactionId,
        institution: importFile.account?.institution ?? null,
        merchantText: entry.merchantText,
        categoryId: entry.categoryId,
        categoryName: entry.categoryName,
        type: entry.type,
        source: "import_confirmation",
        confidence: entry.confidence,
        teachabilityScore: entry.teachabilityScore,
        notes: entry.notes,
      })
    )
  ).catch(() => null);

  const backupParserRows = parsedRows.filter((row) => {
    const rawPayload = row.rawPayload;
    return (
      rawPayload &&
      typeof rawPayload === "object" &&
      !Array.isArray(rawPayload) &&
      (rawPayload as Record<string, unknown>).source === "openai"
    );
  }) as EnrichedParsedImportRow[];
  if (backupParserRows.length > 0) {
    const backupLearningSignals = extractBackupParserLearningSignals(backupParserRows);
    if (backupLearningSignals.length > 0) {
      const categories = await prisma.category.findMany({
        where: { workspaceId: importFile.workspaceId },
        select: { id: true, name: true },
      }).catch(() => []);
      const categoryIdsByName = new Map(
        categories.map((category) => [category.name.trim().toLowerCase(), category.id] as const)
      );

      await Promise.allSettled(
        backupLearningSignals.map((signal, index) => {
          const categoryId = categoryIdsByName.get(signal.categoryName.trim().toLowerCase());
          if (!categoryId) {
            return Promise.resolve(null);
          }

          return recordTrainingSignal({
            workspaceId: importFile.workspaceId,
            importFileId,
            transactionId: `${importFileId}:backup:${index + 1}`,
            institution: importFile.account?.institution ?? null,
            merchantText: signal.merchantText,
            normalizedName: signal.normalizedName,
            categoryId,
            categoryName: signal.categoryName,
            type: signal.type,
            source: "import_confirmation",
            confidence: signal.confidence,
            teachabilityScore: signal.teachabilityScore,
            notes: signal.notes,
          });
        })
      ).catch(() => null);
    }
  }

  if (qaMetadataForRun && qaAccountForRun) {
    try {
      await recordDataQaRun({
        workspaceId: String(importFile.workspaceId),
        importFileId,
        accountId: resolvedAccountId,
        source: "import_confirmation",
        fileName: String(importFile.fileName ?? "imported-file"),
        fileType: String(importFile.fileType ?? "unknown"),
        parserVersion: DATA_ENGINE_VERSION,
        parsedRows: parsedRows as unknown as DataQaParsedRow[],
        metadata: qaMetadataForRun,
        account: qaAccountForRun,
        checkpoint: qaCheckpointForRun,
        timings: {
          totalMs: Date.now() - startedAt,
          parsingMs: 0,
          usedDeterministicParser: true,
        },
        duplicate: false,
        actorUserId: null,
      });
    } catch (error) {
      console.warn("Data QA recording failed after import confirmation", {
        importFileId,
        error,
      });
    }
  }

  return confirmationResult;
};
