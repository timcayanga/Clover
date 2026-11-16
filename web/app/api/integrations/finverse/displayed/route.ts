import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { recordBankLinkStage } from "@/lib/bank-link-journey";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const { userId } = await requireAuth();
    const input = z.object({ workspaceId: z.string().min(1).max(240), connectionId: z.string().min(1).max(240),
      kind: z.enum(["balance", "transaction"]) }).strict().safeParse(await request.json());
    if (!input.success) return Response.json({ ok: false }, { status: 400 });
    const { workspaceId, connectionId, kind } = input.data;
    const workspace = await assertWorkspaceAccess(userId, workspaceId);
    const available = await prisma.auditLog.findFirst({
      where: { workspaceId, actorUserId: workspace.userId, entity: "BankLink", entityId: connectionId, action: "bank_link.data_available" },
      select: { id: true },
    });
    const active = available && await prisma.finverseConnection.findFirst({
      where: { id: connectionId, workspaceId, userId: workspace.userId, status: "ready", disconnectRequestedAt: null },
      select: { id: true },
    });
    if (!active) return Response.json({ ok: false }, { status: 409 });
    await recordBankLinkStage(connectionId, "first_data_displayed", { dataKind: kind });
    return Response.json({ ok: true });
  } catch (error) {
    const status = error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 400;
    return Response.json({ ok: false }, { status });
  }
}
