import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getCircleAccess,
  getCircleCurrentUser,
  getCircleErrorResponse,
  CircleAccessError,
} from "@/lib/circle-access";
import { sendCircleInvitationEmail } from "@/lib/circle-invitation-email";
import {
  CIRCLE_INVITATION_DURATION_DAYS,
  getCircleInvitationPath,
} from "@/lib/circle-invitations";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { getUserDisplayName } from "@/lib/user-display-name";

type RouteParams = {
  params: Promise<{ circleId: string; invitationId: string }>;
};

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    assertTrustedRequestOrigin(request);
    const user = await getCircleCurrentUser();
    const { circleId, invitationId } = await params;
    const access = await getCircleAccess(circleId, user.id, "organizer");
    const invitation = await prisma.circleInvitation.findFirst({
      where: { id: invitationId, circleId, status: "pending" },
    });
    if (!invitation) {
      throw new CircleAccessError("Pending invitation not found.", 404);
    }
    if (!invitation.email) {
      throw new CircleAccessError(
        "This invitation has no email address. Copy its link instead.",
        400,
      );
    }

    const expiresAt = new Date(
      Date.now() + CIRCLE_INVITATION_DURATION_DAYS * 24 * 60 * 60 * 1000,
    );
    const updated = await prisma.$transaction(async (tx) => {
      const value = await tx.circleInvitation.update({
        where: { id: invitation.id },
        data: {
          token: randomBytes(24).toString("hex"),
          expiresAt,
        },
      });
      await tx.circleActivity.create({
        data: {
          circleId,
          actorUserId: user.id,
          action: "invitation_resent",
          entityType: "invitation",
          entityId: invitation.id,
          summary: `Invitation to ${invitation.displayName || invitation.email} was resent.`,
        },
      });
      return value;
    });

    const shareUrl = getCircleInvitationPath(updated.token);
    let emailSent = false;
    try {
      await sendCircleInvitationEmail({
        to: updated.email!,
        circleName: access.circle.name,
        inviterName: getUserDisplayName(user),
        inviteUrl: new URL(shareUrl, request.url).toString(),
        expiresAt: updated.expiresAt,
      });
      emailSent = true;
    } catch (error) {
      console.error("[Circles] Resent invitation email failed", {
        circleId,
        invitationId,
        error: error instanceof Error ? error.message : "Unknown email error",
      });
    }

    return NextResponse.json({
      invitation: {
        id: updated.id,
        shareUrl,
        expiresAt: updated.expiresAt.toISOString(),
        emailSent,
      },
    });
  } catch (error) {
    const response = getCircleErrorResponse(error);
    return NextResponse.json(
      { error: response.message },
      { status: response.status },
    );
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    assertTrustedRequestOrigin(request);
    const user = await getCircleCurrentUser();
    const { circleId, invitationId } = await params;
    await getCircleAccess(circleId, user.id, "organizer");
    const invitation = await prisma.circleInvitation.findFirst({
      where: { id: invitationId, circleId, status: "pending" },
    });
    if (!invitation) {
      throw new CircleAccessError("Pending invitation not found.", 404);
    }

    await prisma.$transaction(async (tx) => {
      await tx.circleInvitation.update({
        where: { id: invitation.id },
        data: { status: "revoked" },
      });
      if (invitation.email) {
        const remainingInvites = await tx.circleInvitation.count({
          where: {
            circleId,
            id: { not: invitation.id },
            status: "pending",
            expiresAt: { gt: new Date() },
            email: { equals: invitation.email, mode: "insensitive" },
          },
        });
        if (remainingInvites === 0) {
          await tx.circleMembership.updateMany({
            where: {
              circleId,
              userId: null,
              status: "invited",
              email: { equals: invitation.email, mode: "insensitive" },
            },
            data: { status: "removed", leftAt: new Date() },
          });
        }
      }
      await tx.circleActivity.create({
        data: {
          circleId,
          actorUserId: user.id,
          action: "invitation_revoked",
          entityType: "invitation",
          entityId: invitation.id,
          summary: `Invitation to ${invitation.displayName || invitation.email || "a guest"} was revoked.`,
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const response = getCircleErrorResponse(error);
    return NextResponse.json(
      { error: response.message },
      { status: response.status },
    );
  }
}
