import type { Prisma, TransactionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { detectStatementMetadata, parseAmountValue, parseDateValue, type ParsedImportRow } from "@/lib/import-parser";

export const DATA_ENGINE_VERSION = "v2";

type TrainingSignalRow = {
  categoryId: string;
  categoryName: string | null;
  merchantKey: string;
  merchantTokens: string[];
  source: string;
  confidence: number;
};

export type EnrichedParsedImportRow = ParsedImportRow & {
  institution?: string | null;
  accountNumber?: string | null;
  statementFingerprint?: string | null;
  parserVersion?: string;
  confidence?: number;
  categoryReason?: string | null;
};

const COMMON_STOP_WORDS = new Set([
  "and",
  "the",
  "for",
  "from",
  "with",
  "payment",
  "pay",
  "card",
  "debit",
  "credit",
  "transfer",
  "bank",
  "online",
  "pos",
  "inc",
  "corp",
  "co",
  "ltd",
  "llc",
  "ph",
]);

const CATEGORY_FALLBACKS: Record<TransactionType, string> = {
  income: "Income",
  expense: "Other",
  transfer: "Transfers",
};

const KNOWN_INSTITUTIONS: Array<{ name: string; match: RegExp }> = [
  { name: "BPI", match: /\b(BANK OF THE PHILIPPINE ISLANDS|BPI)\b/i },
  { name: "BDO", match: /\b(BDO|BANCO DE ORO)\b/i },
  { name: "Metrobank", match: /\b(METROBANK|METROPOLITAN BANK)\b/i },
  { name: "Security Bank", match: /\bSECURITY BANK\b/i },
  { name: "EastWest", match: /\b(EASTWEST|EAST WEST)\b/i },
  { name: "RCBC", match: /\bRCBC\b/i },
  { name: "UnionBank", match: /\bUNIONBANK\b/i },
  { name: "Landbank", match: /\bLANDBANK\b/i },
  { name: "Chinabank", match: /\bCHINABANK\b/i },
  { name: "Maya", match: /\bMAYA\b/i },
  { name: "GCash", match: /\bGCASH\b/i },
  { name: "Wise", match: /\bWISE\b/i },
  { name: "PayPal", match: /\bPAYPAL\b/i },
];

const PARSED_TRANSACTION_COLUMNS = [
  "id",
  "importFileId",
  "workspaceId",
  "institution",
  "accountNumber",
  "accountName",
  "date",
  "amount",
  "merchantRaw",
  "merchantClean",
  "type",
  "categoryName",
  "confidence",
  "categoryReason",
  "parserVersion",
  "statementFingerprint",
  "rawPayload",
  "createdAt",
] as const;

const IMPORT_FILE_COLUMNS = [
  "id",
  "workspaceId",
  "accountId",
  "fileName",
  "fileType",
  "storageKey",
  "status",
  "confirmedAt",
  "uploadedAt",
  "deletedAt",
  "createdAt",
  "updatedAt",
] as const;

const fnv1a = (value: string) => {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
};

const normalizeWhitespace = (value: string) => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

export const normalizeMerchantText = (value?: string | null) =>
  normalizeWhitespace(String(value ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const tokenizeMerchant = (value?: string | null) =>
  normalizeMerchantText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !COMMON_STOP_WORDS.has(token));

export const guessCategoryFallback = (description: string, type: TransactionType) => {
  const lower = description.toLowerCase();
  if (type === "income" || /salary|payroll|income|deposit|credit memo/.test(lower)) return "Income";
  if (/transfer|instapay|pesonet|wise to|to savings|to checking/.test(lower)) return "Transfers";
  if (/grocery|supermarket|market|food|dining|restaurant|coffee|cafe|meal|takeout/.test(lower)) return "Food & Dining";
  if (/grab|uber|taxi|bus|train|parking|gas|fuel|transport|ride/.test(lower)) return "Transport";
  if (/rent|mortgage|apartment|housing/.test(lower)) return "Housing";
  if (/bill|utilities|electric|water|internet|phone|subscription|openai|netflix|spotify/.test(lower)) return "Bills & Utilities";
  if (/travel|airbnb|hotel|airline|flight|tour|holiday/.test(lower)) return "Travel & Lifestyle";
  if (/shop|shopping|mall|amazon|lazada|shopee|retail/.test(lower)) return "Shopping";
  if (/health|doctor|clinic|pharmacy|medical|hospital/.test(lower)) return "Health & Wellness";
  if (/education|tuition|school|college|course|learning/.test(lower)) return "Education";
  if (/gift|donation|charity|present/.test(lower)) return "Gifts & Donations";
  if (/business|invoice|client|contract/.test(lower)) return "Business";
  if (/fee|interest|loan|financial|bank charge/.test(lower)) return "Financial";
  return "Other";
};

export const defaultCategoryForType = (type: TransactionType) => CATEGORY_FALLBACKS[type];

export const detectInstitutionFromText = (text: string | null | undefined) => {
  const normalized = normalizeWhitespace(String(text ?? ""));
  for (const institution of KNOWN_INSTITUTIONS) {
    if (institution.match.test(normalized)) {
      return institution.name;
    }
  }

  return null;
};

export const detectAccountNumber = (text: string | null | undefined) => {
  const normalized = normalizeWhitespace(String(text ?? ""));
  const labeledAccountSection =
    normalized.match(/\b(?:ACCOUNT\s*(?:NO|NUMBER|#)?|ACCT\s*(?:NO|NUMBER|#)?|A\/C\s*(?:NO|NUMBER|#)?|CARD\s*(?:NO|NUMBER|#)?|NO)\s*[:\-]?\s*([0-9\s-]{6,})/i)?.[1] ??
    "";
  const trailingDigits = normalized.match(/\b\d{4}[-\s]?\d{4}[-\s]?\d{2,4}\b/)?.[0] ?? "";
  const accountSection = labeledAccountSection || trailingDigits;
  const accountNumber = accountSection.replace(/\D/g, "").slice(0, 16) || null;
  return accountNumber;
};

export const detectStatementMetadataFromText = (text: string) => {
  const metadata = detectStatementMetadata(text);
  const institution = metadata?.institution ?? detectInstitutionFromText(text);
  const accountNumber = metadata?.accountNumber ?? detectAccountNumber(text);
  const accountName =
    metadata?.accountName ??
    (institution && accountNumber ? `${institution} ${accountNumber.slice(-4)}` : institution ?? null);

  return {
    institution,
    accountNumber,
    accountName,
    openingBalance: metadata?.openingBalance ?? null,
    endingBalance: metadata?.endingBalance ?? null,
    startDate: metadata?.startDate ?? null,
    endDate: metadata?.endDate ?? null,
  };
};

export const isMissingDatabaseRelationError = (error: unknown, tableName: string) => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  const combined = `${code} ${message}`.toLowerCase();
  return combined.includes(tableName.toLowerCase()) && (combined.includes("does not exist") || code === "p2021");
};

export const isMissingDatabaseColumnError = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  const combined = `${code} ${message}`.toLowerCase();
  return combined.includes("does not exist") && combined.includes("column") || code === "p2022";
};

export const extractMissingDatabaseColumn = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return null;
  }

  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  const match =
    message.match(/column\s+`([^`]+)`/i) ??
    message.match(/column\s+"([^"]+)"/i) ??
    message.match(/column\s+([A-Za-z0-9_]+)\s+of\s+relation/i);
  const raw = match?.[1] ?? null;
  if (!raw) {
    return null;
  }

  return raw.split(" of relation")[0]?.trim() || null;
};

const columnCache = new Map<string, string[]>();

export const getCompatibleParsedTransactionColumns = async () => {
  const cacheKey = "ParsedTransaction";
  const cached = columnCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ParsedTransaction'
  `;

  const existing = new Set(columns.map((column) => column.column_name));
  const compatible = PARSED_TRANSACTION_COLUMNS.filter((column) => existing.has(column));
  columnCache.set(cacheKey, compatible as string[]);
  return compatible as string[];
};

