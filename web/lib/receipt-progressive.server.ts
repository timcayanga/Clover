import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getR2Client, getLocalImportObjectPath, uploadObject } from "./s3";
import { getEnv } from "./env";
import { getBoundedImportImagePreview } from "./import-image-validation.server";
import { readLocalReceiptImage } from "./local-receipt-ocr.server";
import { assessReceiptPreviewQuality, hasReconciledOpticalSettlement, parseReceiptPhotoText, type ReceiptPreviewResult } from "./split-bill";
import { readLocalReceiptOcrText, singleReceiptDate, receiptDateDisagreements, readReceiptOpticalEvidence } from "./local-receipt-ocr-envelope";
import { editableReceiptItems } from "../../shared/split-bill-experience";
import { reconcilesReviewedDiscountPhoto, hasPrintedItemizedTotal, readChargedReceiptTable } from "./receipt-item-table";
import { classifyUnsettledPurchaseDocument } from "./purchase-document-payment";
import { getClearLocalPhotoRejection } from "./financial-upload-scope";

export type ReceiptDraft = {
  draftId: string;
  fileName: string;
  mimeType: string;
  attemptId: string;
  receiptStorageKey: string;
  refining: boolean;
  preview: ReceiptPreviewResult;
  reliableForScopedSplit: boolean;
};

/** A reconciled paper receipt may be saved as a reviewable Split Bill.
 * Connected transactions and Circle expenses keep their existing confirmation rules. */
export function canSaveReceiptForReview(preview: ReceiptPreviewResult) {
  const text = readLocalReceiptOcrText(preview.receiptText);
  if (!text || !preview.requiresReview || !preview.billDate || !preview.total || !preview.merchantName ||
      preview.currencyWarning || preview.currency === "MIXED" || classifyUnsettledPurchaseDocument(text)) return false;
  return assessReceiptPreviewQuality({...preview, requiresReview:false}).reliableForFastPath &&
    hasPrintedItemizedTotal(text, preview.total) && editableReceiptItems(preview).length > 0;
}

// Only finish on the first pass when the printed purchase rows and fee
// independently reconcile and the preview contains those exact amounts.
export function completeChargedReceipt(preview: ReceiptPreviewResult) {
  if (!preview.billDate || !preview.merchantName || preview.currencyWarning || !preview.total) return false;
  const text = readLocalReceiptOcrText(preview.receiptText) ?? preview.receiptText;
  const table = readChargedReceiptTable(text);
  return Boolean(table && !classifyUnsettledPurchaseDocument(text) && hasPrintedItemizedTotal(text, preview.total) &&
    table.total === preview.total && table.serviceCharge === preview.serviceCharge &&
    table.items.length === preview.items.length && table.items.every((item,i) => item.amount === preview.items[i].amount) &&
    editableReceiptItems(preview).length === table.items.length + 1);
}

export function receiptDraftId(bytes: Uint8Array, currency: string) {
  return createHash("sha256").update("receipt-v1:" + currency + ":").update(bytes).digest("hex");
}

export function billAttemptForReceipt(draftId: string, scope: string) {
  const hex = createHash("sha256").update(draftId + ":" + scope).digest("hex");
  return [hex.slice(0,8), hex.slice(8,12), "5"+hex.slice(13,16), "8"+hex.slice(17,20), hex.slice(20,32)].join("-");
}

export async function readReceiptObject(key: string) {
  try {
    if (process.env.NODE_ENV !== "production") return await readFile(getLocalImportObjectPath(key));
    const obj = await getR2Client().send(new GetObjectCommand({Bucket:getEnv().R2_BUCKET_NAME, Key:key}));
    return Buffer.from(await obj.Body!.transformToByteArray());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || (error as Error).name === "NoSuchKey") return null;
    throw error;
  }
}

