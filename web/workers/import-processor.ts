import type { AccountType, Prisma, TransactionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { capturePostHogServerEvent } from "@/lib/analytics";
import { recordDataQaRun, type DataQaParsedRow, type DataQaSource } from "@/lib/data-qa";
import { deriveReconciledBalance, type BalanceLikeTransaction } from "@/lib/account-balance";
import { countNonCashAccounts, getWorkspaceOwnerLimits } from "@/lib/plan-access";
import { parseAmountValue, parseDateValue, parseImportText } from "@/lib/import-parser";
import { readImportedFileImageDataUrls, readImportedFileText, readImportedPdfPageImages } from "@/lib/import-file-text.server";
import {
  DATA_ENGINE_VERSION,
  applyDataQaReviewLearning,
  buildParsedTransactionInsertData,
  buildStatementFingerprint,
  detectStatementMetadataFromText,
  type EnrichedParsedImportRow,
  findExistingImportedStatement,
  fetchImportFileCompat,
  fetchParsedTransactionRows,
  enrichParsedRowsWithTraining,
  defaultCategoryForType,
  replaceDocumentImportPagesCompat,
  upsertDocumentImportCompat,
  upsertInvestmentSnapshotCompat,
  replaceInvestmentHoldingsCompat,
  upsertReceiptDocumentCompat,
  getCompatibleImportFileColumns,
  insertParsedTransactionsCompat,
  hasCompatibleTable,
  recordTrainingSignal,
  loadStatementTemplate,
  mergeStatementMetadataWithTemplate,
  updateImportFileCompat,
  upsertAccountRule,
  upsertStatementTemplate,
} from "@/lib/data-engine";
import { getTrailingBalanceFromParsedRows, inferAccountTypeFromStatement } from "@/lib/import-parser";
import { parseImportTextWithOpenAIFallback, transcribeImportImagesWithOpenAI } from "@/lib/openai-import-parser";
import { isMissingAccountNumberColumnError, omitAccountNumberField } from "@/lib/account-column-compat";
import { toInternalTransactionType } from "@/lib/transaction-directions";
import { normalizeBankName } from "@/lib/data-qa-banks";
import { normalizeImportImageMode, type ImportImageMode } from "@/lib/import-image-mode";
import { normalizeImportedAccountKey } from "@/lib/workspace-cache";

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
  amount?: unknown;
  type?: unknown;
  merchantRaw?: unknown;
  merchantClean?: unknown;
  description?: unknown;
  categoryName?: unknown;
  rawPayload?: unknown;
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
    notes: string | null;
  };
};

type ProcessImportResult = {
  imported: number;
  duplicate: boolean;
  metadata: ReturnType<typeof detectStatementMetadataFromText>;
  accountId?: string | null;
  confirmedTransactionsCount?: number | null;
  insightSummary?: ImportInsightSummary;
  accountBalance?: string | null;
  status?: "done" | "staged";
};

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

const shouldRouteToReview = (params: { confidence: number; categoryName?: string | null; type?: string | null }) => {
  if (params.confidence < 90) {
    return true;
  }

  if (!params.type) {
    return true;
  }

  return false;
};

const countRowsWithParseableDates = (rows: Array<{ date?: string | null }>) =>
  rows.reduce((count, row) => (parseDateValue(row.date ?? null) ? count + 1 : count), 0);

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

const readCheckpointImportMode = (sourceMetadata: unknown): ImportImageMode | null => {
  if (!isRecord(sourceMetadata)) {
    return null;
  }

  return normalizeImportImageMode(sourceMetadata.importMode);
};

const normalizeStatementImageOcrText = (text: string) => {
  const lines = text
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
const AUTO_REPARSE_MAX_ATTEMPTS = 12;
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
  const paymentDueDate = readCandidateString(objects, ["paymentDueDate", "dueDate", "payment_date"]);
  const totalAmountDue = readCandidateNumber(objects, ["paymentAmountDue", "amountDue", "totalAmountDue", "minimumAmountDue"]);
  const startDate = readCandidateString(objects, ["statementStartDate", "startDate", "periodStart", "fromDate"]);
  const endDate = readCandidateString(objects, ["statementEndDate", "endDate", "periodEnd", "toDate"]);
  const sourceText =
    readCandidateString(objects, ["statementText", "sourceText", "rawText", "ocrText", "rawStatementText"]) ??
    jsonText;

  const detectedMetadata = detectStatementMetadataFromText(sourceText);
  const metadata = {
    ...detectedMetadata,
    institution: institution ?? detectedMetadata.institution ?? null,
    accountNumber: accountNumber ?? detectedMetadata.accountNumber ?? null,
    accountName: accountName ?? detectedMetadata.accountName ?? null,
    accountType: (accountType || detectedMetadata.accountType || null) as typeof detectedMetadata.accountType,
    openingBalance: openingBalance ?? detectedMetadata.openingBalance ?? null,
    endingBalance: endingBalance ?? detectedMetadata.endingBalance ?? null,
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
        ? `JSON training file processed and replayed ${replaySummary.replayed} related file${replaySummary.replayed === 1 ? "" : "s"}.`
        : "JSON training file processed and applied to the learning loop.",
  });

  return {
    imported: parsed.rows.length,
    duplicate: false,
    metadata,
  };
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