export const getCompatibleImportFileColumns = async () => {
  const cacheKey = "ImportFile";
  const cached = columnCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ImportFile'
  `;

  const existing = new Set(columns.map((column) => column.column_name));
  const compatible = IMPORT_FILE_COLUMNS.filter((column) => existing.has(column));
  columnCache.set(cacheKey, compatible as string[]);
  return compatible as string[];
};

export const buildImportFileInsertData = async (params: {
  workspaceId: string;
  accountId?: string | null;
  fileName: string;
  fileType: string;
  storageKey: string;
  status?: string;
}) => {
  const columns = new Set(await getCompatibleImportFileColumns());
  const record: Record<string, unknown> = {};

  if (columns.has("id")) record.id = crypto.randomUUID();
  if (columns.has("workspaceId")) record.workspaceId = params.workspaceId;
  if (columns.has("accountId")) record.accountId = params.accountId ?? null;
  if (columns.has("fileName")) record.fileName = params.fileName;
  if (columns.has("fileType")) record.fileType = params.fileType;
  if (columns.has("storageKey")) record.storageKey = params.storageKey;
  if (columns.has("status")) record.status = params.status ?? "processing";
  if (columns.has("confirmedAt")) record.confirmedAt = null;
  if (columns.has("uploadedAt")) record.uploadedAt = new Date();
  if (columns.has("deletedAt")) record.deletedAt = null;
  if (columns.has("createdAt")) record.createdAt = new Date();
  if (columns.has("updatedAt")) record.updatedAt = new Date();

  return record;
};

export const insertImportFileCompat = async (params: {
  workspaceId: string;
  accountId?: string | null;
  fileName: string;
  fileType: string;
  storageKey: string;
  status?: string;
}): Promise<any> => {
  const record = await buildImportFileInsertData(params);
  const columns = Object.keys(record);
  if (columns.length === 0) {
    return null;
  }

  const values = columns.map((column) => record[column] ?? null);
  const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ImportFile" (${columns.map((column) => `"${column}"`).join(", ")}) VALUES (${placeholders})`,
    ...values
  );

  return record;
};