export async function cachedReceiptDraft(prefix: string) {
  const data = await readReceiptObject(prefix + ".final.json") ?? await readReceiptObject(prefix + ".early.json");
  if (!data) return null;
  const draft = JSON.parse(data.toString()) as ReceiptDraft;
  // Older drafts may have discarded the total when its printed label was
  // damaged. Reconcile the stored transcript without starting another scan.
  if (!draft.preview.total && readLocalReceiptOcrText(draft.preview.receiptText)) {
    const repaired = singleReadReceiptPreview(draft.preview.receiptText, draft.preview.currency);
    if (repaired.merchantName === draft.preview.merchantName && repaired.currency === draft.preview.currency &&
        repaired.total && editableReceiptItems(repaired).length && readChargedReceiptTable(readLocalReceiptOcrText(repaired.receiptText)!)?.total === repaired.total) {
      draft.preview = {...repaired, billDate:null, requiresReview:true, confidence:Math.min(45, repaired.confidence)};
      return {...draft, refining:false, readyForReviewableBill:false, reliableForScopedSplit:false};
    }
  }
  if (draft.preview.items.length < 2 && draft.preview.receiptText && draft.preview.total) {
    const parsed = parseReceiptPhotoText(draft.preview.receiptText, draft.preview.currency);
    if (parsed.total === draft.preview.total && parsed.currency === draft.preview.currency &&
        parsed.merchantName === draft.preview.merchantName && completeChargedReceipt(parsed)) {
      draft.preview = {...draft.preview, items:parsed.items, subtotal:parsed.subtotal, serviceCharge:parsed.serviceCharge};
    }
  }
  if (draft.preview.billDate && hasUncertainPhotoDate(draft.preview.receiptText)) {
    return { ...draft, refining:false, preview:{...draft.preview, billDate:null, requiresReview:true,
      confidence:Math.min(45, draft.preview.confidence)}, readyForReviewableBill:false, reliableForScopedSplit:false };
  }
  // Previous clients may poll a partial photo draft. Serve its saved evidence
  // for manual review without scheduling another recognition or changing a bill.
  if (draft.refining) return { ...draft, refining:false, preview:{...draft.preview, requiresReview:true},
    readyForReviewableBill:false, reliableForScopedSplit:false };
  return draft;
}

export async function storeReceiptDraft(prefix: string, draft: ReceiptDraft) {
  const key = prefix + (draft.refining ? ".early.json" : ".final.json");
  const body = Buffer.from(JSON.stringify(draft));
  if (process.env.NODE_ENV === "production") return uploadObject(key, body, "application/json");
  const target = getLocalImportObjectPath(key);
  const temporary = target + "." + randomUUID();
  await mkdir(dirname(target), {recursive:true});
  try {
    await writeFile(temporary, body);
    await rename(temporary, target);
  } finally {
    await rm(temporary, {force:true});
  }
}

export async function firstReceiptRead(bytes: Uint8Array, name: string, type: string, currency: string) {
  const source = await readLocalReceiptImage(await getBoundedImportImagePreview(bytes));
  if (!source) return { source, preview: null };
  const text = readLocalReceiptOcrText(source) ?? source;
  const rejection = getClearLocalPhotoRejection({text, fileName:name, fileType:type});
  if (rejection) throw rejection;
  return { source, preview: singleReadReceiptPreview(source, currency) };
}

function hasUncertainPhotoDate(source: string) {
  const evidence = readReceiptOpticalEvidence(source);
  return receiptDateDisagreements(evidence).length > 0 || evidence.some(line =>
    singleReceiptDate(line.text) && line.minimumCharacterConfidence !== undefined && line.minimumCharacterConfidence < 0.85);
}

export function singleReadReceiptPreview(source: string, currency: string) {
  const text = readLocalReceiptOcrText(source) ?? source;
  const preview = parseReceiptPhotoText(source, currency);
  const reconciled = Boolean(preview.total && preview.currency !== "MIXED" &&
    !classifyUnsettledPurchaseDocument(text) && (hasPrintedItemizedTotal(text, preview.total) ||
      hasReconciledOpticalSettlement(text, preview.total) || reconcilesReviewedDiscountPhoto(text, preview)));
  const dateUncertain = hasUncertainPhotoDate(source);
  return { ...preview, billDate:dateUncertain ? null : preview.billDate,
    total:reconciled ? preview.total : null,
    confidence:reconciled && !dateUncertain ? preview.confidence : Math.min(45, preview.confidence),
    requiresReview:Boolean(preview.requiresReview || !reconciled || dateUncertain || !preview.merchantName),
    receiptText:source };
}
