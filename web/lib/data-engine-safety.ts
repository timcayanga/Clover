import type { ReviewStatus } from "@prisma/client";

export const PROTECTED_TRANSACTION_REVIEW_STATUSES = ["confirmed", "edited", "rejected", "duplicate_skipped"] as const satisfies readonly ReviewStatus[];

export const isProtectedTransactionReviewStatus = (status: ReviewStatus | string | null | undefined) =>
  PROTECTED_TRANSACTION_REVIEW_STATUSES.includes(status as (typeof PROTECTED_TRANSACTION_REVIEW_STATUSES)[number]);

export const buildSourceRowKey = (params: {
  fileFingerprint?: string | null;
  statementFingerprint?: string | null;
  page?: number | null;
  rowIndex?: number | null;
  sourceText?: string | null;
}) => {
  const source = [
    params.fileFingerprint ?? "",
    params.statementFingerprint ?? "",
    params.page ?? "",
    params.rowIndex ?? "",
    String(params.sourceText ?? "").replace(/\s+/g, " ").trim().toLowerCase(),
  ].join("|");
  return source.replace(/\|+$/, "") || null;
};
