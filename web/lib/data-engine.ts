import { Prisma } from "@prisma/client";
import type { AccountType, TransactionType } from "@prisma/client";
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

type MerchantRuleRow = {
  merchantKey: string;
  merchantPattern: string | null;
  normalizedName: string;
  categoryId: string | null;
  categoryName: string | null;
  source: string;
  confidence: number;
  timesConfirmed: number;
};

type AccountRuleRow = {
  ruleKey: string;
  accountId: string | null;
  accountName: string;
  institution: string | null;
  accountType: AccountType;
  source: string;
  confidence: number;
  timesConfirmed: number;
};

export type EnrichedParsedImportRow = ParsedImportRow & {
  institution?: string | null;
  accountNumber?: string | null;
  statementFingerprint?: string | null;
  parserVersion?: string;
  confidence?: number;
  categoryReason?: string | null;
  reviewStatus?: "pending_review" | "suggested" | "confirmed" | "edited" | "rejected" | "duplicate_skipped";
  parserConfidence?: number;
  categoryConfidence?: number;
  accountMatchConfidence?: number;
  duplicateConfidence?: number;
  transferConfidence?: number;
  rawPayload?: Prisma.InputJsonValue | null;
  normalizedPayload?: Prisma.InputJsonValue | null;
  learnedRuleIdsApplied?: Prisma.InputJsonValue | null;
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

const STATEMENT_TEMPLATE_COLUMNS = [
  "id",
  "workspaceId",
  "fingerprint",
  "fileType",
  "institution",
  "accountNumber",
  "accountName",
  "parserVersion",
  "parserConfig",
  "exampleCount",
  "successCount",
  "failureCount",
  "lastSeenAt",
  "metadata",
  "createdAt",
  "updatedAt",
] as const;

const MERCHANT_RULE_COLUMNS = [
  "id",
  "workspaceId",
  "merchantKey",
  "merchantPattern",
  "normalizedName",
  "categoryId",
  "categoryName",
  "source",
  "confidence",
  "timesConfirmed",
  "lastUsedAt",
  "createdAt",
  "updatedAt",
] as const;

const ACCOUNT_RULE_COLUMNS = [
  "id",
  "workspaceId",
  "accountId",
  "ruleKey",
  "accountName",
  "institution",
  "accountType",
  "source",
  "confidence",
  "timesConfirmed",
  "lastUsedAt",
  "createdAt",
  "updatedAt",
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

const TRAINING_SIGNAL_COLUMNS = [
  "id",
  "workspaceId",
  "importFileId",
  "transactionId",
  "source",
  "merchantKey",
  "merchantTokens",
  "categoryId",
  "categoryName",
  "type",
  "confidence",
  "notes",
  "createdAt",
] as const;

const TRANSACTION_COLUMNS = [
  "id",
  "workspaceId",
  "accountId",
  "importFileId",
  "categoryId",
  "reviewStatus",
  "parserConfidence",
  "categoryConfidence",
  "accountMatchConfidence",
  "duplicateConfidence",
  "transferConfidence",
  "rawPayload",
  "normalizedPayload",
  "learnedRuleIdsApplied",
  "date",
  "amount",
  "currency",
  "type",
  "merchantRaw",
  "merchantClean",
  "description",
  "isTransfer",
  "isExcluded",
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

export const normalizeAccountRuleKey = (accountName?: string | null, institution?: string | null) =>
  normalizeMerchantText(
    `${institution ?? ""} ${extractLastFourDigits(accountName) ?? normalizeWhitespace(String(accountName ?? ""))}`
  );

export const extractLastFourDigits = (value?: string | null) => {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, "");
  if (digits.length < 4) return null;
  return digits.slice(-4);
};

const getHardcodedCategoryOverride = (merchantText: string) => {
  const lower = merchantText.toLowerCase();
  const compact = normalizeWhitespace(merchantText).replace(/\s+/g, "").toLowerCase();

  if (/taxwithheld|withheldtax|tax withheld|withheld tax/.test(lower) || /taxwithheld|withheldtax/.test(compact)) {
    return "Financial";
  }

  if (/instapay\s*transfer\s*fee|instapaytransferfee/.test(lower) || /instapaytransferfee/.test(compact)) {
    return "Transfers";
  }

  return null;
};

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
  const override = getHardcodedCategoryOverride(description);
  if (override) return override;
  if (type === "income" || /salary|payroll|income|deposit|credit memo/.test(lower)) return "Income";
  if (/transfer|instapay|pesonet|wise to|to savings|to checking/.test(lower)) return "Transfers";
  if (/grocery|supermarket|market|food|dining|restaurant|coffee|cafe|meal|takeout/.test(lower)) return "Food & Dining";
  if (/grab|uber|taxi|bus|train|parking|gas|fuel|transport|ride/.test(lower)) return "Transport";
  if (/rent|mortgage|apartment|housing/.test(lower)) return "Housing";
  if (/bill|utilities|electric|water|internet|phone|subscription|openai|netflix|spotify/.test(lower)) return "Bills & Utilities";
  if (/travel|airbnb|hotel|airline|flight|tour|holiday/.test(lower)) return "Travel & Lifestyle";
  if (/entertainment|movie|cinema|theater|theatre|concert|show|ticket|tickets|game|gaming|arcade|karaoke|amusement|disney|steam|playstation|xbox/.test(lower))
    return "Entertainment";
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
const tableExistsCache = new Map<string, boolean>();

export const hasCompatibleTable = async (tableName: string) => {
  const cached = tableExistsCache.get(tableName);
  if (typeof cached === "boolean") {
    return cached;
  }

  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${tableName}
    ) AS "exists"
  `;

  const exists = Boolean(rows[0]?.exists);
  tableExistsCache.set(tableName, exists);
  return exists;
};

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

export const getCompatibleTrainingSignalColumns = async () => {
  const cacheKey = "TrainingSignal";
  const cached = columnCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'TrainingSignal'
  `;

  const existing = new Set(columns.map((column) => column.column_name));
  const compatible = TRAINING_SIGNAL_COLUMNS.filter((column) => existing.has(column));
  columnCache.set(cacheKey, compatible as string[]);
  return compatible as string[];
};

export const getCompatibleTransactionColumns = async () => {
  const cacheKey = "Transaction";
  const cached = columnCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Transaction'
  `;

  const existing = new Set(columns.map((column) => column.column_name));
  const compatible = TRANSACTION_COLUMNS.filter((column) => existing.has(column));
  columnCache.set(cacheKey, compatible as string[]);
  return compatible as string[];
};

export const getCompatibleStatementTemplateColumns = async () => {
  const cacheKey = "StatementTemplate";
  const cached = columnCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'StatementTemplate'
  `;

  const existing = new Set(columns.map((column) => column.column_name));
  const compatible = STATEMENT_TEMPLATE_COLUMNS.filter((column) => existing.has(column));
  columnCache.set(cacheKey, compatible as string[]);
  return compatible as string[];
};

export const getCompatibleMerchantRuleColumns = async () => {
  const cacheKey = "MerchantRule";
  const cached = columnCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'MerchantRule'
  `;

  const existing = new Set(columns.map((column) => column.column_name));
  const compatible = MERCHANT_RULE_COLUMNS.filter((column) => existing.has(column));
  columnCache.set(cacheKey, compatible as string[]);
  return compatible as string[];
};

export const getCompatibleAccountRuleColumns = async () => {
  const cacheKey = "AccountRule";
  const cached = columnCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'AccountRule'
  `;

  const existing = new Set(columns.map((column) => column.column_name));
  const compatible = ACCOUNT_RULE_COLUMNS.filter((column) => existing.has(column));
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

export const deleteTransactionsByImportFileCompat = async (importFileId: string) => {
  const columns = new Set(await getCompatibleTransactionColumns());
  if (!columns.has("importFileId")) {
    return;
  }

  await prisma.$executeRawUnsafe(`DELETE FROM "Transaction" WHERE "importFileId" = $1`, importFileId);
};

export const countTransactionsByImportFileCompat = async (importFileId: string) => {
  const columns = new Set(await getCompatibleTransactionColumns());
  if (!columns.has("importFileId")) {
    return 0;
  }

  const result = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*)::bigint AS count FROM "Transaction" WHERE "importFileId" = $1`,
    importFileId
  );
  return Number(result[0]?.count ?? 0n);
};

type TransactionInsertParams = {
  workspaceId: string;
  accountId: string;
  importFileId?: string | null;
  categoryId?: string | null;
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
};

const buildTransactionInsertRecord = async (params: TransactionInsertParams, columns?: Set<string>) => {
  const columnSet = columns ?? new Set(await getCompatibleTransactionColumns());
  const record: Record<string, unknown> = {};
  const amount = parseAmountValue(typeof params.amount === "number" ? String(params.amount) : params.amount ?? null);

  if (amount === null) {
    throw new Error("Invalid transaction amount.");
  }

  if (columnSet.has("id")) record.id = crypto.randomUUID();
  if (columnSet.has("workspaceId")) record.workspaceId = params.workspaceId;
  if (columnSet.has("accountId")) record.accountId = params.accountId;
  if (columnSet.has("importFileId") && params.importFileId !== undefined) record.importFileId = params.importFileId ?? null;
  if (columnSet.has("categoryId")) record.categoryId = params.categoryId ?? null;
  if (columnSet.has("reviewStatus")) record.reviewStatus = params.reviewStatus ?? "suggested";
  if (columnSet.has("parserConfidence")) record.parserConfidence = params.parserConfidence ?? 0;
  if (columnSet.has("categoryConfidence")) record.categoryConfidence = params.categoryConfidence ?? 0;
  if (columnSet.has("accountMatchConfidence")) record.accountMatchConfidence = params.accountMatchConfidence ?? 0;
  if (columnSet.has("duplicateConfidence")) record.duplicateConfidence = params.duplicateConfidence ?? 0;
  if (columnSet.has("transferConfidence")) record.transferConfidence = params.transferConfidence ?? 0;
  if (columnSet.has("rawPayload")) record.rawPayload = params.rawPayload ?? null;
  if (columnSet.has("normalizedPayload")) record.normalizedPayload = params.normalizedPayload ?? null;
  if (columnSet.has("learnedRuleIdsApplied")) record.learnedRuleIdsApplied = params.learnedRuleIdsApplied ?? null;
  if (columnSet.has("date")) record.date = params.date;
  if (columnSet.has("amount")) record.amount = amount;
  if (columnSet.has("currency")) record.currency = params.currency;
  if (columnSet.has("type")) record.type = params.type;
  if (columnSet.has("merchantRaw")) record.merchantRaw = params.merchantRaw;
  if (columnSet.has("merchantClean")) record.merchantClean = params.merchantClean ?? null;
  if (columnSet.has("description")) record.description = params.description ?? null;
  if (columnSet.has("isTransfer")) record.isTransfer = params.isTransfer ?? false;
  if (columnSet.has("isExcluded")) record.isExcluded = params.isExcluded ?? false;
  if (columnSet.has("createdAt")) record.createdAt = new Date();
  if (columnSet.has("updatedAt")) record.updatedAt = new Date();

  return {
    record,
    amount,
  };
};

export const insertTransactionCompat = async (params: TransactionInsertParams) => {
  const columns = new Set(await getCompatibleTransactionColumns());
  const { record } = await buildTransactionInsertRecord(params, columns);
  const keys = Object.keys(record);
  if (keys.length === 0) {
    return null;
  }

  const values = keys.map((key) => record[key] ?? null);
  const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Transaction" (${keys.map((key) => `"${key}"`).join(", ")}) VALUES (${placeholders})`,
    ...values
  );

  return record;
};

