import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getR2Client, getLocalImportObjectPath, uploadObject } from "./s3";
import { getEnv } from "./env";
import { getBoundedImportImagePreview } from "./import-image-validation.server";
import { readLocalReceiptImage } from "./local-receipt-ocr.server";
import { assessReceiptPreviewQuality, hasReconciledOpticalSettlement, parseReceiptPhotoText, type ReceiptPreviewResult } from "./split-bill";
import { readLocalReceiptOcrText, receiptDateDisagreements, readReceiptOpticalEvidence } from "./local-receipt-ocr-envelope";
import { editableReceiptItems } from "../../shared/split-bill-experience";
import { hasPrintedItemizedTotal } from "./receipt-item-table";
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
  return data ? JSON.parse(data.toString()) as ReceiptDraft : null;
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
  const preview = parseReceiptPhotoText(source, currency);
  if (!preview.merchantName || !preview.total || preview.currency === "MIXED" || classifyUnsettledPurchaseDocument(text) ||
      !(hasPrintedItemizedTotal(text, preview.total) || hasReconciledOpticalSettlement(text, preview.total))) return { source, preview:null };
  const dateUncertain = receiptDateDisagreements(readReceiptOpticalEvidence(source)).length > 0;
  return { source, preview: { ...preview, billDate:dateUncertain ? null : preview.billDate, receiptText:source } };
}
