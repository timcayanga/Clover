import { parseAmountValue, parseDateValue, type DetectedStatementMetadata, type ParsedImportRow } from "@/lib/import-parser";
import { validateParsedImportRows, type ImportValidationResult } from "@/lib/data-engine-validation";
import { assessStatementExtractionQuality, type StatementExtractionQuality } from "@/lib/import-quality";

export type ImportCandidateSource = "trained" | "generic" | "backup";

export type ImportCandidateAssessment = {
  source: ImportCandidateSource;
  rows: ParsedImportRow[];
  score: number;
  critical: boolean;
  validation: ImportValidationResult;
  extraction: StatementExtractionQuality;
  balanceReconciliation: {
    available: boolean;
    reconciled: boolean | null;
    expectedEndingBalance: number | null;
    difference: number | null;
    runningBalanceCoverage: number;
  };
  currencyConsistency: number;
  reasons: string[];
};

export type ImportCandidateArbitration = {
  winner: ImportCandidateSource;
  assessment: ImportCandidateAssessment;
  assessments: ImportCandidateAssessment[];
  materiallyBetter: boolean;
  requiresReview: boolean;
  agreement: number | null;
  reasons: string[];
};

const asRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const readNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  return parseAmountValue(value);
};

const rowAmount = (row: ParsedImportRow) => readNumber(row.amount);

const rowBalance = (row: ParsedImportRow) => {
  const payload = asRecord(row.rawPayload);
  return readNumber(payload?.balance ?? payload?.runningBalance ?? payload?.balanceText);
};

const normalizeCurrency = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim().toUpperCase() : null;

const amountTolerance = (left: number, right: number) => Math.max(0.02, Math.max(Math.abs(left), Math.abs(right)) * 0.001);

const assessBalanceReconciliation = (
  rows: ParsedImportRow[],
  metadata?: Partial<DetectedStatementMetadata> | null
) => {
  const opening = readNumber(metadata?.openingBalance);
  const ending = readNumber(metadata?.endingBalance);
  const metadataConfidence = Number(metadata?.confidence ?? 0);
  const accountType = normalizedText(metadata?.accountType);
  const directionalRows = rows.filter((row) => row.type === "income" || row.type === "expense");
  const hasUnresolvedTransfers = rows.some((row) => row.type === "transfer");
  const directionalAmountsAvailable = directionalRows.every((row) => rowAmount(row) !== null);
  const expectedEndingBalance =
    opening !== null &&
    ending !== null &&
    metadataConfidence >= 75 &&
    directionalAmountsAvailable &&
    !hasUnresolvedTransfers
      ? directionalRows.reduce((balance, row) => {
          const amount = Math.abs(rowAmount(row) ?? 0);
          if (accountType === "credit_card") {
            return row.type === "expense" ? balance + amount : balance - amount;
          }
          return row.type === "income" ? balance + amount : balance - amount;
        }, opening)
      : null;
  const difference = expectedEndingBalance === null || ending === null ? null : Math.abs(expectedEndingBalance - ending);
  const reconciled =
    difference === null || expectedEndingBalance === null || ending === null
      ? null
      : difference <= amountTolerance(expectedEndingBalance, ending);

  const rowsWithBalances = rows
    .map((row) => ({ row, balance: rowBalance(row), amount: rowAmount(row) }))
    .filter((entry): entry is { row: ParsedImportRow; balance: number; amount: number } => entry.balance !== null && entry.amount !== null);
  let comparableMovements = 0;
  let matchingMovements = 0;
  for (let index = 1; index < rowsWithBalances.length; index += 1) {
    const previous = rowsWithBalances[index - 1];
    const current = rowsWithBalances[index];
    const movement = Math.abs(current.balance - previous.balance);
    if (movement <= amountTolerance(current.balance, previous.balance)) continue;
    comparableMovements += 1;
    const currentMatches = Math.abs(movement - Math.abs(current.amount)) <= amountTolerance(movement, current.amount);
    const previousMatches = Math.abs(movement - Math.abs(previous.amount)) <= amountTolerance(movement, previous.amount);
    if (currentMatches || previousMatches) {
      matchingMovements += 1;
    }
  }

  return {
    available: expectedEndingBalance !== null || comparableMovements > 0,
    reconciled,
    expectedEndingBalance,
    difference,
    runningBalanceCoverage: comparableMovements > 0 ? matchingMovements / comparableMovements : 0,
  };
};

