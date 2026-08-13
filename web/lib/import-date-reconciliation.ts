import type { EnrichedParsedImportRow } from "@/lib/data-engine";
import { parseDateValue } from "@/lib/import-parser";

type StatementDateMetadata = {
  startDate?: string | null;
  endDate?: string | null;
};

const DAY_MS = 86_400_000;

const readRowEvidence = (row: EnrichedParsedImportRow) => {
  const payload =
    row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
      ? (row.rawPayload as Record<string, unknown>)
      : null;
  const parserEvidence =
    payload?.parserEvidence && typeof payload.parserEvidence === "object" && !Array.isArray(payload.parserEvidence)
      ? (payload.parserEvidence as Record<string, unknown>)
      : null;

  return [
    payload?.sourceLine,
    payload?.fullLineText,
    payload?.line,
    parserEvidence?.source_text,
    parserEvidence?.sourceText,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n");
};

const evidenceHasExplicitYear = (evidence: string) =>
  /(?:\b(?:19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b|\b\d{1,2}[-/.]\d{1,2}[-/.](?:19|20)\d{2}\b|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2},?\s+(?:19|20)\d{2}\b|\b\d{1,2}\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(?:19|20)\d{2}\b)/i.test(
    evidence
  );

const resolveStatementRange = (primary: StatementDateMetadata, fallback: StatementDateMetadata) => {
  const startDate = parseDateValue(primary.startDate ?? fallback.startDate ?? null);
  const endDate = parseDateValue(primary.endDate ?? fallback.endDate ?? null);
  if (!startDate && !endDate) {
    return null;
  }

  const start = startDate ?? endDate!;
  const end = endDate ?? startDate!;
  return start.getTime() <= end.getTime() ? { start, end } : { start: end, end: start };
};

const dateFallsNearRange = (date: Date, start: Date, end: Date) => {
  const timestamp = date.getTime();
  return timestamp >= start.getTime() - 7 * DAY_MS && timestamp <= end.getTime() + 7 * DAY_MS;
};

/**
 * Repairs a parser-added year only when the statement range supplies stronger
 * evidence and the source row did not contain its own explicit year.
 */
export const reconcileStatementTransactionYears = (params: {
  rows: EnrichedParsedImportRow[];
  sourceMetadata: StatementDateMetadata;
  resolvedMetadata: StatementDateMetadata;
}) => {
  const range = resolveStatementRange(params.sourceMetadata, params.resolvedMetadata);
  if (!range) {
    return params.rows;
  }

  const candidateYears = Array.from(new Set([range.start.getUTCFullYear(), range.end.getUTCFullYear()]));

  return params.rows.map((row) => {
    const parsedDate = parseDateValue(row.date ?? null);
    if (!parsedDate || dateFallsNearRange(parsedDate, range.start, range.end)) {
      return row;
    }

    const evidence = readRowEvidence(row);
    if (evidence && evidenceHasExplicitYear(evidence)) {
      return row;
    }

    const correctedDate = candidateYears
      .map((year) => new Date(Date.UTC(year, parsedDate.getUTCMonth(), parsedDate.getUTCDate(), 12)))
      .find((candidate) => dateFallsNearRange(candidate, range.start, range.end));
    if (!correctedDate || correctedDate.getUTCFullYear() === parsedDate.getUTCFullYear()) {
      return row;
    }

    const originalDate = row.date ?? parsedDate.toISOString();
    return {
      ...row,
      date: correctedDate.toISOString().slice(0, 10),
      confidence: Math.min(Number(row.confidence ?? 80), 82),
      rawPayload: {
        ...(row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
          ? (row.rawPayload as Record<string, unknown>)
          : {}),
        dateYearReconciliation: {
          originalDate,
          correctedDate: correctedDate.toISOString().slice(0, 10),
          statementStartDate: range.start.toISOString().slice(0, 10),
          statementEndDate: range.end.toISOString().slice(0, 10),
          reason: "Yearless transaction date anchored to the explicit statement period.",
        },
      },
    } satisfies EnrichedParsedImportRow;
  });
};
