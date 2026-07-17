import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionContext, isLocalDevHost } from "@/lib/auth";
import { getCircleCurrentUser } from "@/lib/circle-access";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { getCircleInvitationPath } from "@/lib/circle-invitations";
import { getUserDisplayName } from "@/lib/user-display-name";

export const dynamic = "force-dynamic";

const getAuthenticatedUser = async () => {
  if (await isLocalDevHost()) return getCircleCurrentUser();
  const session = await getSessionContext();
  if (session.isGuest) return null;
  return getOrCreateCurrentUser(session.userId);
};

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ invitations: [] }, { status: 401 });
    }

    const invitations = await prisma.circleInvitation.findMany({
      where: {
        email: { equals: user.email, mode: "insensitive" },
        status: "pending",
        expiresAt: { gt: new Date() },
        circle: {
          archivedAt: null,
          memberships: {
            none: { userId: user.id, status: "active" },
          },
        },
      },
      include: {
        circle: { select: { name: true, type: true, avatarUrl: true } },
        invitedBy: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json({
      invitations: invitations.map((invitation) => ({
        id: invitation.id,
        circleName: invitation.circle.name,
        circleType: invitation.circle.type,
        avatarUrl: invitation.circle.avatarUrl,
        invitedBy: getUserDisplayName(invitation.invitedBy),
        role: invitation.role,
        expiresAt: invitation.expiresAt.toISOString(),
        href: getCircleInvitationPath(invitation.token),
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ invitations: [] }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Unable to load Circle invitations." },
      { status: 400 },
    );
  }
}
