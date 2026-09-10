import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import {
  createLunchFlowAuthorizationUrl,
  encryptLunchFlowToken,
  getLunchFlowConfig,
  hashLunchFlowState,
  isLunchFlowEnabled,
  registerLunchFlowUser,
} from "@/lib/lunch-flow";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isLunchFlowEnabled()) {
    return NextResponse.json({ error: "Bank connections are not available yet." }, { status: 404 });
  }

  try {
    const { userId } = await requireAuth();
    const body = await request.json().catch(() => ({})) as { workspaceId?: string };
    if (!body.workspaceId) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });
    const workspace = await assertWorkspaceAccess(userId, body.workspaceId);
    const user = await prisma.user.findUnique({ where: { id: workspace.userId }, select: { id: true, email: true } });
    if (!user?.email) return NextResponse.json({ error: "Your account needs an email address before connecting a bank." }, { status: 422 });

    const registered = await registerLunchFlowUser(user.email, user.id);
    if (!registered.access_token) throw new Error("LUNCHFLOW_USER_TOKEN_MISSING");
    const config = getLunchFlowConfig();
    const state = randomBytes(32).toString("base64url");
    const stateHash = hashLunchFlowState(state);
    const expiresAt = new Date(Date.now() + Math.max(60, registered.expires_in ?? 3600) * 1000);

    const connection = await prisma.lunchFlowConnection.upsert({
      where: { workspaceId: workspace.id },
      create: {
        userId: user.id,
        workspaceId: workspace.id,
        stateHash,
        stateExpiresAt: new Date(Date.now() + 15 * 60_000),
        externalUserId: registered.user_id || registered.external_user_id || user.id,
        encryptedAccessToken: encryptLunchFlowToken(registered.access_token, config.encryptionKey),
        encryptedRefreshToken: registered.refresh_token
          ? encryptLunchFlowToken(registered.refresh_token, config.encryptionKey)
          : null,
        accessTokenExpiresAt: expiresAt,
      },
      update: {
        userId: user.id,
        stateHash,
        stateExpiresAt: new Date(Date.now() + 15 * 60_000),
        status: "link_pending",
        externalUserId: registered.user_id || registered.external_user_id || user.id,
        encryptedAccessToken: encryptLunchFlowToken(registered.access_token, config.encryptionKey),
        encryptedRefreshToken: registered.refresh_token
          ? encryptLunchFlowToken(registered.refresh_token, config.encryptionKey)
          : undefined,
        accessTokenExpiresAt: expiresAt,
        syncError: null,
      },
      select: { id: true },
    });

    return NextResponse.json({
      connectionId: connection.id,
      linkUrl: createLunchFlowAuthorizationUrl(user.email, state),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    if (message === "WORKSPACE_NOT_FOUND") return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    if (message === "LUNCHFLOW_DISABLED") return NextResponse.json({ error: "Bank connections are not available yet." }, { status: 404 });
    if (message === "LUNCHFLOW_NOT_CONFIGURED") return NextResponse.json({ error: "Bank connections are not configured yet." }, { status: 503 });
    console.error("Lunch Flow link creation failed", error);
    return NextResponse.json({ error: "Unable to open the secure bank connection." }, { status: 502 });
  }
}
