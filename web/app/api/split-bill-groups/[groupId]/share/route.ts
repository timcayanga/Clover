import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import { assertTrustedRequestOrigin } from "@/lib/request-security";

export async function POST(request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  assertTrustedRequestOrigin(request);
  const user = await getSplitBillCurrentUser();
  const { groupId } = await params;
  const group = await prisma.splitBillGroup.findFirst({ where: { id: groupId, userId: user.id }, select: { id: true, shareToken: true, circleId: true } });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  if (group.circleId) {
    const invitation = await prisma.$transaction(async (tx) => {
      const created = await tx.circleInvitation.create({
        data: {
          circleId: group.circleId!,
          invitedByUserId: user.id,
          role: "member",
          token: randomBytes(24).toString("hex"),
          expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      });
      await tx.circleActivity.create({
        data: {
          circleId: group.circleId!,
          actorUserId: user.id,
          action: "invitation_created",
          entityType: "invitation",
          entityId: created.id,
          summary: "A general Circle invitation was created from Split Bills.",
        },
      });
      return created;
    });
    return NextResponse.json({ shareUrl: `/circles/join/${invitation.token}` });
  }

  const shareToken = group.shareToken ?? randomBytes(24).toString("hex");
  if (!group.shareToken) await prisma.splitBillGroup.update({ where: { id: group.id }, data: { shareToken } });
  return NextResponse.json({ shareUrl: `/split-bill/group-invite/${shareToken}` });
}
