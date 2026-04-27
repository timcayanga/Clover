import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DATA_ENGINE_VERSION } from "@/lib/data-engine";
import { parseDateValue } from "@/lib/import-parser";

export type DataQaSource = "import_processing" | "import_confirmation" | "local_training" | "replay" | "manual";

export type DataQaSeverity = "info" | "warning" | "critical";

export type DataQaTiming = {
  totalMs?: number;
  extractionMs?: number;
  parsingMs?: number;
  enrichmentMs?: number;
  persistenceMs?: number;
  pageCount?: number;
  usedVisionFallback?: boolean;
  usedOpenAiFallback?: boolean;
  usedDeterministicParser?: boolean;
};

export type DataQaStatementSnapshot = {
  institution?: string | null;
  accountNumber?: string | null;
  accountName?: string | null;
  accountType?: string | null;
  openingBalance?: number | null;
  endingBalance?: number | null;
  paymentDueDate?: string | null;
  totalAmountDue?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  confidence?: number | null;
};

export type DataQaParsedRow = {
  date?: string | Date | null;
  amount?: string | number | null;
  merchantRaw?: string | null;
  merchantClean?: string | null;
  description?: string | null;
  categoryName?: string | null;
  type?: string | null;
  confidence?: number | null;
  parserConfidence?: number | null;
  categoryConfidence?: number | null;
  accountMatchConfidence?: number | null;
  duplicateConfidence?: number | null;
  transferConfidence?: number | null;
  rawPayload?: Prisma.JsonValue | null;
};

export type DataQaAccountSnapshot = {
  id?: string | null;
  name?: string | null;
  institution?: string | null;
  type?: string | null;
  balance?: string | number | null;
};

export type DataQaCheckpointSnapshot = {
  statementStartDate?: string | Date | null;
  statementEndDate?: string | Date | null;
  openingBalance?: string | number | null;
  endingBalance?: string | number | null;
  status?: string | null;
  rowCount?: number | null;
};

export type DataQaRunInput = {
  workspaceId: string;
  importFileId?: string | null;
  accountId?: string | null;
  source: DataQaSource;
  fileName: string;
  fileType: string;
  parserVersion?: string;
  parsedRows: DataQaParsedRow[];
  metadata: DataQaStatementSnapshot;
  account?: DataQaAccountSnapshot | null;
  checkpoint?: DataQaCheckpointSnapshot | null;
  timings?: DataQaTiming;
  duplicate?: boolean;
  duplicateReason?: string | null;
  actorUserId?: string | null;
};

const DATA_QA_CONFIG_KEYS = ["clover_output_spec", "qa_instructions"] as const;

const DEFAULT_DATA_QA_GUIDANCE = {
  clover_output_spec:
    "Accounts should show the account name, number, balance, type, and institution when known. Transactions should show date, merchant/description, amount, and category, with raw descriptions preserved for traceability. Prefer real Philippine bank statement layouts over synthetic examples and avoid inventing fields that do not exist in the source statement.",
  qa_instructions:
    "Review legitimate Statement of Accounts from real Philippine banks, with preference for popular banks like BPI, BDO, Metrobank, RCBC, UnionBank, GCash, Maya, and Security Bank. Do not create synthetic statements. Re-parse older uploaded statements as safe sample files so the parser can learn from real layouts and improve confidence. Upload real files, review the parsed output against the source file, mark the field correct when it matches, add notes when it should improve, and rerun QA after parser or UI fixes.",
} as const;

type DataQaGuidanceSnapshot = {
  cloverOutputSpec: string;
  qaInstructions: string;
};

export type DataQaFindingInput = {
  code: string;
  severity: DataQaSeverity;
  field?: string | null;
  message: string;
  observedValue?: Prisma.JsonValue | null;
  expectedValue?: Prisma.JsonValue | null;
  suggestion?: string | null;
  confidence?: number | null;
  metadata?: Prisma.JsonValue | null;
  transactionId?: string | null;
};

