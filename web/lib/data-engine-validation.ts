import { parseDateValue, parseAmountValue, type DetectedStatementMetadata, type ParsedImportRow } from "@/lib/import-parser";

export type ImportValidationFinding = {
  code: string;
  severity: "warning" | "critical";
  field: string;
  message: string;
};

export type ImportValidationResult = {
  score: number;
  critical: boolean;
  findings: ImportValidationFinding[];
  metrics: {
    rowCount: number;
    dateCoverage: number;
    amountCoverage: number;
    typeCoverage: number;
    evidenceCoverage: number;
    outsidePeriodRate: number;
    unsafeRowRate: number;
  };
};

export const calibrateConfidenceScore = (params: {
  rawConfidence?: number | null;
  validationScore: number;
  hasEvidence: boolean;
  userConfirmed?: boolean;
}) => {
  if (params.userConfirmed) return 100;
  const raw = typeof params.rawConfidence === "number" && Number.isFinite(params.rawConfidence)
    ? clamp(params.rawConfidence)
    : 0;
  const evidencePenalty = params.hasEvidence ? 0 : 12;
  return clamp(Math.min(raw || params.validationScore, params.validationScore) - evidencePenalty);
};

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const rowHasEvidence = (row: ParsedImportRow) => {
  const payload = row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
    ? (row.rawPayload as Record<string, unknown>)
    : null;
  const evidence = payload?.parserEvidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return Boolean(text(row.merchantRaw) || text(row.description));
  }
  const record = evidence as Record<string, unknown>;
  return Boolean(text(record.source_text ?? record.sourceText) || typeof record.page === "number");
};

const unsafeRowFinding = (row: ParsedImportRow): ImportValidationFinding | null => {
  const payload =
    row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
      ? (row.rawPayload as Record<string, unknown>)
      : null;
  const merchant = text(row.merchantRaw ?? row.merchantClean ?? row.description);
  const sourceText = text(payload?.sourceLine ?? payload?.line);
  if (/\bBALANCE\s+(?:BROUGHT|CARRIED)\s+FORWARD\b/i.test(`${merchant} ${sourceText}`)) {
    return {
      code: "row.balance_anchor",
      severity: "critical",
      field: "rows",
      message: "A statement balance anchor was incorrectly extracted as a transaction.",
    };
  }
  if (merchant.length > 500 || sourceText.length > 1_500) {
    return {
      code: "evidence.boilerplate",
      severity: "critical",
      field: "rawPayload",
      message: "Statement instructions or legal copy were incorrectly extracted as a transaction.",
    };
  }

  const amount = parseAmountValue(row.amount == null ? null : String(row.amount));
  const rawAmountText = text(payload?.amountText);
  const sourceAmounts = Array.from(rawAmountText.matchAll(/[0-9][0-9,]*\.\d{2}/g))
    .map((match) => Number(match[0].replace(/,/g, "")))
    .filter(Number.isFinite);
  const largestSourceAmount = sourceAmounts.length > 0 ? Math.max(...sourceAmounts) : 0;
  const mergedAmount =
    amount !== null &&
    sourceAmounts.length >= 2 &&
    largestSourceAmount > 0 &&
    Math.abs(amount) > largestSourceAmount * 100;
  if ((amount !== null && Math.abs(amount) >= 1_000_000_000_000) || mergedAmount) {
    return {
      code: "amount.implausible",
      severity: "critical",
      field: "amount",
      message: "Multiple statement values appear to have been merged into one transaction amount.",
    };
  }
  return null;
};

