const PARSED_NOTE_KEYS = [
  "fullDetails",
  "parsedDetails",
  "transactionDetails",
  "transactionDetail",
  "counterpartyDetails",
  "counterparty",
  "recipient",
  "sender",
  "notes",
  "note",
  "detail",
  "details",
  "trailingDetails",
] as const;

const PARSER_EVIDENCE_PATHS = [
  ["parserEvidence", "sourceText"],
  ["parserEvidence", "source_text"],
  ["parserEvidence", "reason"],
  ["parser_evidence", "sourceText"],
  ["parser_evidence", "source_text"],
  ["parser_evidence", "reason"],
] as const;

const normalizeTextValue = (value: unknown) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value).trim() : "";
  }

  return typeof value === "string" ? value.trim() : "";
};

const normalizeComparableText = (value: unknown) =>
  normalizeTextValue(value)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const readNestedTextValue = (value: unknown, path: readonly string[]) => {
  let current: unknown = value;
  for (const key of path) {
    const record = asRecord(current);
    if (!record) {
      return "";
    }

    current = record[key];
  }

  return normalizeTextValue(current);
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

const readNormalizedUserNote = (normalizedPayload: unknown) => {
  const record = asRecord(normalizedPayload);
  if (!record) {
    return "";
  }

  for (const key of ["userNote", "user_note"]) {
    const candidate = normalizeTextValue(record[key]);
    if (candidate) {
      return candidate;
    }
  }

  return "";
};

const readNormalizedParserSummaryNote = (normalizedPayload: unknown) => {
  const record = asRecord(normalizedPayload);
  if (!record) {
    return "";
  }

  const parserSummary = asRecord(record.parserSummary);
  if (!parserSummary) {
    return "";
  }

  for (const key of ["summaryText", "summary_text"]) {
    const candidate = normalizeTextValue(parserSummary[key]);
    if (candidate && !looksLikeJsonBlob(candidate)) {
      return candidate;
    }
  }

  return "";
};

export const normalizeTransactionNoteValue = (value: unknown) => {
  const normalized = normalizeTextValue(value);
  return normalized && !looksLikeJsonBlob(normalized) ? normalized : "";
};

const getImportedParsedNoteFallback = (params: {
  description?: unknown;
  merchantRaw?: unknown;
  merchantClean?: unknown;
}) => {
  const description = normalizeTextValue(params.description);
  if (!description || looksLikeJsonBlob(description)) {
    return "";
  }

  const normalizedDescription = normalizeComparableText(description);
  const merchantCandidates = [params.merchantClean, params.merchantRaw]
    .map((value) => normalizeComparableText(value))
    .filter(Boolean);

  if (merchantCandidates.includes(normalizedDescription)) {
    return "";
  }

  return description;
};

export const extractRawParsedTransactionNote = (rawPayload: unknown) => {
  const record = asRecord(rawPayload);
  if (!record) {
    return "";
  }

  for (const key of PARSED_NOTE_KEYS) {
    const candidate = normalizeTextValue(record[key]);
    if (!candidate || looksLikeJsonBlob(candidate)) {
      continue;
    }

    return candidate;
  }

  return "";
};

export const getTransactionUserNoteValue = (params: {
  normalizedPayload?: unknown;
  description?: unknown;
  source?: unknown;
  importFileId?: unknown;
}) => {
  const normalizedUserNote = readNormalizedUserNote(params.normalizedPayload);
  if (normalizedUserNote) {
    return normalizeTransactionNoteValue(normalizedUserNote);
  }

  if (params.source === "manual" && !params.importFileId) {
    return normalizeTransactionNoteValue(params.description);
  }

  return "";
};

export const getTransactionParsedNoteValue = (params: {
  rawPayload?: unknown;
  normalizedPayload?: unknown;
  description?: unknown;
  merchantRaw?: unknown;
  merchantClean?: unknown;
  source?: unknown;
  importFileId?: unknown;
}) => {
  const parsedNote = extractRawParsedTransactionNote(params.rawPayload);
  if (parsedNote) {
    return parsedNote;
  }

  for (const path of PARSER_EVIDENCE_PATHS) {
    const parserEvidenceNote = normalizeTransactionNoteValue(readNestedTextValue(params.rawPayload, path));
    if (parserEvidenceNote) {
      return parserEvidenceNote;
    }
  }

  const normalizedParserSummaryNote = normalizeTransactionNoteValue(readNormalizedParserSummaryNote(params.normalizedPayload));
  if (normalizedParserSummaryNote) {
    return normalizedParserSummaryNote;
  }

  if ((params.source === "upload" || params.importFileId) && !readNormalizedUserNote(params.normalizedPayload)) {
    return getImportedParsedNoteFallback(params);
  }

  return "";
};

export const buildImportedTransactionRawPayload = (params: {
  rawPayload?: unknown;
  description?: unknown;
  merchantRaw?: unknown;
  merchantClean?: unknown;
}) => {
  const base = asRecord(params.rawPayload) ? { ...(params.rawPayload as Record<string, unknown>) } : {};
  if (extractRawParsedTransactionNote(base)) {
    return base;
  }

  const fallbackNote = getImportedParsedNoteFallback(params);
  if (!fallbackNote) {
    return base;
  }

  return {
    ...base,
    parsedDetails: normalizeTextValue(base.parsedDetails) || fallbackNote,
    fullDetails: normalizeTextValue(base.fullDetails) || fallbackNote,
  };
};
