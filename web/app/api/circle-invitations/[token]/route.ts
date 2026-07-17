import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getCircleCurrentUser,
  getCircleErrorResponse,
  CircleAccessError,
} from "@/lib/circle-access";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { capturePostHogServerEvent } from "@/lib/analytics";
import { getSessionContext, isLocalDevHost } from "@/lib/auth";
import {
  getOrCreateCurrentUser,
  hasCompletedOnboarding,
} from "@/lib/user-context";
import { isCircleInvitationToken } from "@/lib/circle-invitations";

const getInvitationViewer = async () => {
  if (await isLocalDevHost()) {
    const user = await getCircleCurrentUser();
    return {
      user,
      signedIn: true,
      onboardingCompleted: hasCompletedOnboarding(user),
    };
  }

  try {
    const session = await getSessionContext();
    if (session.isGuest) {
      return { user: null, signedIn: false, onboardingCompleted: false };
    }
    const user = await getOrCreateCurrentUser(session.userId);
    return {
      user,
      signedIn: true,
      onboardingCompleted: hasCompletedOnboarding(user),
    };
  } catch {
    return { user: null, signedIn: false, onboardingCompleted: false };
  }
};

const findInvitation = (token: string) =>
  prisma.circleInvitation.findUnique({
    where: { token },
    include: {
      circle: {
        select: {
          id: true,
          name: true,
          type: true,
          description: true,
          avatarUrl: true,
          owner: { select: { firstName: true, lastName: true } },
          _count: {
            select: { memberships: { where: { status: "active" } } },
          },
          memberships: {
            where: { status: "active" },
            select: { id: true, displayName: true, role: true },
            orderBy: { createdAt: "asc" },
            take: 12,
          },
        },
      },
    },
  });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!isCircleInvitationToken(token)) {
    return NextResponse.json(
      { error: "This Circle invitation is unavailable or has expired." },
      { status: 404 },
    );
  }
  const invitation = await findInvitation(token);
  if (
    !invitation ||
    invitation.status !== "pending" ||
    invitation.expiresAt <= new Date()
  ) {
    return NextResponse.json(
      { error: "This Circle invitation is unavailable or has expired." },
      { status: 404 },
    );
  }

  const viewer = await getInvitationViewer();
  return NextResponse.json({
    invitation: {
      circle: {
        id: invitation.circle.id,
        name: invitation.circle.name,
        type: invitation.circle.type,
        description: invitation.circle.description,
        avatarUrl: invitation.circle.avatarUrl,
        memberCount: invitation.circle._count.memberships,
        members: invitation.circle.memberships.map((member) => ({
          displayName: member.displayName,
          role: member.role,
        })),
      },
      invitedBy:
        [invitation.circle.owner.firstName, invitation.circle.owner.lastName]
          .filter(Boolean)
          .join(" ") || "A Clover member",
      role: invitation.role,
      expiresAt: invitation.expiresAt.toISOString(),
      privacy:
        "Your accounts and transactions stay private. Only items you choose to share will be visible in this Circle.",
    },
    viewer: {
      signedIn: viewer.signedIn,
      onboardingCompleted: viewer.onboardingCompleted,
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    assertTrustedRequestOrigin(request);
    const { token } = await params;
    if (!isCircleInvitationToken(token)) {
      throw new CircleAccessError(
        "This Circle invitation is no longer available.",
        404,
      );
    }
    const viewer = await getInvitationViewer();
    if (!viewer.signedIn || !viewer.user) {
      throw new CircleAccessError(
        "Sign in or create a free Clover account to join this Circle.",
        401,
      );
    }
    if (!viewer.onboardingCompleted) {
      throw new CircleAccessError(
        "Finish your Clover setup before joining this Circle.",
        409,
      );
    }
    const user = viewer.user;
    const invitation = await findInvitation(token);
    if (!invitation || invitation.status !== "pending") {
      throw new CircleAccessError(
        "This Circle invitation is no longer available.",
        404,
      );
    }
    if (invitation.expiresAt <= new Date()) {
      await prisma.circleInvitation.update({
        where: { id: invitation.id },
        data: { status: "expired" },
      });
      throw new CircleAccessError("This Circle invitation has expired.", 410);
    }
    if (
      invitation.email &&
      invitation.email.toLowerCase() !== user.email.toLowerCase()
    ) {
      throw new CircleAccessError(
        `This invitation was sent to ${invitation.email}. Sign in with that email to accept it.`,
        403,
      );
    }

    await prisma.$transaction(async (tx) => {
      const currentMembership = await tx.circleMembership.findFirst({
        where: { circleId: invitation.circleId, userId: user.id },
      });
      const guestMembership = currentMembership
        ? null
        : await tx.circleMembership.findFirst({
            where: {
              circleId: invitation.circleId,
              userId: null,
              status: "invited",
              OR: [
                { email: { equals: user.email, mode: "insensitive" } },
                ...(invitation.displayName
                  ? [
                      {
                        displayName: {
                          equals: invitation.displayName,
                          mode: "insensitive" as const,
                        },
                      },
                    ]
                  : []),
              ],
            },
          });

      if (currentMembership) {
        await tx.circleMembership.update({
          where: { id: currentMembership.id },
          data: {
            status: "active",
            joinedAt: new Date(),
            leftAt: null,
          },
        });
      } else if (guestMembership) {
        await tx.circleMembership.update({
          where: { id: guestMembership.id },
          data: {
            userId: user.id,
            email: user.email,
            role: invitation.role,
            status: "active",
            joinedAt: new Date(),
          },
        });
      } else {
        await tx.circleMembership.create({
          data: {
            circleId: invitation.circleId,
            userId: user.id,
            displayName:
              [user.firstName, user.lastName].filter(Boolean).join(" ") ||
              user.email.split("@")[0],
            email: user.email,
            role: invitation.role,
            status: "active",
            joinedAt: new Date(),
          },
        });
      }

      await tx.circleInvitation.update({
        where: { id: invitation.id },
        data: { status: "accepted", acceptedAt: new Date() },
      });
      const group = await tx.splitBillGroup.findUnique({
        where: { circleId: invitation.circleId },
      });
      if (group && group.userId !== user.id) {
        await tx.splitBillGroupCollaborator.upsert({
          where: { groupId_userId: { groupId: group.id, userId: user.id } },
          update: {},
          create: { groupId: group.id, userId: user.id },
        });
      }
      await tx.circleActivity.create({
        data: {
          circleId: invitation.circleId,
          actorUserId: user.id,
          action: "invitation_accepted",
          entityType: "membership",
          summary: `${[user.firstName, user.lastName].filter(Boolean).join(" ") || user.email.split("@")[0]} joined the Circle.`,
          metadata: { role: invitation.role },
        },
      });
    });

    void capturePostHogServerEvent("circle_invitation_accepted", user.id, {
      circle_id: invitation.circleId,
      circle_type: invitation.circle.type,
      accepted_role: invitation.role,
    });
    return NextResponse.json({ ok: true, circleId: invitation.circleId });
  } catch (error) {
    const response = getCircleErrorResponse(error);
    return NextResponse.json(
      { error: response.message },
      { status: response.status },
    );
  }
}
