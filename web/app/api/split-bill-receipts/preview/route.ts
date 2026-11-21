import { assessFinancialUploadScope, getClearLocalPhotoRejection, getUploadRejectionDetails, NonFinancialUploadError } from "@/lib/financial-upload-scope";
import { validateImportImageDecode } from "@/lib/import-image-validation.server";
import { readLocalReceiptOcrText } from "@/lib/local-receipt-ocr-envelope";
import { getMobileRequestContext } from "@/lib/mobile-request-context";
import { after, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { normalizeReceiptImageForVision, readUploadedFileText, renderReceiptPdfPagesForVision } from "@/lib/import-file-text.server";
import { parseImportTextWithOpenAIFallback, type OpenAIImportModelUsage } from "@/lib/openai-import-parser";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import { assessReceiptPreviewQuality, normalizeCurrencyCode, parseAmountValue, parseReceiptText, type ReceiptPreviewResult } from "@/lib/split-bill";
import { isLocalDevHost } from "@/lib/auth";
import { validateImportFile, validateImportFileBytes } from "@/lib/import-file-validation";
import { assertContentLengthWithin, assertTrustedRequestOrigin } from "@/lib/request-security";
import { assertRateLimit } from "@/lib/rate-limit";
import { uploadObject } from "@/lib/s3";
import { nativeUploadRequest, readReceiptUpload } from "@/lib/native-upload-store";
import { NATIVE_UPLOAD_MAX_SIZE } from "../../../../../shared/native-upload";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { selectedWorkspaceKey } from "@/lib/workspace-selection";
import { getCloverTokenLimitError, getCloverTokenUsage } from "@/lib/clover-token-usage";
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

const asText = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
const asAmount = (value: unknown) => {
  const parsed = typeof value === "number" ? parseAmountValue(value) : typeof value === "string" ? parseAmountValue(value) : null;
  return parsed !== null ? parsed.toFixed(2) : null;
};

const asNumber = (value: unknown) => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const asReceiptDate = (value: unknown) => {
  const raw = asText(value);
  if (!raw) {
    return null;
  }

  const match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
    ? parsed.toISOString()
    : null;
};

const isVisualReceiptFile = (file: File) =>
  file.type.startsWith("image/") || file.type === "application/pdf" || /\.(?:jpe?g|png|webp|heic|heif|pdf)$/i.test(file.name);

const mergeReceiptBackup = (
  localPreview: ReceiptPreviewResult,
  backup: Record<string, unknown>,
  backupAccountMatch: unknown,
  backupAudit: { model?: string | null; promptVersion?: string | null; confidence?: number | null; schemaValidated?: boolean | null; reason?: string | null }
): ReceiptPreviewResult => {
  const localMerchantLooksWeak = assessReceiptPreviewQuality(localPreview).issues.includes("merchant looks noisy");
  const backupItems = Array.isArray(backup.line_items)
    ? backup.line_items.flatMap((item) => {
        if (!item || typeof item !== "object") {
          return [];
        }
        const value = item as Record<string, unknown>;
        const description = asText(value.description);
        const amount = asAmount(value.amount);
        return description && amount ? [{
          description,
          amount,
          quantity: asNumber(value.quantity),
          unitPrice: asAmount(value.unit_price),
        }] : [];
      })
    : [];
  const backupAllocations = Array.isArray(backup.split_allocations)
    ? backup.split_allocations.flatMap((allocation) => {
        if (!allocation || typeof allocation !== "object") {
          return [];
        }
        const value = allocation as Record<string, unknown>;
        const participantName = asText(value.participant_name);
        return participantName ? [{
          participantName,
          charged: asAmount(value.charged),
          paid: asAmount(value.paid),
          due: asAmount(value.due),
          currency: asText(value.currency) ?? localPreview.currency,
        }] : [];
      })
    : [];
  const backupConfidence = typeof backup.confidence_score === "number" && Number.isFinite(backup.confidence_score)
    ? Math.round(backup.confidence_score)
    : 0;
  const accountMatch = backupAccountMatch && typeof backupAccountMatch === "object"
    ? backupAccountMatch as Record<string, unknown>
    : null;
  const normalizedAccountMatch = accountMatch && (asText(accountMatch.account_name) || asText(accountMatch.account_last4))
    ? {
        accountName: asText(accountMatch.account_name),
        accountLast4: asText(accountMatch.account_last4),
        confidence: Math.max(0, Math.min(100, Math.round(asNumber(accountMatch.confidence) ?? 0))),
        reason: asText(accountMatch.reason),
      }
    : null;
  const backupPaymentMethod = asText(backup.payment_method) ?? (normalizedAccountMatch?.accountName
    ? normalizedAccountMatch.accountLast4
      ? `${normalizedAccountMatch.accountName} ending ${normalizedAccountMatch.accountLast4}`
      : normalizedAccountMatch.accountName
    : null);
  const backupType = asText(backup.receipt_type)?.toLowerCase();
  const receiptType = backupType === "restaurant_receipt" || backupType === "official_receipt" || backupType === "tax_invoice" ||
    backupType === "travel_ticket" || backupType === "wallet_transfer" ? backupType : localPreview.receiptType;
  const backupCurrency = asText(backup.currency) ? normalizeCurrencyCode(asText(backup.currency)) : null;

  return {
    ...localPreview,
    receiptType,
    merchantName: localPreview.merchantName && !localMerchantLooksWeak && !/^this document\b|[~_=|]{2,}/i.test(localPreview.merchantName)
      ? localPreview.merchantName
      : asText(backup.merchant_clean) ?? asText(backup.merchant_raw) ?? localPreview.merchantName,
    billDate: localPreview.billDate ?? asReceiptDate(backup.transaction_date),
    documentNumber: localPreview.documentNumber ?? asText(backup.document_number),
    invoiceNumber: localPreview.invoiceNumber ?? asText(backup.invoice_number),
    bookingReference: localPreview.bookingReference ?? asText(backup.booking_reference),
    currency: backupCurrency ?? localPreview.currency,
    currencyMentions: localPreview.currencyMentions.length > 0
      ? localPreview.currencyMentions
      : backupCurrency
        ? [backupCurrency]
        : localPreview.currencyMentions,
    paymentMethod: localPreview.paymentMethod ?? backupPaymentMethod,
    receiptPayerName: localPreview.receiptPayerName ?? asText(backup.buyer_name),
    receiptAccountMatch: localPreview.receiptAccountMatch ?? normalizedAccountMatch,
    subtotal: localPreview.subtotal ?? asAmount(backup.subtotal),
    serviceCharge: localPreview.serviceCharge ?? asAmount(backup.service_charge),
    tax: localPreview.tax ?? asAmount(backup.tax),
    tip: localPreview.tip ?? asAmount(backup.tip),
    discount: localPreview.discount ?? asAmount(backup.discount),
    total: localPreview.total ?? asAmount(backup.total),
    items: localPreview.items.length > 0 ? localPreview.items : backupItems,
    participants: localPreview.participants.length > 0 ? localPreview.participants : backupAllocations.map((allocation) => allocation.participantName),
    splitAllocations: localPreview.splitAllocations.length > 0 ? localPreview.splitAllocations : backupAllocations,
    confidence: Math.min(89, Math.max(localPreview.confidence, backupConfidence)),
    requiresReview: true,
    backupParser: {
      model: asText(backupAudit.model),
      promptVersion: asText(backupAudit.promptVersion),
      confidence: Math.max(0, Math.min(100, Math.round(asNumber(backupAudit.confidence) ?? backupConfidence))) || null,
      schemaValidated: typeof backupAudit.schemaValidated === "boolean" ? backupAudit.schemaValidated : null,
      reason: asText(backupAudit.reason),
    },
  };
};

const tryReceiptBackup = async (params: {
  consentUserId: string;
  file: File;
  bytes: Uint8Array;
  receiptText: string;
  preview: ReceiptPreviewResult;
  onUsage?: (usage: OpenAIImportModelUsage) => void;
}) => {
  const isImage = params.file.type.startsWith("image/");
  const isPdf = params.file.type === "application/pdf" || /\.pdf$/i.test(params.file.name);
  if (!process.env.OPENAI_API_KEY?.trim() || !assessReceiptPreviewQuality(params.preview).issues.length || (!isImage && !isPdf)) {
    return params.preview;
  }

  try {
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
    const tokenUsage = await getCloverTokenUsage(user);
    const tokenLimitError = getCloverTokenLimitError(tokenUsage);
    if (tokenLimitError) {
      return NextResponse.json(tokenLimitError, { status: 429 });
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

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Receipt file is required" }, { status: 400 });
    }

    const selectedFile = file as File;
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
      bytes: new Uint8Array(await selectedFile.arrayBuffer()),
    };
    const byteValidationError = validateImportFileBytes(validationInput) ??
      await validateImportImageDecode(validationInput);
    if (byteValidationError) {
      return NextResponse.json({ error: byteValidationError, code: "I-101", retryable: false }, { status: 400 });
    }
    let receiptText = "";
    let localPreview: ReceiptPreviewResult;
    try {
      receiptText = await readUploadedFileText(selectedFile, undefined, { importMode: "receipt", sourceBytes: validationInput.bytes });
      const rejection = getClearLocalPhotoRejection({
        text: readLocalReceiptOcrText(receiptText) ?? receiptText,
        fileName: selectedFile.name,
        fileType: selectedFile.type,
      });
      if (rejection) throw rejection;
      localPreview = parseReceiptText(receiptText);
    } catch (error) {
      if (error instanceof NonFinancialUploadError) {
        if (workspace) await prisma.auditLog.create({ data: {
          workspaceId: workspace.id, actorUserId: user.id,
          action: "import.scope_rejected", entity: "SplitBillReceiptPreview", entityId: null,
          metadata: { rejection_reason_code: error.reasonCode, rejection_rule_id: error.ruleId, evidence_source: "server_ocr" },
        } }).catch(() => null);
        return NextResponse.json({ error: error.message, code: "I-108", ...getUploadRejectionDetails(error), retryable: false }, { status: 422 });
      }
      if (!isVisualReceiptFile(selectedFile)) {
        throw error;
      }
      console.warn("Local receipt extraction failed; trying backup parser", error);
      localPreview = parseReceiptText("");
    }
    const readingText = readLocalReceiptOcrText(receiptText) ?? receiptText;
    const preview = await tryReceiptBackup({
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
