import { Prisma } from "@prisma/client";
import { buildVisibleWorkspaceTransactionWhere } from "@/lib/transaction-query";

export const buildReviewQueueWhere = (workspaceId: string): Prisma.TransactionWhereInput => buildVisibleWorkspaceTransactionWhere(workspaceId, {
  isExcluded: false,
  reviewStatus: {
    in: ["pending_review", "suggested"],
  },
  OR: [
    { categoryId: null },
    { categoryConfidence: { lt: 70 } },
    { accountMatchConfidence: { lt: 70 } },
    { duplicateConfidence: { gte: 50 } },
    { transferConfidence: { gte: 50 } },
  ],
});
