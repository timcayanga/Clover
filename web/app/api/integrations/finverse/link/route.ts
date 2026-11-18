import { withBankMonitoring, bindBankMonitoring, bankJourney, bankJourneyFailure, bankAttemptId } from "@/lib/bank-journey-monitor";
import { recordBankLinkStage } from "@/lib/bank-link-journey";
import { assertPlanQuota, PlanQuotaError } from "@/lib/plan-quota";
import { getMobileRequestContext } from "@/lib/mobile-request-context";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { cachedFinverseBankName, createFinverseLink, getFinverseBanks, hashFinverseState, isFinverseEnabled } from "@/lib/finverse";

import { getProAccess } from "@/lib/pro-access";

export const dynamic = "force-dynamic";

export function POST(request: Request) { return withBankMonitoring("link",()=>handlePost(request)); }
async function handlePost(request: Request) {
  if (!isFinverseEnabled()) {
    return NextResponse.json({ error: "Bank connections are not available yet." }, { status: 404 });
  }

  let preparedConnectionId:string|undefined;
  try {
    const { userId } = await requireAuth();
    const parsed = z.object({ workspaceId: z.string().min(1), institutionId: z.string().min(1).max(200).optional(), setup: z.literal(true).optional() }).strict().safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Choose a Profile and bank." }, { status: 400 });
    const body = parsed.data;
    if (!body.workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });
    const workspace = await assertWorkspaceAccess(userId, body.workspaceId);
    const owner = await prisma.user.findUniqueOrThrow({ where: { id: workspace.userId }, select: { verified: true } });
    if (!owner.verified) return NextResponse.json({ error: "Verify your email before connecting a bank.", emailVerificationRequired: true }, { status: 403 });
    if ((await getProAccess(workspace.userId)).planTier === "free") return NextResponse.json({ error: "Upgrade to Clover Plus or Pro to connect your banks.", upgradeRequired: true }, { status: 403 });
    // Authorization may reconnect an already reserved account at a full allowance.
    // Distinct-account slots are enforced atomically when accounts are selected.
    const state = (getMobileRequestContext() ? "native." : body.setup ? "setup." : "") + randomBytes(32).toString("base64url");
    const connection = await prisma.finverseConnection.create({
      data: {
        userId: workspace.userId,
        workspaceId: workspace.id,
        institutionId: body.institutionId,
        institutionName: cachedFinverseBankName(body.institutionId),
        status: "preparing",
        stateHash: hashFinverseState(state),
        stateExpiresAt: new Date(Date.now() + 15 * 60_000),
      },
      select: { id: true, workspaceId: true, userId: true, institutionId: true, institutionName: true, createdAt: true },
    });

    preparedConnectionId=connection.id;
    await bindBankMonitoring(connection,userId);
    // Commit selection before any provider/catalog request; no callback is needed to retain attribution.
    await bankJourney('bank_selected','succeeded',{durable:true});
    await bankJourney('link_request','started',{durable:true});
    const selectedBank = body.institutionId ? (await getFinverseBanks({ fresh: true })).banks.find(bank => bank.id === body.institutionId) : undefined;
    if(body.institutionId&&!selectedBank){
      await bankJourney('bank_selection_validated','failed',{durable:true,error:{providerCode:'BANK_SELECTION_UNAVAILABLE'}});
      await prisma.finverseConnection.update({where:{id:connection.id},data:{status:'error',syncError:'The selected bank is no longer available.'}});
      return NextResponse.json({error:'This bank is no longer available. Refresh the bank list.'},{status:400});
    }
    if(selectedBank){
      await prisma.finverseConnection.update({where:{id:connection.id},data:{institutionName:selectedBank.name}});
      await bindBankMonitoring({...connection,institutionName:selectedBank.name},userId);
      await bankJourney('bank_selection_validated','succeeded',{durable:true});
      await recordBankLinkStage(connection.id, 'institution_selected');
    }
    const link=await createFinverseLink(workspace.userId,state,body.institutionId);
    if(!link.link_url)throw new Error('FINVERSE_LINK_URL_MISSING');
    await prisma.finverseConnection.update({where:{id:connection.id},data:{status:'link_pending'}});
    bankJourney('link_request','succeeded');
    await recordBankLinkStage(connection.id, "started");
    return NextResponse.json({ connectionId: connection.id, attemptId:bankAttemptId(), linkUrl: link.link_url });
  } catch (error) {
    if(preparedConnectionId){
      bankJourneyFailure(error,'link_request');
      await prisma.finverseConnection.updateMany({where:{id:preparedConnectionId,status:'preparing'},data:{status:'error',syncError:'The secure bank setup could not open.'}}).catch(()=>{});
    }
    if (error instanceof PlanQuotaError) return NextResponse.json({error:error.message},{status:403});
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    if (message === "WORKSPACE_NOT_FOUND") return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    if (message === "FINVERSE_DISABLED") return NextResponse.json({ error: "Bank connections are not available yet." }, { status: 404 });
    if (message === "FINVERSE_NOT_CONFIGURED") return NextResponse.json({ error: "Bank connections are not configured yet." }, { status: 503 });
    console.error("Finverse link creation failed", error);
    return NextResponse.json({ error: "Unable to open the secure bank connection." }, { status: 502 });
  }
}
