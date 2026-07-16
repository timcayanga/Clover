export type StatementQualityRow = {
  date?: unknown;
  amount?: unknown;
  merchantRaw?: unknown;
  merchantClean?: unknown;
  categoryName?: unknown;
  rawPayload?: unknown;
};

export type StatementExtractionQuality = {
  score: number;
  rowCount: number;
  normalizedNameCoverage: number;
  categoryCoverage: number;
  otherRate: number;
  evidenceCoverage: number;
  pageCoverage: number;
  duplicateKeyRate: number;
  critical: boolean;
  reasons: string[];
};

export type StatementCandidateComparison = {
  winner: "local" | "backup" | "tie";
  localScore: number;
  backupScore: number | null;
  backupQualityAdvantage: number;
  reason: "backup_materially_better" | "local_materially_better" | "backup_critical" | "insufficient_backup" | "close_quality";
};

const asText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const rowEvidence = (row: StatementQualityRow) => {
  if (!row.rawPayload || typeof row.rawPayload !== "object" || Array.isArray(row.rawPayload)) {
    return { page: null, hasEvidence: false };
  }
  const payload = row.rawPayload as Record<string, unknown>;
  const parserEvidence = payload.parserEvidence;
  const evidence = parserEvidence && typeof parserEvidence === "object" && !Array.isArray(parserEvidence)
    ? (parserEvidence as Record<string, unknown>)
    : null;
  const page = typeof evidence?.page === "number" && Number.isFinite(evidence.page) ? evidence.page : null;
  const sourceText = asText(evidence?.source_text ?? payload.sourceLine);
  return { page, hasEvidence: Boolean(sourceText) || page !== null };
};

const normalizeKeyPart = (value: unknown) => asText(value).toLowerCase().replace(/\s+/g, " ");

export const assessStatementExtractionQuality = (params: {
  rows: StatementQualityRow[];
  pageCount?: number | null;
  declaredTransactionCount?: number | null;
  balanceReconciled?: boolean | null;
}): StatementExtractionQuality => {
  const rows = params.rows;
  const rowCount = rows.length;
  const normalizedNameCoverage = rowCount
    ? rows.filter((row) => Boolean(asText(row.merchantClean))).length / rowCount
    : 0;
  const categoryCoverage = rowCount
    ? rows.filter((row) => Boolean(asText(row.categoryName))).length / rowCount
    : 0;
  const otherRate = rowCount
    ? rows.filter((row) => /^other$/i.test(asText(row.categoryName))).length / rowCount
    : 0;
  const evidence = rows.map(rowEvidence);
  const evidenceCoverage = rowCount ? evidence.filter((entry) => entry.hasEvidence).length / rowCount : 0;
  const pages = new Set(evidence.map((entry) => entry.page).filter((page): page is number => page !== null));
  const pageCount = Math.max(0, Math.floor(Number(params.pageCount ?? 0)));
  const pageCoverage = pageCount > 0 ? Math.min(1, pages.size / pageCount) : 1;
  const keys = rows.map((row) => [normalizeKeyPart(row.date), normalizeKeyPart(row.amount), normalizeKeyPart(row.merchantRaw)].join("|"));
  const duplicateKeyRate = rowCount
    ? 1 - new Set(keys.filter((key) => key !== "||")).size / Math.max(1, keys.filter((key) => key !== "||").length)
    : 0;
  const reasons: string[] = [];
  let score = 100;

  if (rowCount === 0) {
    score -= 60;
    reasons.push("no_transaction_rows");
  }
  if (params.declaredTransactionCount !== null && params.declaredTransactionCount !== undefined && params.declaredTransactionCount !== rowCount) {
    score -= 35;
    reasons.push("declared_count_mismatch");
  }
  if (rowCount > 0 && normalizedNameCoverage < 0.8) {
    score -= 10;
    reasons.push("low_normalized_name_coverage");
  }
  if (rowCount > 0 && categoryCoverage < 0.95) {
    score -= 8;
    reasons.push("missing_categories");
  }
  if (otherRate > 0.3) {
    score -= 10;
    reasons.push("high_other_rate");
  }
  if (rowCount > 0 && evidenceCoverage < 0.8) {
    score -= 15;
    reasons.push("low_row_evidence_coverage");
  }
  if (pageCount > 1 && rowCount > 0 && pageCoverage < 0.75) {
    score -= 20;
    reasons.push("incomplete_page_coverage");
  }
  if (duplicateKeyRate > 0.05) {
    score -= 15;
    reasons.push("duplicate_row_keys");
  }
  if (params.balanceReconciled === false) {
    score -= 10;
    reasons.push("balance_not_reconciled");
  }

  const critical = rowCount === 0 || reasons.includes("declared_count_mismatch") || reasons.includes("incomplete_page_coverage");
  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    rowCount,
    normalizedNameCoverage,
    categoryCoverage,
    otherRate,
    evidenceCoverage,
    pageCoverage,
    duplicateKeyRate,
    critical,
    reasons,
  };
};

export const compareStatementExtractionCandidates = (params: {
  local: StatementExtractionQuality;
  backup?: StatementExtractionQuality | null;
}): StatementCandidateComparison => {
  const backup = params.backup ?? null;
  if (!backup) {
    return {
      winner: "local",
      localScore: params.local.score,
      backupScore: null,
      backupQualityAdvantage: 0,
      reason: "insufficient_backup",
    };
  }

  const backupQualityAdvantage = backup.score - params.local.score;
  if (backup.critical && !params.local.critical) {
    return {
      winner: "local",
      localScore: params.local.score,
      backupScore: backup.score,
      backupQualityAdvantage,
      reason: "backup_critical",
    };
  }
  if (!params.local.critical && backupQualityAdvantage <= -8) {
    return {
      winner: "local",
      localScore: params.local.score,
      backupScore: backup.score,
      backupQualityAdvantage,
      reason: "local_materially_better",
    };
  }
  if (!backup.critical && (params.local.critical || backupQualityAdvantage >= 8)) {
    return {
      winner: "backup",
      localScore: params.local.score,
      backupScore: backup.score,
      backupQualityAdvantage,
      reason: "backup_materially_better",
    };
  }
  return {
    winner: "tie",
    localScore: params.local.score,
    backupScore: backup.score,
    backupQualityAdvantage,
    reason: "close_quality",
  };
};
