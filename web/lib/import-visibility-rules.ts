import type { UploadInsightsSummary } from "@/components/upload-insights-toast";
import { normalizeBankName } from "@/lib/data-qa-banks";
import { type ImportImageMode } from "@/lib/import-image-mode";
import { inferImportModeForFile, isFilenameOnlyScreenshotSummary } from "@/lib/import-statement-identity";

type ImportFileLike = {
  name: string;
  type?: string | null;
};

type VisibilityQueueItem = {
  id?: string;
  file: ImportFileLike;
  importMode?: ImportImageMode | null;
  status?: string | null;
  targetAccountId?: string | null;
  importedRows?: number | null;
  confirmationState?: string | null;
  progress?: number | null;
  importFileId?: string | null;
};

const IMPORT_VISIBILITY_BASE_TIMEOUT_MS = 30_000;
const IMPORT_VISIBILITY_ADDITIONAL_FILE_TIMEOUT_MS = 15_000;
const IMPORT_VISIBILITY_MAX_TIMEOUT_MS = 2 * 60_000;
const IMPORT_IMAGE_HEAVY_VISIBILITY_BASE_TIMEOUT_MS = 60_000;
const IMPORT_IMAGE_HEAVY_VISIBILITY_ADDITIONAL_FILE_TIMEOUT_MS = 20_000;
const IMPORT_IMAGE_HEAVY_VISIBILITY_MAX_TIMEOUT_MS = 5 * 60_000;
const IMPORT_SERVER_HEAVY_VISIBILITY_BASE_TIMEOUT_MS = 60_000;
const IMPORT_SERVER_HEAVY_VISIBILITY_ADDITIONAL_FILE_TIMEOUT_MS = 30_000;
const IMPORT_SERVER_HEAVY_VISIBILITY_MAX_TIMEOUT_MS = 4 * 60_000;
const IMPORT_PROGRESS_PREPARING = 20;
const IMPORT_PROGRESS_UPLOADING = 40;
const IMPORT_BACKGROUND_HARD_STOP_MINUTES = 10;

const isImageImportFile = (file: ImportFileLike) =>
  /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name.toLowerCase()) || String(file.type ?? "").startsWith("image/");

const getImportVisibilityTimeoutMs = (fileCount: number) =>
  Math.min(
    IMPORT_VISIBILITY_MAX_TIMEOUT_MS,
    IMPORT_VISIBILITY_BASE_TIMEOUT_MS +
      Math.max(0, fileCount - 1) * IMPORT_VISIBILITY_ADDITIONAL_FILE_TIMEOUT_MS
  );

export const isLikelyLowQualityUnionBankStatementFilename = (fileName: string) => {
  const lower = fileName.toLowerCase();
  return /union[\s_-]*bank/i.test(lower) && /(?:word|excel|template|business_statement)/i.test(lower);
};

export const isExplicitLowQualityUnionBankStatementFilename = (fileName: string) =>
  /union[\s_-]*bank/i.test(fileName.toLowerCase()) && /(?:word|excel|template|business_statement)/i.test(fileName.toLowerCase());

export const isKnownUnionBankSampleStatementFilename = (fileName: string) =>
  /(?:771487697.*soa.*union.*bank|soa-union-bank|philippines\s+unionbank\s+(?:excel|word)|business_statement|word_and_pdf_template|union_bank_of_the_philippines_business)/i.test(
    fileName.toLowerCase()
  );

export const isNoisyVisibilityBank = (fileName: string) => {
  return (
    ["Landbank", "EastWest", "UCPB", "Chinabank", "China Bank"].includes(normalizeBankName(fileName)) ||
    isLikelyLowQualityUnionBankStatementFilename(fileName)
  );
};

export const isLikelyLowQualityUnionBankStatementFile = (fileName: string) =>
  isLikelyLowQualityUnionBankStatementFilename(fileName) || normalizeBankName(fileName) === "UnionBank";

export const shouldRequireVisibleRowsForImport = (fileName: string) =>
  normalizeBankName(fileName) === "UnionBank" || isLikelyLowQualityUnionBankStatementFilename(fileName);

export const importSummaryLooksWise = (summary: UploadInsightsSummary | null | undefined) => {
  if (!summary) {
    return false;
  }

  const identityText = [
    summary.fileName,
    summary.accountName,
    summary.institution,
    summary.accountSummaries?.map((account) => `${account.accountName ?? ""} ${account.institution ?? ""}`).join(" "),
    summary.previewTransactions
      ?.slice(0, 5)
      .map((transaction) => `${transaction.accountName ?? ""} ${transaction.merchantRaw ?? ""}`)
      .join(" "),
  ]
    .filter(Boolean)
    .join(" ");

  return /\bwise\b/i.test(identityText);
};