export const validateParsedImportRows = (params: {
  rows: ParsedImportRow[];
  metadata?: Partial<DetectedStatementMetadata> | null;
}): ImportValidationResult => {
  const rows = params.rows ?? [];
  const rowCount = rows.length;
  const dateCount = rows.filter((row) => Boolean(parseDateValue(row.date ?? row.transactionDate ?? row.postedDate ?? null))).length;
  const amountCount = rows.filter((row) => parseAmountValue(row.amount == null ? null : String(row.amount)) !== null).length;
  const typeCount = rows.filter((row) => row.type === "income" || row.type === "expense" || row.type === "transfer").length;
  const evidenceCount = rows.filter(rowHasEvidence).length;
  const dateCoverage = rowCount ? dateCount / rowCount : 0;
  const amountCoverage = rowCount ? amountCount / rowCount : 0;
  const typeCoverage = rowCount ? typeCount / rowCount : 0;
  const evidenceCoverage = rowCount ? evidenceCount / rowCount : 0;

  const start = parseDateValue(params.metadata?.startDate ?? null);
  const end = parseDateValue(params.metadata?.endDate ?? null);
  const outsidePeriodCount = start && end
    ? rows.reduce((count, row) => {
        const date = parseDateValue(row.date ?? row.transactionDate ?? row.postedDate ?? null);
        if (!date) return count;
        return date < start || date > end ? count + 1 : count;
      }, 0)
    : 0;
  const outsidePeriodRate = rowCount ? outsidePeriodCount / rowCount : 0;
  const findings: ImportValidationFinding[] = [];
  const unsafeFindings = rows.map(unsafeRowFinding).filter((finding): finding is ImportValidationFinding => Boolean(finding));
  const unsafeRowRate = rowCount ? unsafeFindings.length / rowCount : 0;
  if (rowCount === 0) findings.push({ code: "rows.empty", severity: "critical", field: "rows", message: "No transaction rows were extracted." });
  if (rowCount > 0 && dateCoverage < 0.65) findings.push({ code: "date.coverage_low", severity: "critical", field: "date", message: "Too many rows have no usable date." });
  if (rowCount > 0 && amountCoverage < 0.9) findings.push({ code: "amount.coverage_low", severity: "critical", field: "amount", message: "Too many rows have no usable amount." });
  if (rowCount > 0 && typeCoverage < 0.8) findings.push({ code: "type.coverage_low", severity: "warning", field: "type", message: "Some rows have no reliable transaction direction." });
  if (rowCount > 0 && evidenceCoverage < 0.8) findings.push({ code: "evidence.coverage_low", severity: "warning", field: "rawPayload", message: "Some rows lack source evidence." });
  if (outsidePeriodRate > 0.1) findings.push({ code: "date.outside_statement_period", severity: outsidePeriodRate > 0.35 ? "critical" : "warning", field: "date", message: "Some rows fall outside the statement period." });
  for (const finding of unsafeFindings) {
    if (!findings.some((existing) => existing.code === finding.code)) {
      findings.push(finding);
    }
  }

  const score = clamp(
    dateCoverage * 30 +
      amountCoverage * 30 +
      typeCoverage * 15 +
      evidenceCoverage * 15 +
      (1 - Math.min(1, outsidePeriodRate)) * 10 -
      Math.min(60, unsafeRowRate * 100)
  );
  return {
    score,
    critical: findings.some((finding) => finding.severity === "critical"),
    findings,
    metrics: { rowCount, dateCoverage, amountCoverage, typeCoverage, evidenceCoverage, outsidePeriodRate, unsafeRowRate },
  };
};

export const applyImportValidationToRows = <T extends ParsedImportRow & Record<string, unknown>>(
  rows: T[],
  validation: ImportValidationResult
) => rows.map((row) => {
  if (!validation.critical && validation.score >= 80) return row;
  const currentConfidence = typeof row.confidence === "number" ? row.confidence : 0;
  const payload = row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
    ? (row.rawPayload as Record<string, unknown>)
    : null;
  const evidence = payload?.parserEvidence;
  const hasEvidence = Boolean(evidence && typeof evidence === "object") || Boolean(text(row.merchantRaw) || text(row.description));
  const cappedConfidence = calibrateConfidenceScore({ rawConfidence: currentConfidence, validationScore: validation.score, hasEvidence });
  return {
    ...row,
    confidence: cappedConfidence,
    parserConfidence: Math.min(typeof row.parserConfidence === "number" ? row.parserConfidence : cappedConfidence, cappedConfidence),
    categoryConfidence: Math.min(typeof row.categoryConfidence === "number" ? row.categoryConfidence : cappedConfidence, cappedConfidence),
    reviewStatus: "pending_review",
    rawPayload: {
      ...(row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload) ? row.rawPayload : {}),
      validation: {
        score: validation.score,
        critical: validation.critical,
        findings: validation.findings,
        metrics: validation.metrics,
        rawConfidence: currentConfidence,
        calibratedConfidence: cappedConfidence,
      },
    },
  } as T;
});
