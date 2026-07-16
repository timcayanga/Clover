import { NextResponse } from "next/server";
import { normalizeReceiptImageForVision, readUploadedFileText, renderReceiptPdfPagesForVision } from "@/lib/import-file-text.server";
import { parseImportTextWithOpenAIFallback } from "@/lib/openai-import-parser";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import { assessReceiptPreviewQuality, normalizeCurrencyCode, parseReceiptText, type ReceiptPreviewResult } from "@/lib/split-bill";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const asText = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
const asAmount = (value: unknown) => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/,/g, "").trim()) : NaN;
  return Number.isFinite(parsed) ? parsed.toFixed(2) : null;
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
  backupAudit: { model?: string | null; promptVersion?: string | null; confidence?: number | null; schemaValidated?: boolean | null }
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
          quantity: typeof value.quantity === "number" ? value.quantity : null,
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
        confidence: typeof accountMatch.confidence === "number" && Number.isFinite(accountMatch.confidence)
          ? Math.max(0, Math.min(100, Math.round(accountMatch.confidence)))
          : 0,
        reason: asText(accountMatch.reason),
      }
    : null;
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
    paymentMethod: localPreview.paymentMethod ?? asText(backup.payment_method),
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
      confidence: typeof backupAudit.confidence === "number" && Number.isFinite(backupAudit.confidence)
        ? Math.max(0, Math.min(100, Math.round(backupAudit.confidence)))
        : backupConfidence || null,
      schemaValidated: typeof backupAudit.schemaValidated === "boolean" ? backupAudit.schemaValidated : null,
    },
  };
};

const tryReceiptBackup = async (params: { file: File; receiptText: string; preview: ReceiptPreviewResult }) => {
  const isImage = params.file.type.startsWith("image/");
  const isPdf = params.file.type === "application/pdf" || /\.pdf$/i.test(params.file.name);
  if (!process.env.OPENAI_API_KEY?.trim() || !assessReceiptPreviewQuality(params.preview).issues.length || (!isImage && !isPdf)) {
    return params.preview;
  }

  try {
    const bytes = new Uint8Array(await params.file.arrayBuffer());
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
      text: params.receiptText,
      fileName: params.file.name,
      fileType: isPdf ? "application/pdf" : params.file.type,
      detectedMetadata: null,
      parsedRows: [],
      pageImages,
      importMode: "receipt",
      pageImageLimit: Math.min(3, pageImages.length),
      timeoutMs: 25_000,
    });
    return result?.receiptDetails
      ? mergeReceiptBackup(
          params.preview,
          result.receiptDetails as unknown as Record<string, unknown>,
          result.receiptAccountMatch,
          result.audit
        )
      : params.preview;
  } catch (error) {
    console.warn("Receipt backup parser failed; keeping local preview", error);
    return params.preview;
  }
};

export async function POST(request: Request) {
  try {
    await getSplitBillCurrentUser();

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Receipt file is required" }, { status: 400 });
    }

    const selectedFile = file as File;
    let receiptText = "";
    let localPreview: ReceiptPreviewResult;
    try {
      receiptText = await readUploadedFileText(selectedFile, undefined, { importMode: "receipt" });
      localPreview = parseReceiptText(receiptText);
    } catch (error) {
      if (!isVisualReceiptFile(selectedFile)) {
        throw error;
      }
      console.warn("Local receipt extraction failed; trying backup parser", error);
      localPreview = parseReceiptText("");
    }
    const preview = await tryReceiptBackup({ file: selectedFile, receiptText, preview: localPreview });

    return NextResponse.json({ preview });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to preview receipt",
      },
      { status: 400 }
    );
  }
}
