export function isAutomaticReviewExclusion(row: { reviewStatus?: string | null; reviewReasons?: unknown; normalizedPayload?: unknown }) {
  const payload = row.normalizedPayload as {source?: unknown} | null;
  return ["pending_review", "suggested"].includes(row.reviewStatus ?? "") &&
    Array.isArray(row.reviewReasons) && row.reviewReasons.includes("finverse_possible_duplicate") && payload?.source !== "manual_edit";
}

/** An edit resolves automatic exclusion without undoing an explicit Ignore choice. */
export function exclusionAfterTransactionEdit(
  row: Parameters<typeof isAutomaticReviewExclusion>[0] & {isExcluded:boolean},
  explicitExclusion: boolean | undefined,
  resolvesReview: boolean,
) {
  return explicitExclusion ?? (resolvesReview && isAutomaticReviewExclusion(row) ? false : row.isExcluded);
}
