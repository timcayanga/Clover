import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  getAdminDataEnvironment,
  requireAdminAuth,
  isAdminUserId,
} from "@/lib/admin";
import { isConfiguredAdminEmail } from "@/lib/admin-access";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import {
  assertClerkIdentityEnvironment,
  deleteClerkIdentity,
} from "@/lib/clerk-identity-lifecycle";
import { claimApproval, finishApproval } from "@/lib/admin-approvals";
import { recordAdminSupportAction } from "@/lib/admin-support";
export const maxDuration = 60;
export async function DELETE(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  let claimed: string | undefined;
  try {
    assertTrustedRequestOrigin(request);
    const actor = await requireAdminAuth("destructive");
    await assertClerkIdentityEnvironment();
    const { userId } = await context.params;
    const { approvalId } = z
      .object({
        approvalId: z.string().min(1),
        confirmation: z.literal("DELETE USER"),
      })
      .strict()
      .parse(await request.json());
    const target = await prisma.user.findFirst({
      where: { id: userId, environment: getAdminDataEnvironment() },
    });
    if (!target) throw new Error("User not found.");
    const member = await prisma.adminMember.findUnique({
      where: { clerkUserId: target.clerkUserId },
    });
    if (
      target.clerkUserId === actor.userId ||
      member?.active ||
      isAdminUserId(target.clerkUserId) ||
      (await isConfiguredAdminEmail(target.clerkUserId))
    )
      throw new Error(
        "Remove staff access and bootstrap allowlists before deleting this identity. You cannot delete yourself from Admin.",
      );
    await claimApproval(
      approvalId,
      actor.userId,
      userId,
      "delete_identity",
      {},
    );
    claimed = approvalId;
    await recordAdminSupportAction({
      actorUserId: actor.userId,
      targetClerkUserId: target.clerkUserId,
      action: "delete_user_requested",
    });
    await deleteClerkIdentity(target.clerkUserId);
    await finishApproval(approvalId, true, { deleted: true });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to delete user.";
    if (claimed) await finishApproval(claimed, false, { error: message });
    return NextResponse.json(
      { error: message },
      {
        status:
          message === "UNAUTHORIZED"
            ? 401
            : message === "FORBIDDEN"
              ? 403
              : 400,
      },
    );
  }
}
