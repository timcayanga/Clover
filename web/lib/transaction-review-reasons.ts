export type TransactionReviewReasonInput = {
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
  status === "confirmed" || status === "edited" || status === "rejected" || status === "duplicate_skipped";

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

const getReceiptReviewReasons = (rawPayload: unknown): string[] => {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return [];
  const payload = rawPayload as Record<string, unknown>;
  const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const details = record(payload.receiptDetails ?? payload.receipt_details);
  const currency = record(details.currency_resolution);
  const reasons: string[] = [];
  if (currency.source === "user_default" && currency.requiresReview !== false) {
    const code = typeof currency.currency === "string" && /^[A-Z]{3}$/.test(currency.currency) ? currency.currency : "your default currency";
    reasons.push(`Currency was not detected. Check ${code} against the receipt.`);
  }
  if (payload.dateInferredFromFileName === true) reasons.push("Date came from the file name. Check it against the receipt.");
  const labels: Record<string, string> = {
    "merchant missing": "Check the receipt merchant.",
    "date missing": "Check the receipt date.",
    "total missing": "Check the receipt total.",
    "summary totals do not reconcile": "The receipt subtotal and adjustments do not match its total. Check the amount.",
    "single line item with weak merchant identity": "Check the receipt merchant and line items.",
    "missing receipt details": "Check the receipt details against the original photo.",
    "sparse receipt parse": "Only a few receipt details were readable. Check them against the original photo.",
  };
  const validation = record(payload.receiptValidation);
  for (const issue of Array.isArray(validation.issues) ? validation.issues : []) {
    if (typeof issue !== "string") continue;
    if (Object.hasOwn(labels, issue)) reasons.push(labels[issue]);
    else if (/^currency mismatch:/i.test(issue)) reasons.push("The detected currency differs from the account currency. Check the receipt currency.");
  }
  return [...new Set(reasons)];
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

  const receiptReasons = getReceiptReviewReasons(transaction.rawPayload);
  for (const reason of receiptReasons) reasons.add(reason);
  const parserScore = normalizeConfidenceScore(transaction.parserConfidence);
  if (parserScore !== null && parserScore < REVIEW_THRESHOLD && receiptReasons.length === 0) {
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

// Keep list membership, badges, and counts on the same definition of review.
export const transactionNeedsReview = (transaction: TransactionReviewReasonInput) =>
  getTransactionReviewReasons(transaction).length > 0;
