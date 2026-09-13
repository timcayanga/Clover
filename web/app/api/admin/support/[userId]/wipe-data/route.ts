import { claimApproval, finishApproval } from "@/lib/admin-approvals";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminDataEnvironment, requireAdminAuth } from "@/lib/admin";
import { capturePostHogServerEvent } from "@/lib/analytics";
import { wipeLocalUserData } from "@/lib/account-management";
import { prisma } from "@/lib/prisma";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { createAdminDataSnapshot, recordAdminSupportAction } from "@/lib/admin-support";

export const dynamic = "force-dynamic";

const schema = z.object({
  approvalId: z.string().min(1).optional(),
  confirmation: z.literal("WIPE"),
  reseedStarterWorkspace: z.boolean().default(true),
});

export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  let claimedId: string | null = null;
  try {
    assertTrustedRequestOrigin(request);
    const admin = await requireAdminAuth("destructive");
    const { userId } = await context.params;
    const payload = schema.parse(await request.json());
    const user = await prisma.user.findFirst({
      where: { id: userId, environment: getAdminDataEnvironment() },
      select: { id: true, clerkUserId: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await claimApproval(payload.approvalId, admin.userId, userId, "wipe", { reseedStarterWorkspace: payload.reseedStarterWorkspace });
    claimedId = payload.approvalId!;

    const snapshot = await createAdminDataSnapshot(user.id, admin.userId);

    const wiped = await wipeLocalUserData(user.clerkUserId, payload);
    if (!wiped) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await recordAdminSupportAction({
      actorUserId: admin.userId,
      targetUserId: user.id,
      targetClerkUserId: user.clerkUserId,
      action: "wipe_data",
      metadata: { snapshot_id: snapshot.id, reseeded_starter_workspace: payload.reseedStarterWorkspace },
    });

    void capturePostHogServerEvent("admin_support_action", admin.userId, {
      action: "wipe_data",
      target_user_id: user.id,
      reseeded_starter_workspace: payload.reseedStarterWorkspace,
    });
    void capturePostHogServerEvent("account_wiped", user.clerkUserId, { wipe_scope: "admin_support" });

    await finishApproval(claimedId, true, { snapshotId: snapshot.id });
    return NextResponse.json({ success: true, snapshotId: snapshot.id, reseededStarterWorkspace: payload.reseedStarterWorkspace });
  } catch (error) {
    if (claimedId) await finishApproval(claimedId, false, { error: "Execution did not complete. Inspect audit and current user data before requesting another action." });
    const message = error instanceof Error ? error.message : "Unable to wipe user data.";
    if (message === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Type WIPE to confirm." }, { status: 400 });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
