import type { Prisma } from "@prisma/client";
import { hasTransactionUserEdits } from "./transaction-user-edits";
import { transactionNeedsReview } from "./transaction-review-reasons";
import { getEffectiveTransactionCategoryName } from "./transaction-display";
import { resolveFinancialTransactionType } from "./transaction-directions";
import { getTransactionSummaryTypeOverrides } from "./transaction-summary";
import { reportDay, type ReportRow } from "../../shared/reports/analysis";

export const reportTransactionSelect = (workspaceId: string) =>
  ({
    id: true,
    accountId: true,
    date: true,
    createdAt: true,
    amount: true,
    currency: true,
    type: true,
    isTransfer: true,
    importFileId: true,
    reviewStatus: true,
    transactionTags: {
      where: { tag: { workspaceId } },
      select: { tagId: true },
    },
    normalizedPayload: true,
    parserConfidence: true,
    categoryConfidence: true,
    accountMatchConfidence: true,
    duplicateConfidence: true,
    isExcluded: true,
    categoryId: true,
    merchantRaw: true,
    merchantClean: true,
    description: true,
    rawPayload: true,
    category: { select: { id: true, name: true } },
    account: {
      select: {
        id: true,
        name: true,
        type: true,
        institution: true,
        currency: true,
      },
    },
  }) satisfies Prisma.TransactionSelect;

export function normalizeReportRows(
  transactions: Prisma.TransactionGetPayload<{
    select: ReturnType<typeof reportTransactionSelect>;
  }>[],
  timeZone: string,
): ReportRow[] {
  const resolvedCategories = new Map(
    transactions.map((t) => [
      t.id,
      hasTransactionUserEdits(t)
        ? (t.category?.name ?? "Other")
        : (getEffectiveTransactionCategoryName({
            categoryName: t.category?.name ?? null,
            rawPayload: t.rawPayload as never,
            merchantRaw: t.merchantRaw,
            merchantClean: t.merchantClean,
            description: t.description,
            institution: t.account.institution,
            source: t.importFileId ? "upload" : "manual",
            type: t.type,
          }) ?? "Uncategorized"),
    ]),
  );
  const overrides = getTransactionSummaryTypeOverrides(
    transactions.map((t) => ({
      ...t,
      accountType: t.account.type,
      categoryName: resolvedCategories.get(t.id),
    })),
  );
  return transactions.map((t) => ({
    id: t.id,
    date: reportDay(t.date, timeZone),
    amount: Math.abs(Number(t.amount)),
    currency: t.currency,
    type: hasTransactionUserEdits(t)
      ? t.type
      : (overrides.get(t.id) ??
        resolveFinancialTransactionType({
          ...t,
          categoryName: resolvedCategories.get(t.id),
          institution: t.account.institution,
        })),
    category: resolvedCategories.get(t.id)!,
    categoryId: t.category?.id,
    merchant: t.merchantClean || t.merchantRaw || "Other",
    accountId: t.accountId,
    account: t.account.name,
    reviewStatus: t.reviewStatus,
    needsReview: transactionNeedsReview({
      ...t,
      categoryName: resolvedCategories.get(t.id),
    }),
    tags: t.transactionTags.map((tag) => tag.tagId),
  }));
}
