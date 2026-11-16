import { claimApproval, finishApproval } from "@/lib/admin-approvals";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminDataEnvironment, requireAdminAuth } from "@/lib/admin";
import { createAdminDataSnapshot, recordAdminSupportAction, restoreAdminDataSnapshot } from "@/lib/admin-support";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { prisma } from "@/lib/prisma";
import { wipeLocalUserData } from "@/lib/account-management";

export const dynamic = "force-dynamic";

const schema = z.object({ approvalId: z.string().min(1).optional(), confirmation: z.literal("RESTORE"), snapshotId: z.string().min(1) });

export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  let claimedId: string | null = null;
  try {
    assertTrustedRequestOrigin(request);
    const admin = await requireAdminAuth("destructive");
    const payload = schema.parse(await request.json());
    const { userId } = await context.params;
    const snapshot = await prisma.adminDataSnapshot.findFirst({
      where: {
        id: payload.snapshotId,
        targetUserId: userId,
        targetUser: { environment: getAdminDataEnvironment() },
      },
      select: { targetUserId: true, targetClerkUserId: true, restoredAt: true },
    });
    if (!snapshot) return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
    if (snapshot.restoredAt) return NextResponse.json({ error: "This snapshot was already restored." }, { status: 409 });
    await claimApproval(payload.approvalId, admin.userId, userId, "restore", { snapshotId: payload.snapshotId });
    claimedId = payload.approvalId!;
    const recoverySnapshot = await createAdminDataSnapshot(userId, admin.userId);
    await wipeLocalUserData(snapshot.targetClerkUserId, { reseedStarterWorkspace: false });
    const result = await restoreAdminDataSnapshot(payload.snapshotId, admin.userId);
    await recordAdminSupportAction({ actorUserId: admin.userId, targetUserId: snapshot.targetUserId, action: "restore_data", metadata: { snapshot_id: payload.snapshotId } });
    await finishApproval(claimedId, true, { snapshotId: recoverySnapshot.id, restoredSnapshotId: payload.snapshotId });
    return NextResponse.json(result);
  } catch (error) {
    if (claimedId) await finishApproval(claimedId, false, { error: "Execution did not complete. Inspect audit and current user data before requesting another action." });
    const message = error instanceof Error ? error.message : "Unable to restore data.";
    if (message === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Type RESTORE and provide a snapshot ID to confirm." }, { status: 400 });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
