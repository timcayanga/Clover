import type { Prisma, TransactionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { detectStatementMetadata, type ParsedImportRow } from "@/lib/import-parser";

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
  const signals = await prisma.trainingSignal.findMany({
    where: { workspaceId },
    include: {
      category: true,
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

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
  return prisma.statementTemplate.upsert({
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
};

export const recordTrainingSignal = async (params: {
  workspaceId: string;
  importFileId?: string | null;
  transactionId?: string | null;
  merchantText: string;
  categoryId: string;
  categoryName?: string | null;
  type: TransactionType;
  source: "import_confirmation" | "manual_recategorization" | "training_upload";
  confidence?: number;
  notes?: string | null;
}) => {
  const merchantKey = normalizeMerchantText(params.merchantText);
  const merchantTokens = tokenizeMerchant(params.merchantText);

  return prisma.trainingSignal.create({
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