export const fetchImportFileCompat = async (importFileId: string): Promise<any | null> => {
  const columns = await getCompatibleImportFileColumns();
  if (columns.length === 0) {
    return null;
  }

  const selectColumns = columns.map((column) => `"${column}"`).join(", ");
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT ${selectColumns} FROM "ImportFile" WHERE "id" = $1 LIMIT 1`,
    importFileId
  );

  return rows[0] ?? null;
};

export const listImportFilesCompat = async (workspaceId: string): Promise<any[]> => {
  const columns = await getCompatibleImportFileColumns();
  if (columns.length === 0) {
    return [];
  }

  const selectColumns = columns.map((column) => `"${column}"`).join(", ");
  const orderBy = columns.includes("uploadedAt")
    ? ' ORDER BY "uploadedAt" DESC'
    : columns.includes("createdAt")
      ? ' ORDER BY "createdAt" DESC'
      : ' ORDER BY "id" DESC';

  return prisma.$queryRawUnsafe<any[]>(
    `SELECT ${selectColumns} FROM "ImportFile" WHERE "workspaceId" = $1${orderBy}`,
    workspaceId
  );
};

export const updateImportFileCompat = async (
  importFileId: string,
  data: Partial<Record<string, unknown>>
): Promise<any | null> => {
  const columns = new Set(await getCompatibleImportFileColumns());
  const entries = Object.entries(data).filter(([key, value]) => columns.has(key) && value !== undefined);
  if (columns.has("updatedAt")) {
    entries.push(["updatedAt", new Date()]);
  }

  if (entries.length > 0) {
    const setClause = entries.map(([key], index) => `"${key}" = $${index + 1}`).join(", ");
    const values = entries.map(([, value]) => value);
    await prisma.$executeRawUnsafe(
      `UPDATE "ImportFile" SET ${setClause} WHERE "id" = $${entries.length + 1}`,
      ...values,
      importFileId
    );
  }

  return fetchImportFileCompat(importFileId);
};

export const buildParsedTransactionInsertData = async (params: {
  importFileId: string;
  workspaceId: string;
  rows: EnrichedParsedImportRow[];
  metadata: ReturnType<typeof detectStatementMetadataFromText>;
  statementFingerprint: string;
}) => {
  const columns = new Set(await getCompatibleParsedTransactionColumns());

  return params.rows.map((row) => {
    const record: Record<string, unknown> = {};
    if (columns.has("id")) record.id = crypto.randomUUID();
    if (columns.has("importFileId")) record.importFileId = params.importFileId;
    if (columns.has("workspaceId")) record.workspaceId = params.workspaceId;
    if (columns.has("institution")) record.institution = params.metadata.institution;
    if (columns.has("accountNumber")) record.accountNumber = params.metadata.accountNumber;
    if (columns.has("accountName")) record.accountName = row.accountName ?? null;
    if (columns.has("date")) record.date = parseDateValue(row.date ?? null);
    if (columns.has("amount")) record.amount = parseAmountValue(row.amount ?? null);
    if (columns.has("merchantRaw")) record.merchantRaw = row.merchantRaw ?? null;
    if (columns.has("merchantClean")) record.merchantClean = row.merchantClean ?? row.merchantRaw ?? null;
    if (columns.has("type")) record.type = row.type ?? "expense";
    if (columns.has("categoryName")) record.categoryName = row.categoryName ?? defaultCategoryForType(row.type ?? "expense");
    if (columns.has("confidence")) record.confidence = row.confidence ?? 0;
    if (columns.has("categoryReason")) record.categoryReason = row.categoryReason ?? null;
    if (columns.has("parserVersion")) record.parserVersion = row.parserVersion ?? DATA_ENGINE_VERSION;
    if (columns.has("statementFingerprint")) record.statementFingerprint = params.statementFingerprint;
    if (columns.has("rawPayload")) record.rawPayload = (row.rawPayload ?? {}) as Prisma.InputJsonValue;
    if (columns.has("createdAt")) record.createdAt = new Date();
    return record;
  });
};

export const insertParsedTransactionsCompat = async (params: {
  importFileId: string;
  rows: Array<Record<string, unknown>>;
}) => {
  if (params.rows.length === 0) {
    return;
  }

  const columns = await getCompatibleParsedTransactionColumns();
  if (columns.length === 0) {
    return;
  }

  const values: unknown[] = [];
  const tuples = params.rows.map((row) => {
    const placeholders = columns.map((column) => {
      values.push(row[column] ?? null);
      return `$${values.length}`;
    });
    return `(${placeholders.join(", ")})`;
  });

  await prisma.$executeRawUnsafe(
    `INSERT INTO "ParsedTransaction" (${columns.map((column) => `"${column}"`).join(", ")}) VALUES ${tuples.join(", ")}`,
    ...values
  );
};

export const fetchParsedTransactionRows = async (importFileId: string) => {
  const columns = await getCompatibleParsedTransactionColumns();
  if (columns.length === 0) {
    return [];
  }

  const selectColumns = columns.map((column) => `"${column}"`).join(", ");
  const orderBy = columns.includes("createdAt") ? ' ORDER BY "createdAt" ASC' : "";
  return prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT ${selectColumns} FROM "ParsedTransaction" WHERE "importFileId" = $1${orderBy}`,
    importFileId
  );
};

