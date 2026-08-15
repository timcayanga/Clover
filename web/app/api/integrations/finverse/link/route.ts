import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { createFinverseLink, hashFinverseState, isFinverseEnabled } from "@/lib/finverse";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isFinverseEnabled()) {
    return NextResponse.json({ error: "Bank connections are not available yet." }, { status: 404 });
  }

  try {
    const { userId } = await requireAuth();
    const body = await request.json().catch(() => ({})) as { workspaceId?: string };
    if (!body.workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });
    const workspace = await assertWorkspaceAccess(userId, body.workspaceId);
    const state = randomBytes(32).toString("base64url");
    const link = await createFinverseLink(workspace.userId, state);
    if (!link.link_url) throw new Error("FINVERSE_LINK_URL_MISSING");

    const connection = await prisma.finverseConnection.create({
      data: {
        userId: workspace.userId,
        workspaceId: workspace.id,
        stateHash: hashFinverseState(state),
        stateExpiresAt: new Date(Date.now() + 15 * 60_000),
      },
      select: { id: true },
    });

    return NextResponse.json({ connectionId: connection.id, linkUrl: link.link_url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    if (message === "WORKSPACE_NOT_FOUND") return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    if (message === "FINVERSE_DISABLED") return NextResponse.json({ error: "Bank connections are not available yet." }, { status: 404 });
    if (message === "FINVERSE_NOT_CONFIGURED") return NextResponse.json({ error: "Bank connections are not configured yet." }, { status: 503 });
    console.error("Finverse link creation failed", error);
    return NextResponse.json({ error: "Unable to open the secure bank connection." }, { status: 502 });
  }
}