export type DataQaEvaluation = {
  score: number;
  findings: DataQaFindingInput[];
  metrics: {
    rowCount: number;
    parseableDateCount: number;
    dateCoverage: number;
    merchantNormalizationCoverage: number;
    categoryFallbackRate: number;
    lowConfidenceRate: number;
    hasStatementIdentity: boolean;
    hasStatementBalances: boolean;
    uiAccountsReady: boolean;
    uiDrawerReady: boolean;
    uiTransactionsReady: boolean;
    msPerRow: number | null;
  };
  feedbackPayload: Prisma.JsonObject;
};

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const normalizeText = (value: unknown) => String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

const normalizeKey = (value: unknown) => normalizeText(value).toLowerCase();

const toNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const countParseableDates = (rows: DataQaParsedRow[]) =>
  rows.reduce((count, row) => (parseDateValue(typeof row.date === "string" ? row.date : row.date instanceof Date ? row.date.toISOString() : null) ? count + 1 : count), 0);

const countRowsWithValue = (rows: DataQaParsedRow[], predicate: (row: DataQaParsedRow) => boolean) =>
  rows.reduce((count, row) => (predicate(row) ? count + 1 : count), 0);

const summarizeFileSpeed = (params: { totalMs?: number; rowCount: number; fileType: string }) => {
  const totalMs = typeof params.totalMs === "number" && Number.isFinite(params.totalMs) ? Math.max(0, params.totalMs) : null;
  const msPerRow = totalMs !== null && params.rowCount > 0 ? totalMs / params.rowCount : null;
  const isPdf = params.fileType.toLowerCase().includes("pdf");
  const slowThreshold = isPdf ? 4500 : 1500;
  const rowThreshold = isPdf ? 120 : 35;
  const isSlow = totalMs !== null && (totalMs > slowThreshold || (msPerRow !== null && msPerRow > rowThreshold));

  return { totalMs, msPerRow, isSlow };
};

const loadDataQaGuidanceSnapshot = async (): Promise<DataQaGuidanceSnapshot> => {
  try {
    const configs = await prisma.dataQaConfig.findMany({
      where: {
        key: { in: [...DATA_QA_CONFIG_KEYS] },
      },
      select: {
        key: true,
        body: true,
      },
    });

    const byKey = new Map(configs.map((config) => [config.key, config.body] as const));

    return {
      cloverOutputSpec: byKey.get("clover_output_spec") ?? DEFAULT_DATA_QA_GUIDANCE.clover_output_spec,
      qaInstructions: byKey.get("qa_instructions") ?? DEFAULT_DATA_QA_GUIDANCE.qa_instructions,
    };
  } catch {
    return {
      cloverOutputSpec: DEFAULT_DATA_QA_GUIDANCE.clover_output_spec,
      qaInstructions: DEFAULT_DATA_QA_GUIDANCE.qa_instructions,
    };
  }
};