const assessCurrencyConsistency = (rows: ParsedImportRow[], metadata?: Partial<DetectedStatementMetadata> | null) => {
  const expectedCurrency = normalizeCurrency(metadata?.currency);
  const rowCurrencies = rows.map((row) => normalizeCurrency(row.currency)).filter((currency): currency is string => Boolean(currency));
  if (rowCurrencies.length === 0) return expectedCurrency ? 0 : 1;
  if (!expectedCurrency) {
    const counts = new Map<string, number>();
    rowCurrencies.forEach((currency) => counts.set(currency, (counts.get(currency) ?? 0) + 1));
    return Math.max(...counts.values()) / rowCurrencies.length;
  }
  return rowCurrencies.filter((currency) => currency === expectedCurrency).length / rowCurrencies.length;
};

export const assessImportCandidate = (params: {
  source: ImportCandidateSource;
  rows: ParsedImportRow[];
  metadata?: Partial<DetectedStatementMetadata> | null;
  pageCount?: number | null;
}): ImportCandidateAssessment => {
  const validation = validateParsedImportRows({ rows: params.rows, metadata: params.metadata });
  const balanceReconciliation = assessBalanceReconciliation(params.rows, params.metadata);
  const extraction = assessStatementExtractionQuality({
    rows: params.rows,
    pageCount: params.pageCount,
    balanceReconciled: balanceReconciliation.reconciled,
  });
  const currencyConsistency = assessCurrencyConsistency(params.rows, params.metadata);
  const reasons = [...validation.findings.map((finding) => finding.code), ...extraction.reasons];
  if (balanceReconciliation.reconciled === false) reasons.push("balance_not_reconciled");
  if (balanceReconciliation.runningBalanceCoverage > 0 && balanceReconciliation.runningBalanceCoverage < 0.75) {
    reasons.push("running_balance_mismatch");
  }
  if (currencyConsistency < 0.9) reasons.push("currency_inconsistent");

  const reconciliationScore = balanceReconciliation.available
    ? balanceReconciliation.reconciled === true
      ? 100
      : balanceReconciliation.reconciled === false
        ? 20
        : Math.round(balanceReconciliation.runningBalanceCoverage * 100)
    : 70;
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(validation.score * 0.45 + extraction.score * 0.3 + reconciliationScore * 0.15 + currencyConsistency * 10)
    )
  );
  const critical = validation.critical || extraction.critical || balanceReconciliation.reconciled === false;

  return {
    source: params.source,
    rows: params.rows,
    score,
    critical,
    validation,
    extraction,
    balanceReconciliation,
    currencyConsistency,
    reasons: Array.from(new Set(reasons)),
  };
};

const normalizedText = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const rowKey = (row: ParsedImportRow) => {
  const date = parseDateValue(row.date ?? row.transactionDate ?? row.postedDate ?? null)?.toISOString().slice(0, 10) ?? "";
  const amount = rowAmount(row);
  const merchant = normalizedText(row.merchantRaw ?? row.merchantClean ?? row.description).replace(/[^a-z0-9]+/g, " ").trim();
  const type = normalizedText(row.type);
  return date && amount !== null ? `${date}|${Math.abs(amount).toFixed(2)}|${type}|${merchant}` : "";
};

