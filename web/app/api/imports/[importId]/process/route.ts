import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { buildImportKey } from "@/lib/import-keys";
import {
  detectStatementMetadataFromText,
  countParsedTransactionRows,
  countTransactionsByImportFileCompat,
  fetchImportFileCompat,
  insertImportFileCompat,
  loadStatementTemplate,
  mergeStatementMetadataWithTemplate,
  updateImportFileCompat,
  buildStatementFingerprint,
} from "@/lib/data-engine";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { enqueueImportProcessing } from "@/lib/import-queue";
import { ensureImportProcessingWorker } from "@/lib/import-worker-runtime";
import { uploadObject } from "@/lib/s3";
import { validateImportFile } from "@/lib/import-file-validation";
import { countWorkspaceImportFilesThisMonth } from "@/lib/plan-access";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { getEffectiveUserLimits } from "@/lib/user-limits";
import { summarizeErrorForLog } from "@/lib/security-logging";
import { NextResponse } from "next/server";
import { normalizeBankName } from "@/lib/data-qa-banks";
import { hasCompatibleTable } from "@/lib/data-engine";
import { prisma } from "@/lib/prisma";
import { normalizeImportImageMode, type ImportImageMode } from "@/lib/import-image-mode";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

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

const readImportMode = (value: unknown): ImportImageMode | null => {
  if (typeof value !== "string") {
    return null;
  }

  return normalizeImportImageMode(value);
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

    if (isMultipart) {
      stage = "reading multipart form";
      const formData = await _request.formData();
      const uploadedFile = formData.get("file");
      const formPassword = formData.get("password");
      const formWorkspaceId = typeof formData.get("workspaceId") === "string" ? String(formData.get("workspaceId")) : "";
      const formFileName = typeof formData.get("fileName") === "string" ? String(formData.get("fileName")) : "";
      const formFileType = typeof formData.get("fileType") === "string" ? String(formData.get("fileType")) : "";
      const formBankName = typeof formData.get("bankName") === "string" ? String(formData.get("bankName")) : "";
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
          const currentMonthUploads = await countWorkspaceImportFilesThisMonth(formWorkspaceId);
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
      }

      stage = "uploading raw file";
      await updateImportFileCompat(importId, {
        status: "processing",
        processingPhase: "uploading",
        processingMessage: "Uploading file...",
      });
      const bytes = new Uint8Array(await file.arrayBuffer());
      await uploadObject(String(importFile.storageKey ?? buildImportKey(importFile.workspaceId as string, importFile.fileName)), bytes, file.type || "application/octet-stream");
      await upsertUploadBankHint({
        importFileId: importId,
        workspaceId: String(importFile.workspaceId),
        bankName: formBankName || null,
        importMode,
        trainingMode: formTrainingMode,
      });
      let metadata: Record<string, unknown> | null = null;
      let extractedText = "";
      const effectiveFileName = file.name || formFileName || "imported-file";
      const effectiveFileType = file.type || formFileType || "";
      const isImageUpload =
        effectiveFileType.toLowerCase().startsWith("image/") ||
        /\.(jpe?g|png|webp|heic|heif|gif|bmp|avif)$/i.test(effectiveFileName.toLowerCase());
      const shouldQueueDocumentUpload = isImageUpload || Boolean(importMode && importMode !== "statement");
      if (shouldQueueDocumentUpload) {
        stage = "scheduling background processing";
        try {
          await ensureImportProcessingWorker();
          await enqueueImportProcessing({
            importFileId: importId,
            actorUserId: userId,
            password,
            allowDuplicateStatement,
            bankName: formBankName || undefined,
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

        return NextResponse.json({
          ok: true,
          queued: true,
          processed: false,
          importedRows: 0,
          duplicate: false,
          status: "queued",
          importFileId: importId,
          metadata: null,
        });
      }
      const shouldPreflightPdf = isPdfUpload(effectiveFileName, effectiveFileType) && bytes.length <= 10_000_000;

      if (shouldPreflightPdf) {
        stage = "reading statement metadata";
        try {
          const { readImportedFileText } = await import("@/lib/import-file-text.server");
          extractedText = await readImportedFileText(
            {
              storageKey: String(importFile.storageKey ?? buildImportKey(importFile.workspaceId as string, importFile.fileName)),
              fileType: effectiveFileType || "application/octet-stream",
              fileName: effectiveFileName,
            },
            password,
            pdfJsBaseUrl
          );
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

      const parsedMetadataConfidence = Number((metadata as { confidence?: unknown } | null)?.confidence ?? 0);
      const hasExtractedText = extractedText.trim().length > 0;
      const detectedInstitution = normalizeBankName(String((metadata as { institution?: unknown } | null)?.institution ?? ""));
      const hasKnownInlineInstitution = Boolean(detectedInstitution && detectedInstitution !== "Unknown");
      const shouldProcessKnownStatementInline =
        isPdfUpload(effectiveFileName, effectiveFileType) &&
        hasExtractedText &&
        bytes.length <= 10_000_000 &&
        hasKnownInlineInstitution;
      const shouldQueuePdfImmediately =
        isPdfUpload(effectiveFileName, effectiveFileType) &&
        !forceInlineProcessing &&
        !shouldProcessKnownStatementInline &&
        !(hasExtractedText && parsedMetadataConfidence >= 80);

      if (shouldQueuePdfImmediately) {
        stage = "scheduling background processing";
        try {
          if (!shouldQueueDocumentUpload) {
            await ensureImportProcessingWorker();
          }
        await enqueueImportProcessing({
          importFileId: importId,
          actorUserId: userId,
          password,
          allowDuplicateStatement,
          bankName: formBankName || undefined,
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

        return NextResponse.json({
          ok: true,
          queued: true,
          processed: false,
          importedRows: 0,
          duplicate: false,
          status: "queued",
          importFileId: importId,
          metadata: null,
        });
      }

      stage = "reading statement metadata";
      if (!metadata || !extractedText) {
        try {
          const { readImportedFileText } = await import("@/lib/import-file-text.server");
          extractedText = await readImportedFileText(
            {
              storageKey: String(importFile.storageKey ?? buildImportKey(importFile.workspaceId as string, importFile.fileName)),
              fileType: effectiveFileType || "application/octet-stream",
              fileName: effectiveFileName,
            },
            password,
            pdfJsBaseUrl
          );
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
        (forceInlineProcessing || shouldProcessKnownStatementInline) &&
        hasExtractedText &&
        (parsedMetadataConfidence >= 80 || shouldProcessKnownStatementInline);
      const shouldProcessInline =
        (!shouldQueueDocumentUpload &&
          !isPdfUpload(effectiveFileName, effectiveFileType) &&
          ((hasExtractedText && parsedMetadataConfidence >= 95 && bytes.length <= 8_000_000) ||
            (!hasExtractedText && bytes.length <= 2_500_000))) ||
        shouldProcessInlinePdf;

      const shouldProcessInlineRequest = (shouldProcessInline || forceInlineProcessing) && !shouldQueueDocumentUpload;

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
          password,
          actorUserId: userId,
          qaSource: "import_processing",
          allowDuplicateStatement,
          importMode,
          statementMetadataOverride: formBankName
            ? {
                institution: formBankName,
              }
            : null,
        });

        const visibleRows =
          result.status === "done"
            ? Number(result.confirmedTransactionsCount ?? result.imported ?? 0)
            : Number(result.confirmedTransactionsCount ?? 0);

        return NextResponse.json({
          ok: true,
          queued: false,
          processed: true,
          importedRows: result.imported,
          duplicate: Boolean(result.duplicate),
          status: result.status ?? "done",
          importFileId: importId,
          metadata: result.metadata,
          accountId: result.accountId ?? null,
          confirmedTransactionsCount: result.confirmedTransactionsCount ?? (result.status === "done" ? result.imported : 0),
          insightSummary: result.insightSummary ?? null,
          accountBalance: result.accountBalance ?? null,
          visibleImportComplete: visibleRows > 0,
          finalizationInBackground: result.status === "done" && visibleRows > 0,
        });
      }

      stage = "scheduling background processing";
      try {
        if (!shouldQueueDocumentUpload) {
          await ensureImportProcessingWorker();
        }
      await enqueueImportProcessing({
        importFileId: importId,
        actorUserId: userId,
        password,
        allowDuplicateStatement,
        bankName: formBankName || undefined,
          importMode: importMode ?? undefined,
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
        metadata,
      });
    } else {
      stage = "loading import record";
      if (!importFile) {
        return NextResponse.json({ error: "Import not found" }, { status: 404 });
      }

      await assertWorkspaceAccess(userId, importFile.workspaceId as string);
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

      const visibleRows =
        result.status === "done"
          ? Number(result.confirmedTransactionsCount ?? result.imported ?? 0)
          : Number(result.confirmedTransactionsCount ?? 0);

      return NextResponse.json({
        ok: true,
        queued: false,
        processed: true,
        importedRows: result.imported,
        duplicate: Boolean(result.duplicate),
        status: result.status ?? "done",
        importFileId: importId,
        metadata: result.metadata,
        accountId: result.accountId ?? null,
        confirmedTransactionsCount: result.confirmedTransactionsCount ?? (result.status === "done" ? result.imported : 0),
        insightSummary: result.insightSummary ?? null,
        accountBalance: result.accountBalance ?? null,
        visibleImportComplete: visibleRows > 0,
        finalizationInBackground: result.status === "done" && visibleRows > 0,
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
      if (savedTransactionsCount > 0 || parsedRowsCount > 0) {
        await updateImportFileCompat(importId, {
          status: "done",
          processingPhase: "finalizing_enrichment",
          processingMessage:
            savedTransactionsCount > 0
              ? "Transactions are visible. Clover is cleaning up names and categories in the background."
              : "Account details are visible. Clover is finishing transaction cleanup in the background.",
          confirmedTransactionsCount: savedTransactionsCount,
        }).catch(() => null);
        if (savedTransactionsCount > 0) {
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
