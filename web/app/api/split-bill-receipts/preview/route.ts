import { classifyUnsettledPurchaseDocument } from "@/lib/purchase-document-payment";
import { mergeReceiptBackup } from "@/lib/receipt-backup-preview";
import { canPreviewLocalReceiptItems } from "@/lib/receipt-item-table";
import { assessFinancialUploadScope, getClearLocalPhotoRejection, getUploadRejectionDetails, NonFinancialUploadError } from "@/lib/financial-upload-scope";
import { validateImportImageDecode } from "@/lib/import-image-validation.server";
import { readLocalReceiptOcrText } from "@/lib/local-receipt-ocr-envelope";
import { getMobileRequestContext } from "@/lib/mobile-request-context";
import { after, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isPdfPasswordError, normalizeReceiptImageForVision, readUploadedFileText, renderReceiptPdfPagesForVision } from "@/lib/import-file-text.server";
import { parseImportTextWithOpenAIFallback, type OpenAIImportModelUsage } from "@/lib/openai-import-parser";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import { assessReceiptPreviewQuality, parseReceiptPhotoText, parseReceiptText, type ReceiptPreviewResult } from "@/lib/split-bill";
import { isLocalDevHost } from "@/lib/auth";
import { validateImportFile, validateImportFileBytes } from "@/lib/import-file-validation";
import { assertContentLengthWithin, assertTrustedRequestOrigin } from "@/lib/request-security";
import { assertRateLimit } from "@/lib/rate-limit";
import { uploadObject } from "@/lib/s3";
import { nativeUploadRequest, readReceiptUpload } from "@/lib/native-upload-store";
import { isUploadPhoto, isUploadPdf, NATIVE_UPLOAD_MAX_SIZE } from "../../../../../shared/native-upload";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { selectedWorkspaceKey } from "@/lib/workspace-selection";
import { mayUseImportCloudAi } from "@/lib/clover-token-usage";
import { estimateLocalParserTokens } from "@/lib/import-token-usage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_RECEIPT_REQUEST_BYTES = 4.5 * 1024 * 1024;
const sanitizeReceiptFileName = (value: string) =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "receipt";

const isReceiptImage = (file: Pick<File, "name" | "type">) =>
  isUploadPhoto(file.name, file.type);
const isReceiptPdf = (file: Pick<File, "name" | "type">) => isUploadPdf(file.name, file.type);

const tryReceiptBackup = async (params: {
  consentUserId: string;
  file: Pick<File, "name" | "type">;
  bytes: Uint8Array;
  receiptText: string;
  preview: ReceiptPreviewResult;
  onUsage?: (usage: OpenAIImportModelUsage) => void;
}) => {
  const isImage = isReceiptImage(params.file);
  const isPdf = isReceiptPdf(params.file);
  if (!process.env.OPENAI_API_KEY?.trim() || (!isImage && !isPdf) || !assessReceiptPreviewQuality(params.preview).issues.length) {
    return params.preview;
  }
  if ((params.preview.currency !== "MIXED" || !params.preview.currencyMentions.length) &&
      canPreviewLocalReceiptItems(params.receiptText, params.preview)) {
    return params.preview;
  }

  try {
    if (!(await mayUseImportCloudAi(params.consentUserId))) return params.preview;
    const { bytes } = params;
    const pageImages = isImage
      ? [{
          page: 1,
          dataUrl: (await normalizeReceiptImageForVision({ bytes, fileType: params.file.type, fileName: params.file.name })).dataUrl,
        }]
      : await renderReceiptPdfPagesForVision(bytes);
    if (pageImages.length === 0) {
      return params.preview;
    }
    const result = await parseImportTextWithOpenAIFallback({
      consentUserId: params.consentUserId,
      text: params.receiptText,
      fileName: params.file.name,
      fileType: isPdf ? "application/pdf" : params.file.type,
      detectedMetadata: null,
      parsedRows: [],
      pageImages,
      importMode: "receipt",
      pageImageLimit: Math.min(3, pageImages.length),
      timeoutMs: 25_000,
      onUsage: params.onUsage,
    });
    const canUseAccountHint = !isImage || assessFinancialUploadScope({
      text: [params.receiptText, result?.receiptDetails?.parser_evidence.source_text,
        ...(result?.classificationVerdict?.evidence ?? [])].filter(Boolean).join("\n"),
      fileName: params.file.name,
      fileType: params.file.type,
    }).decision === "financial";
    return result?.receiptDetails
      ? mergeReceiptBackup(
          canUseAccountHint ? params.preview : { ...params.preview, receiptAccountMatch: null },
          result.receiptDetails as unknown as Record<string, unknown>,
          canUseAccountHint ? result.receiptAccountMatch : null,
          {
            ...result.audit,
            reason: typeof result.receiptDetails === "object" && result.receiptDetails
              ? (result.receiptDetails.parser_evidence?.reason ?? null)
              : null,
          }
        )
      : params.preview;
  } catch (error) {
    console.warn("Receipt backup parser failed; keeping local preview", error);
    return params.preview;
  }
};

