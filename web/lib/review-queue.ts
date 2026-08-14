import { Prisma } from "@prisma/client";
import { buildActiveWorkspaceTransactionWhere } from "@/lib/transaction-query";

export const buildReviewQueueWhere = (workspaceId: string): Prisma.TransactionWhereInput => buildActiveWorkspaceTransactionWhere(workspaceId, {
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
