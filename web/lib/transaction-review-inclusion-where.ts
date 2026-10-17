import { Prisma } from "@prisma/client";
export const automaticReviewExclusionWhere: Prisma.TransactionWhereInput = {
  reviewStatus: { in: ["pending_review", "suggested"] },
  reviewReasons: { array_contains: ["finverse_possible_duplicate"] },
  OR: [
    {normalizedPayload:{equals:Prisma.DbNull}},
    {normalizedPayload:{path:["source"],equals:Prisma.AnyNull}},
    {normalizedPayload:{path:["source"],not:"manual_edit"}},
  ],
};
export const includedTransactionWhere = (): Prisma.TransactionWhereInput => ({ OR: [{ isExcluded: false }, automaticReviewExclusionWhere] });