const resolveConfirmationAccount = async (params: {
  importFile: { workspaceId: unknown; fileName?: unknown };
  statementMetadata?: {
    accountName?: unknown;
    institution?: unknown;
    accountType?: unknown;
    accountNumber?: unknown;
    currency?: unknown;
  } | null;
  parsedRows: Array<{
    accountName?: unknown;
    institution?: unknown;
  }>;
  accountId?: string | null;
  planLimits?: {
    accountLimit: number | null;
  } | null;
}) => {
  const workspaceId = String(params.importFile.workspaceId);
  const compatibleAccountColumns = await getCompatibleAccountColumns();
  const updateAccountIdentity = async (
    account: {
      id: string;
      name: string;
      institution: string | null;
      accountNumber: string | null;
      type: AccountType;
      source?: string | null;
      currency: string | null;
    },
    next: {
      name?: string | null;
      institution?: string | null;
      accountNumber?: string | null;
      type?: AccountType | null;
      currency?: string | null;
    }
  ) => {
    const data: Record<string, unknown> = {};
    if (typeof next.name === "string" && next.name.trim() && next.name.trim() !== account.name) {
      data.name = next.name.trim();
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
    if (next.currency && next.currency !== account.currency && account.source !== "manual") {
      data.currency = next.currency;
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
  const candidateRow =
    (typeof params.statementMetadata?.accountName === "string" && params.statementMetadata.accountName.trim()
      ? params.statementMetadata
      : null) ??
    (typeof params.statementMetadata?.institution === "string" && params.statementMetadata.institution.trim()
      ? params.statementMetadata
      : null) ??
    params.parsedRows.find((row) => typeof row.accountName === "string" && row.accountName.trim()) ??
    params.parsedRows.find((row) => typeof row.institution === "string" && row.institution.trim()) ??
    null;

  const inferredAccountName =
    typeof candidateRow?.accountName === "string" && candidateRow.accountName.trim()
      ? String(candidateRow.accountName).trim()
      : typeof candidateRow?.institution === "string" && candidateRow.institution.trim()
        ? candidateRow.institution.trim()
        : null;

  const inferredInstitution =
    typeof candidateRow?.institution === "string" && candidateRow.institution.trim()
      ? candidateRow.institution.trim()
      : null;
  const inferredAccountNumber =
    typeof params.statementMetadata?.accountNumber === "string" && params.statementMetadata.accountNumber.trim()
      ? params.statementMetadata.accountNumber.trim()
      : null;
  const inferredAccountType =
    typeof params.statementMetadata?.accountType === "string" &&
    ["bank", "wallet", "credit_card", "cash", "investment", "other"].includes(params.statementMetadata.accountType)
      ? (params.statementMetadata.accountType as "bank" | "wallet" | "credit_card" | "cash" | "investment" | "other")
      : null;
  const inferredCurrency =
    typeof params.statementMetadata?.currency === "string" && params.statementMetadata.currency.trim()
      ? params.statementMetadata.currency.trim().toUpperCase()
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
    return updateAccountIdentity(directAccount, {
      name: inferredAccountName,
      institution: inferredInstitution,
      accountNumber: inferredAccountNumber,
      type: inferredAccountType,
      currency: inferredCurrency,
    });
  }

  const accountIdentityType =
    inferredAccountType ?? inferAccountTypeFromStatement(inferredInstitution, inferredAccountName ?? inferredAccountNumber, "bank");
  const candidateKey = normalizeImportedAccountKey(
    inferredAccountName || inferredAccountNumber || String(params.importFile.fileName ?? null),
    inferredInstitution,
    inferredAccountNumber,
    accountIdentityType
  );

  const workspaceAccounts = await prisma.account.findMany({
    where: { workspaceId },
    select: getCompatibleAccountSelect(compatibleAccountColumns),
  });
  const existingByKey = workspaceAccounts.find(
    (account) => normalizeImportedAccountKey(account.name, account.institution, account.accountNumber, account.type) === candidateKey
  );
  if (existingByKey) {
    return updateAccountIdentity(existingByKey, {
      name: inferredAccountName,
      institution: inferredInstitution,
      accountNumber: inferredAccountNumber,
      type: accountIdentityType,
      currency: inferredCurrency,
    });
  }

  if (inferredAccountName || inferredAccountNumber) {
    const nonCashAccountCount = countNonCashAccounts(workspaceAccounts);
    if (params.planLimits?.accountLimit != null && accountIdentityType !== "cash" && nonCashAccountCount >= params.planLimits.accountLimit) {
      throw new Error(
        `Free plan includes up to ${params.planLimits.accountLimit} non-cash accounts. Upgrade to Pro to add more accounts from imports.`
      );
    }

    const compatibleAccountColumns = await getCompatibleAccountColumns();
      const accountData = {
        workspaceId,
        name:
          inferredAccountName ??
          (inferredInstitution && inferredAccountNumber
            ? `${inferredInstitution} ${inferredAccountNumber.slice(-4)}`
            : null),
        institution: inferredInstitution,
        ...(compatibleAccountColumns.has("accountNumber") && inferredAccountNumber
          ? { accountNumber: inferredAccountNumber }
          : {}),
        type: accountIdentityType,
        currency: inferredCurrency ?? "PHP",
        source: "upload",
      };

      if (!accountData.name) {
        return null;
      }

    try {
      return await prisma.account.create({
        data: accountData,
        select: getCompatibleAccountSelect(compatibleAccountColumns),
      });
    } catch (error) {
      if (Object.prototype.hasOwnProperty.call(accountData, "accountNumber") && isMissingAccountNumberColumnError(error)) {
        return prisma.account.create({
          data: omitAccountNumberField(accountData),
          select: getCompatibleAccountSelect(compatibleAccountColumns),
        });
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

export const processImportFileText = async (
  importFileId: string,
  options: {
    text?: string;
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
  const importMode = readCheckpointImportMode(statementCheckpoint?.sourceMetadata) ?? options.importMode ?? "statement";
  const isDocumentImportMode =
    importMode === "receipt" || importMode === "portfolio" || importMode === "account_detail" || importMode === "notes";

  await updateImportFileCompat(importFileId, {
    status: "processing",
    processingPhase: autoRerunAttempt > 0 ? "auto_rerunning" : "parsing",
    processingAttempt: autoRerunAttempt,
    processingTargetScore: autoRerunEnabled ? AUTO_REPARSE_SCORE_TARGET : null,
    processingCurrentScore: null,
    processingMessage:
      autoRerunAttempt > 0
        ? `Auto-rerun ${autoRerunAttempt}/${AUTO_REPARSE_MAX_ATTEMPTS} running...`
        : "Parsing file...",
  });

  const fileType = String(importFile.fileType ?? "");
  const fileName = String(importFile.fileName ?? "");
  const imageImport = isImageImportFile(fileType, fileName);
  const isDocumentImport = isDocumentImportMode || (imageImport && importMode !== "statement");
  let text = options.text ?? "";
  let pageImages: Array<{ page: number; dataUrl: string }> | null = null;

  if (imageImport || !text) {
    const storageKey = String(importFile.storageKey ?? "");
    if (!storageKey) {
      throw new Error("Missing imported file.");
    }

    if (imageImport) {
      pageImages = await readImportedFileImageDataUrls({
        storageKey,
        fileType,
        fileName,
      });
    }

    if (!text) {
      try {
        text = await readImportedFileText(
          {
            storageKey,
            fileType,
            fileName,
          },
          options.password,
          options.pdfJsBaseUrl
        );
      } catch (error) {
        console.warn("Unable to read imported file text; continuing with vision fallback", {
          importFileId,
          error,
        });
        text = "";
      }
    }
  }

  if (isJsonImportFile(fileType, fileName)) {
    return processImportTrainingJson(importFileId, importFile, text, options, startedAt);
  }

  const textForParse = imageImport && importMode === "statement" ? normalizeStatementImageOcrText(text) : text;
  const metadata = detectStatementMetadataFromText(textForParse);
  const statementFingerprint = buildStatementFingerprint(textForParse, metadata, importFile.fileName, importFile.fileType, importMode);
  const existingTemplate = await loadStatementTemplate({
    workspaceId: String(importFile.workspaceId),
    fingerprint: statementFingerprint,
  });
  const templateMetadata =
    existingTemplate?.metadata && typeof existingTemplate.metadata === "object" && !Array.isArray(existingTemplate.metadata)
      ? (existingTemplate.metadata as Record<string, unknown>)
      : null;
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
  const metadataOverride = options.statementMetadataOverride ?? {};
  const metadataForParse = {
    ...mergedMetadata,
    ...Object.fromEntries(Object.entries(metadataOverride).filter(([, value]) => value !== undefined)),
  } as typeof mergedMetadata;

  const parsedRows = parseImportText(textForParse, importFile.fileName, importFile.fileType, {
    institution: metadataForParse.institution,
    accountName: metadataForParse.accountName,
    accountNumber: metadataForParse.accountNumber,
  });
  const hasKnownInstitution = Boolean(metadataForParse.institution && metadataForParse.institution !== "Unknown");
  const gcashSuspiciouslySparse =
    metadataForParse.institution === "GCash" &&
    parsedRows.length > 0 &&
    parsedRows.length < 50 &&
    !metadataForParse.endingBalance;
  const parsedRowsWithDates = countRowsWithParseableDates(parsedRows);
  const parsedDateCoverage = parsedRows.length > 0 ? parsedRowsWithDates / parsedRows.length : 0;
  const suspiciousDateCoverage =
    (importFile.fileType === "application/pdf" || imageImport) && parsedRows.length >= 6 && parsedRowsWithDates === 0
      ? true
      : (importFile.fileType === "application/pdf" || imageImport) && parsedRows.length >= 10 && parsedDateCoverage < 0.25;
  const shouldUseVisionFallback =
    (importFile.fileType === "application/pdf" || imageImport) &&
    (!text.trim() ||
      parsedRows.length === 0 ||
      (metadataForParse.confidence ?? 0) < 70 ||
      !metadataForParse.accountNumber ||
      !hasKnownInstitution ||
      gcashSuspiciouslySparse ||
      suspiciousDateCoverage);
  if (shouldUseVisionFallback && !pageImages) {
    try {
      if (imageImport) {
        pageImages = await readImportedFileImageDataUrls({
          storageKey: String(importFile.storageKey ?? ""),
          fileType,
          fileName,
        });
      } else {
        pageImages = await readImportedPdfPageImages(
          {
            storageKey: String(importFile.storageKey ?? ""),
            fileType,
            fileName,
          },
          options.password,
          !text.trim() ? 6 : gcashSuspiciouslySparse ? 3 : 2,
          !text.trim() ? 2.0 : gcashSuspiciouslySparse ? 1.35 : 1.1,
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
  const openAiPrimaryMode = isTruthyEnvValue(getEnv().OPENAI_IMPORT_PARSER_PRIMARY);
  let openAiParsed = await parseImportTextWithOpenAIFallback({
    textForParse,
    fileName,
    fileType,
    detectedMetadata: metadataForParse,
    parsedRows,
    pageImages,
    preferPrimary: openAiPrimaryMode || Boolean(pageImages?.length),
    importMode,
  });

  let openAiMetadata = openAiParsed
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

  const imageTranscriptRequiresRetry = Boolean(imageImport && pageImages?.length);
  const openAiResultLooksSparse =
    !openAiParsed ||
    (importMode === "statement" && (openAiParsed.rows.length === 0 || !openAiMetadata?.accountNumber)) ||
    (importMode === "receipt" &&
      (!openAiParsed.receiptDetails ||
        (!openAiParsed.receiptDetails.merchant_raw && !openAiParsed.receiptDetails.total && openAiParsed.receiptDetails.line_items.length === 0))) ||
    ((importMode === "portfolio" || importMode === "account_detail") &&
      (!openAiParsed.holdings.length || !openAiMetadata?.accountName));

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
          const existingScore =
            Number(openAiParsed.receiptDetails?.merchant_raw ? 1 : 0) +
            Number(openAiParsed.receiptDetails?.merchant_clean ? 1 : 0) +
            Number(openAiParsed.receiptDetails?.total !== null ? 1 : 0) +
            Number(openAiParsed.receiptDetails?.transaction_date ? 1 : 0) +
            Number((openAiParsed.receiptDetails?.line_items.length ?? 0) > 0 ? 1 : 0);
          const transcriptScore =
            Number(transcriptParsed.receiptDetails?.merchant_raw ? 1 : 0) +
            Number(transcriptParsed.receiptDetails?.merchant_clean ? 1 : 0) +
            Number(transcriptParsed.receiptDetails?.total !== null ? 1 : 0) +
            Number(transcriptParsed.receiptDetails?.transaction_date ? 1 : 0) +
            Number((transcriptParsed.receiptDetails?.line_items.length ?? 0) > 0 ? 1 : 0);
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

  const useOpenAiParse =
    Boolean(openAiParsed?.audit.schemaValidated) &&
    (openAiPrimaryMode ||
      Boolean(pageImages?.length) ||
      isDocumentImport ||
      (openAiMetadata
        ? (openAiMetadata?.confidence ?? 0) >= (metadataForParse.confidence ?? 0)
        : parsedRows.length === 0));
  const effectiveRows = useOpenAiParse && openAiParsed ? openAiParsed.rows : parsedRows;
  const effectiveMetadataSource = useOpenAiParse && openAiMetadata ? openAiMetadata : metadataForParse;
  const parsedEndingBalance = getTrailingBalanceFromParsedRows(effectiveRows);
  const resolvedMetadata = {
    ...effectiveMetadataSource,
    endingBalance: effectiveMetadataSource.endingBalance ?? parsedEndingBalance,
  };
  let confirmedImportResult:
    | {
        imported: number;
        accountId: string;
        insightSummary: ImportInsightSummary;
        accountBalance: string | null;
      }
    | null = null;
  const duplicateImportFileId = await findExistingImportedStatement({
    workspaceId: importFile.workspaceId,
    statementFingerprint,
    importFileId,
  });
  if (duplicateImportFileId && !options.allowDuplicateStatement) {
    await updateImportFileCompat(importFileId, {
      status: "done",
    });
    return { imported: 0, duplicate: true, metadata: resolvedMetadata };
  }
  let rows: Awaited<ReturnType<typeof enrichParsedRowsWithTraining>> = effectiveRows as Awaited<
    ReturnType<typeof enrichParsedRowsWithTraining>
  >;
  try {
    rows = await enrichParsedRowsWithTraining({
      workspaceId: importFile.workspaceId,
      rows: effectiveRows,
      statementConfidence: resolvedMetadata.confidence ?? 0,
    });
  } catch (error) {
    console.warn("Import training enrichment failed; continuing with parsed rows", {
      importFileId,
      error,
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
    importMode,
    documentType: importMode,
    statementFingerprint,
    fileName,
    fileType,
    rowCount: rows.length,
    pageCount: pageImages?.length ?? 0,
    usedVisionFallback: Boolean(pageImages?.length),
    usedOpenAiFallback: Boolean(useOpenAiParse),
    usedDeterministicParser: !useOpenAiParse,
  } as Prisma.InputJsonValue;
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
    accountId: importFile.account?.id ?? null,
    documentFamily: importMode,
    documentSubtype:
      importMode === "receipt"
        ? "receipt"
        : importMode === "portfolio"
          ? resolvedMetadata.accountType ?? resolvedMetadata.accountName ?? "portfolio"
          : importMode === "account_detail"
            ? resolvedMetadata.accountType ?? resolvedMetadata.accountName ?? "account_detail"
            : importMode === "notes"
              ? "notes"
              : "statement",
    institution: resolvedMetadata.institution ?? null,
    accountName: resolvedMetadata.accountName ?? null,
    accountNumber: resolvedMetadata.accountNumber ?? null,
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
          importMode === "receipt"
            ? "receipt_page"
            : importMode === "portfolio"
              ? "portfolio_page"
              : importMode === "account_detail"
                ? "account_detail_page"
                : importMode === "notes"
                  ? "notes_page"
                  : "statement_page",
        visibleTitle:
          importMode === "receipt"
            ? "Receipt"
            : importMode === "portfolio"
              ? resolvedMetadata.accountName ?? resolvedMetadata.institution ?? "Portfolio"
              : importMode === "account_detail"
                ? resolvedMetadata.accountName ?? resolvedMetadata.institution ?? "Account details"
                : importMode === "notes"
                  ? "Notes"
                  : resolvedMetadata.accountName ?? resolvedMetadata.institution ?? "Statement",
        visibleDate: resolvedMetadata.endDate ?? resolvedMetadata.paymentDueDate ?? null,
        visibleCurrency: resolvedMetadata.currency ?? null,
        layoutNotes: `Imported ${importMode} page ${page}`,
        confidence: resolvedMetadata.confidence ?? 0,
        rawPayload: {
          pageNumber: page,
          importMode,
          fileName,
          fileType,
        } as Prisma.InputJsonValue,
      })),
    });
  }

  if (documentImportRecord && importMode === "receipt") {
    const receiptDetails = openAiParsed?.receiptDetails ?? null;
    const receiptAccountMatch = openAiParsed?.receiptAccountMatch ?? null;
    await upsertReceiptDocumentCompat({
      workspaceId: String(importFile.workspaceId),
      documentImportId: documentImportRecord.id,
      accountId: importFile.account?.id ?? null,
      transactionId: null,
      merchantRaw: receiptDetails?.merchant_raw ?? null,
      merchantClean: receiptDetails?.merchant_clean ?? null,
      transactionDate: parseDateValue(receiptDetails?.transaction_date ?? resolvedMetadata.endDate ?? null),
      transactionTime: receiptDetails?.transaction_time ?? null,
      currency: receiptDetails?.currency ?? resolvedMetadata.currency ?? null,
      subtotal: receiptDetails?.subtotal ?? null,
      tax: receiptDetails?.tax ?? null,
      total: receiptDetails?.total ?? resolvedMetadata.endingBalance ?? resolvedMetadata.totalAmountDue ?? null,
      paymentMethod: receiptDetails?.payment_method ?? null,
      accountMatch: receiptAccountMatch
        ? {
            account_name: receiptAccountMatch.account_name,
            account_last4: receiptAccountMatch.account_last4,
            confidence: receiptAccountMatch.confidence,
            reason: receiptAccountMatch.reason,
          }
        : null,
      confidence: resolvedMetadata.confidence ?? 0,
      rawPayload: {
        documentType: importMode,
        metadata: resolvedMetadata,
        receiptAccountMatch,
        receiptDetails,
        rowCount: rows.length,
        pageCount: pageImages?.length ?? 0,
      } as Prisma.InputJsonValue,
    });
  }

  if (documentImportRecord && (importMode === "portfolio" || importMode === "account_detail")) {
    const investmentSnapshot = await upsertInvestmentSnapshotCompat({
      workspaceId: String(importFile.workspaceId),
      documentImportId: documentImportRecord.id,
      accountId: importFile.account?.id ?? null,
      snapshotDate: parseDateValue(resolvedMetadata.endDate ?? null),
      portfolioName: resolvedMetadata.accountName ?? resolvedMetadata.institution ?? null,
      currency: resolvedMetadata.currency ?? null,
      totalValue: resolvedMetadata.endingBalance ?? resolvedMetadata.totalAmountDue ?? null,
      costBasis: resolvedMetadata.openingBalance ?? null,
      gainLossValue: null,
      gainLossPercent: null,
      confidence: resolvedMetadata.confidence ?? 0,
      rawPayload: {
        documentType: importMode,
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
        accountId: importFile.account?.id ?? null,
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
            documentType: importMode,
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
        accountType: resolvedMetadata.accountType ?? inferAccountTypeFromStatement(resolvedMetadata.institution, resolvedMetadata.accountName, "bank"),
        rowCount: rows.length,
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

  if (await hasCompatibleTable("AccountStatementCheckpoint")) {
    try {
      const metadataStartDate = metadata.startDate ? new Date(metadata.startDate) : null;
      const metadataEndDate = resolvedMetadata.endDate ? new Date(resolvedMetadata.endDate) : null;
      const checkpointSourceMetadata = {
        ...resolvedMetadata,
        importMode,
        documentType: importMode,
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
    const allowWarningFinalizeForImageStatement =
      imageImport && importMode === "statement" && hasUsableParsedRows && !hasCriticalFindings;
    const canFinalizeWithWarnings =
      hasUsableParsedRows &&
      !hasCriticalFindings &&
      (allowWarningFinalizeForImageStatement || qaRunResult.evaluation.score >= 90) &&
      qaRunResult.evaluation.score < AUTO_REPARSE_SCORE_TARGET;

    const shouldAutoRerun =
      autoRerunEnabled &&
      !isDocumentImport &&
      !plateaued &&
      qaRunResult.evaluation.score < AUTO_REPARSE_SCORE_TARGET &&
      autoRerunAttempt < AUTO_REPARSE_MAX_ATTEMPTS &&
      !allowWarningFinalizeForImageStatement;

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

    const shouldMarkDone = isDocumentImport ? Boolean(documentImportRecord) : qaRunResult.evaluation.score >= AUTO_REPARSE_SCORE_TARGET || canFinalizeWithWarnings;
    if (shouldMarkDone) {
      try {
        confirmedImportResult = await confirmImportFile(importFileId, null);
        if (confirmedImportResult.status === "staged") {
          await updateImportFileCompat(importFileId, {
            status: "processing",
            processingPhase: "staged",
            processingMessage: "Clover is still lining things up.",
          });

          return {
            imported: confirmedImportResult.imported,
            duplicate: confirmedImportResult.duplicate,
            metadata: resolvedMetadata,
            accountId: confirmedImportResult.accountId ?? null,
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
          });

          return {
            imported: rows.length,
            duplicate: false,
            metadata: resolvedMetadata,
            accountId: confirmedImportResult.accountId ?? null,
            confirmedTransactionsCount: confirmedImportResult.confirmedTransactionsCount ?? null,
            insightSummary: confirmedImportResult.insightSummary ?? undefined,
            accountBalance: confirmedImportResult.accountBalance ?? null,
            status: "done",
          };
        }
      } catch (error) {
        await updateImportFileCompat(importFileId, {
          status: "failed",
          processingPhase: "needs_retry",
          processingMessage: "Clover couldn't finish saving the import.",
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
            : "needs_retry",
      processingCurrentScore: qaRunResult.evaluation.score,
      processingMessage:
        shouldMarkDone
          ? autoRerunEnabled && autoRerunAttempt > 0
            ? plateaued && canFinalizeWithWarnings
              ? `Automatic reruns plateaued at score ${qaRunResult.evaluation.score}, but Clover finalized the import with the available statement data.`
              : `Auto-rerun ${autoRerunAttempt}/${AUTO_REPARSE_MAX_ATTEMPTS} complete. Final score ${qaRunResult.evaluation.score}.`
            : null
          : plateaued
            ? `Automatic reruns plateaued at score ${qaRunResult.evaluation.score}. Manual parser fixes are needed before rerunning again.`
            : `Automatic reruns stopped below the ${AUTO_REPARSE_SCORE_TARGET} target. Latest score ${qaRunResult.evaluation.score}.`,
    });
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
    payload.description,
    payload.notes,
    payload.memo,
    payload.detail,
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

export const confirmImportFile = async (importFileId: string, accountId?: string | null) => {
  const startedAt = Date.now();
  const importFile = await fetchImportFileCompat(importFileId);

  if (!importFile) {
    throw new Error("Import file not found");
  }

  const planLimits = await getWorkspaceOwnerLimits(String(importFile.workspaceId));
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
              documentFamily: true,
              documentSubtype: true,
            },
          }).catch(() => null)
        : null;

    return {
      imported: 0,
      duplicate: false,
      metadata: detectStatementMetadataFromText(""),
      accountId: documentImport?.accountId ?? accountId ?? null,
      confirmedTransactionsCount: 0,
      insightSummary: null,
      accountBalance: null,
      status: "done",
    };
  }

  let parsedRows: Array<Record<string, unknown>> = [];
  const MAX_WAIT_MS = 30_000;
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
      metadata: detectStatementMetadataFromText(""),
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

  const account = await resolveConfirmationAccount({
    importFile,
    statementMetadata: {
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
    },
    parsedRows,
    accountId,
    planLimits: planLimits ? { accountLimit: planLimits.accountLimit } : null,
  });
  if (!account) {
    throw new Error("Account not found");
  }
  const resolvedAccountId = account.id;
  const compatibleImportFileColumns = new Set(await getCompatibleImportFileColumns());

  let statementRow: Record<string, unknown> | null = null;
  let statementConfidence = 0;
  let reconciledAccountBalance: string | null = null;
  const transactions: ImportInsightSourceRow[] = [];
  const trainingSignalJobs: Promise<unknown>[] = [];
  const preparedTransactions: PreparedImportTransaction[] = [];
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
    await tx.transaction.deleteMany({
      where: { importFileId },
    });

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
  const fallbackReconciledBalance = deriveReconciledBalance({
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
  reconciledAccountBalance = statementEndingBalance ?? latestExplicitStatementBalance ?? fallbackReconciledBalance;

  if (reconciledAccountBalance !== null) {
    await tx.account.update({
      where: { id: resolvedAccountId },
      data: {
        balance: reconciledAccountBalance,
      },
    });
  }

    const existingCategories = await tx.category.findMany({
      where: { workspaceId: importFile.workspaceId },
    });
  const categoryByName = new Map(existingCategories.map((category) => [category.name.toLowerCase(), category.id]));

    for (const row of parsedRows) {
    const rowType =
      row.type === "income" || row.type === "expense" || row.type === "transfer" ? row.type : undefined;
    const rowConfidence = typeof row.confidence === "number" ? row.confidence : 0;
    const rowParserConfidence = typeof row.parserConfidence === "number" ? row.parserConfidence : rowConfidence;
    const rowCategoryConfidence = typeof row.categoryConfidence === "number" ? row.categoryConfidence : rowConfidence;
    const rowAccountMatchConfidence = typeof row.accountMatchConfidence === "number" ? row.accountMatchConfidence : 100;
    const rowDuplicateConfidence = typeof row.duplicateConfidence === "number" ? row.duplicateConfidence : 0;
    const rowTransferConfidence = typeof row.transferConfidence === "number" ? row.transferConfidence : rowType === "transfer" ? 100 : 0;
    const categoryName = (typeof row.categoryName === "string" && row.categoryName) || defaultCategoryForType((rowType as "income" | "expense" | "transfer") ?? "expense");
    const rowIsOpeningBalance = Boolean(
      typeof row.rawPayload === "object" &&
        row.rawPayload !== null &&
        !Array.isArray(row.rawPayload) &&
        (row.rawPayload as Record<string, unknown>).kind === "opening_balance"
    );

    if (rowIsOpeningBalance) {
      continue;
    }

    let categoryId = categoryByName.get(categoryName.toLowerCase());

    if (!categoryId) {
      const created = await tx.category.create({
        data: {
          workspaceId: importFile.workspaceId,
          name: categoryName,
          type: (rowType ?? "expense") as "income" | "expense" | "transfer",
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
      accountId: resolvedAccountId,
      importFileId,
      categoryId,
      categoryName,
      reviewStatus: reviewOnlyRow
        ? "rejected"
        : shouldRouteToReview({ confidence: rowConfidence, categoryName, type: rowType })
          ? "pending_review"
          : "confirmed",
      parserConfidence: rowParserConfidence,
      categoryConfidence: rowCategoryConfidence,
      accountMatchConfidence: rowAccountMatchConfidence,
      duplicateConfidence: rowDuplicateConfidence,
      transferConfidence: rowTransferConfidence,
      rawPayload: (row.rawPayload ?? {}) as Prisma.InputJsonValue,
      normalizedPayload: (row.normalizedPayload ?? {}) as Prisma.InputJsonValue,
      learnedRuleIdsApplied: (row.learnedRuleIdsApplied ?? []) as Prisma.InputJsonValue,
      date:
        (row.date instanceof Date && !Number.isNaN(row.date.getTime())
          ? row.date
          : parseDateValue(typeof row.date === "string" ? row.date : null)) ?? new Date(),
      amount: parseAmountValue(coerceAmountToString(row.amount)) ?? 0,
      currency: typeof row.currency === "string" && row.currency.trim() ? row.currency.trim().toUpperCase() : "PHP",
      type: (rowType ?? "expense") as TransactionType,
      merchantRaw: typeof row.merchantRaw === "string" ? row.merchantRaw : "Imported transaction",
      merchantClean: typeof row.merchantClean === "string" ? row.merchantClean : typeof row.merchantRaw === "string" ? row.merchantRaw : null,
      description: extractHumanReadableDescription(row.rawPayload ?? null),
      isTransfer: rowType === "transfer",
      isExcluded:
        reviewOnlyRow ||
        (typeof row.rawPayload === "object" && row.rawPayload !== null && (row.rawPayload as Record<string, unknown>).kind === "opening_balance"),
    });
    const transactionId = String(insertRow.id ?? crypto.randomUUID());

    preparedTransactions.push({
      transactionId,
      insertRow,
      insightRow: {
        amount: row.amount,
        type: rowType ?? "expense",
        merchantRaw: typeof row.merchantRaw === "string" ? row.merchantRaw : null,
        merchantClean: typeof row.merchantClean === "string" ? row.merchantClean : typeof row.merchantRaw === "string" ? row.merchantRaw : null,
        description: extractHumanReadableDescription(row.rawPayload ?? null),
        categoryName,
        rawPayload: (row.rawPayload ?? {}) as Prisma.InputJsonValue,
      },
      trainingSignal: {
        merchantText,
        categoryId,
        categoryName,
        type: rowType ?? "expense",
        confidence: typeof row.confidence === "number" ? row.confidence : 100,
        notes: typeof row.categoryReason === "string" ? row.categoryReason : null,
      },
      });
    }

    if (planLimits?.transactionLimit != null) {
      const existingTransactionCount = await tx.transaction.count({
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

    await updateImportFileWithTxCompat(
      tx,
      importFileId,
      {
        accountId: resolvedAccountId,
        confirmedAt: new Date(),
        status: "done",
        confirmedTransactionsCount: preparedTransactions.length + (openingBalanceInserted ? 1 : 0),
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
    trainingSignalJobs.push(
      recordTrainingSignal({
        workspaceId: importFile.workspaceId,
        importFileId,
        transactionId: entry.transactionId,
        merchantText: entry.trainingSignal.merchantText,
        categoryId: entry.trainingSignal.categoryId,
        categoryName: entry.trainingSignal.categoryName,
        type: entry.trainingSignal.type,
        source: "import_confirmation",
        confidence: entry.trainingSignal.confidence,
        notes: entry.trainingSignal.notes,
      }).catch(() => null)
    );
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

  void Promise.allSettled(trainingSignalJobs);

  const insightSummary = buildImportInsightSummary(transactions);

  qaMetadataForRun = {
    institution:
      typeof statementRow?.institution === "string" ? statementRow.institution : null,
    accountNumber:
      typeof statementMetadata?.accountNumber === "string" ? statementMetadata.accountNumber : null,
    accountName:
      typeof statementRow?.accountName === "string" ? statementRow.accountName : null,
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
    name: account.name,
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
      imported: transactions.length,
      accountId: resolvedAccountId,
      insightSummary,
      accountBalance: reconciledAccountBalance,
    };
  });

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