export const importContextLooksWise = (context: {
  fileName?: string | null;
  fallbackAccountName?: string | null;
  guessedAccountName?: string | null;
  guessedInstitution?: string | null;
  accountName?: string | null;
  institution?: string | null;
}) =>
  /\bwise\b/i.test(
    [
      context.fileName,
      context.fallbackAccountName,
      context.guessedAccountName,
      context.guessedInstitution,
      context.accountName,
      context.institution,
    ]
      .filter(Boolean)
      .join(" ")
  );

export const shouldRequireVisibleRowsForImportSummary = (
  fileName: string,
  summary: UploadInsightsSummary | null | undefined
) => shouldRequireVisibleRowsForImport(fileName) || importSummaryLooksWise(summary);

export const importSummaryHasVisibleRows = (summary: UploadInsightsSummary | null | undefined) => {
  const rowsImported = Number(summary?.rowsImported ?? 0);
  const previewRows = Array.isArray(summary?.previewTransactions) ? summary.previewTransactions.length : 0;
  return Math.max(rowsImported, previewRows) > 0 && Boolean(summary?.accountId);
};

const importSummaryIsOptimistic = (summary: UploadInsightsSummary | null | undefined) => {
  if (!summary) {
    return false;
  }

  const accountId = typeof summary.accountId === "string" ? summary.accountId.trim() : "";
  const optimisticAccountId = typeof summary.optimisticAccountId === "string" ? summary.optimisticAccountId.trim() : "";

  return Boolean(summary.optimistic || accountId.startsWith("optimistic-") || optimisticAccountId.startsWith("optimistic-"));
};

export const importSummaryHasAccountNumber = (summary: UploadInsightsSummary | null | undefined) => {
  if (typeof summary?.accountNumber === "string" && summary.accountNumber.replace(/\D/g, "").length >= 4) {
    return true;
  }

  return Boolean(
    summary?.accountSummaries?.some(
      (account) => typeof account.accountNumber === "string" && account.accountNumber.replace(/\D/g, "").length >= 4
    )
  );
};

export const shouldPublishImportSummary = (
  fileName: string,
  summary: UploadInsightsSummary | null | undefined
) => {
  if (!summary) {
    return false;
  }

  if (isFilenameOnlyScreenshotSummary(fileName, summary)) {
    return false;
  }

  if ((normalizeBankName(fileName) === "UnionBank" || isLikelyLowQualityUnionBankStatementFilename(fileName)) && !importSummaryHasAccountNumber(summary)) {
    return false;
  }

  return !shouldRequireVisibleRowsForImportSummary(fileName, summary) || importSummaryHasVisibleRows(summary);
};

export const isLikelyLowQualityPnbStatementFile = (fileName: string) => {
  if (normalizeBankName(fileName) !== "PNB") {
    return false;
  }

  const normalized = fileName.toLowerCase();
  return (
    normalized.includes("philippines pnb") ||
    normalized.includes("pnb 4 pages excel") ||
    normalized.includes("bank st") ||
    normalized.includes("template-in-word-and-pdf")
  );
};

export const shouldSkipClientStatementPreparse = (fileName: string) =>
  /\.(?:xlsx|xls|xlsm|xlsb|ods)$/i.test(fileName) ||
  isNoisyVisibilityBank(fileName) ||
  isExplicitLowQualityUnionBankStatementFilename(fileName) ||
  isLikelyLowQualityPnbStatementFile(fileName);

export const isServerHeavyStatementBatchItem = (item: VisibilityQueueItem) => {
  const mode = inferImportModeForFile(item.file, item.importMode ?? "statement");
  const lowerName = item.file.name.toLowerCase();
  return (
    mode === "statement" &&
    (lowerName.endsWith(".pdf") || /\.(?:csv|tsv)$/.test(lowerName)) &&
    (shouldSkipClientStatementPreparse(item.file.name) || shouldRequireVisibleRowsForImport(item.file.name))
  );
};

export const getImportVisibilityTimeoutMsForItems = (items: VisibilityQueueItem[]) => {
  const fileCount = Math.max(1, items.length);
  const hasServerHeavyBatch = items.some(isServerHeavyStatementBatchItem);
  const hasOnlyFastImages = items.length > 0 && items.every((item) => {
    const mode = inferImportModeForFile(item.file, item.importMode ?? "statement");
    return isImageImportFile(item.file) && (mode === "statement" || mode === "receipt");
  });
  if (hasOnlyFastImages) {
    return Math.min(
      IMPORT_IMAGE_HEAVY_VISIBILITY_MAX_TIMEOUT_MS,
      IMPORT_IMAGE_HEAVY_VISIBILITY_BASE_TIMEOUT_MS +
        Math.max(0, fileCount - 1) * IMPORT_IMAGE_HEAVY_VISIBILITY_ADDITIONAL_FILE_TIMEOUT_MS
    );
  }
  if (!hasServerHeavyBatch) {
    return getImportVisibilityTimeoutMs(fileCount);
  }

  return Math.min(
    IMPORT_SERVER_HEAVY_VISIBILITY_MAX_TIMEOUT_MS,
    IMPORT_SERVER_HEAVY_VISIBILITY_BASE_TIMEOUT_MS +
      Math.max(0, fileCount - 1) * IMPORT_SERVER_HEAVY_VISIBILITY_ADDITIONAL_FILE_TIMEOUT_MS
  );
};