export const countParsedTransactionRows = async (importFileId: string) => {
  const result = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*)::bigint AS count FROM "ParsedTransaction" WHERE "importFileId" = $1`,
    importFileId
  );
  return Number(result[0]?.count ?? 0n);
};

export const buildStatementFingerprint = (
  text: string,
  metadata: ReturnType<typeof detectStatementMetadataFromText>,
  fileName?: string | null,
  fileType?: string | null
) => {
  const normalizedLines = text
    .split(/\r?\n/)
    .map((line) =>
      normalizeWhitespace(line)
        .replace(/\b\d{1,2}[/-][A-Za-z0-9]{1,4}[/-]\d{2,4}\b/g, "<date>")
        .replace(/\b[A-Z]{3}\s+\d{1,2},\s+\d{4}\b/g, "<date>")
        .replace(/[0-9][0-9,]*\.\d{2}/g, "<amount>")
        .replace(/\b\d{4,}\b/g, "<number>")
    )
    .filter(Boolean)
    .slice(0, 32);

  const fingerprintSource = [
    metadata.institution ?? "",
    metadata.accountNumber ?? "",
    metadata.startDate ?? "",
    metadata.endDate ?? "",
    (fileName ?? "").toLowerCase(),
    (fileType ?? "").toLowerCase(),
    normalizedLines.join("\n"),
  ].join("|");

  return `stmt_${fnv1a(fingerprintSource)}`;
};

const scoreSignal = (tokens: string[], normalizedMerchant: string, signal: TrainingSignalRow) => {
  const exactMatch = signal.merchantKey && signal.merchantKey === normalizedMerchant;
  if (exactMatch) {
    return 100 + signal.confidence;
  }

  const signalTokens = new Set(signal.merchantTokens);
  let overlap = 0;

  for (const token of tokens) {
    if (signalTokens.has(token)) {
      overlap += 1;
    }
  }

  if (overlap === 0) {
    return 0;
  }

  return overlap * 18 + signal.confidence * 0.5;
};

export const classifyMerchant = (params: {
  merchantText: string;
  type: TransactionType;
  categoryName?: string | null;
  trainingSignals: TrainingSignalRow[];
}) => {
  const tokens = tokenizeMerchant(params.merchantText);
  const normalizedMerchant = normalizeMerchantText(params.merchantText);
  const heuristicCategory = params.categoryName?.trim() || guessCategoryFallback(params.merchantText, params.type);

  let bestSignal: TrainingSignalRow | null = null;
  let bestScore = 0;

  for (const signal of params.trainingSignals) {
    const score = scoreSignal(tokens, normalizedMerchant, signal);
    if (score > bestScore) {
      bestScore = score;
      bestSignal = signal;
    }
  }

  if (!bestSignal || bestScore < 18) {
    return {
      categoryName: heuristicCategory,
      confidence: heuristicCategory === "Other" ? 35 : 62,
      categoryReason: heuristicCategory === "Other" ? "heuristic-other" : "heuristic-rule",
      merchantKey: normalizedMerchant,
      merchantTokens: tokens,
    };
  }

  const learnedCategory = bestSignal.categoryName ?? heuristicCategory;
  const confidence = Math.min(99, Math.round(Math.max(68, bestScore)));

  return {
    categoryName: learnedCategory,
    confidence,
    categoryReason: bestSignal.merchantKey === normalizedMerchant ? "learned-exact" : "learned-pattern",
    merchantKey: normalizedMerchant,
    merchantTokens: tokens,
  };
};

export const loadTrainingSignals = async (workspaceId: string) => {
  let signals: Array<{
    categoryId: string;
    categoryName: string | null;
    merchantKey: string;
    merchantTokens: Prisma.JsonValue | null;
    source: string;
    confidence: number;
    category: { name: string };
  }> = [];

  try {
    signals = await prisma.trainingSignal.findMany({
      where: { workspaceId },
      include: {
        category: true,
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
  } catch (error) {
    if (!isMissingDatabaseRelationError(error, "TrainingSignal")) {
      throw error;
    }
  }

  return signals.map((signal) => ({
    categoryId: signal.categoryId,
    categoryName: signal.category.name,
    merchantKey: signal.merchantKey,
    merchantTokens: Array.isArray(signal.merchantTokens) ? signal.merchantTokens.filter((token): token is string => typeof token === "string") : [],
    source: signal.source,
    confidence: signal.confidence,
  }));
};

export const upsertStatementTemplate = async (params: {
  workspaceId: string;
  fingerprint: string;
  metadata: ReturnType<typeof detectStatementMetadataFromText>;
}) => {
  try {
    return await prisma.statementTemplate.upsert({
      where: {
        workspaceId_fingerprint: {
          workspaceId: params.workspaceId,
          fingerprint: params.fingerprint,
        },
      },
      update: {
        institution: params.metadata.institution,
        accountNumber: params.metadata.accountNumber,
        accountName: params.metadata.accountName,
        metadata: params.metadata as Prisma.InputJsonValue,
        exampleCount: { increment: 1 },
        lastSeenAt: new Date(),
      },
      create: {
        workspaceId: params.workspaceId,
        fingerprint: params.fingerprint,
        institution: params.metadata.institution,
        accountNumber: params.metadata.accountNumber,
        accountName: params.metadata.accountName,
        metadata: params.metadata as Prisma.InputJsonValue,
        parserVersion: DATA_ENGINE_VERSION,
      },
    });
  } catch (error) {
    if (isMissingDatabaseRelationError(error, "StatementTemplate")) {
      return null;
    }

    throw error;
  }
};

export const recordTrainingSignal = async (params: {
  workspaceId: string;
  importFileId?: string | null;
  transactionId?: string | null;
  merchantText: string;
  categoryId: string;
  categoryName?: string | null;
  type: TransactionType;
  source: "import_confirmation" | "manual_recategorization" | "training_upload" | "manual_transaction_creation";
  confidence?: number;
  notes?: string | null;
}) => {
  const merchantKey = normalizeMerchantText(params.merchantText);
  const merchantTokens = tokenizeMerchant(params.merchantText);

  try {
    return await prisma.trainingSignal.create({
      data: {
        workspaceId: params.workspaceId,
        importFileId: params.importFileId ?? null,
        transactionId: params.transactionId ?? null,
        source: params.source,
        merchantKey,
        merchantTokens: merchantTokens as Prisma.InputJsonValue,
        categoryId: params.categoryId,
        categoryName: params.categoryName ?? null,
        type: params.type,
        confidence: params.confidence ?? 100,
        notes: params.notes ?? null,
      },
    });
  } catch (error) {
    if (isMissingDatabaseRelationError(error, "TrainingSignal")) {
      return null;
    }

    throw error;
  }
};

export const enrichParsedRowsWithTraining = async (params: {
  workspaceId: string;
  rows: ParsedImportRow[];
}) => {
  const trainingSignals = await loadTrainingSignals(params.workspaceId);

  return params.rows.map((row) => {
    const merchantText = row.merchantClean || row.merchantRaw || row.description || "";
    const learned = classifyMerchant({
      merchantText,
      type: row.type ?? "expense",
      categoryName: row.categoryName ?? null,
      trainingSignals,
    });

    const categoryName = learned.categoryName || row.categoryName || defaultCategoryForType(row.type ?? "expense");
    return {
      ...row,
      merchantClean: row.merchantClean || merchantText || undefined,
      categoryName,
      confidence: learned.confidence,
      categoryReason: learned.categoryReason,
      parserVersion: DATA_ENGINE_VERSION,
      rawPayload: {
        ...(row.rawPayload ?? {}),
        classification: {
          engineVersion: DATA_ENGINE_VERSION,
          merchantKey: learned.merchantKey,
          merchantTokens: learned.merchantTokens,
          categoryReason: learned.categoryReason,
          confidence: learned.confidence,
        },
      },
    } satisfies EnrichedParsedImportRow;
  });
};
