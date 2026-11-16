import { readLocalReceiptOcrText } from "./local-receipt-ocr-envelope";
import { splitReceiptPromotionalFooter } from "./receipt-promotional-footer";
import { assessReceiptPreviewQuality, parseReceiptText } from "./split-bill";

const MAX_CORE_TEXT_LENGTH = 1_600;
export const COMPACT_RECEIPT_VISION_EDGE = 1_120;

export function buildCompactReceiptEvidence(rawText: string) {
  const text = readLocalReceiptOcrText(rawText) ?? rawText;
  const { body: purchaseText } = splitReceiptPromotionalFooter(text);
  const preview = parseReceiptText(text);
  const quality = assessReceiptPreviewQuality(preview);
  const total = Number(String(preview.total ?? "").replace(/,/g, ""));
  if (
    !purchaseText.trim() || purchaseText.length > MAX_CORE_TEXT_LENGTH ||
    !quality.reliableForFastPath || quality.issues.length || preview.currencyWarning ||
    !preview.billDate || !preview.merchantName || !/^[A-Z]{3}$/.test(preview.currency) ||
    !Number.isFinite(total) || total <= 0
  ) return null;

  const hasPrintedCurrency = new RegExp(`\\b${preview.currency}\\b`, "i").test(purchaseText) ||
    (preview.currency === "PHP" && purchaseText.includes("₱"));
  if (!hasPrintedCurrency) return null;

  return {
    text: purchaseText,
    merchant: preview.merchantName,
    date: preview.billDate.slice(0, 10),
    currency: preview.currency,
    total,
  };
}

const merchantKey = (merchant: string) =>
  merchant.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export function agreesWithCompactReceiptEvidence(
  evidence: NonNullable<ReturnType<typeof buildCompactReceiptEvidence>>,
  candidate: { merchant_raw?: string | null; transaction_date?: string | null; currency?: string | null; total?: number | null } | null | undefined
) {
  return candidate?.transaction_date?.slice(0, 10) === evidence.date &&
    merchantKey(candidate.merchant_raw ?? "") === merchantKey(evidence.merchant) &&
    candidate.currency === evidence.currency &&
    typeof candidate.total === "number" &&
    Math.abs(candidate.total - evidence.total) < 0.005;
}

export type ReceiptVisualField = "merchant" | "date" | "currency" | "total";

type VisualCore = {
  merchant_raw?: string | null;
  merchant_clean?: string | null;
  merchant_source_text?: string | null;
  merchant_source_kind?: string | null;
  transaction_date?: string | null;
  currency?: string | null;
  currency_source_text?: string | null;
  total?: number | null;
  parser_evidence: { source_text?: string | null; reason: string };
};

export function unresolvedReceiptVisualFields(
  details: VisualCore,
  expected?: NonNullable<ReturnType<typeof buildCompactReceiptEvidence>> | null,
) {
  const fields: ReceiptVisualField[] = [];
  if (!details.merchant_raw || (expected && merchantKey(details.merchant_raw) !== merchantKey(expected.merchant))) fields.push("merchant");
  if (!details.transaction_date || (expected && details.transaction_date !== expected.date)) fields.push("date");
  if (!details.currency || (expected && details.currency !== expected.currency)) fields.push("currency");
  if (!(Number(details.total) > 0) || (expected && Math.abs(Number(details.total) - expected.total) >= 0.005)) fields.push("total");
  return fields;
}

export function mergeReceiptVisualFields<T extends VisualCore>(original: T, reread: T, fields: readonly ReceiptVisualField[]): T {
  return {
    ...original,
    ...(fields.includes("merchant") && reread.merchant_raw ? {
      merchant_raw: reread.merchant_raw, merchant_clean: reread.merchant_clean,
      merchant_source_text: reread.merchant_source_text, merchant_source_kind: reread.merchant_source_kind,
    } : {}),
    ...(fields.includes("date") && reread.transaction_date ? { transaction_date: reread.transaction_date } : {}),
    ...(fields.includes("currency") && reread.currency ? {
      currency: reread.currency, currency_source_text: reread.currency_source_text,
    } : {}),
    ...(fields.includes("total") && reread.total != null ? { total: reread.total } : {}),
    parser_evidence: {
      ...original.parser_evidence,
      source_text: [...new Set([original.parser_evidence.source_text, reread.parser_evidence.source_text]
        .flatMap(text => text?.trim().split(/\r?\n/u) ?? []))].join("\n"),
    },
  };
}

export async function cropReceiptVisualRegion(
  page: { page: number; dataUrl: string },
  opticalSource: string,
  fields: readonly ReceiptVisualField[],
) {
  if (!fields.length || fields.some(field => field !== "total" && field !== "currency")) return null;
  const { readReceiptOpticalLines } = await import("./local-receipt-ocr-envelope");
  const lines = readReceiptOpticalLines(opticalSource);
  const totals = lines.filter(line => /^(?:grand\s+total|total(?:\s+(?:paid|due))?|amount\s+(?:paid|due))\b/iu.test(line.text) &&
    !/\b(?:items?|qty|points|vat|tax)\b/iu.test(line.text));
  if (totals.length !== 1) return null;
  const nearby = lines.filter(line => /^(?:cash|tender|change|card|tunai|kembali)/iu.test(line.text));
  const anchors = [...totals, ...nearby];
  const top = Math.max(0, Math.min(...anchors.map(line => line.box[1])) - 0.08);
  const bottom = Math.min(1, Math.max(...anchors.map(line => line.box[3])) + 0.08);
  if (bottom - top > 0.55) return null;
  const base64 = /^data:image\/(?:jpeg|png|webp);base64,(.+)$/u.exec(page.dataUrl)?.[1];
  if (!base64) return null;
  try {
    const { default: sharp } = await import("sharp");
    const image = sharp(Buffer.from(base64, "base64"));
    const { width, height, orientation } = await image.metadata();
    if (!width || !height || (orientation && orientation !== 1)) return null;
    const firstRow = Math.floor(top * height);
    const jpeg = await image.extract({ left: 0, top: firstRow, width, height: Math.ceil(bottom * height) - firstRow })
      .jpeg({ quality: 88 }).toBuffer();
    return { page: page.page, dataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}` };
  } catch {
    return null;
  }
}
