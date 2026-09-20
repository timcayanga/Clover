export type ReviewEditableTransaction = {
  id: string;
  accountId: string;
  categoryId: string | null;
  description: string | null;
};

export type ReviewDraft = {
  accountId: string;
  categoryId: string;
  description: string;
};

export const buildReviewDraft = (transaction: ReviewEditableTransaction): ReviewDraft => ({
  accountId: transaction.accountId,
  categoryId: transaction.categoryId ?? "",
  description: transaction.description ?? "",
});

/** Keep local edits while accepting refreshed values for untouched fields. */
export function mergeReviewDrafts(
  previous: readonly ReviewEditableTransaction[],
  next: readonly ReviewEditableTransaction[],
  drafts: Readonly<Record<string, ReviewDraft>>,
): Record<string, ReviewDraft> {
  const previousById = new Map(previous.map((transaction) => [transaction.id, transaction]));
  const result: Record<string, ReviewDraft> = {};
  for (const transaction of next) {
    const draft = drafts[transaction.id];
    if (!draft) continue;
    const prior = previousById.get(transaction.id);
    if (!prior) {
      result[transaction.id] = { ...draft };
      continue;
    }
    const baseline = buildReviewDraft(prior);
    const refreshed = buildReviewDraft(transaction);
    for (const field of ["accountId", "categoryId", "description"] as const) {
      if (draft[field] !== baseline[field]) refreshed[field] = draft[field];
    }
    result[transaction.id] = refreshed;
  }
  return result;
}
