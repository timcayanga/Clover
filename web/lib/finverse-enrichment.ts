import { summarizeMerchantText } from "@/lib/merchant-labels";
import { enrichParsedRowsWithTraining, type EnrichedParsedImportRow } from "@/lib/data-engine";
import { normalizeFinverseTransaction, type FinverseTransaction } from "@/lib/finverse";

type Category = { id: string; name: string; type: string };
export type BankCategorySuggestion = {
  categoryId: string | null;
  categoryConfidence: number;
  reviewStatus: "suggested" | "pending_review";
  reviewPriority: "none" | "medium";
  reviewReasons: string[];
  learnedRuleIdsApplied: EnrichedParsedImportRow["learnedRuleIdsApplied"];
  enrichment: { categoryName: string | null; reason: string; engineVersion: string | null };
};

export async function enrichFinverseTransactions(params: {
  workspaceId: string;
  transactions: FinverseTransaction[];
  institution?: string;
  categories: Category[];
  trainingContext?: Parameters<typeof enrichParsedRowsWithTraining>[0]["trainingContext"];
}) {
  const booked = params.transactions.flatMap(transaction => {
    const row = normalizeFinverseTransaction(transaction);
    return row && !row.isPending ? [{ transaction, row }] : [];
  });
  if (!booked.length) return new Map<string, BankCategorySuggestion>();
  const enriched = await enrichParsedRowsWithTraining({
    workspaceId: params.workspaceId,
    statementConfidence: 100,
    trainingContext: params.trainingContext,
    rows: booked.map(({ transaction, row }) => ({
      date: row.date.toISOString().slice(0, 10), amount: String(row.amount), currency: row.currency,
      type: row.type, merchantRaw: row.merchantRaw, merchantClean: row.merchantClean || summarizeMerchantText(row.merchantRaw, params.institution ?? null),
      description: row.description ?? undefined,
      // The source bank is not the merchant. Apply its title normalization above,
      // but do not let the bank name become a Financial category keyword.
      parserConfidence: 100, rawPayload: { ...transaction },
    })),
  });
  return new Map(booked.map(({ transaction, row }, index) => {
    const suggestion = enriched[index];
    const matches = params.categories.filter(category => category.name.toLowerCase() === suggestion.categoryName?.toLowerCase());
    const category = matches.find(category => category.type === row.type) ?? (matches.length === 1 ? matches[0] : null);
    const unidentified = /^(?:bank transaction|unknown(?: bank)?(?: reference)?(?: \d+)?|transaction(?: #?\d+)?)$/i.test(row.merchantRaw.trim());
    const concrete = Boolean(!unidentified && category && category.name.toLowerCase() !== "other");
    const confidence = concrete ? suggestion.categoryConfidence ?? 0 : 0;
    // Bank API rows already have typed amounts, dates and a linked account.
    // Import-document shape/teachability flags are not category uncertainty.
    const needsReview = !concrete || confidence < 70;
    return [transaction.transaction_id, {
      categoryId: unidentified ? null : category?.id ?? null, categoryConfidence: confidence,
      reviewStatus: needsReview ? "pending_review" : "suggested",
      reviewPriority: needsReview ? "medium" : "none",
      reviewReasons: needsReview ? ["category_low_confidence"] : [],
      learnedRuleIdsApplied: suggestion.learnedRuleIdsApplied ?? [],
      enrichment: { categoryName: suggestion.categoryName ?? null, reason: suggestion.categoryReason ?? "unresolved_category", engineVersion: suggestion.parserVersion ?? null },
    } satisfies BankCategorySuggestion];
  }));
}

// Only fill untouched, uncategorized provider rows. Confirmed/edited records and
// duplicate/review decisions are never reconsidered automatically on a resync.
export const finverseUncategorizedBackfillWhere = (id: string) => ({
  id, categoryId: null, categoryConfidence: 0, reviewStatus: "suggested" as const,
  reviewPriority: "none", duplicateConfidence: 0, isExcluded: false, deletedAt: null,
  sourceRowKey: { startsWith: "finverse:" },
});

/** Resync may reassess only a recorded automatic category suggestion, never a user decision. */
export function canRefreshFinverseCategory(row: {
  reviewStatus: string | null; normalizedPayload: unknown; reviewReasons: unknown;
  categoryId: string | null; categoryConfidence: number; duplicateConfidence: number;
  isExcluded: boolean; deletedAt: Date | null; sourceRowKey: string | null;
}) {
  if (!row.sourceRowKey?.startsWith("finverse:") || row.isExcluded || row.deletedAt || row.duplicateConfidence > 0 ||
      !["suggested", "pending_review"].includes(row.reviewStatus ?? "")) return false;
  const payload = row.normalizedPayload as { source?: string; enrichment?: { categoryName?: string | null } } | null;
  if (payload?.source === "manual_edit") return false;
  const reasons = row.reviewReasons;
  if (!Array.isArray(reasons) || reasons.some(reason => reason !== "category_low_confidence")) return false;
  return Boolean(payload?.enrichment) || (!row.categoryId && row.categoryConfidence === 0);
}
