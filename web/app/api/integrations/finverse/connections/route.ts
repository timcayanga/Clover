import { preferredBankLinks } from "../../../../../../shared/bank-link-presentation";
import { pendingBankAttempts } from "@/lib/finverse-bank-presentation";
import { cleanBankNumber } from "@/lib/finverse-matching";
import { getProAccess } from "@/lib/pro-access";
import { bankLifecycleOverview } from "@/lib/finverse-lifecycle";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { prisma } from "@/lib/prisma";
import { accountBrandPalette, getAccountWalletBrand } from "@/lib/account-brand";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { userId } = await requireAuth();
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (!workspaceId) return NextResponse.json({error:"Choose a Profile first."},{status:400});
    const workspace=await assertWorkspaceAccess(userId,workspaceId);
    const accountId = new URL(request.url).searchParams.get("accountId") || undefined;
    const picker = new URL(request.url).searchParams.get("view") === "picker";
    const [details, connections] = await Promise.all([
      picker ? getProAccess(workspace.userId).then(access => ({ upgradeRequired: access.planTier === "free", trial: access.trial }))
        : bankLifecycleOverview(workspace.userId).then(lifecycle => ({ lifecycle })),
      prisma.finverseConnection.findMany({where:{workspaceId,user:{clerkUserId:userId},...(accountId ? { accountLinks: { some: { accountId } } } : { status:{notIn:["disconnected","cancelled"]},OR:[{encryptedRefreshToken:{not:null}},{encryptedAccessToken:{not:null}},{status:{in:["link_pending","authorizing","retrieving","error"]}}] })},select:{id:true,workspaceId:true,createdAt:true,stateExpiresAt:true,status:true,institutionName:true,institutionId:true,loginIdentityId:true,rawLoginIdentity:true,disconnectRequestedAt:true,lastSyncedAt:true,syncError:true,encryptedAccessToken:true,encryptedRefreshToken:true,accountLinks:{where:{workspaceId,accountId:{not:null},...(accountId ? {} : {unlinkedAt:null})},select:{unlinkedAt:true,account:{select:{id:true,name:true,institution:true,accountNumber:true,logoUrl:true,type:true}}}}}}),
    ]);
    return NextResponse.json({ ...details,
      pending: pendingBankAttempts(connections, c => c.accountLinks.some(link => !link.unlinkedAt && Boolean(link.account)), new Date()),
      accounts: preferredBankLinks(connections.flatMap(connection =>
        connection.accountLinks.flatMap(link => {
          const account = link.account;
          if (!account) return [];
          const brand = getAccountWalletBrand(account);
          return [{
            id: account.id,
            connectionId: connection.id,
            name: account.name,
            institution: account.institution,
            type: account.type,
            brandPalette: accountBrandPalette(brand),
            status: connection.status,
            syncError: connection.syncError ?? null,
            institutionId: connection.institutionId,
            unlinkedAt: link.unlinkedAt?.toISOString() ?? null,
            authorizationAvailable: Boolean(connection.encryptedRefreshToken),
            last4: cleanBankNumber(account.accountNumber).slice(-4) || null,
            logoUrl: brand.logoSrc || brand.logoSrcs?.[0] || brand.fallbackIconSrc,
            lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
          }];
        }),
      )),
    },{headers:{"Cache-Control":"private, no-store"}});
  } catch(error) {
    const message=error instanceof Error?error.message:"";
    return NextResponse.json({error:message==='UNAUTHORIZED'?"Please sign in again.":"Unable to load linked accounts."},{status:message==='UNAUTHORIZED'?401:message==='WORKSPACE_NOT_FOUND'?404:503});
  }
}

export async function POST(request:Request) {
  try {
    const {userId}=await requireAuth();
    const body=await request.json();
    const workspace=await assertWorkspaceAccess(userId,body.workspaceId);
    if(!Array.isArray(body.retainIds)||body.retainIds.length>2||body.retainIds.some((id:unknown)=>typeof id!=='string')) return NextResponse.json({error:'Choose up to two accounts to keep on Plus.'},{status:400});
    await prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`plan-quota:${workspace.userId}`}, 0))`;
      const links=await tx.finverseAccountLink.findMany({where:{id:{in:body.retainIds},workspace:{userId:workspace.userId},unlinkedAt:null,accountId:{not:null},connection:{disconnectRequestedAt:null,status:{not:'disconnected'}}}});
      if(links.length!==new Set(body.retainIds).size) throw new Error('Choose active linked accounts belonging to you.');
      await tx.finverseAccountLink.updateMany({where:{workspace:{userId:workspace.userId}},data:{retainOnDowngrade:false}});
      await tx.finverseAccountLink.updateMany({where:{id:{in:body.retainIds},workspace:{userId:workspace.userId}},data:{retainOnDowngrade:true}});
    });
    return NextResponse.json({saved:true});
  } catch {return NextResponse.json({error:'Unable to save retained accounts.'},{status:400});}
}
