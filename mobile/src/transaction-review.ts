import type { Transaction } from "./types";

type ReviewableTransaction = Pick<Transaction, "reviewStatus" | "reviewReasons"> & Partial<Pick<Transaction,
  "isExcluded" | "confidenceScore" | "categoryId" | "categoryName" | "merchantClean" | "merchantRaw">>;

/** A pending suggestion is not automatically a warning. Mirror server reasons. */
export function transactionReviewReasons(row: ReviewableTransaction): string[] {
  if (["confirmed", "edited", "rejected", "duplicate_skipped"].includes(row.reviewStatus ?? "")) return [];
  // Explicit server reasons, including an empty list, are authoritative. Older
  // downloaded data predates this projection, so retain facts we can still see.
  if (Array.isArray(row.reviewReasons)) return [...new Set(row.reviewReasons.filter(reason => typeof reason === "string" && reason.trim()).map(reason => reason.trim()))];
  const reasons: string[] = [];
  if (row.isExcluded) reasons.push("Ignored from totals");
  const category = row.categoryName?.trim().toLowerCase();
  if (("categoryName" in row || "categoryId" in row) && !row.categoryId?.trim() && (!category || category === "needs category review")) reasons.push("Needs category review");
  const confidence = row.confidenceScore;
  if (typeof confidence === "number" && Number.isFinite(confidence) && (confidence <= 1 ? confidence * 100 : confidence) < 70) {
    reasons.push("Check the transaction details against the original file.");
  }
  const merchant = (row.merchantClean ?? row.merchantRaw ?? "").trim().toLowerCase();
  if (("merchantClean" in row || "merchantRaw" in row) && (!merchant || ["unknown", "transaction", "imported transaction", "other", "miscellaneous"].includes(merchant) || /^transaction\s*#?\d*$/i.test(merchant))) reasons.push("Could not identify merchant");
  return reasons;
}
