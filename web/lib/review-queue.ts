import { Prisma } from "@prisma/client";
import { buildActiveWorkspaceTransactionWhere } from "@/lib/transaction-query";

export const buildReviewQueueWhere = (workspaceId: string): Prisma.TransactionWhereInput => buildActiveWorkspaceTransactionWhere(workspaceId, {
  reviewStatus: {
    in: ["pending_review", "suggested"],
  },
  // Every unresolved row remains reachable, including parser, merchant and generic warnings.
});
