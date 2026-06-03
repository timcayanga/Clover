type TransactionReviewReasonInput = {
  warningReason?: string | null;
  reviewStatus?: string | null;
  isExcluded?: boolean;
  categoryId?: string | null;
  categoryName?: string | null;
  parserConfidence?: number | null;
  categoryConfidence?: number | null;
  accountMatchConfidence?: number | null;
  duplicateConfidence?: number | null;
  merchantRaw?: string | null;
  merchantClean?: string | null;
  rawPayload?: unknown;
};

const normalizeConfidenceScore = (value: number | null | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const score = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, Math.round(score)));
};

const isResolvedReviewStatus = (status: string | null | undefined) =>
  status === "confirmed" || status === "rejected" || status === "duplicate_skipped";

const isMerchantUnidentified = (merchantClean?: string | null, merchantRaw?: string | null) => {
  const merchantText = (merchantClean ?? merchantRaw ?? "").trim().toLowerCase();
  if (!merchantText) {
    return true;
  }

  const genericMerchantLabels = new Set(["unknown", "transaction", "imported transaction", "other", "miscellaneous"]);
  return genericMerchantLabels.has(merchantText) || /^transaction\s*#?\d*$/i.test(merchantText);
};

const REVIEW_THRESHOLD = 70;

const getGenericImportReviewReasons = (rawPayload: unknown) => {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return [];
  }

  const payload = rawPayload as Record<string, unknown>;
  const detailReasons = Array.isArray(payload.genericReviewReasonDetails)
    ? payload.genericReviewReasonDetails
        .map((detail) =>
          detail && typeof detail === "object" && !Array.isArray(detail) && typeof (detail as Record<string, unknown>).message === "string"
            ? ((detail as Record<string, unknown>).message as string).trim()
            : null
        )
        .filter((value): value is string => Boolean(value))
    : [];
  const fallbackReasons = Array.isArray(payload.genericReviewReasons)
    ? payload.genericReviewReasons.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim())
    : [];

  return Array.from(new Set([...detailReasons, ...fallbackReasons]));
};

export const getTransactionReviewReasons = (transaction: TransactionReviewReasonInput) => {
  if (isResolvedReviewStatus(transaction.reviewStatus)) {
    return [];
  }

  const reasons = new Set<string>();

  const explicitReason = (transaction.warningReason ?? "").trim();
  if (explicitReason === "Possible duplicate") {
    reasons.add("Review similar transaction");
  } else if (explicitReason && explicitReason !== "Needs review") {
    reasons.add(explicitReason);
  }

  if (transaction.isExcluded) {
    reasons.add("Ignored from totals");
  }

  const duplicateScore = normalizeConfidenceScore(transaction.duplicateConfidence) ?? 0;
  if (duplicateScore >= REVIEW_THRESHOLD) {
    reasons.add("Review similar transaction");
  }

  const normalizedCategoryName = (transaction.categoryName ?? "").trim().toLowerCase();
  const categoryScore = normalizeConfidenceScore(transaction.categoryConfidence);
  const categoryIsOther = normalizedCategoryName === "other";
  const categoryNameIsConcrete = Boolean(normalizedCategoryName) && normalizedCategoryName !== "needs category review";
  const hasCategory = Boolean((transaction.categoryId ?? "").trim()) || categoryNameIsConcrete;

  if (!hasCategory && !isResolvedReviewStatus(transaction.reviewStatus)) {
    reasons.add("Needs category review");
  } else if (!categoryIsOther && categoryScore !== null && categoryScore < REVIEW_THRESHOLD) {
    reasons.add("Needs category review");
  }

  const accountScore = normalizeConfidenceScore(transaction.accountMatchConfidence);
  if (accountScore !== null && accountScore < REVIEW_THRESHOLD) {
    reasons.add("Needs account review");
  }

  const parserScore = normalizeConfidenceScore(transaction.parserConfidence);
  if (parserScore !== null && parserScore < REVIEW_THRESHOLD) {
    reasons.add("Import needs review");
  }

  if (isMerchantUnidentified(transaction.merchantClean, transaction.merchantRaw)) {
    reasons.add("Could not identify merchant");
  }

  for (const reason of getGenericImportReviewReasons(transaction.rawPayload)) {
    reasons.add(reason);
  }

  return Array.from(reasons);
};

export const getTransactionReviewReason = (transaction: TransactionReviewReasonInput) =>
  getTransactionReviewReasons(transaction)[0] ?? null;
