import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { circleRoles } from "@/lib/circles";
import {
  getCircleAccess,
  getCircleCurrentUser,
  getCircleErrorResponse,
} from "@/lib/circle-access";
import {
  assertContentLengthWithin,
  assertTrustedRequestOrigin,
} from "@/lib/request-security";
import { capturePostHogServerEvent } from "@/lib/analytics";
import { sendCircleInvitationEmail } from "@/lib/circle-invitation-email";
import {
  CIRCLE_INVITATION_DURATION_DAYS,
  getCircleInvitationPath,
  getCircleInviteeDisplayName,
} from "@/lib/circle-invitations";
import { getUserDisplayName } from "@/lib/user-display-name";

const invitationSchema = z.object({
  email: z.string().trim().email().max(254),
  displayName: z.string().trim().min(1).max(100).nullable().optional(),
  role: z.enum(circleRoles).default("member"),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ circleId: string }> },
) {
  try {
    assertTrustedRequestOrigin(request);
    assertContentLengthWithin(request, 20_000);
    const user = await getCircleCurrentUser();
    const { circleId } = await params;
    const access = await getCircleAccess(circleId, user.id, "organizer");
    const body = invitationSchema.parse(await request.json());
    const expiresAt = new Date(
      Date.now() + CIRCLE_INVITATION_DURATION_DAYS * 24 * 60 * 60 * 1000,
    );

    const invitation = await prisma.$transaction(async (tx) => {
      if (body.email) {
        const invitedName = getCircleInviteeDisplayName(
          body.email,
          body.displayName,
        );
        const existingGuest = await tx.circleMembership.findFirst({
          where: {
            circleId,
            userId: null,
            status: "invited",
            OR: [
              {
                email: {
                  equals: body.email,
                  mode: "insensitive" as const,
                },
              },
              ...(body.displayName
                ? [
                    {
                      displayName: {
                        equals: body.displayName,
                        mode: "insensitive" as const,
                      },
                    },
                  ]
                : []),
            ],
          },
        });
        if (existingGuest) {
          await tx.circleMembership.update({
            where: { id: existingGuest.id },
            data: {
              email: body.email,
              displayName: body.displayName || existingGuest.displayName,
              role: body.role,
            },
          });
        } else {
          await tx.circleMembership.create({
            data: {
              circleId,
              displayName: invitedName,
              email: body.email,
              role: body.role,
              status: "invited",
            },
          });
        }

        const group = await tx.splitBillGroup.findUnique({
          where: { circleId },
          select: {
            id: true,
            members: { select: { name: true } },
          },
        });
        if (
          group &&
          !group.members.some(
            (member) =>
              member.name.trim().toLowerCase() ===
              invitedName.trim().toLowerCase(),
          )
        ) {
          await tx.splitBillGroupMember.create({
            data: { groupId: group.id, name: invitedName, sortOrder: 999 },
          });
        }
      }

      const created = await tx.circleInvitation.create({
        data: {
          circleId,
          invitedByUserId: user.id,
          email: body.email,
          displayName: body.displayName || null,
          role: body.role,
          token: randomBytes(24).toString("hex"),
          expiresAt,
        },
      });
      await tx.circleActivity.create({
        data: {
          circleId,
          actorUserId: user.id,
          action: "invitation_created",
          entityType: "invitation",
          entityId: created.id,
          summary: `${body.displayName || body.email || "Someone"} was invited to ${access.circle.name}.`,
          metadata: { role: body.role, hasEmail: Boolean(body.email) },
        },
      });
      return created;
    });

    void capturePostHogServerEvent("circle_invitation_created", user.id, {
      circle_id: circleId,
      invitation_role: body.role,
      invitation_has_email: Boolean(body.email),
    });

    const shareUrl = getCircleInvitationPath(invitation.token);
    let emailSent = false;
    try {
      await sendCircleInvitationEmail({
        to: body.email,
        circleName: access.circle.name,
        inviterName: getUserDisplayName(user),
        inviteUrl: new URL(shareUrl, request.url).toString(),
        expiresAt: invitation.expiresAt,
      });
      emailSent = true;
    } catch (error) {
      console.error("[Circles] Invitation email failed", {
        circleId,
        invitationId: invitation.id,
        error: error instanceof Error ? error.message : "Unknown email error",
      });
    }

    return NextResponse.json({
      invitation: {
        id: invitation.id,
        shareUrl,
        expiresAt: invitation.expiresAt.toISOString(),
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
