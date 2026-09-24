import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { prisma } from "@/lib/prisma";
import { getAccountBrand } from "@/lib/account-brand";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { userId } = await requireAuth();
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (!workspaceId) return NextResponse.json({error:"Choose a Profile first."},{status:400});
    await assertWorkspaceAccess(userId,workspaceId);
    const connections = await prisma.finverseConnection.findMany({where:{workspaceId,user:{clerkUserId:userId},status:{not:"disconnected"},encryptedRefreshToken:{not:null}},select:{id:true,status:true,institutionName:true,lastSyncedAt:true,accountLinks:{where:{accountId:{not:null},unlinkedAt:null},select:{account:{select:{id:true,name:true,institution:true,accountNumber:true,logoUrl:true,type:true}}}}}});
    return NextResponse.json({
      pending:connections.filter(c=>c.status==='awaiting_selection'||(!c.accountLinks.length&&!c.lastSyncedAt)).map(c=>({id:c.id,name:c.institutionName||"Linked bank"})),
      accounts:connections.flatMap(c=>c.accountLinks.flatMap(link=>{const a=link.account;if(!a)return [];const brand=getAccountBrand(a);return [{id:a.id,connectionId:c.id,name:a.name,last4:a.accountNumber?.replace(/\s/g,"").slice(-4)||null,logoUrl:brand.logoSrc||brand.fallbackIconSrc,lastSyncedAt:c.lastSyncedAt}];})),
    },{headers:{"Cache-Control":"private, no-store"}});
  } catch(error) {
    const message=error instanceof Error?error.message:"";
    return NextResponse.json({error:message==='UNAUTHORIZED'?"Please sign in again.":"Unable to load linked accounts."},{status:message==='UNAUTHORIZED'?401:message==='WORKSPACE_NOT_FOUND'?404:503});
  }
}