export const evaluateDataQaRun = (input: DataQaRunInput): DataQaEvaluation => {
  const rows = input.parsedRows ?? [];
  const rowCount = rows.length;
  const parseableDateCount = countParseableDates(rows);
  const dateCoverage = rowCount > 0 ? parseableDateCount / rowCount : 0;
  const merchantNormalizationCoverage = rowCount > 0
    ? countRowsWithValue(rows, (row) => normalizeKey(row.merchantClean).length > 0)
      / rowCount
    : 0;
  const categoryFallbackRate = rowCount > 0
    ? countRowsWithValue(rows, (row) => {
        const category = normalizeKey(row.categoryName);
        return !category || category === "other";
      }) / rowCount
    : 0;
  const lowConfidenceRate = rowCount > 0
    ? countRowsWithValue(rows, (row) => (typeof row.confidence === "number" ? row.confidence < 85 : true)) / rowCount
    : 0;

  const hasStatementIdentity = Boolean(
    normalizeText(input.metadata.institution) || normalizeText(input.metadata.accountNumber) || normalizeText(input.metadata.accountName)
  );
  const hasStatementBalances = Boolean(
    typeof input.metadata.openingBalance === "number" ||
      typeof input.metadata.endingBalance === "number" ||
      typeof input.metadata.totalAmountDue === "number" ||
      normalizeText(input.metadata.paymentDueDate)
  );

  const accountBalance = toNumber(input.account?.balance);
  const checkpointEndingBalance = toNumber(input.checkpoint?.endingBalance);
  const uiAccountsReady = hasStatementIdentity;
  const uiDrawerReady = Boolean(accountBalance !== null || checkpointEndingBalance !== null || hasStatementBalances);
  const uiTransactionsReady =
    rowCount > 0 &&
    dateCoverage >= 0.5 &&
    merchantNormalizationCoverage >= 0.5 &&
    lowConfidenceRate < 0.5;

  const speed = summarizeFileSpeed({
    totalMs: input.timings?.totalMs,
    rowCount,
    fileType: input.fileType,
  });

  const findings: DataQaFindingInput[] = [];

  if (rowCount === 0) {
    findings.push({
      code: "transactions.empty",
      severity: "critical",
      field: "parsedRows",
      message: "The parser returned no transactions for this file.",
      observedValue: { rowCount },
      expectedValue: { minRows: 1 },
      suggestion: "Check the statement detector, OCR extraction, and file-specific parser path before shipping this file type.",
      confidence: 100,
      metadata: {
        fileType: input.fileType,
        source: input.source,
      },
    });
  }

  if (!hasStatementIdentity) {
    findings.push({
      code: "statement.identity_missing",
      severity: "critical",
      field: "metadata",
      message: "The parser could not identify a stable account identity.",
      observedValue: {
        institution: input.metadata.institution ?? null,
        accountNumber: input.metadata.accountNumber ?? null,
        accountName: input.metadata.accountName ?? null,
      },
      expectedValue: {
        institution: "non-null when visible in the source",
        accountNumber: "non-null when visible in the source",
        accountName: "non-null when visible in the source",
      },
      suggestion: "Improve institution detection, account-number extraction, or statement template matching for this bank/file type.",
      confidence: 95,
      metadata: {
        fileName: input.fileName,
        fileType: input.fileType,
        source: input.source,
      },
    });
  }

  if ((input.metadata.confidence ?? 0) < 70) {
    findings.push({
      code: "statement.low_confidence",
      severity: "warning",
      field: "metadata.confidence",
      message: "Statement metadata confidence is low enough that the parser should be treated cautiously.",
      observedValue: { confidence: input.metadata.confidence ?? 0 },
      expectedValue: { confidence: 70 },
      suggestion: "Use a statement template, institution-specific rule, or OCR cleanup pass before trusting the extracted metadata.",
      confidence: 85,
      metadata: {
        source: input.source,
      },
    });
  }

  if (rowCount > 0 && dateCoverage < 0.5) {
    findings.push({
      code: "transactions.date_coverage_low",
      severity: rowCount >= 5 ? "critical" : "warning",
      field: "date",
      message: "Too many parsed rows are missing a usable date.",
      observedValue: { parseableDateCount, rowCount, dateCoverage },
      expectedValue: { minCoverage: 0.5 },
      suggestion: "Improve date tokenization, OCR spacing normalization, or file-specific row splitting.",
      confidence: 90,
      metadata: {
        fileType: input.fileType,
      },
    });
  }

  if (rowCount > 0 && merchantNormalizationCoverage < 0.75) {
    findings.push({
      code: "transactions.merchant_normalization_gap",
      severity: "warning",
      field: "merchantClean",
      message: "Many transactions are still using raw merchant text instead of a normalized merchant label.",
      observedValue: { merchantNormalizationCoverage },
      expectedValue: { minCoverage: 0.75 },
      suggestion: "Add or refine merchant-label simplifiers for repeated raw merchant patterns in this statement family.",
      confidence: 82,
      metadata: {
        fileName: input.fileName,
        fileType: input.fileType,
      },
    });
  }

  if (categoryFallbackRate > 0.35) {
    findings.push({
      code: "transactions.category_fallback_rate_high",
      severity: rowCount >= 5 ? "warning" : "info",
      field: "categoryName",
      message: "A large share of rows are falling back to generic categories.",
      observedValue: { categoryFallbackRate },
      expectedValue: { maxFallbackRate: 0.35 },
      suggestion: "Add a merchant rule, statement template rule, or category fallback for the repeated transaction patterns.",
      confidence: 80,
      metadata: {
        source: input.source,
      },
    });
  }

  if (lowConfidenceRate > 0.35) {
    findings.push({
      code: "transactions.low_confidence_rows",
      severity: rowCount >= 10 ? "warning" : "info",
      field: "confidence",
      message: "Too many rows were parsed at low confidence.",
      observedValue: { lowConfidenceRate },
      expectedValue: { maxLowConfidenceRate: 0.35 },
      suggestion: "Route more rows through deterministic parsing before AI fallback, or add statement-specific rules for this format.",
      confidence: 78,
      metadata: {
        source: input.source,
      },
    });
  }

  if (speed.isSlow && speed.totalMs !== null) {
    findings.push({
      code: "performance.slow_parse",
      severity: "warning",
      field: "timings.totalMs",
      message: "Parsing was slower than the current QA threshold.",
      observedValue: {
        totalMs: speed.totalMs,
        msPerRow: speed.msPerRow,
        rowCount,
      },
      expectedValue: {
        maxTotalMs: input.fileType.toLowerCase().includes("pdf") ? 4500 : 1500,
      },
      suggestion: input.fileType.toLowerCase().includes("pdf")
        ? "Skip unnecessary OCR passes, cache extracted text, and reserve AI fallback for statements that fail deterministic extraction."
        : "Check whether row splitting, normalization, or database writes are taking longer than expected.",
      confidence: 88,
      metadata: {
        usedVisionFallback: input.timings?.usedVisionFallback ?? false,
        usedOpenAiFallback: input.timings?.usedOpenAiFallback ?? false,
        usedDeterministicParser: input.timings?.usedDeterministicParser ?? false,
      },
    });
  }

  if (input.timings?.usedVisionFallback) {
    findings.push({
      code: "performance.vision_fallback_used",
      severity: "info",
      field: "timings.usedVisionFallback",
      message: "The parser needed a vision fallback for this file.",
      observedValue: {
        pageCount: input.timings.pageCount ?? null,
        usedOpenAiFallback: input.timings.usedOpenAiFallback ?? false,
      },
      expectedValue: {
        preferred: false,
      },
      suggestion: "Add a deterministic OCR cleanup path or a statement template so future files of this family can avoid image-based fallback.",
      confidence: 72,
      metadata: {
        source: input.source,
      },
    });
  }

  if (input.timings?.usedOpenAiFallback) {
    findings.push({
      code: "performance.openai_fallback_used",
      severity: "info",
      field: "timings.usedOpenAiFallback",
      message: "The parser routed through the OpenAI fallback path.",
      observedValue: {
        usedVisionFallback: input.timings.usedVisionFallback ?? false,
      },
      expectedValue: {
        preferred: false,
      },
      suggestion: "Keep improving the deterministic parser and statement templates so the AI fallback is only needed for edge cases.",
      confidence: 72,
      metadata: {
        source: input.source,
      },
    });
  }

  if (input.source === "import_confirmation") {
    if (!uiDrawerReady) {
      findings.push({
        code: "ui.account_drawer_not_ready",
        severity: "warning",
        field: "account.balance",
        message: "The account drawer does not yet have enough data to render a reliable running balance.",
        observedValue: {
          accountBalance,
          checkpointEndingBalance,
          hasStatementBalances,
        },
        expectedValue: {
          oneOf: ["account balance", "checkpoint ending balance", "statement balances"],
        },
        suggestion: "Persist the reconciled account balance and statement checkpoint data so the account drawer can render reliably.",
        confidence: 87,
        metadata: {
          accountId: input.accountId ?? null,
        },
      });
    }

    if (!uiTransactionsReady) {
      findings.push({
        code: "ui.transactions_not_renderable",
        severity: "warning",
        field: "transactions",
        message: "The transactions view may still render poorly because the parsed rows are not consistently shaped.",
        observedValue: {
          rowCount,
          dateCoverage,
          merchantNormalizationCoverage,
          lowConfidenceRate,
        },
        expectedValue: {
          rowCount: "greater than zero",
          dateCoverage: "at least 0.5",
          merchantNormalizationCoverage: "at least 0.5",
          lowConfidenceRate: "below 0.5",
        },
        suggestion: "Keep improving row extraction and merchant/category normalization before treating this file family as production-ready.",
        confidence: 84,
        metadata: {
          fileName: input.fileName,
          source: input.source,
        },
      });
    }
  }

  const penalty = findings.reduce((total, finding) => {
    if (finding.severity === "critical") {
      return total + 20;
    }

    if (finding.severity === "warning") {
      return total + 8;
    }

    return total + 2;
  }, 0);
  const score = clampScore(100 - penalty);
  const feedbackPayload: Prisma.JsonObject = {
    source: input.source,
    parserVersion: input.parserVersion ?? DATA_ENGINE_VERSION,
    fileName: input.fileName,
    fileType: input.fileType,
    duplicate: input.duplicate ?? false,
    duplicateReason: input.duplicateReason ?? null,
    metrics: {
      rowCount,
      parseableDateCount,
      dateCoverage,
      merchantNormalizationCoverage,
      categoryFallbackRate,
      lowConfidenceRate,
      hasStatementIdentity,
      hasStatementBalances,
      uiAccountsReady,
      uiDrawerReady,
      uiTransactionsReady,
      totalMs: speed.totalMs,
      msPerRow: speed.msPerRow,
    },
    findings: findings.map((finding) => ({
      code: finding.code,
      severity: finding.severity,
      field: finding.field ?? null,
      suggestion: finding.suggestion ?? null,
      confidence: finding.confidence ?? 0,
    })),
  };

  return {
    score,
    findings,
    metrics: {
      rowCount,
      parseableDateCount,
      dateCoverage,
      merchantNormalizationCoverage,
      categoryFallbackRate,
      lowConfidenceRate,
      hasStatementIdentity,
      hasStatementBalances,
      uiAccountsReady,
      uiDrawerReady,
      uiTransactionsReady,
      msPerRow: speed.msPerRow,
    },
    feedbackPayload,
  };
};

