import { NextResponse } from "next/server";
import { normalizeReceiptImageForVision, readUploadedFileText } from "@/lib/import-file-text.server";
import { parseImportTextWithOpenAIFallback } from "@/lib/openai-import-parser";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import { assessReceiptPreviewQuality, parseReceiptText, type ReceiptPreviewResult } from "@/lib/split-bill";

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

const mergeReceiptBackup = (localPreview: ReceiptPreviewResult, backup: Record<string, unknown>): ReceiptPreviewResult => {
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
  const backupType = asText(backup.receipt_type)?.toLowerCase();
  const receiptType = backupType === "restaurant_receipt" || backupType === "official_receipt" || backupType === "tax_invoice" ||
    backupType === "travel_ticket" || backupType === "wallet_transfer" ? backupType : localPreview.receiptType;

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
    currency: asText(backup.currency)?.toUpperCase() ?? localPreview.currency,
    paymentMethod: localPreview.paymentMethod ?? asText(backup.payment_method),
    receiptPayerName: localPreview.receiptPayerName ?? asText(backup.buyer_name),
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
  };
};

const tryReceiptBackup = async (params: { file: File; receiptText: string; preview: ReceiptPreviewResult }) => {
  if (!process.env.OPENAI_API_KEY?.trim() || !assessReceiptPreviewQuality(params.preview).issues.length || !params.file.type.startsWith("image/")) {
    return params.preview;
  }

  try {
    const bytes = new Uint8Array(await params.file.arrayBuffer());
    const normalized = await normalizeReceiptImageForVision({ bytes, fileType: params.file.type, fileName: params.file.name });
    const result = await parseImportTextWithOpenAIFallback({
      text: params.receiptText,
      fileName: params.file.name,
      fileType: normalized.mimeType,
      detectedMetadata: null,
      parsedRows: [],
      pageImages: [{ page: 1, dataUrl: normalized.dataUrl }],
      importMode: "receipt",
      pageImageLimit: 1,
      timeoutMs: 25_000,
    });
    return result?.receiptDetails ? mergeReceiptBackup(params.preview, result.receiptDetails as unknown as Record<string, unknown>) : params.preview;
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

    const receiptText = await readUploadedFileText(file as File, undefined, { importMode: "receipt" });
    const localPreview = parseReceiptText(receiptText);
    const preview = await tryReceiptBackup({ file: file as File, receiptText, preview: localPreview });

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
