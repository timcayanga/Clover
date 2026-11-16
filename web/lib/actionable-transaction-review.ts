import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getTransactionReviewReasons } from "./transaction-review-reasons";
import { getEffectiveTransactionCategoryName, getEffectiveTransactionMerchantName } from "./transaction-display";
import { hasTransactionUserEdits } from "./transaction-user-edits";
export const unresolvedReviewWhere: Prisma.TransactionWhereInput = {reviewStatus: {notIn: ["confirmed","edited","rejected","duplicate_skipped"]}};
export const reviewSelection = { id:true, updatedAt:true, workspaceId:true, accountId:true, reviewStatus:true, reviewReasons:true, isExcluded:true, categoryId:true, parserConfidence:true, categoryConfidence:true, accountMatchConfidence:true, duplicateConfidence:true, merchantRaw:true, merchantClean:true, description:true, rawPayload:true, normalizedPayload:true, type:true, importFileId:true, category:{select:{name:true}}, account:{select:{institution:true}} } satisfies Prisma.TransactionSelect;
type ReviewRow = Prisma.TransactionGetPayload<{select:typeof reviewSelection}>;
export function transactionReviewDisplayFields(row: ReviewRow) {
 const edited = hasTransactionUserEdits(row) || ["confirmed","edited","rejected","duplicate_skipped"].includes(row.reviewStatus);
 const raw = row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload) ? row.rawPayload : {};
 const categoryName = edited ? row.category?.name : getEffectiveTransactionCategoryName({ categoryName:row.category?.name ?? (typeof raw.categoryName === "string" ? raw.categoryName : null), rawPayload:row.rawPayload, merchantRaw:row.merchantRaw, merchantClean:row.merchantClean, description:row.description, institution:row.account.institution, source:row.importFileId ? "upload" : "manual", type:row.type });
 return {categoryName, merchantClean:edited ? row.merchantClean : getEffectiveTransactionMerchantName({merchantClean:row.merchantClean,merchantRaw:row.merchantRaw,institution:row.account.institution})};
}
export function actionableReviewReasons(row: ReviewRow) {
 return getTransactionReviewReasons({...row,...transactionReviewDisplayFields(row)});
}
export async function actionableReviewIds(where: Prisma.TransactionWhereInput) {
 const rows = await prisma.transaction.findMany({where:{AND:[where,unresolvedReviewWhere]},select:reviewSelection});
 return rows.filter(row => actionableReviewReasons(row).length > 0).map(row=>row.id);
}