export const calculateCandidateAgreement = (left: ParsedImportRow[], right: ParsedImportRow[]) => {
  const leftKeys = new Set(left.map(rowKey).filter(Boolean));
  const rightKeys = new Set(right.map(rowKey).filter(Boolean));
  if (leftKeys.size === 0 || rightKeys.size === 0) return null;
  let matches = 0;
  leftKeys.forEach((key) => {
    if (rightKeys.has(key)) matches += 1;
  });
  return matches / Math.max(leftKeys.size, rightKeys.size);
};

const sourcePriority: Record<ImportCandidateSource, number> = { trained: 3, generic: 2, backup: 1 };

export const arbitrateImportCandidates = (params: {
  candidates: Array<{
    source: ImportCandidateSource;
    rows: ParsedImportRow[];
    metadata?: Partial<DetectedStatementMetadata> | null;
  }>;
  pageCount?: number | null;
  preferredSource?: ImportCandidateSource;
}): ImportCandidateArbitration => {
  const assessments = params.candidates
    .filter((candidate) => candidate.rows.length > 0)
    .map((candidate) => assessImportCandidate({ ...candidate, pageCount: params.pageCount }));
  if (assessments.length === 0) {
    const empty = assessImportCandidate({ source: params.preferredSource ?? "trained", rows: [], pageCount: params.pageCount });
    return {
      winner: empty.source,
      assessment: empty,
      assessments: [empty],
      materiallyBetter: false,
      requiresReview: true,
      agreement: null,
      reasons: ["no_viable_candidate"],
    };
  }

  const preferredSource = params.preferredSource ?? "trained";
  const preferred = assessments.find((assessment) => assessment.source === preferredSource) ?? assessments[0];
  const ordered = [...assessments].sort((left, right) => {
    if (left.critical !== right.critical) return left.critical ? 1 : -1;
    if (left.score !== right.score) return right.score - left.score;
    return sourcePriority[right.source] - sourcePriority[left.source];
  });
  const best = ordered[0];
  const materiallyBetter =
    best.source !== preferred.source &&
    ((!best.critical && preferred.critical) || (!best.critical && best.score >= preferred.score + 8));
  const winner = materiallyBetter ? best : preferred;
  const comparisonTarget = assessments.find((assessment) => assessment.source !== winner.source) ?? null;
  const agreement = comparisonTarget ? calculateCandidateAgreement(winner.rows, comparisonTarget.rows) : null;
  const closeDisagreement =
    comparisonTarget !== null &&
    !winner.critical &&
    !comparisonTarget.critical &&
    Math.abs(winner.score - comparisonTarget.score) < 8 &&
    agreement !== null &&
    agreement < 0.7;
  const requiresReview = winner.critical || winner.score < 80 || closeDisagreement;

  return {
    winner: winner.source,
    assessment: winner,
    assessments,
    materiallyBetter,
    requiresReview,
    agreement,
    reasons: Array.from(new Set([
      ...(materiallyBetter ? [`${winner.source}_materially_safer`] : [`${preferred.source}_retained`]),
      ...(closeDisagreement ? ["candidate_disagreement_requires_review"] : []),
      ...winner.reasons,
    ])),
  };
};

export const assessStatementLayoutDrift = (params: {
  currentSignature?: string | null;
  templateSignature?: string | null;
  templateScore?: number | null;
}) => {
  const currentParts = new Set(String(params.currentSignature ?? "").split("|").filter(Boolean));
  const templateParts = new Set(String(params.templateSignature ?? "").split("|").filter(Boolean));
  if (currentParts.size === 0 || templateParts.size === 0) {
    return { drifted: false, overlap: null, reason: "insufficient_signature" as const };
  }
  let overlapCount = 0;
  currentParts.forEach((part) => {
    if (templateParts.has(part)) overlapCount += 1;
  });
  const overlap = overlapCount / Math.max(currentParts.size, templateParts.size);
  const drifted = overlap < 0.45 && Number(params.templateScore ?? 0) < 72;
  return { drifted, overlap, reason: drifted ? "layout_signature_drift" as const : "layout_signature_match" as const };
};
