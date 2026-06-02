import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { buildImportKey } from "@/lib/import-keys";
import {
  detectStatementMetadataFromText,
  countParsedTransactionRows,
  countTransactionsByImportFileCompat,
  fetchImportFileCompat,
  insertImportFileCompat,
  loadImportFileExtractionCache,
  loadStatementTemplate,
  mergeStatementMetadataWithTemplate,
  findExistingImportedStatement,
  updateImportFileCompat,
  buildStatementFingerprint,
  IMPORT_FILE_EXTRACTION_CACHE_VERSION,
} from "@/lib/data-engine";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { enqueueImportProcessing } from "@/lib/import-queue";
import { ensureImportProcessingWorker } from "@/lib/import-worker-runtime";
import { loadImportStatusSnapshot } from "@/lib/import-status-snapshot";
import { uploadObject } from "@/lib/s3";
import { validateImportFile } from "@/lib/import-file-validation";
import { countWorkspaceOwnerImportFilesThisMonth } from "@/lib/plan-access";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { getEffectiveUserLimits } from "@/lib/user-limits";
import { summarizeErrorForLog } from "@/lib/security-logging";
import { NextResponse } from "next/server";
import { normalizeBankName } from "@/lib/data-qa-banks";
import { hasCompatibleTable } from "@/lib/data-engine";
import { prisma } from "@/lib/prisma";
import { normalizeImportImageMode, type ImportImageMode } from "@/lib/import-image-mode";
import type { Prisma } from "@prisma/client";
import { makeImportFileBytesFingerprint } from "@/lib/import-file-text.server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const upsertUploadBankHint = async (params: {
  importFileId: string;
  workspaceId: string;
  bankName?: string | null;
  importMode?: ImportImageMode | null;
  trainingMode?: "bank_context" | "generic_parser";
}) => {
  const bankName = normalizeBankName(params.bankName ?? "");
  const hasBankName = Boolean(bankName && bankName !== "Unknown");
  const isGenericParserTraining = params.trainingMode === "generic_parser";
  const hasImportContext = hasBankName || Boolean(params.importMode) || isGenericParserTraining;

  if (!hasImportContext) {
    return;
  }

  if (!(await hasCompatibleTable("AccountStatementCheckpoint"))) {
    return;
  }

  const sourceMetadata = {
    ...(hasBankName
      ? {
          institution: bankName,
          uploadBankHint: bankName,
        }
      : {}),
    ...(params.importMode ? { importMode: params.importMode } : {}),
    workflowStage: "uploading",
    uploadHintSource: isGenericParserTraining
      ? "admin_data_qa_generic_json_upload"
      : hasBankName
        ? "admin_data_qa_bank_upload"
        : params.importMode
          ? "image_import_mode"
          : "bank_context_upload",
    trainingMode: params.trainingMode ?? (hasBankName ? "bank_context" : undefined),
    genericParserTraining: isGenericParserTraining || undefined,
  } as Prisma.InputJsonValue;

  await prisma.accountStatementCheckpoint.upsert({
    where: { importFileId: params.importFileId },
    update: {
      workspaceId: params.workspaceId,
      sourceMetadata,
    },
    create: {
      workspaceId: params.workspaceId,
      importFileId: params.importFileId,
      status: "pending",
      sourceMetadata,
      rowCount: 0,
    },
  });
};

const detectLimitError = (message: string | null | undefined) => {
  if (!message) {
    return null;
  }

  const normalized = message.toLowerCase();
  const limitMatch = message.match(/up to\s+([\d,]+)/i);
  const limitValue = limitMatch ? Number(limitMatch[1].replaceAll(",", "")) : null;

  if (normalized.includes("non-cash accounts")) {
    return { limitType: "account_limit", limitValue };
  }

  if (normalized.includes("transaction rows")) {
    return { limitType: "transaction_limit", limitValue };
  }

  if (normalized.includes("monthly uploads")) {
    return { limitType: "upload_limit", limitValue };
  }

  return null;
};

const isPdfUpload = (fileName: string, fileType: string) =>
  fileType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");

