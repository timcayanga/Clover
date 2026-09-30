// A successfully read but incomplete receipt needs user input, not more OCR.
export const RECEIPT_REVIEW_PHASE = "receipt_review_required";

export function incompleteReceiptFields(details: {
  merchant_raw?: string | null;
  merchant_clean?: string | null;
  transaction_date?: string | null;
  currency?: string | null;
  total?: number | null;
}) {
  const missing: string[] = [];
  if (!(details.merchant_raw?.trim() || details.merchant_clean?.trim())) missing.push("merchant");
  const date = details.transaction_date?.trim() ?? "";
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
  if (!parsedDate || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) missing.push("date");
  if (!details.currency || !/^[A-Z]{3}$/.test(details.currency) || details.currency === "XXX") missing.push("currency");
  if (typeof details.total !== "number" || !Number.isFinite(details.total) || details.total <= 0) missing.push("total");
  return missing;
}

export const receiptReviewMessage = (fields: string[]) =>
  `Clover read this receipt, but could not verify its ${fields.join(", ")}. No transaction was added. Upload a complete, clearer receipt or enter the transaction manually.`;
