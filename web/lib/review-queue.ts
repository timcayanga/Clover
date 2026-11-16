import { Prisma } from "@prisma/client";
import { buildVisibleWorkspaceTransactionWhere } from "@/lib/transaction-query";

export const buildReviewQueueWhere = (workspaceId: string): Prisma.TransactionWhereInput => buildVisibleWorkspaceTransactionWhere(workspaceId, {
  reviewStatus: {
    in: ["pending_review", "suggested"],
  },
  OR: [{ isExcluded: false }, { reviewReasons: { array_contains: ["finverse_possible_duplicate"] } }],
  // Every unresolved row remains reachable, including parser, merchant and generic warnings.
});
