import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAuth } from "@/lib/auth";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { prisma } from "@/lib/prisma";
import { selectedWorkspaceKey } from "@/lib/workspace-selection";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { z } from "zod";
import { getFirstUseActivation, recordActivationResult } from "@/lib/first-use-activation";
export const dynamic = "force-dynamic";
async function context(request: Request) {
  const { userId } = await requireAuth();
  const user = await getOrCreateCurrentUser(userId);
  const workspaceId = new URL(request.url).searchParams.get("workspaceId") || (await cookies()).get(selectedWorkspaceKey)?.value;
  const workspace = await prisma.workspace.findFirst({ where: { userId: user.id, ...(workspaceId ? { id: workspaceId } : {}) }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!workspace) throw new Error("Profile unavailable");
  return { user, workspace };
}
export async function GET(request: Request) {
  try {
    const { user, workspace } = await context(request);
    return NextResponse.json({ activation: await getFirstUseActivation(workspace.id, user.id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Unable to load your first step." }, { status: 401 }); }
}

export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const input = z.object({ action: z.enum(["view", "acknowledge"]), transactionId: z.string().min(1).max(240) }).strict().parse(await request.json());
    const { user, workspace } = await context(request);
    const ok = await recordActivationResult(user, workspace.id, input.transactionId, input.action);
    return NextResponse.json({ ok }, { status: ok ? 200 : 409 });
  } catch { return NextResponse.json({ error: "Unable to update your first step." }, { status: 400 }); }
}