export const insertTransactionManyCompat = async (params: {
  records: Record<string, unknown>[];
}) => {
  if (params.records.length === 0) {
    return [];
  }

  await prisma.transaction.createMany({
    data: params.records as Prisma.TransactionCreateManyInput[],
  });

  return params.records;
};

export const buildParsedTransactionInsertData = async (params: {
  importFileId: string;
  workspaceId: string;
  rows: EnrichedParsedImportRow[];
  metadata: ReturnType<typeof detectStatementMetadataFromText>;
  statementFingerprint: string;
}) => {
  const columns = new Set(await getCompatibleParsedTransactionColumns());

  return params.rows.flatMap((row) => {
    const amount = parseAmountValue(row.amount ?? null);
    if (amount === null) {
      return [];
    }

    const record: Record<string, unknown> = {};
    if (columns.has("id")) record.id = crypto.randomUUID();
    if (columns.has("importFileId")) record.importFileId = params.importFileId;
    if (columns.has("workspaceId")) record.workspaceId = params.workspaceId;
    if (columns.has("institution")) record.institution = params.metadata.institution;
    if (columns.has("accountNumber")) record.accountNumber = params.metadata.accountNumber;
    if (columns.has("accountName")) record.accountName = row.accountName ?? null;
    if (columns.has("date")) record.date = parseDateValue(row.date ?? null);
    if (columns.has("amount")) record.amount = amount;
    if (columns.has("merchantRaw")) record.merchantRaw = row.merchantRaw ?? null;
    if (columns.has("merchantClean")) record.merchantClean = row.merchantClean ?? row.merchantRaw ?? null;
    if (columns.has("type")) record.type = row.type ?? "expense";
    if (columns.has("categoryName")) record.categoryName = row.categoryName ?? defaultCategoryForType(row.type ?? "expense");
    if (columns.has("confidence")) record.confidence = row.confidence ?? 0;
    if (columns.has("categoryReason")) record.categoryReason = row.categoryReason ?? null;
    if (columns.has("parserVersion")) record.parserVersion = row.parserVersion ?? DATA_ENGINE_VERSION;
    if (columns.has("statementFingerprint")) record.statementFingerprint = params.statementFingerprint;
    if (columns.has("rawPayload")) record.rawPayload = (row.rawPayload ?? {}) as Prisma.InputJsonValue;
    if (columns.has("reviewStatus")) record.reviewStatus = row.reviewStatus ?? "suggested";
    if (columns.has("parserConfidence")) record.parserConfidence = row.parserConfidence ?? row.confidence ?? 0;
    if (columns.has("categoryConfidence")) record.categoryConfidence = row.categoryConfidence ?? row.confidence ?? 0;
    if (columns.has("accountMatchConfidence")) record.accountMatchConfidence = row.accountMatchConfidence ?? 0;
    if (columns.has("duplicateConfidence")) record.duplicateConfidence = row.duplicateConfidence ?? 0;
    if (columns.has("transferConfidence")) record.transferConfidence = row.transferConfidence ?? 0;
    if (columns.has("normalizedPayload")) record.normalizedPayload = (row.normalizedPayload ?? null) as Prisma.InputJsonValue | null;
    if (columns.has("learnedRuleIdsApplied")) record.learnedRuleIdsApplied = (row.learnedRuleIdsApplied ?? null) as Prisma.InputJsonValue | null;
    if (columns.has("createdAt")) record.createdAt = new Date();
    return [record];
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

export const loadMerchantRules = async (workspaceId: string) => {
  let rules: Array<{
    merchantKey: string;
    merchantPattern: string | null;
    normalizedName: string;
    categoryId: string | null;
    categoryName: string | null;
    source: string;
    confidence: number;
    timesConfirmed: number;
    category: { name: string } | null;
  }> = [];

  try {
    rules = await prisma.merchantRule.findMany({
      where: { workspaceId },
      include: {
        category: true,
      },
      orderBy: [{ timesConfirmed: "desc" }, { updatedAt: "desc" }],
      take: 500,
    });
  } catch (error) {
    if (!isMissingDatabaseRelationError(error, "MerchantRule")) {
      throw error;
    }
  }

  return rules.map((rule) => ({
    merchantKey: rule.merchantKey,
    merchantPattern: rule.merchantPattern,
    normalizedName: rule.normalizedName,
    categoryId: rule.categoryId,
    categoryName: rule.category?.name ?? rule.categoryName ?? null,
    source: rule.source,
    confidence: rule.confidence,
    timesConfirmed: rule.timesConfirmed,
  }));
};

export const loadAccountRules = async (workspaceId: string) => {
  let rules: Array<{
    ruleKey: string;
    accountId: string | null;
    accountName: string;
    institution: string | null;
    accountType: AccountType;
    source: string;
    confidence: number;
    timesConfirmed: number;
  }> = [];

  try {
    rules = await prisma.accountRule.findMany({
      where: { workspaceId },
      orderBy: [{ timesConfirmed: "desc" }, { updatedAt: "desc" }],
      take: 250,
    });
  } catch (error) {
    if (!isMissingDatabaseRelationError(error, "AccountRule")) {
      throw error;
    }
  }

  return rules.map((rule) => ({
    ruleKey: rule.ruleKey,
    accountId: rule.accountId,
    accountName: rule.accountName,
    institution: rule.institution,
    accountType: rule.accountType,
    source: rule.source,
    confidence: rule.confidence,
    timesConfirmed: rule.timesConfirmed,
  }));
};

export const upsertMerchantRule = async (params: {
  workspaceId: string;
  merchantText: string;
  normalizedName: string;
  categoryId: string;
  categoryName?: string | null;
  source: string;
  confidence?: number;
}) => {
  const merchantKey = normalizeMerchantText(params.merchantText);

  try {
    return await prisma.merchantRule.upsert({
      where: {
        workspaceId_merchantKey: {
          workspaceId: params.workspaceId,
          merchantKey,
        },
      },
      update: {
        merchantPattern: params.merchantText.trim(),
        normalizedName: params.normalizedName.trim(),
        categoryId: params.categoryId,
        categoryName: params.categoryName ?? null,
        source: params.source,
        confidence: params.confidence ?? 100,
        timesConfirmed: { increment: 1 },
        lastUsedAt: new Date(),
      },
      create: {
        workspaceId: params.workspaceId,
        merchantKey,
        merchantPattern: params.merchantText.trim(),
        normalizedName: params.normalizedName.trim(),
        categoryId: params.categoryId,
        categoryName: params.categoryName ?? null,
        source: params.source,
        confidence: params.confidence ?? 100,
        timesConfirmed: 1,
        lastUsedAt: new Date(),
      },
    });
  } catch (error) {
    if (isMissingDatabaseRelationError(error, "MerchantRule")) {
      return null;
    }

    throw error;
  }
};

export const upsertAccountRule = async (params: {
  workspaceId: string;
  accountId?: string | null;
  accountName: string;
  institution?: string | null;
  accountType: AccountType;
  source: string;
  confidence?: number;
}) => {
  const ruleKey = normalizeAccountRuleKey(params.accountName, params.institution);

  try {
    return await prisma.accountRule.upsert({
      where: {
        workspaceId_ruleKey: {
          workspaceId: params.workspaceId,
          ruleKey,
        },
      },
      update: {
        accountId: params.accountId ?? null,
        accountName: params.accountName.trim(),
        institution: params.institution?.trim() || null,
        accountType: params.accountType,
        source: params.source,
        confidence: params.confidence ?? 100,
        timesConfirmed: { increment: 1 },
        lastUsedAt: new Date(),
      },
      create: {
        workspaceId: params.workspaceId,
        accountId: params.accountId ?? null,
        ruleKey,
        accountName: params.accountName.trim(),
        institution: params.institution?.trim() || null,
        accountType: params.accountType,
        source: params.source,
        confidence: params.confidence ?? 100,
        timesConfirmed: 1,
        lastUsedAt: new Date(),
      },
    });
  } catch (error) {
    if (isMissingDatabaseRelationError(error, "AccountRule")) {
      return null;
    }

    throw error;
  }
};

const scoreAccountRule = (
  accountName: string | null | undefined,
  institution: string | null | undefined,
  rule: AccountRuleRow
) => {
  const normalizedRuleKey = normalizeAccountRuleKey(rule.accountName, rule.institution);
  const normalizedInputKey = normalizeAccountRuleKey(accountName, institution);
  if (normalizedRuleKey === normalizedInputKey) {
    return 120 + rule.confidence + rule.timesConfirmed * 2;
  }

  const inputName = normalizeMerchantText(accountName ?? "");
  const ruleName = normalizeMerchantText(rule.accountName);
  const inputTokens = new Set(tokenizeMerchant(accountName ?? ""));
  const ruleTokens = tokenizeMerchant(rule.accountName);
  const ruleTokenSet = new Set(ruleTokens);
  let overlap = 0;

  for (const token of inputTokens) {
    if (ruleTokenSet.has(token)) {
      overlap += 1;
    }
  }

  if (overlap === 0 && inputName !== ruleName) {
    return 0;
  }

  return overlap * 22 + rule.confidence * 0.75 + rule.timesConfirmed;
};

const findBestAccountRule = (
  accountName: string | null | undefined,
  institution: string | null | undefined,
  accountRules: AccountRuleRow[]
) => {
  let bestRule: AccountRuleRow | null = null;
  let bestScore = 0;

  for (const rule of accountRules) {
    const score = scoreAccountRule(accountName, institution, rule);
    if (score > bestScore) {
      bestScore = score;
      bestRule = rule;
    }
  }

  return bestRule && bestScore >= 20
    ? {
        rule: bestRule,
        score: bestScore,
        exact: normalizeAccountRuleKey(bestRule.accountName, bestRule.institution) === normalizeAccountRuleKey(accountName, institution),
      }
    : null;
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

export const findExistingImportedStatement = async (params: {
  workspaceId: string;
  statementFingerprint: string;
  importFileId?: string | null;
}) => {
  const parsedColumns = new Set(await getCompatibleParsedTransactionColumns());
  const importFileColumns = new Set(await getCompatibleImportFileColumns());
  const supportsStatusGate = importFileColumns.has("status") || importFileColumns.has("confirmedAt");

  if (parsedColumns.has("statementFingerprint") && parsedColumns.has("workspaceId") && supportsStatusGate) {
    const supportsImportFileId = parsedColumns.has("importFileId");
    const completedGateParts: string[] = [];
    if (importFileColumns.has("confirmedAt")) {
      completedGateParts.push(`i."confirmedAt" IS NOT NULL`);
    } else if (importFileColumns.has("status")) {
      completedGateParts.push(`i."status" = 'done'`);
    }

    if (completedGateParts.length > 0 && supportsImportFileId) {
      const rows = await prisma.$queryRawUnsafe<Array<{ importFileId: string | null }>>(
        `SELECT DISTINCT pt."importFileId" FROM "ParsedTransaction" pt INNER JOIN "ImportFile" i ON i."id" = pt."importFileId" LEFT JOIN "Account" a ON a."id" = i."accountId" WHERE pt."workspaceId" = $1 AND pt."statementFingerprint" = $2${params.importFileId ? ' AND pt."importFileId" <> $3' : ""} AND (${completedGateParts.join(" OR ")}) AND i."accountId" IS NOT NULL AND a."id" IS NOT NULL LIMIT 1`,
        ...(params.importFileId ? [params.workspaceId, params.statementFingerprint, params.importFileId] : [params.workspaceId, params.statementFingerprint])
      );

      if (rows.length > 0 && rows[0]?.importFileId !== null) {
        return rows[0]?.importFileId ?? "__duplicate__";
      }
    }
  }

  return null;
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

const scoreMerchantRule = (tokens: string[], normalizedMerchant: string, rule: MerchantRuleRow) => {
  if (rule.merchantKey === normalizedMerchant) {
    return 120 + rule.confidence;
  }

  const ruleTokens = tokenizeMerchant(rule.merchantPattern || rule.normalizedName || rule.merchantKey);
  const ruleTokenSet = new Set(ruleTokens);
  let overlap = 0;

  for (const token of tokens) {
    if (ruleTokenSet.has(token)) {
      overlap += 1;
    }
  }

  if (overlap === 0) {
    return 0;
  }

  return overlap * 20 + rule.confidence * 0.75 + rule.timesConfirmed;
};

export const classifyMerchant = (params: {
  merchantText: string;
  type: TransactionType;
  categoryName?: string | null;
  merchantRules: MerchantRuleRow[];
  trainingSignals: TrainingSignalRow[];
}) => {
  const tokens = tokenizeMerchant(params.merchantText);
  const normalizedMerchant = normalizeMerchantText(params.merchantText);
  const hardcodedOverride = getHardcodedCategoryOverride(params.merchantText);
  if (hardcodedOverride) {
    return {
      categoryName: hardcodedOverride,
      confidence: 99,
      categoryReason: "hardcoded-override",
      merchantKey: normalizedMerchant,
      merchantTokens: tokens,
    };
  }
  const heuristicCategory = params.categoryName?.trim() || guessCategoryFallback(params.merchantText, params.type);

  let bestRule: MerchantRuleRow | null = null;
  let bestRuleScore = 0;
  let bestSignal: TrainingSignalRow | null = null;
  let bestScore = 0;

  for (const rule of params.merchantRules) {
    const score = scoreMerchantRule(tokens, normalizedMerchant, rule);
    if (score > bestRuleScore) {
      bestRuleScore = score;
      bestRule = rule;
    }
  }

  if (bestRule && bestRuleScore >= 20) {
    const learnedCategory = bestRule.categoryName ?? heuristicCategory;
    const exact = bestRule.merchantKey === normalizedMerchant;
    return {
      categoryName: learnedCategory,
      confidence: Math.min(99, Math.round(Math.max(78, bestRuleScore))),
      categoryReason: exact ? "rule-exact" : "rule-pattern",
      merchantKey: normalizedMerchant,
      merchantTokens: tokens,
    };
  }

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
  const columns = await getCompatibleTrainingSignalColumns();
  if (columns.length === 0) {
    return [];
  }

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
  fileType?: string | null;
  parserConfig?: Prisma.InputJsonValue | null;
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
        fileType: params.fileType ?? null,
        institution: params.metadata.institution,
        accountNumber: params.metadata.accountNumber,
        accountName: params.metadata.accountName,
        parserConfig: params.parserConfig ?? Prisma.DbNull,
        metadata: params.metadata as Prisma.InputJsonValue,
        exampleCount: { increment: 1 },
        successCount: { increment: 1 },
        lastSeenAt: new Date(),
      },
      create: {
        workspaceId: params.workspaceId,
        fingerprint: params.fingerprint,
        fileType: params.fileType ?? null,
        institution: params.metadata.institution,
        accountNumber: params.metadata.accountNumber,
        accountName: params.metadata.accountName,
        parserConfig: params.parserConfig ?? Prisma.DbNull,
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

  const columns = await getCompatibleTrainingSignalColumns();
  if (columns.length === 0) {
    return null;
  }

  const signal = await prisma.trainingSignal.create({
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

  const category = await prisma.category.findUnique({
    where: { id: params.categoryId },
  });

  if (category) {
    await upsertMerchantRule({
      workspaceId: params.workspaceId,
      merchantText: params.merchantText,
      normalizedName: params.merchantText,
      categoryId: params.categoryId,
      categoryName: params.categoryName ?? category.name,
      source: params.source,
      confidence: params.confidence ?? 100,
    });
  }

  return signal;
};

export const enrichParsedRowsWithTraining = async (params: {
  workspaceId: string;
  rows: ParsedImportRow[];
}) => {
  const merchantRules = await loadMerchantRules(params.workspaceId);
  const accountRules = await loadAccountRules(params.workspaceId);
  const trainingSignals = await loadTrainingSignals(params.workspaceId);

  return params.rows.map((row) => {
    const rowWithInstitution = row as ParsedImportRow & { institution?: string | null };
    const merchantText = row.merchantClean || row.merchantRaw || row.description || "";
    const accountMatch = findBestAccountRule(row.accountName ?? null, rowWithInstitution.institution ?? null, accountRules);
    const learned = classifyMerchant({
      merchantText,
      type: row.type ?? "expense",
      categoryName: row.categoryName ?? null,
      merchantRules,
      trainingSignals,
    });

    const categoryName = learned.categoryName || row.categoryName || defaultCategoryForType(row.type ?? "expense");
    const accountName = row.accountName ?? null;
    const learnedRuleIdsApplied = [
      ...(Array.isArray(row.learnedRuleIdsApplied) ? (row.learnedRuleIdsApplied as string[]) : []),
      ...(accountMatch ? [`account-rule:${accountMatch.rule.ruleKey}`] : []),
    ];
    return {
      ...row,
      merchantClean: row.merchantClean || merchantText || undefined,
      accountName: accountMatch?.rule.accountName ?? accountName ?? undefined,
      institution: rowWithInstitution.institution ?? accountMatch?.rule.institution ?? undefined,
      categoryName,
      confidence: learned.confidence,
      categoryReason: learned.categoryReason,
      parserVersion: DATA_ENGINE_VERSION,
      reviewStatus: learned.confidence >= 80 ? "suggested" : "pending_review",
      parserConfidence: 100,
      categoryConfidence: learned.confidence,
      accountMatchConfidence: accountMatch ? Math.min(99, Math.round(Math.max(70, accountMatch.score))) : 0,
      duplicateConfidence: 0,
      transferConfidence: row.type === "transfer" ? 100 : 0,
      learnedRuleIdsApplied,
      normalizedPayload: {
        merchantClean: row.merchantClean || merchantText || null,
        categoryName,
        type: row.type ?? "expense",
        accountName: accountMatch?.rule.accountName ?? accountName ?? null,
        institution: row.institution ?? accountMatch?.rule.institution ?? null,
      } as Prisma.InputJsonValue,
      rawPayload: {
        ...(row.rawPayload ?? {}),
        classification: {
          engineVersion: DATA_ENGINE_VERSION,
          merchantKey: learned.merchantKey,
          merchantTokens: learned.merchantTokens,
          categoryReason: learned.categoryReason,
          confidence: learned.confidence,
          accountRuleKey: accountMatch?.rule.ruleKey ?? null,
          accountRuleConfidence: accountMatch ? Math.round(accountMatch.score) : null,
        },
      },
    } satisfies EnrichedParsedImportRow;
  });
};
