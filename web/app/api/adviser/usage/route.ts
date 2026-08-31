import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionContext } from "@/lib/auth";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { selectedWorkspaceKey } from "@/lib/workspace-selection";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { prisma } from "@/lib/prisma";
import { summarizeAdviserUsageAuditLogs } from "@/lib/adviser-model-usage";

export const dynamic = "force-dynamic";

const startForRange = (range: string, now: Date) => {
  if (range === "all") return null;
  if (range === "90d") return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  return new Date(now.getFullYear(), now.getMonth(), 1);
};

export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    const user = await getOrCreateCurrentUser(session.userId);
    const selectedWorkspaceId = (await cookies()).get(selectedWorkspaceKey)?.value ?? "";
    const workspace = selectedWorkspaceId
      ? await assertWorkspaceAccess(session.userId, selectedWorkspaceId)
      : await prisma.workspace.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
    if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

    const url = new URL(request.url);
    const range = ["month", "90d", "all"].includes(url.searchParams.get("range") ?? "")
      ? url.searchParams.get("range")!
      : "month";
    const now = new Date();
    const start = startForRange(range, now);
    const logs = await prisma.auditLog.findMany({
      where: {
        workspaceId: workspace.id,
        actorUserId: user.id,
        action: { in: ["adviser.chat_asked", "adviser.model_call", "adviser.local_response"] },
        ...(start ? { createdAt: { gte: start } } : {}),
      },
      select: { action: true, entityId: true, metadata: true },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      range,
      startsAt: start?.toISOString() ?? null,
      endsAt: now.toISOString(),
      plan: user.planTier,
      workspaceId: workspace.id,
      ...summarizeAdviserUsageAuditLogs(logs),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Adviser usage";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}
