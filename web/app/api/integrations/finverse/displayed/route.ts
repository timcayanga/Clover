import { BANK_MAX_CLIENT_INTERVAL_MS } from '../../../../../../shared/bank-stage-measurements';
import { withBankMonitoring, bindBankMonitoring, bankJourney, bankAttemptId, bindBankSyncObservation } from "@/lib/bank-journey-monitor";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { recordBankLinkStage } from "@/lib/bank-link-journey";
import { prisma } from "@/lib/prisma";

export function POST(request: Request) { return withBankMonitoring("display",()=>handlePost(request)); }
async function handlePost(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const { userId } = await requireAuth();
    const input = z.object({ workspaceId: z.string().min(1).max(240), connectionId: z.string().min(1).max(240),
      syncAttemptId:z.string().uuid().optional(),attemptId:z.string().min(1).max(240).optional(),durationMs:z.number().finite().min(0).max(BANK_MAX_CLIENT_INTERVAL_MS).optional(),requestToVisibleMs:z.number().finite().min(0).max(BANK_MAX_CLIENT_INTERVAL_MS).optional(),kind: z.enum(["balance", "transaction"]) }).strict().safeParse(await request.json());
    if (!input.success) return Response.json({ ok: false }, { status: 400 });
    const { workspaceId, connectionId, kind } = input.data;
    const workspace = await assertWorkspaceAccess(userId, workspaceId);
    const available = await prisma.auditLog.findFirst({
      where: { workspaceId, actorUserId: workspace.userId, entity: "BankLink", entityId: connectionId, action: "bank_link.data_available" },
      select: { id: true },
    });
    const active = available && await prisma.finverseConnection.findFirst({
      where: { id: connectionId, workspaceId, userId: workspace.userId, status: "ready", disconnectRequestedAt: null },
      select: { id: true, userId:true,workspaceId:true,createdAt:true,institutionId:true,institutionName:true },
    });
    if (!active) return Response.json({ ok: false }, { status: 409 });
    await bindBankMonitoring(active,userId);
    if(input.data.attemptId&&input.data.attemptId!==bankAttemptId())return Response.json({ok:false},{status:409});
    if(input.data.syncAttemptId&&!await bindBankSyncObservation(input.data.syncAttemptId,'sync_finished'))return Response.json({ok:false},{status:409});
    bankJourney("first_data_displayed","succeeded",{dataKind:kind,durationMs:input.data.durationMs,requestToVisibleMs:input.data.requestToVisibleMs,timingBoundary:input.data.durationMs!==undefined?"client_payload_to_visible":"legacy_display_ack"});
    await recordBankLinkStage(connectionId, "first_data_displayed", { dataKind: kind });
    return Response.json({ ok: true });
  } catch (error) {
    const status = error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 400;
    return Response.json({ ok: false }, { status });
  }
}