export const recordDataQaRun = async (input: DataQaRunInput) => {
  const evaluation = evaluateDataQaRun(input);
  const criticalCount = evaluation.findings.filter((finding) => finding.severity === "critical").length;
  const guidanceSnapshot = await loadDataQaGuidanceSnapshot();

  const run = await prisma.dataQaRun.create({
    data: {
      workspaceId: input.workspaceId,
      importFileId: input.importFileId ?? null,
      source: input.source,
      stage: input.source,
      status: "completed",
      parserVersion: input.parserVersion ?? DATA_ENGINE_VERSION,
      parserDurationMs: input.timings?.parsingMs ?? null,
      totalDurationMs: input.timings?.totalMs ?? null,
      score: evaluation.score,
      findingCount: evaluation.findings.length,
      criticalCount,
      feedbackPayload: {
        ...evaluation.feedbackPayload,
        guidance: guidanceSnapshot,
      },
    },
  });

  if (evaluation.findings.length > 0) {
    await prisma.dataQaFinding.createMany({
      data: evaluation.findings.map((finding) => ({
        workspaceId: input.workspaceId,
        dataQaRunId: run.id,
        importFileId: input.importFileId ?? null,
        transactionId: finding.transactionId ?? null,
        code: finding.code,
        severity: finding.severity,
        field: finding.field ?? null,
        message: finding.message,
        observedValue: finding.observedValue ?? Prisma.DbNull,
        expectedValue: finding.expectedValue ?? Prisma.DbNull,
        suggestion: finding.suggestion ?? null,
        confidence: finding.confidence ?? 0,
        metadata: finding.metadata ?? Prisma.DbNull,
      })),
    });
  }

  if (input.actorUserId) {
    await prisma.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        action: "data_qa.run_completed",
        entity: "DataQaRun",
        entityId: run.id,
        metadata: evaluation.feedbackPayload,
      },
    });
  }

  return {
    run,
    evaluation,
    criticalCount,
  };
};