export async function POST(request: Request) {
  try {
    if (!(await isLocalDevHost())) {
      assertTrustedRequestOrigin(request);
    }
    assertContentLengthWithin(request, MAX_RECEIPT_REQUEST_BYTES);
    const user = await getSplitBillCurrentUser();
    const mobileContext = getMobileRequestContext();
    const selectedWorkspaceId = mobileContext ? new URL(mobileContext.request.url).searchParams.get("workspaceId") ?? "" : (await cookies()).get(selectedWorkspaceKey)?.value ?? "";
    const workspace =
      (selectedWorkspaceId
        ? await prisma.workspace.findFirst({
            where: { id: selectedWorkspaceId, userId: user.id },
            select: { id: true },
          })
        : null) ??
      await prisma.workspace.findFirst({
        where: { userId: user.id },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      });
    const params = new URL(request.url).searchParams;
    const uploadId = params.get("uploadId");
    const action = params.get("action");
    if (action) {
      if (!workspace || !uploadId || !["start", "part", "cancel"].includes(action))
        return NextResponse.json({ error: "Invalid receipt upload." }, { status: 400 });
      return await nativeUploadRequest(request, uploadId, user.clerkUserId, workspace.id, action);
    }
    const recordUsage = workspace
      ? (usage: OpenAIImportModelUsage) => {
          after(async () => {
            await prisma.auditLog.create({
              data: {
                workspaceId: workspace.id,
                actorUserId: user.id,
                action: "import.openai_model_call",
                entity: "SplitBillReceiptPreview",
                entityId: null,
                metadata: usage,
              },
            }).catch(() => null);
          });
        }
      : undefined;
    try {
      assertRateLimit(`split-bill-receipt-preview:${user.id}`, 12, 60_000);
    } catch {
      return NextResponse.json({ error: "Too many receipt previews. Please try again shortly." }, { status: 429 });
    }

    const file = uploadId && workspace
      ? await readReceiptUpload(uploadId, user.clerkUserId, workspace.id)
      : (await request.formData()).get("file");
    if (uploadId && workspace) {
      after(() => nativeUploadRequest(request, uploadId, user.clerkUserId, workspace.id, "cancel").then(() => {}));
    }

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Receipt file is required" }, { status: 400 });
    }

    const selectedFile = file;
    const validationError = validateImportFile({
      fileName: selectedFile.name,
      fileSize: selectedFile.size,
      contentType: selectedFile.type,
      importMode: "receipt",
    }, { maximumBytes: NATIVE_UPLOAD_MAX_SIZE, maximumLabel: "25 MB" });
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
    const validationInput = {
      fileName: selectedFile.name,
      contentType: selectedFile.type,
      bytes: "sourceBytes" in selectedFile ? selectedFile.sourceBytes : new Uint8Array(await selectedFile.arrayBuffer()),
    };
    const byteValidationError = validateImportFileBytes(validationInput) ??
      await validateImportImageDecode(validationInput);
    if (byteValidationError) {
      return NextResponse.json({ error: byteValidationError, code: "I-101", retryable: false }, { status: 400 });
    }
    let receiptText = "";
    let localPreview: ReceiptPreviewResult;
    try {
      receiptText = await readUploadedFileText(selectedFile, undefined, {importMode:"receipt", sourceBytes:validationInput.bytes});
      const rejection = getClearLocalPhotoRejection({
        text: readLocalReceiptOcrText(receiptText) ?? receiptText,
        fileName: selectedFile.name,
        fileType: selectedFile.type,
      });
      if (rejection) throw rejection;
      localPreview = isReceiptImage(selectedFile) || isReceiptPdf(selectedFile)
        ? parseReceiptPhotoText(receiptText) : parseReceiptText(receiptText);
    } catch (error) {
      if (isReceiptPdf(selectedFile) && isPdfPasswordError(error)) {
        return NextResponse.json({ error: "This receipt PDF needs a password. Choose an unlocked copy to add the bill.",
          code: "IMPORT_PASSWORD_REQUIRED" }, { status: 422 });
      }
      if (error instanceof NonFinancialUploadError) {
        if (workspace) await prisma.auditLog.create({ data: {
          workspaceId: workspace.id, actorUserId: user.id,
          action: "import.scope_rejected", entity: "SplitBillReceiptPreview", entityId: null,
          metadata: { rejection_reason_code: error.reasonCode, rejection_rule_id: error.ruleId, evidence_source: "server_ocr" },
        } }).catch(() => null);
        return NextResponse.json({ error: error.message, code: "I-108", ...getUploadRejectionDetails(error), retryable: false }, { status: 422 });
      }
      if (!isReceiptImage(selectedFile) && !isReceiptPdf(selectedFile)) {
        throw error;
      }
      console.warn("Local receipt extraction failed; trying backup parser", error);
      localPreview = parseReceiptText("");
    }
    const readingText = readLocalReceiptOcrText(receiptText) ?? receiptText;
    const preview = classifyUnsettledPurchaseDocument(readingText) ? localPreview : await tryReceiptBackup({
      consentUserId: user.id,
      file: selectedFile,
      bytes: validationInput.bytes,
      receiptText: readingText,
      preview: localPreview,
      onUsage: recordUsage,
    });
    if (workspace) {
      const localParser = estimateLocalParserTokens(readingText);
      after(async () => {
        await prisma.auditLog.create({
          data: {
            workspaceId: workspace.id,
            actorUserId: user.id,
            action: "import.parser_usage",
            entity: "SplitBillReceiptPreview",
            entityId: null,
            metadata: {
              version: 1,
              selectedParser: preview.backupParser ? "backup_parser" : "local_parser",
              localParser,
              backupParserInvoked: Boolean(preview.backupParser),
            },
          },
        }).catch(() => null);
      });
    }
    const receiptStorageKey = [
      "split-bill-receipts",
      user.id,
      `${randomUUID()}-${sanitizeReceiptFileName(selectedFile.name)}`,
    ].join("/");
    await uploadObject(
      receiptStorageKey,
      validationInput.bytes,
      selectedFile.type || "application/octet-stream"
    );

    return NextResponse.json({ preview, receiptStorageKey, reliableForScopedSplit: assessReceiptPreviewQuality(preview).reliableForFastPath });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to preview receipt",
      },
      { status: 400 }
    );
  }
}
