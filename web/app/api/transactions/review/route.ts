import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { actionableReviewReasons, reviewSelection } from "@/lib/actionable-transaction-review";
import { isAutomaticReviewExclusion } from "@/lib/transaction-review-inclusion";
import { invalidateWorkspaceSummaryCache } from "@/lib/workspace-summary-cache";
const input = z.object({workspaceId:z.string().min(1),transactionIds:z.array(z.string().min(1)).min(1).max(500)}).strict();
export async function POST(request:Request) {
 try {
  assertTrustedRequestOrigin(request);
  const {userId} = await requireAuth();
  const text=await request.text();
  if(new TextEncoder().encode(text).length>100000) return NextResponse.json({error:"Select up to 500 transactions."},{status:413});
  const parsed = input.safeParse(JSON.parse(text));
  if(!parsed.success) return NextResponse.json({error:"Select up to 500 transactions."},{status:400});
  const {workspaceId} = parsed.data;
  await assertWorkspaceAccess(userId,workspaceId);
  const ids = [...new Set(parsed.data.transactionIds)];
  const keptIds = await prisma.$transaction(async tx => {
   const rows = await tx.transaction.findMany({where:{workspaceId,id:{in:ids},deletedAt:null},select:reviewSelection});
   if(rows.length !== ids.length) throw new Error("SELECTION_CHANGED");
   const reviewed = rows.filter(row=>actionableReviewReasons(row).length>0);
   if(reviewed.length) {
    // One guarded write for the whole selection; remote database latency must
    // not multiply by the number of selected transactions.
    const result = await tx.transaction.updateMany({
     where:{workspaceId,deletedAt:null,OR:reviewed.map(row=>({id:row.id,updatedAt:row.updatedAt,reviewStatus:row.reviewStatus}))},
     data:{reviewStatus:"confirmed",reviewPriority:"none",reviewReasons:Prisma.DbNull,duplicateConfidence:0},
    });
    if(result.count !== reviewed.length) throw new Error("SELECTION_CHANGED");
    const automaticExclusions=reviewed.filter(row=>row.isExcluded && isAutomaticReviewExclusion(row)).map(row=>row.id);
    if(automaticExclusions.length) await tx.transaction.updateMany({where:{workspaceId,id:{in:automaticExclusions}},data:{isExcluded:false}});
   }
   if(reviewed.length) await tx.auditLog.createMany({data:reviewed.map(row=>({workspaceId,actorUserId:userId,action:"transaction_review_kept",entity:"Transaction",entityId:row.id,metadata:{previousReviewStatus:row.reviewStatus,previousReasons:row.reviewReasons,previousExcluded:row.isExcluded}}))});
   return reviewed.map(row=>row.id);
  });
  invalidateWorkspaceSummaryCache(workspaceId);
  return NextResponse.json({keptIds},{headers:{"Cache-Control":"private, no-store"}});
 } catch(error) {
  if(error instanceof SyntaxError) return NextResponse.json({error:"Choose valid transactions to keep."},{status:400});
  if(error instanceof Error && error.message === "Untrusted request origin.") return NextResponse.json({error:"This request is not authorized."},{status:403});
  if(error instanceof Error && error.message === "SELECTION_CHANGED") return NextResponse.json({error:"Some selected transactions changed. Refresh the list and try again."},{status:409});
  return NextResponse.json({error:"Unable to keep the selected transactions. Please try again."},{status:500});
 }
}