export const hasVisibleImportData = (
  item: VisibilityQueueItem,
  summary: UploadInsightsSummary | null | undefined
) => {
  if (item.status === "error" || item.status === "needs_password") {
    return false;
  }

  const localRows = Number(summary?.rowsImported ?? 0);
  const localPreviewRows = Array.isArray(summary?.previewTransactions) ? summary.previewTransactions.length : 0;
  const summaryIsOptimistic = importSummaryIsOptimistic(summary);
  const localHasRows = Math.max(localRows, localPreviewRows) > 0 && Boolean(summary?.accountId);
  const localHasSettledRows = localHasRows && !summaryIsOptimistic;
  const localHasAccountDetails =
    (Boolean(summary?.accountId) && Boolean(summary?.accountName || summary?.accountNumber || summary?.balance)) ||
    Boolean(
      summary?.accountSummaries?.some(
        (account) => Boolean(account.accountId) && Boolean(account.accountName || account.accountNumber || account.balance)
      )
    );
  const localHasSettledAccountDetails = localHasAccountDetails && !summaryIsOptimistic;
  const itemHasRows = item.importedRows !== null && item.importedRows !== undefined && item.importedRows > 0 && Boolean(item.targetAccountId);
  const importMode = inferImportModeForFile(item.file, item.importMode ?? "statement");
  const isStatementImageImport = isImageImportFile(item.file) && importMode === "statement";

  if (importMode === "statement" && shouldRequireVisibleRowsForImportSummary(item.file.name, summary)) {
    return itemHasRows || localHasSettledRows;
  }

  if (isStatementImageImport) {
    return itemHasRows || localHasSettledRows || (item.confirmationState === "confirmed" && localHasSettledAccountDetails);
  }

  return itemHasRows || localHasRows || localHasAccountDetails;
};

export const hasActiveServerImport = (items: VisibilityQueueItem[]) =>
  items.some(
    (item) =>
      (item.status === "importing" || item.status === "parsing") &&
      Boolean(item.importFileId) &&
      Number(item.progress ?? 0) >= IMPORT_PROGRESS_PREPARING
  );

export const summarizeVisibilityOutcome = <TItem extends VisibilityQueueItem>(
  items: TItem[],
  getSummary: (item: TItem) => UploadInsightsSummary | null | undefined
) => {
  const successful = items.filter((item) => hasVisibleImportData(item, getSummary(item)));
  const failed = items.filter((item) => item.status === "error" || item.status === "needs_password");
  const partial = items.filter(
    (item) =>
      !successful.includes(item) &&
      !failed.includes(item) &&
      (item.importFileId ||
        item.targetAccountId ||
        item.importedRows !== null && item.importedRows !== undefined ||
        item.confirmationState === "staged" ||
        Number(item.progress ?? 0) >= IMPORT_PROGRESS_UPLOADING)
  );

  const blocked = items.filter((item) => !successful.includes(item) && !failed.includes(item) && !partial.includes(item));
  const queued = blocked.filter(
    (item) => item.status === "pending" && !item.importFileId && Number(item.progress ?? 0) < IMPORT_PROGRESS_UPLOADING
  );
  const blockedFailures = blocked.filter((item) => !queued.includes(item));
  const retryNeeded = [...partial, ...queued, ...failed, ...blockedFailures];
  const listNames = (label: string, entries: TItem[]) =>
    entries.length > 0 ? `${label}: ${entries.map((entry) => entry.file.name).join(", ")}.` : "";
  const failureCount = failed.length + blockedFailures.length;

  return {
    successful,
    failed,
    partial,
    blocked,
    queued,
    blockedFailures,
    retryNeeded,
    failureCount,
    message: [
      `${successful.length} visible, ${partial.length} partially parsed, ${queued.length} queued, ${failureCount} failed.`,
      listNames("Partial", partial),
      listNames("Queued", queued),
      listNames("Failed", [...failed, ...blockedFailures]),
      retryNeeded.length > 0
        ? `Try uploading again: ${retryNeeded.map((entry) => entry.file.name).join(", ")}.`
        : "",
      partial.length > 0 || queued.length > 0
        ? `Clover will keep working in the background for up to ${IMPORT_BACKGROUND_HARD_STOP_MINUTES} minutes.`
        : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
};
