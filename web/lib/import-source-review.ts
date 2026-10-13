export const SOURCE_REVIEW_PHASE = "source_review_required";
export const SOURCE_REVIEW_CODE = "I-109";

// Only deterministic native-source validators may opt into this failure.
// Message text alone must never turn a reader/network failure into a refusal.
export class SourceReviewRequiredError extends Error {
  readonly code = "SOURCE_REVIEW_REQUIRED";
}

export const isSourceReviewRequiredError = (error: unknown): error is Error =>
  error instanceof Error && (error as Error & { code?: unknown }).code === "SOURCE_REVIEW_REQUIRED";

export function sourceReviewUserMessage(reason: string): string {
  if (reason === "POSB reversed cash movement requires source review.") {
    return "This statement has a cash reversal that cannot yet be matched safely to a Cash account.";
  }
  if (reason === "Native source requires review: complete DBS zero snapshot pages") {
    return "Clover could not verify the account, pages, and balances in this DBS statement.";
  }
  if (reason.includes("GCash payment template mixes currencies")) {
    return "This GCash template shows conflicting currencies and does not establish a reliable payment.";
  }
  if (reason === "MariBank native statement requires source review: all incoming/outgoing source movements must match summary totals") {
    return "The statement's incoming and outgoing movements do not match its printed totals.";
  }
  return reason.replace(/^(?:Native source requires review|MariBank native statement requires source review):\s*/, "This statement needs review: ");
}

export function sourceReviewFailureReason(
  error: unknown,
  counts: { parsedRows: number; confirmedRows: number }
): string | null {
  if (counts.parsedRows !== 0 || counts.confirmedRows !== 0) return null;
  return isSourceReviewRequiredError(error) ? error.message : null;
}