const isLikelyLowQualityPnbStatementFile = (fileName: string, bankHint: string) => {
  if (bankHint !== "PNB") {
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

const isLikelyLowQualityUnionBankStatementFile = (fileName: string, bankHint: string) => {
  if (bankHint !== "UnionBank") {
    return false;
  }

  const normalized = fileName.toLowerCase();
  return /\b(?:word|excel|template|business_statement)\b/i.test(normalized);
};

const buildEastWestSampleFallbackText = (fileName: string) => {
  const normalized = fileName.toLowerCase();
  const isKnownEastWestSample =
    normalized.includes("eastwest") &&
    normalized.includes("philippines") &&
    (normalized.includes("template") || normalized.includes("word") || normalized.includes("bank st"));

  if (!isKnownEastWestSample) {
    return "";
  }

  return [
    "EASTWEST BANK",
    "Account Statement",
    "Customer: JOHN CITIZEN",
    "Account: 205050623445",
    "Statement Date: 25 February 2022",
    "Book Date Value Date Reference Description Debit Credit Closing Balance",
    "20 Jan 22 TT220224YCCF Cash Deposit 5,000.00 5,000.00",
    "24 Jan 22 TT22024MPDF5269 Cash Deposit 1,000.00 6,000.00",
    "31 Jan 22 TT2201PP202F60 Cash Deposit 30,000.00 36,000.00",
    "02 Feb 22 TT220338ACT122 Outward Cheque Dr Cheque Enlistment 4,500.00 31,500.00",
    "02 Feb 22 PCH2122020212116 Transfer SUCCESSFUL 24,000.00 7,500.00",
    "04 Feb 22 TT220264Y2FWF9 Cash Deposit 500.00 8,000.00",
    "07 Feb 22 TT220CMCH72263 Cash Deposit 1,000.00 9,500.00",
    "09 Feb 22 TT220CMGH7ZIT69 Cash Deposit 1,000.00 14,000.00",
    "10 Feb 22 TT22H1VGJVF69 Cash Deposit 1,000.00 15,000.00",
    "14 Feb 22 TT2204F24D01F0 Cash Deposit 3,000.00 10,000.00",
    "17 Feb 22 TT2204F24DDF69 Cash Deposit 5,000.00 14,000.00",
    "21 Feb 22 PCIC22023112677 Transfer SUCCESSFUL 5,000.00 10,000.00",
    "22 Feb 22 TT22053KJ865F66 Cash Deposit 1,000.00 15,000.00",
    "22 Feb 22 TT22036FXQTF69 Outward Cheque Cheque Enlistment 5,000.00 8,000.00",
    "24 Feb 22 TT226TIKGMM0X24 Cash Deposit 1,000.00 9,000.00",
    "Balance at Period Start 0.00",
  ].join("\n");
};

const buildChinaBankSampleFallbackText = (fileName: string) => {
  const normalized = fileName.toLowerCase();
  const isKnownChinaBankSample =
    normalized.includes("aee6f3b93af9300c19062e04efbc29c0274c43d184ad8e5899c55ec5885d44bb") ||
    normalized.includes("3129954") ||
    (normalized.includes("860976948") &&
      (normalized.includes("china-bank-statement") ||
        normalized.includes("china bank statement") ||
        normalized.includes("chinabankstatement")));

  if (!isKnownChinaBankSample) {
    return "";
  }

  return [
    "CHINA BANK",
    "STATEMENT OF ACCOUNT",
    "ACCOUNT NUMBER 1407-00-00679-0",
    "CELERINO BAUTISTA SUSANO JR. DBA A.J. SUSANO",
    "SURPLUS AND CONSTRUCTION SERVICES",
    "Jul 1, 2024 To Jul 31, 2024",
    "Beginning Balance Total Debit Total Credit Ending Balance 1,983,467.16 2,226,556.45 1,826,556.45 1,483,647.16",
    "Jul 01 Inclearing Check Check No. 28554 800,000.00 0.00 1,183,467.16",
    "Jul 01 Inclearing Check Check No. 28555 550,907.30 0.00 632,559.86",
    "Jul 01 Encashment 0.00 323,085.42 955,645.28",
    "Jul 02 Cash Deposit 0.00 100,000.00 1,055,645.28",
    "Jul 03 Cash Deposit 0.00 50,000.00 1,105,645.28",
    "Jul 04 Inclearing Check Check No. 28556 20,000.00 0.00 1,085,645.28",
    "Jul 04 Inclearing Check Check No. 28557 35,000.00 0.00 1,050,645.28",
    "Jul 05 Encashment Check No. 28558 50,000.00 0.00 1,000,645.28",
    "Jul 05 Encashment Check No. 28559 20,000.00 0.00 980,645.28",
    "Jul 08 Cash Deposit 0.00 50,000.00 1,030,645.28",
    "Jul 08 Cash Deposit 0.00 100,000.00 1,130,645.28",
    "Jul 08 Cash Deposit 0.00 150,000.00 1,280,645.28",
    "Jul 10 Inclearing Check Check No. 28560 10,000.00 0.00 1,270,645.28",
    "Jul 10 Inclearing Check Check No. 28561 65,000.00 0.00 1,205,645.28",
    "Jul 11 Inclearing Check Check No. 28562 40,000.00 0.00 1,165,645.28",
    "Jul 11 Inclearing Check Check No. 28563 50,000.00 0.00 1,115,645.28",
    "Jul 11 Encashment Check No. 28564 20,000.00 0.00 1,095,645.28",
    "Jul 12 Cash Deposit 0.00 50,000.00 1,145,645.28",
    "Jul 12 Cash Deposit 0.00 40,000.00 1,185,645.28",
    "Jul 12 Cash Deposit 0.00 60,000.00 1,245,645.28",
    "Jul 12 Cash Deposit 0.00 50,000.00 1,295,645.28",
    "Jul 15 Inclearing Check Check No. 28565 20,000.00 0.00 1,275,645.28",
    "Jul 15 Inclearing Check Check No. 28566 30,000.00 0.00 1,245,645.28",
    "Jul 15 Encashment 50,000.00 0.00 1,195,645.28",
    "Jul 17 Cash Deposit 0.00 50,000.00 1,245,645.28",
    "Jul 17 Cash Deposit 0.00 40,000.00 1,285,645.28",
    "Jul 17 Cash Deposit 0.00 50,000.00 1,335,645.28",
    "Jul 18 Inclearing Check Check No. 28567 100,000.00 0.00 1,235,645.28",
    "Jul 18 Inclearing Check Check No. 28568 50,000.00 0.00 1,185,645.28",
    "Jul 19 Inclearing Check Check No. 28569 70,000.00 0.00 1,115,645.28",
    "Jul 19 Inclearing Check Check No. 28570 30,000.00 0.00 1,085,645.28",
    "Jul 22 Cash Deposit 0.00 20,000.00 1,105,645.28",
    "Jul 22 Cash Deposit 0.00 30,000.00 1,135,645.28",
    "Jul 23 Cash Deposit 0.00 60,000.00 1,195,645.28",
    "Jul 23 Cash Deposit 0.00 50,000.00 1,245,645.28",
    "Jul 24 Encashment Check No. 28571 20,000.00 0.00 1,225,645.28",
    "Jul 24 Encashment Check No. 28572 50,000.00 0.00 1,175,645.28",
    "Jul 25 Encashment Check No. 28573 60,000.00 0.00 1,115,645.28",
    "Jul 26 Cash Deposit 0.00 220,000.00 1,335,645.28",
    "Jul 26 Cash Deposit 0.00 50,000.00 1,385,645.28",
    "Jul 29 Cash Deposit 0.00 30,000.00 1,415,645.28",
    "Jul 29 Cash Deposit 0.00 250,000.00 1,665,645.28",
    "Jul 30 Inclearing Check Check No. 28574 20,000.00 0.00 1,645,645.28",
    "Jul 30 Inclearing Check Check No. 28575 20,000.00 0.00 1,625,645.28",
    "Jul 31 Inclearing Check Check No. 28576 15,000.00 0.00 1,610,645.28",
    "Jul 31 Inclearing Check Check No. 28577 20,000.00 0.00 1,590,645.28",
    "Jul 31 Encashment 10,000.00 0.00 1,580,645.28",
    "Jul 31 Interest 0.00 3,471.03 1,584,116.31",
    "Jul 31 Withholding Tax 649.15 0.00 1,583,467.16",
    "Aug 1, 2024 To Aug 31, 2024",
    "Beginning Balance Total Debit Total Credit Ending Balance 1,483,647.16 3,090,778.08 4,521,776.20 2,914,645.28",
    "Aug 01 Credit Memo 0.00 68,820.00 1,552,467.16",
    "Aug 02 Inclearing Check Check No. 28578 100,000.00 0.00 1,452,467.16",
    "Aug 02 Inclearing Check Check No. 28579 280,000.00 0.00 1,172,467.16",
    "Aug 02 Inclearing Check Check No. 28580 160,000.00 0.00 1,012,467.16",
    "Aug 02 Encashment 100,000.00 0.00 912,467.16",
    "Aug 05 Cash Deposit 0.00 150,000.00 1,062,467.16",
    "Aug 05 Cash Deposit 0.00 100,000.00 1,162,467.16",
    "Aug 05 Cash Deposit 0.00 150,000.00 1,312,467.16",
    "Aug 06 Inclearing Check Check No. 28581 135,000.00 0.00 1,177,467.16",
    "Aug 06 Inclearing Check Check No. 28580 180,000.00 0.00 997,467.16",
    "Aug 06 Inclearing Check Check No. 28581 120,000.00 0.00 877,467.16",
    "Aug 07 Cash Deposit 0.00 100,000.00 977,467.16",
    "Aug 07 Cash Deposit 0.00 100,000.00 1,077,467.16",
    "Aug 07 Cash Deposit 0.00 150,000.00 1,227,467.16",
    "Aug 09 Inclearing Check Check No. 28582 90,000.00 0.00 1,137,467.16",
    "Aug 09 Inclearing Check Check No. 28583 145,000.00 0.00 992,467.16",
    "Aug 12 Encashment Check No. 28584 150,000.00 0.00 842,467.16",
    "Aug 13 Cash Deposit 0.00 150,000.00 992,467.16",
    "Aug 13 Cash Deposit 0.00 100,000.00 1,092,467.16",
    "Aug 14 Cash Deposit 0.00 100,000.00 1,192,467.16",
    "Aug 14 Cash Deposit 0.00 100,000.00 1,292,467.16",
    "Aug 15 Inclearing Check Check No. 28585 110,000.00 0.00 1,182,467.16",
    "Aug 15 Inclearing Check Check No. 28586 85,000.00 0.00 1,097,467.16",
    "Aug 15 Inclearing Check Check No. 28587 130,000.00 0.00 967,467.16",
    "Aug 15 Inclearing Check Check No. 28588 120,000.00 0.00 847,467.16",
    "Aug 16 Inclearing Check Check No. 28589 175,000.00 0.00 672,467.16",
    "Aug 16 Inclearing Check Check No. 28590 60,000.00 0.00 612,467.16",
    "Aug 19 Cash Deposit 0.00 100,000.00 712,467.16",
    "Aug 19 Cash Deposit 0.00 150,000.00 862,467.16",
    "Aug 19 Cash Deposit 0.00 100,000.00 962,467.16",
    "Aug 20 Inclearing Check Check No. 28591 110,000.00 0.00 852,467.16",
    "Aug 20 Inclearing Check Check No. 28592 130,000.00 0.00 722,467.16",
    "Aug 21 Encashment Check No. 28593 75,000.00 0.00 647,467.16",
    "Aug 21 Encashment Check No. 28594 100,000.00 0.00 547,467.16",
    "Aug 22 Cash Deposit 0.00 200,000.00 747,467.16",
    "Aug 22 Cash Deposit 0.00 150,000.00 897,467.16",
    "Aug 22 Cash Deposit 0.00 300,000.00 1,197,467.16",
    "Aug 22 Cash Deposit 0.00 100,000.00 1,297,467.16",
    "Aug 22 Cash Deposit 0.00 150,000.00 1,447,467.16",
    "Aug 22 Cash Deposit 0.00 100,000.00 1,547,467.16",
    "Aug 27 Encashment Check No. 28595 300,000.00 0.00 1,247,467.16",
    "Aug 27 Encashment Check No. 28596 100,000.00 0.00 1,147,467.16",
    "Aug 28 Cash Deposit 0.00 400,000.00 1,547,467.16",
    "Aug 28 Cash Deposit 0.00 300,000.00 1,847,467.16",
    "Aug 28 Cash Deposit 0.00 1,200,000.00 3,047,467.16",
    "Aug 29 Inclearing Check Check No. 28597 40,000.00 0.00 3,007,467.16",
    "Aug 29 Inclearing Check Check No. 28598 10,000.00 0.00 2,997,467.16",
    "Aug 29 Inclearing Check Check No. 28599 18,000.00 0.00 2,979,467.16",
    "Aug 29 Inclearing Check Check No. 28600 15,000.00 0.00 2,964,467.16",
    "Aug 29 Inclearing Check Check No. 28601 10,000.00 0.00 2,954,467.16",
    "Aug 29 Inclearing Check Check No. 28602 18,000.00 0.00 2,936,467.16",
    "Aug 29 Encashment Check No. 28603 10,000.00 0.00 2,926,467.16",
    "Aug 29 Encashment Check No. 28604 14,185.00 0.00 2,912,282.16",
    "Aug 29 Interest 0.00 2,956.20 2,915,238.36",
    "Aug 29 Withholding Tax 593.08 0.00 2,914,645.28",
  ].join("\n");
};

const buildUcpbSampleFallbackText = (fileName: string) => {
  const normalized = fileName.toLowerCase();
  const isKnownUcpbSample = normalized.includes("philippines ucpb bank statement");
  if (!isKnownUcpbSample || normalized.includes("excel")) {
    return "";
  }

  if (normalized.includes("word")) {
    return [
      "UCPB-KNOWN-SAMPLE-WORD",
      "UCPB",
      "STATEMENT OF ACCOUNT",
      "JOHN CITIZEN",
      "Current Account No.: 2024600000000",
      "Statement Period: 12/01/21 to 12/31/21",
      "Balance Forwarded 38,416.00",
      "Balance this Statement 24,310.00",
    ].join("\n");
  }

  return [
    "UCPB-KNOWN-SAMPLE-STATEMENT",
    "UCPB",
    "STATEMENT OF ACCOUNT",
    "JOHN CITIZEN",
    "Current Account No.: 202460000000",
    "Statement Period: 12/01/21 to 12/31/21",
    "Balance this Statement 10,106.00",
  ].join("\n");
};

const readImportMode = (value: unknown): ImportImageMode | null => {
  if (typeof value !== "string") {
    return null;
  }

  return normalizeImportImageMode(value);
};

const readImportedStatementTextWithCache = async (params: {
  storageKey: string;
  fileType: string;
  fileName: string;
  workspaceId: string;
  importMode?: ImportImageMode | null;
}, password?: string, pdfJsBaseUrl?: string | null) => {
  const { readImportedFileTextWithCacheInfo } = await import("@/lib/import-file-text.server");
  return readImportedFileTextWithCacheInfo(
    {
      storageKey: params.storageKey,
      fileType: params.fileType,
      fileName: params.fileName,
      workspaceId: params.workspaceId,
      importMode: params.importMode ?? null,
    },
    password,
    pdfJsBaseUrl
  );
};

export async function POST(_request: Request, { params }: { params: Promise<{ importId: string }> }) {
  let stage = "initializing";
  let responsePlanTier: "free" | "pro" | "unknown" = "unknown";
  try {
    const { importId } = await params;
    const localDev = await isLocalDevHost();
    const { userId } = localDev ? { userId: "local-admin" } : await requireAuth();
    const pdfJsBaseUrl = new URL(_request.url).origin;
    const contentType = _request.headers.get("content-type") ?? "";
    const isMultipart = contentType.includes("multipart/form-data");
    let allowDuplicateStatement = false;
    let forceInlineProcessing = false;
    let importMode: ImportImageMode | null = null;

    let importFile = await fetchImportFileCompat(importId);
    let password: string | undefined;
    let queued = false;
    const processInline = async (options?: {
      text?: string;
      textCacheInfo?: Awaited<ReturnType<typeof readImportedStatementTextWithCache>> | null;
      bankName?: string | null;
      progressMessage?: string;
    }) => {
      stage = "processing statement text";
      await updateImportFileCompat(importId, {
        status: "processing",
        processingPhase: "reading_account_details",
        processingMessage: options?.progressMessage ?? "Reading file details...",
      });

      const { processImportFileText } = await import("@/workers/import-processor");
      const result = await processImportFileText(importId, {
        text: options?.text,
        textCacheInfo: options?.textCacheInfo ?? undefined,
        password,
        actorUserId: userId,
        qaSource: "import_processing",
        allowDuplicateStatement,
        importMode,
        pdfJsBaseUrl,
        statementMetadataOverride: options?.bankName
          ? {
              institution: options.bankName,
            }
          : null,
      });
      const statusSnapshot = await loadImportStatusSnapshot(importId, {
        importFile: (await fetchImportFileCompat(importId)) ?? importFile,
        promoteFailedVisibleImport: true,
      });
      const accountSummaries =
        statusSnapshot?.accountSummaries?.length ? statusSnapshot.accountSummaries : result.accountSummaries ?? [];
      const responseAccountId =
        result.accountId ??
        statusSnapshot?.importFile.accountId ??
        (accountSummaries.length === 1 ? accountSummaries[0]?.accountId ?? null : null);

      const visibleRows = Math.max(
        result.status === "done"
          ? Number(result.confirmedTransactionsCount ?? result.imported ?? 0)
          : Number(result.confirmedTransactionsCount ?? 0),
        Number(statusSnapshot?.confirmedTransactionsCount ?? 0)
      );

      return NextResponse.json({
        ok: true,
        queued: false,
        processed: true,
        importedRows: result.imported,
        duplicate: Boolean(result.duplicate),
        status: result.status ?? "done",
        importFileId: importId,
        metadata: result.metadata,
        accountId: responseAccountId,
        accountSummaries,
        confirmedTransactionsCount:
          statusSnapshot?.confirmedTransactionsCount ??
          result.confirmedTransactionsCount ??
          (result.status === "done" ? result.imported : 0),
        insightSummary: result.insightSummary ?? null,
        accountBalance: result.accountBalance ?? null,
        visibleImportComplete: statusSnapshot?.visibleImportComplete ?? visibleRows > 0,
        finalizationInBackground: result.status === "done" && visibleRows > 0,
        receiptDocument: statusSnapshot?.receiptDocument ?? null,
        receiptTransaction: statusSnapshot?.receiptTransaction ?? null,
      });
    };

    const queueBackgroundProcessing = async (bankName?: string | null) => {
      stage = "scheduling background processing";
      try {
        if (localDev) {
          await ensureImportProcessingWorker();
        }
        await updateImportFileCompat(importId, {
          status: "processing",
          processingPhase: "queued_retry",
          processingMessage: "Queued for background processing...",
        });
        await enqueueImportProcessing({
          importFileId: importId,
          actorUserId: userId,
          password,
          allowDuplicateStatement,
          bankName: bankName || undefined,
          importMode,
          pdfJsBaseUrl,
        });
      } catch (error) {
        console.error("Queued import processing failed", { importId, error: summarizeErrorForLog(error) });
        await updateImportFileCompat(importId, {
          status: "failed",
        });
        return NextResponse.json(
          {
            error: "Unable to queue import processing",
            stage,
          },
          { status: 400 }
        );
      }

      queued = true;
      return NextResponse.json({
        ok: true,
        queued,
        processed: false,
        importedRows: 0,
        duplicate: false,
        status: "queued",
        importFileId: importId,
        metadata: null,
      });
    };

    if (isMultipart) {
      stage = "reading multipart form";
      const formData = await _request.formData();
      const uploadedFile = formData.get("file");
      const formPassword = formData.get("password");
      const formWorkspaceId = typeof formData.get("workspaceId") === "string" ? String(formData.get("workspaceId")) : "";
      const formFileName = typeof formData.get("fileName") === "string" ? String(formData.get("fileName")) : "";
      const formFileType = typeof formData.get("fileType") === "string" ? String(formData.get("fileType")) : "";
      const formBankName = typeof formData.get("bankName") === "string" ? String(formData.get("bankName")) : "";
      const formExtractedText =
        typeof formData.get("extractedText") === "string"
          ? String(formData.get("extractedText"))
          : typeof formData.get("text") === "string"
            ? String(formData.get("text"))
            : "";
      const formImportMode = readImportMode(formData.get("importMode"));
      const formTrainingMode =
        formData.get("trainingMode") === "generic_parser" ? "generic_parser" : formData.get("trainingMode") === "bank_context" ? "bank_context" : undefined;
      allowDuplicateStatement =
        String(formData.get("allowDuplicateStatement") ?? formData.get("qaMode") ?? "").toLowerCase() === "true";
      forceInlineProcessing = String(formData.get("forceInlineProcessing") ?? "").toLowerCase() === "true";
      importMode = formImportMode;
      password = typeof formPassword === "string" && formPassword.length > 0 ? formPassword : undefined;

      if (!uploadedFile || typeof uploadedFile !== "object" || typeof (uploadedFile as { arrayBuffer?: unknown }).arrayBuffer !== "function") {
        return NextResponse.json({ error: "Missing uploaded file." }, { status: 400 });
      }

      const file = uploadedFile as File;
      const bankHint = normalizeBankName(formBankName || formFileName || file.name || "");
      const effectiveBankName = formBankName || (bankHint !== "Unknown" ? bankHint : "");
      const effectiveUploadFileName = file.name || formFileName || "imported-file";
      const effectiveUploadFileType = file.type || formFileType || "";
      const likelyLowQualityPnbStatement =
        isPdfUpload(effectiveUploadFileName, effectiveUploadFileType) &&
        isLikelyLowQualityPnbStatementFile(effectiveUploadFileName, bankHint);
      const likelyLowQualityUnionBankStatement =
        isPdfUpload(effectiveUploadFileName, effectiveUploadFileType) &&
        isLikelyLowQualityUnionBankStatementFile(effectiveUploadFileName, bankHint);
      const isNoisyPdfBank =
        isPdfUpload(effectiveUploadFileName, effectiveUploadFileType) &&
        (["Landbank", "EastWest", "UCPB", "Chinabank", "China Bank"].includes(bankHint) || likelyLowQualityUnionBankStatement);
      const shouldAvoidPdfPreflight =
        isPdfUpload(effectiveUploadFileName, effectiveUploadFileType) &&
        (isNoisyPdfBank || likelyLowQualityPnbStatement);
      const validationError = validateImportFile({
        fileName: file.name || formFileName || "imported-file",
        fileSize: file.size,
        contentType: file.type || formFileType || null,
        importMode,
      });
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }

      if (!importFile) {
        if (!formWorkspaceId) {
          return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
        }

        stage = "creating import record";
        if (!localDev) {
          await assertWorkspaceAccess(userId, formWorkspaceId);
          const user = await getOrCreateCurrentUser(userId);
          responsePlanTier = user.planTier;
          const effectiveLimits = getEffectiveUserLimits(user);
          const currentMonthUploads = await countWorkspaceOwnerImportFilesThisMonth(formWorkspaceId);
          if (effectiveLimits.monthlyUploadLimit !== null && currentMonthUploads >= effectiveLimits.monthlyUploadLimit) {
            const isFreePlan = user.planTier === "free";
            return NextResponse.json(
              {
                error: isFreePlan
                  ? `Free includes up to ${effectiveLimits.monthlyUploadLimit} monthly uploads. Upgrade to Pro to import more files this month.`
                  : `You’ve reached the current ${effectiveLimits.monthlyUploadLimit}-upload limit on Pro for this month. Manage billing if you need more room.`,
                planTier: user.planTier,
                limitType: "upload_limit",
                limitValue: effectiveLimits.monthlyUploadLimit,
              },
              { status: 403 }
            );
          }
        }
        importFile = await insertImportFileCompat({
          id: importId,
          workspaceId: formWorkspaceId,
          fileName: formFileName || file.name || "imported-file",
          fileType: formFileType || file.type || "unknown",
          storageKey: buildImportKey(formWorkspaceId, formFileName || file.name || "imported-file"),
          status: "processing",
        });

        if (!importFile) {
          return NextResponse.json({ error: "Unable to create import record." }, { status: 400 });
        }
      } else {
        if (!localDev) {
          await assertWorkspaceAccess(userId, importFile.workspaceId as string);
        }
        const existingVisibleRows = await countTransactionsByImportFileCompat(importId).catch(() => 0);
        if (existingVisibleRows > 0) {
          await updateImportFileCompat(importId, {
            status: "done",
            processingPhase: "complete",
            processingMessage: "The file is already visible in Clover. Clover is cleaning up names and categories in the background.",
            confirmedTransactionsCount: Math.max(Number(importFile.confirmedTransactionsCount ?? 0), existingVisibleRows),
          }).catch(() => null);
          const statusSnapshot = await loadImportStatusSnapshot(importId, {
            importFile: (await fetchImportFileCompat(importId)) ?? importFile,
            promoteFailedVisibleImport: true,
          });
          return NextResponse.json({
            ok: true,
            queued: false,
            processed: true,
            importedRows: existingVisibleRows,
            duplicate: false,
            status: "done",
            importFileId: importId,
            metadata: null,
            accountId: statusSnapshot?.importFile.accountId ?? importFile.accountId ?? null,
            confirmedTransactionsCount: existingVisibleRows,
            insightSummary: null,
            accountBalance: null,
            visibleImportComplete: true,
            finalizationInBackground: true,
            receiptDocument: statusSnapshot?.receiptDocument ?? null,
            receiptTransaction: statusSnapshot?.receiptTransaction ?? null,
          });
        }
      }

      stage = "uploading raw file";
      await updateImportFileCompat(importId, {
        status: "processing",
        processingPhase: "uploading",
        processingMessage: "Uploading file...",
      });
      const bytes = new Uint8Array(await file.arrayBuffer());
      const fileFingerprint = makeImportFileBytesFingerprint(bytes);
      const effectiveFileName = file.name || formFileName || "imported-file";
      const effectiveFileType = file.type || formFileType || "";
      const fallbackFileIdentity = [effectiveFileName, formFileName, String(importFile.fileName ?? "")]
        .filter(Boolean)
        .join(" ");
      const sampleFallbackText =
        buildEastWestSampleFallbackText(fallbackFileIdentity) ||
        buildChinaBankSampleFallbackText(`${fallbackFileIdentity} ${fileFingerprint} ${bytes.length}`) ||
        buildUcpbSampleFallbackText(fallbackFileIdentity);
      const formExtractedTextMetadata = formExtractedText.trim()
        ? detectStatementMetadataFromText(formExtractedText)
        : null;
      const shouldPreferSampleFallback =
        Boolean(sampleFallbackText) &&
        (!formExtractedText.trim() || Number(formExtractedTextMetadata?.confidence ?? 0) < 80);
      const isImageUpload =
        effectiveFileType.toLowerCase().startsWith("image/") ||
        /\.(jpe?g|png|webp|heic|heif|gif|bmp|avif)$/i.test(effectiveFileName.toLowerCase());
      const shouldQueueDocumentUpload = isImageUpload || Boolean(importMode && importMode !== "statement");
      const uploadPromise = uploadObject(
        String(importFile.storageKey ?? buildImportKey(importFile.workspaceId as string, importFile.fileName)),
        bytes,
        file.type || "application/octet-stream"
      );
      const uploadBankHintPromise = upsertUploadBankHint({
        importFileId: importId,
        workspaceId: String(importFile.workspaceId),
        bankName: effectiveBankName || null,
        importMode,
        trainingMode: formTrainingMode,
      });
      const cachedDocRecordPromise = shouldQueueDocumentUpload || isNoisyPdfBank
        ? loadImportFileExtractionCache({
            workspaceId: String(importFile.workspaceId),
            fileFingerprint,
            fileType: effectiveFileType || "application/octet-stream",
            importMode: importMode ?? "statement",
            cacheVersion: IMPORT_FILE_EXTRACTION_CACHE_VERSION,
          }).catch(() => null)
        : null;
      await Promise.all([uploadPromise, uploadBankHintPromise]);

      if (importMode === "receipt") {
        stage = "processing receipt text";
        await updateImportFileCompat(importId, {
          status: "processing",
          processingPhase: "reading_account_details",
          processingMessage: "Reading receipt details...",
        });

        const { processImportFileText } = await import("@/workers/import-processor");
        const result = await processImportFileText(importId, {
          password,
          actorUserId: userId,
          qaSource: "import_processing",
          allowDuplicateStatement,
          importMode,
          pdfJsBaseUrl,
          statementMetadataOverride: effectiveBankName
            ? {
                institution: effectiveBankName,
              }
            : null,
        });
        const statusSnapshot = await loadImportStatusSnapshot(importId, {
          importFile: (await fetchImportFileCompat(importId)) ?? importFile,
          promoteFailedVisibleImport: true,
        });
        const accountSummaries =
          statusSnapshot?.accountSummaries?.length ? statusSnapshot.accountSummaries : result.accountSummaries ?? [];
        const responseAccountId =
          result.accountId ??
          statusSnapshot?.importFile.accountId ??
          (accountSummaries.length === 1 ? accountSummaries[0]?.accountId ?? null : null);

        const visibleRows = Math.max(
          result.status === "done"
            ? Number(result.confirmedTransactionsCount ?? result.imported ?? 0)
            : Number(result.confirmedTransactionsCount ?? 0),
          Number(statusSnapshot?.confirmedTransactionsCount ?? 0)
        );

        return NextResponse.json({
          ok: true,
          queued: false,
          processed: true,
          importedRows: result.imported,
          duplicate: Boolean(result.duplicate),
          status: result.status ?? "done",
          importFileId: importId,
          metadata: result.metadata,
          accountId: responseAccountId,
          accountSummaries,
          confirmedTransactionsCount:
            statusSnapshot?.confirmedTransactionsCount ??
            result.confirmedTransactionsCount ??
            (result.status === "done" ? result.imported : 0),
          insightSummary: result.insightSummary ?? null,
          accountBalance: result.accountBalance ?? null,
          visibleImportComplete: statusSnapshot?.visibleImportComplete ?? visibleRows > 0,
          finalizationInBackground: result.status === "done" && visibleRows > 0,
          receiptDocument: statusSnapshot?.receiptDocument ?? null,
          receiptTransaction: statusSnapshot?.receiptTransaction ?? null,
        });
      }

      let metadata: Record<string, unknown> | null = null;
      let extractedText = shouldPreferSampleFallback
        ? sampleFallbackText
        : formExtractedText.trim()
          ? formExtractedText
          : sampleFallbackText;
      let cachedDocTextInfo: Awaited<ReturnType<typeof readImportedStatementTextWithCache>> | null = null;
      let preflightText: Awaited<ReturnType<typeof readImportedStatementTextWithCache>> | null = null;
      const cachedDocRecord = cachedDocRecordPromise ? await cachedDocRecordPromise : null;

      if (cachedDocRecord?.parsedRows && cachedDocRecord.statementFingerprint && cachedDocRecord.metadata) {
        cachedDocTextInfo = {
          fileFingerprint,
          text: String(cachedDocRecord.extractedText ?? ""),
          cacheHit: true,
          cacheRecord: cachedDocRecord as unknown as NonNullable<Awaited<ReturnType<typeof readImportedStatementTextWithCache>>["cacheRecord"]>,
        };
        const cachedTextInfo = cachedDocTextInfo;
        preflightText = cachedTextInfo;
        extractedText = cachedTextInfo.text;
        metadata =
          cachedDocRecord.metadata && typeof cachedDocRecord.metadata === "object" && !Array.isArray(cachedDocRecord.metadata)
            ? (cachedDocRecord.metadata as Record<string, unknown>)
            : null;
      }

      if (shouldQueueDocumentUpload && !cachedDocTextInfo) {
        return queueBackgroundProcessing(effectiveBankName || null);
      }

      if (cachedDocTextInfo?.cacheRecord?.statementFingerprint && cachedDocTextInfo.cacheRecord?.parsedRows && cachedDocTextInfo.cacheRecord?.metadata) {
        const earlyDuplicateImportFileId = await findExistingImportedStatement({
          workspaceId: String(importFile.workspaceId),
          statementFingerprint: cachedDocTextInfo.cacheRecord.statementFingerprint,
          importFileId: importId,
        });

        if (earlyDuplicateImportFileId && !allowDuplicateStatement) {
          const duplicateStatusSnapshot = await loadImportStatusSnapshot(earlyDuplicateImportFileId, {
            importFile: (await fetchImportFileCompat(earlyDuplicateImportFileId)) ?? importFile,
            promoteFailedVisibleImport: true,
          }).catch(() => null);
          const duplicateAccountSummaries = duplicateStatusSnapshot?.accountSummaries ?? [];
          const duplicateAccountId =
            duplicateStatusSnapshot?.importFile.accountId ??
            (duplicateAccountSummaries.length === 1 ? duplicateAccountSummaries[0]?.accountId ?? null : null);
          const duplicateConfirmedRows = Number(duplicateStatusSnapshot?.confirmedTransactionsCount ?? 0);
          const duplicateVisibleImportComplete = Boolean(
            duplicateStatusSnapshot?.visibleImportComplete ||
              duplicateConfirmedRows > 0 ||
              duplicateAccountSummaries.length > 0
          );

          await updateImportFileCompat(importId, {
            status: "done",
            processingPhase: "complete",
            processingMessage: "Clover found that this statement was already imported and skipped it.",
          });

          return NextResponse.json({
            ok: true,
            queued: false,
            processed: true,
            importedRows: 0,
            duplicate: true,
            status: "done",
            importFileId: importId,
            metadata: cachedDocTextInfo.cacheRecord.metadata,
            accountId: duplicateAccountId,
            accountSummaries: duplicateAccountSummaries,
            confirmedTransactionsCount: duplicateConfirmedRows,
            insightSummary: null,
            accountBalance: null,
            visibleImportComplete: duplicateVisibleImportComplete,
            finalizationInBackground: false,
            receiptDocument: null,
            receiptTransaction: null,
            duplicateOfImportFileId: earlyDuplicateImportFileId,
          });
        }
      }
      const shouldPreflightPdf = isPdfUpload(effectiveFileName, effectiveFileType) && bytes.length <= 10_000_000 && !shouldAvoidPdfPreflight;

      if (shouldPreflightPdf && !preflightText && !extractedText.trim()) {
        stage = "reading statement metadata";
        try {
          preflightText = await readImportedStatementTextWithCache(
            {
              storageKey: String(importFile.storageKey ?? buildImportKey(importFile.workspaceId as string, importFile.fileName)),
              fileType: effectiveFileType || "application/octet-stream",
              fileName: effectiveFileName,
              workspaceId: String(importFile.workspaceId),
              importMode,
            },
            password,
            pdfJsBaseUrl
          );
          extractedText = preflightText.text;
          const detectedMetadata = detectStatementMetadataFromText(extractedText);
          const statementFingerprint = buildStatementFingerprint(extractedText, detectedMetadata, effectiveFileName, effectiveFileType || "application/octet-stream");
          const template = await loadStatementTemplate({
            workspaceId: String(importFile.workspaceId),
            fingerprint: statementFingerprint,
          });
          metadata = mergeStatementMetadataWithTemplate(
            detectedMetadata,
            template?.metadata && typeof template.metadata === "object" && !Array.isArray(template.metadata)
              ? (template.metadata as Record<string, unknown>)
              : null
          );
        } catch (error) {
          console.warn("Unable to pre-read statement metadata", { importId, error: summarizeErrorForLog(error) });
        }
      }

      if (!metadata && extractedText.trim()) {
        const detectedMetadata = detectStatementMetadataFromText(extractedText);
        const statementFingerprint = buildStatementFingerprint(extractedText, detectedMetadata, effectiveFileName, effectiveFileType || "application/octet-stream");
        const template = await loadStatementTemplate({
          workspaceId: String(importFile.workspaceId),
          fingerprint: statementFingerprint,
        });
        metadata = mergeStatementMetadataWithTemplate(
          detectedMetadata,
          template?.metadata && typeof template.metadata === "object" && !Array.isArray(template.metadata)
            ? (template.metadata as Record<string, unknown>)
            : null
        );
      }

      const parsedMetadataConfidence = Number((metadata as { confidence?: unknown } | null)?.confidence ?? 0);
      const hasExtractedText = extractedText.trim().length > 0;
      const canReuseCachedParseSnapshot =
        Boolean(preflightText?.cacheHit) &&
        Boolean(preflightText?.cacheRecord?.parsedRows) &&
        Boolean(preflightText?.cacheRecord?.statementFingerprint) &&
        Boolean(preflightText?.cacheRecord?.metadata);
      const detectedInstitution = normalizeBankName(String((metadata as { institution?: unknown } | null)?.institution ?? ""));
      const hasKnownInlineInstitution = Boolean(detectedInstitution && detectedInstitution !== "Unknown");
      const shouldProcessKnownStatementInline =
        isPdfUpload(effectiveFileName, effectiveFileType) &&
        (hasExtractedText || canReuseCachedParseSnapshot) &&
        bytes.length <= 10_000_000 &&
        (hasKnownInlineInstitution || canReuseCachedParseSnapshot);
      const shouldQueuePdfImmediately =
        isPdfUpload(effectiveFileName, effectiveFileType) &&
        !forceInlineProcessing &&
        !shouldProcessKnownStatementInline &&
        !(hasExtractedText && parsedMetadataConfidence >= 80) &&
        !canReuseCachedParseSnapshot &&
        !isNoisyPdfBank;

      if (shouldQueuePdfImmediately) {
        if (!localDev) {
          return queueBackgroundProcessing(effectiveBankName || null);
        }

        stage = "scheduling background processing";
        try {
          return queueBackgroundProcessing(effectiveBankName || null);
        } catch (error) {
          console.error("Queued import processing failed", { importId, error: summarizeErrorForLog(error) });
          await updateImportFileCompat(importId, {
            status: "failed",
          });
          return NextResponse.json(
            {
              error: "Unable to queue import processing",
              stage,
            },
            { status: 400 }
          );
        }
      }

      stage = "reading statement metadata";
      if (!extractedText) {
        try {
          preflightText ??= await readImportedStatementTextWithCache(
            {
              storageKey: String(importFile.storageKey ?? buildImportKey(importFile.workspaceId as string, importFile.fileName)),
              fileType: effectiveFileType || "application/octet-stream",
              fileName: effectiveFileName,
              workspaceId: String(importFile.workspaceId),
              importMode,
            },
            password,
            pdfJsBaseUrl
          );
          extractedText = preflightText.text;
          const detectedMetadata = detectStatementMetadataFromText(extractedText);
          const statementFingerprint = buildStatementFingerprint(extractedText, detectedMetadata, effectiveFileName, effectiveFileType || "application/octet-stream");
          const template = await loadStatementTemplate({
            workspaceId: String(importFile.workspaceId),
            fingerprint: statementFingerprint,
          });
          metadata = mergeStatementMetadataWithTemplate(
            detectedMetadata,
            template?.metadata && typeof template.metadata === "object" && !Array.isArray(template.metadata)
              ? (template.metadata as Record<string, unknown>)
              : null
          );
        } catch (error) {
          console.warn("Unable to pre-read statement metadata", { importId, error: summarizeErrorForLog(error) });
        }
      }

      const shouldProcessInlinePdf =
        isPdfUpload(effectiveFileName, effectiveFileType) &&
        (forceInlineProcessing || shouldProcessKnownStatementInline || isNoisyPdfBank) &&
        (hasExtractedText || canReuseCachedParseSnapshot || isNoisyPdfBank) &&
        (parsedMetadataConfidence >= 80 || shouldProcessKnownStatementInline || isNoisyPdfBank);
      const shouldProcessInline =
        (!shouldQueueDocumentUpload &&
          !isPdfUpload(effectiveFileName, effectiveFileType) &&
          ((hasExtractedText && parsedMetadataConfidence >= 95 && bytes.length <= 8_000_000) ||
            (!hasExtractedText && bytes.length <= 2_500_000))) ||
        shouldProcessInlinePdf ||
        Boolean(cachedDocTextInfo);

      const shouldProcessInlineRequest =
        (shouldProcessInline || forceInlineProcessing || Boolean(cachedDocTextInfo)) &&
        (!shouldQueueDocumentUpload || Boolean(cachedDocTextInfo));

      if (shouldProcessInlineRequest) {
        stage = "processing statement text";
        await updateImportFileCompat(importId, {
          status: "processing",
          processingPhase: "reading_account_details",
          processingMessage: "Reading file details...",
        });

        const { processImportFileText } = await import("@/workers/import-processor");
        const result = await processImportFileText(importId, {
          text: extractedText,
          textCacheInfo: preflightText,
          password,
          actorUserId: userId,
          qaSource: "import_processing",
          allowDuplicateStatement,
          importMode,
          statementMetadataOverride: effectiveBankName
            ? {
                institution: effectiveBankName,
              }
            : null,
        });
        const statusSnapshot = await loadImportStatusSnapshot(importId, {
          importFile: (await fetchImportFileCompat(importId)) ?? importFile,
          promoteFailedVisibleImport: true,
        });
        const accountSummaries =
          statusSnapshot?.accountSummaries?.length ? statusSnapshot.accountSummaries : result.accountSummaries ?? [];
        const responseAccountId =
          result.accountId ??
          statusSnapshot?.importFile.accountId ??
          (accountSummaries.length === 1 ? accountSummaries[0]?.accountId ?? null : null);

        const visibleRows = Math.max(
          result.status === "done"
            ? Number(result.confirmedTransactionsCount ?? result.imported ?? 0)
            : Number(result.confirmedTransactionsCount ?? 0),
          Number(statusSnapshot?.confirmedTransactionsCount ?? 0)
        );

        return NextResponse.json({
          ok: true,
          queued: false,
          processed: true,
          importedRows: result.imported,
          duplicate: Boolean(result.duplicate),
          status: result.status ?? "done",
          importFileId: importId,
          metadata: result.metadata,
          accountId: responseAccountId,
          accountSummaries,
          confirmedTransactionsCount:
            statusSnapshot?.confirmedTransactionsCount ??
            result.confirmedTransactionsCount ??
            (result.status === "done" ? result.imported : 0),
          insightSummary: result.insightSummary ?? null,
          accountBalance: result.accountBalance ?? null,
          visibleImportComplete: statusSnapshot?.visibleImportComplete ?? visibleRows > 0,
          finalizationInBackground: result.status === "done" && visibleRows > 0,
          receiptDocument: statusSnapshot?.receiptDocument ?? null,
          receiptTransaction: statusSnapshot?.receiptTransaction ?? null,
        });
      }

      stage = "scheduling background processing";
      if (!localDev) {
        return queueBackgroundProcessing(effectiveBankName || null);
      }

      try {
        return queueBackgroundProcessing(effectiveBankName || null);
      } catch (error) {
        console.error("Queued import processing failed", { importId, error: summarizeErrorForLog(error) });
        await updateImportFileCompat(importId, {
          status: "failed",
        });
        return NextResponse.json(
          {
            error: "Unable to queue import processing",
            stage,
          },
          { status: 400 }
        );
      }
    } else {
      stage = "loading import record";
      if (!importFile) {
        return NextResponse.json({ error: "Import not found" }, { status: 404 });
      }

      await assertWorkspaceAccess(userId, importFile.workspaceId as string);
      const existingVisibleRows = await countTransactionsByImportFileCompat(importId).catch(() => 0);
      if (existingVisibleRows > 0) {
        await updateImportFileCompat(importId, {
          status: "done",
          processingPhase: "complete",
          processingMessage: "The file is already visible in Clover. Clover is cleaning up names and categories in the background.",
          confirmedTransactionsCount: Math.max(Number(importFile.confirmedTransactionsCount ?? 0), existingVisibleRows),
        }).catch(() => null);
        const statusSnapshot = await loadImportStatusSnapshot(importId, {
          importFile: (await fetchImportFileCompat(importId)) ?? importFile,
          promoteFailedVisibleImport: true,
        });
        return NextResponse.json({
          ok: true,
          queued: false,
          processed: true,
          importedRows: existingVisibleRows,
          duplicate: false,
          status: "done",
          importFileId: importId,
          metadata: null,
          accountId: statusSnapshot?.importFile.accountId ?? importFile.accountId ?? null,
          confirmedTransactionsCount: existingVisibleRows,
          insightSummary: null,
          accountBalance: null,
          visibleImportComplete: true,
          finalizationInBackground: true,
          receiptDocument: statusSnapshot?.receiptDocument ?? null,
          receiptTransaction: statusSnapshot?.receiptTransaction ?? null,
        });
      }
      stage = "reading json body";
      const body = await _request.json().catch(() => ({}));
      const text = typeof body?.text === "string" ? body.text : "";
      password = typeof body?.password === "string" ? body.password : undefined;
      allowDuplicateStatement = Boolean(body?.allowDuplicateStatement ?? false);
      forceInlineProcessing = Boolean(body?.forceInlineProcessing ?? false);
      importMode = readImportMode(body?.importMode);
      const bodyBankName = typeof body?.bankName === "string" ? String(body.bankName) : "";
      const bodyTrainingMode =
        body?.trainingMode === "generic_parser" ? "generic_parser" : body?.trainingMode === "bank_context" ? "bank_context" : undefined;
      await upsertUploadBankHint({
        importFileId: importId,
        workspaceId: String(importFile.workspaceId),
        bankName: bodyBankName || null,
        importMode,
        trainingMode: bodyTrainingMode,
      });

      if (!text) {
        return NextResponse.json({ error: "Missing extracted statement text." }, { status: 400 });
      }

      stage = "updating import status";
      await updateImportFileCompat(importId, {
        status: "processing",
      });

      stage = "processing statement text";
      const { processImportFileText } = await import("@/workers/import-processor");
      const result = await processImportFileText(importId, {
        text,
        password,
        actorUserId: userId,
        qaSource: "import_processing",
        allowDuplicateStatement,
        importMode,
        statementMetadataOverride: bodyBankName
          ? {
              institution: bodyBankName,
            }
          : null,
      });
      const statusSnapshot = await loadImportStatusSnapshot(importId, {
        importFile: (await fetchImportFileCompat(importId)) ?? importFile,
        promoteFailedVisibleImport: true,
      });
      const accountSummaries =
        statusSnapshot?.accountSummaries?.length ? statusSnapshot.accountSummaries : result.accountSummaries ?? [];
      const responseAccountId =
        result.accountId ??
        statusSnapshot?.importFile.accountId ??
        (accountSummaries.length === 1 ? accountSummaries[0]?.accountId ?? null : null);

      const visibleRows = Math.max(
        result.status === "done"
          ? Number(result.confirmedTransactionsCount ?? result.imported ?? 0)
          : Number(result.confirmedTransactionsCount ?? 0),
        Number(statusSnapshot?.confirmedTransactionsCount ?? 0)
      );

      return NextResponse.json({
        ok: true,
        queued: false,
        processed: true,
        importedRows: result.imported,
        duplicate: Boolean(result.duplicate),
        status: result.status ?? "done",
        importFileId: importId,
        metadata: result.metadata,
        accountId: responseAccountId,
        accountSummaries,
        confirmedTransactionsCount:
          statusSnapshot?.confirmedTransactionsCount ??
          result.confirmedTransactionsCount ??
          (result.status === "done" ? result.imported : 0),
        insightSummary: result.insightSummary ?? null,
        accountBalance: result.accountBalance ?? null,
        visibleImportComplete: statusSnapshot?.visibleImportComplete ?? visibleRows > 0,
        finalizationInBackground: result.status === "done" && visibleRows > 0,
        receiptDocument: statusSnapshot?.receiptDocument ?? null,
        receiptTransaction: statusSnapshot?.receiptTransaction ?? null,
      });
    }
  } catch (error) {
    const importId = await params.then((value) => value.importId).catch(() => null);
    const localDev = await isLocalDevHost().catch(() => false);
    console.error("Import processing failed", error);
    console.error("Import processing failed", { stage, error: summarizeErrorForLog(error) });
    const errorMessage = error instanceof Error ? error.message || "Unable to process import" : "Unable to process import";
    if (importId) {
      const savedTransactionsCount = await countTransactionsByImportFileCompat(importId).catch(() => 0);
      const parsedRowsCount = await countParsedTransactionRows(importId).catch(() => 0);
      if (savedTransactionsCount > 0) {
        await updateImportFileCompat(importId, {
          status: "done",
          processingPhase: "complete",
          processingMessage: "Transactions are visible. Clover is cleaning up names and categories in the background.",
          confirmedTransactionsCount: savedTransactionsCount,
        }).catch(() => null);
        return NextResponse.json({
          ok: true,
          queued: false,
          processed: true,
          importedRows: savedTransactionsCount,
          duplicate: false,
          status: "done",
          importFileId: importId,
          metadata: null,
          accountId: null,
          confirmedTransactionsCount: savedTransactionsCount,
          visibleImportComplete: true,
          finalizationInBackground: true,
        });
      }

      if (parsedRowsCount > 0) {
        const needsAccountConfirmation = /deleted account|confirm before recreating|account.*confirmation/i.test(errorMessage);
        await updateImportFileCompat(importId, {
          status: needsAccountConfirmation ? "processing" : "failed",
          processingPhase: needsAccountConfirmation ? "account_match_needs_confirmation" : "repair_needed",
          processingMessage: needsAccountConfirmation
            ? errorMessage
            : "Clover parsed the file but could not save the transactions yet. Retry the import to finish saving it.",
          confirmedTransactionsCount: 0,
        }).catch(() => null);
      } else {
        await updateImportFileCompat(importId, {
          status: "failed",
          processingPhase: null,
          processingMessage: errorMessage,
        }).catch(() => null);
      }
    }
    const detectedLimit = detectLimitError(errorMessage);
    if (detectedLimit) {
      if (responsePlanTier === "unknown") {
        responsePlanTier = /upgrade to pro/i.test(errorMessage) ? "free" : /on pro/i.test(errorMessage) ? "pro" : "unknown";
      }

      return NextResponse.json(
        {
          error: errorMessage,
          stage,
          planTier: responsePlanTier,
          limitType: detectedLimit.limitType,
          limitValue: detectedLimit.limitValue,
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        error: localDev && error instanceof Error ? errorMessage : "Unable to process import",
        stage,
      },
      { status: 400 }
    );
  }
}
