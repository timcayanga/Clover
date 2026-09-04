import { randomBytes } from "node:crypto";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { circleRoles, circleTypes } from "@/lib/circles";
import { getCircleCurrentUser, getCircleErrorResponse } from "@/lib/circle-access";
import { loadCirclesWorkspaceData } from "@/lib/circle-loaders";
import { loadCirclesDirectoryData } from "@/lib/circle-directory";
import { getUserDisplayName } from "@/lib/user-display-name";
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

export const dynamic = "force-dynamic";

const memberSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  role: z.enum(circleRoles).optional().default("member"),
});

const createCircleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(circleTypes).default("custom"),
  description: z.string().trim().max(300).nullable().optional(),
  avatarUrl: z.string().trim().max(200_000).nullable().optional(),
  color: z
    .enum(["teal", "green", "blue", "violet", "coral", "gold"])
    .default("teal"),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase())
    .default("PHP"),
  members: z.array(memberSchema).max(30).default([]),
});

export async function GET(request: Request) {
  try {
    const user = await getCircleCurrentUser();
    const params = new URL(request.url).searchParams;
    const circleId = params.get("circle");
    const data = params.get("view") === "directory"
      ? await loadCirclesDirectoryData(user)
      : await loadCirclesWorkspaceData(user, circleId || undefined);
    if (circleId && !data.circles.some((circle) => circle.id === circleId)) {
      return NextResponse.json({ error: "Circle not found or you no longer have access." }, { status: 404 });
    }
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const failure = getCircleErrorResponse(error);
    return NextResponse.json(
      { error: failure.message },
      { status: failure.status },
    );
  }
}

export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    assertContentLengthWithin(request, 250_000);
    const user = await getCircleCurrentUser();
    const body = createCircleSchema.parse(await request.json());
    const ownerName = getUserDisplayName(user);
    const uniqueMembers = body.members.filter(
      (member, index, members) =>
        member.email.toLowerCase() !== user.email.toLowerCase() &&
        members.findIndex(
          (candidate) =>
            candidate.email.toLowerCase() === member.email.toLowerCase(),
        ) === index,
    );
    const expiresAt = new Date(
      Date.now() + CIRCLE_INVITATION_DURATION_DAYS * 24 * 60 * 60 * 1000,
    );
    const invitationDrafts = uniqueMembers.map((member) => ({
      ...member,
      token: randomBytes(24).toString("hex"),
      displayName: getCircleInviteeDisplayName(member.email, member.displayName),
    }));

    const circle = await prisma.$transaction(async (tx) => {
      const created = await tx.circle.create({
        data: {
          ownerUserId: user.id,
          name: body.name,
          type: body.type,
          description: body.description || null,
          avatarUrl: body.avatarUrl || null,
          color: body.color,
          currency: body.currency,
          memberships: {
            create: [
              {
                userId: user.id,
                displayName: ownerName,
                email: user.email,
                role: "organizer",
                status: "active",
                joinedAt: new Date(),
              },
              ...invitationDrafts.map((member) => ({
                displayName: member.displayName,
                email: member.email,
                role: member.role,
                status: "invited" as const,
              })),
            ],
          },
        },
      });

      await tx.splitBillGroup.create({
        data: {
          userId: user.id,
          circleId: created.id,
          name: created.name,
          avatarUrl: created.avatarUrl,
          members: {
            create: invitationDrafts.map((member, index) => ({
              name: member.displayName,
              sortOrder: index,
            })),
          },
        },
      });

      if (invitationDrafts.length > 0) {
        await tx.circleInvitation.createMany({
          data: invitationDrafts.map((invitation) => ({
            circleId: created.id,
            invitedByUserId: user.id,
            email: invitation.email,
            displayName: invitation.displayName,
            role: invitation.role,
            token: invitation.token,
            expiresAt,
          })),
        });
      }

      await tx.circleActivity.create({
        data: {
          circleId: created.id,
          actorUserId: user.id,
          action: "circle_created",
          entityType: "circle",
          entityId: created.id,
          summary: `${ownerName} created ${created.name}.`,
          metadata: {
            type: created.type,
            memberCount: invitationDrafts.length + 1,
            invitationsSent: invitationDrafts.length,
          },
        },
      });

      return created;
    });

    void capturePostHogServerEvent("circle_created", user.id, {
      circle_id: circle.id,
      circle_type: circle.type,
      initial_member_count: invitationDrafts.length + 1,
    });

    const origin = new URL(request.url).origin;
    after(async () => {
      const deliveryResults = await Promise.allSettled(
        invitationDrafts.map((invitation) =>
          sendCircleInvitationEmail({
            to: invitation.email,
            circleName: circle.name,
            inviterName: ownerName,
            inviteUrl: new URL(
              getCircleInvitationPath(invitation.token),
              origin,
            ).toString(),
            expiresAt,
          }),
        ),
      );
      deliveryResults.forEach((result, index) => {
        if (result.status === "rejected") {
          console.error("[Circles] Initial invitation email failed", {
            circleId: circle.id,
            invitationEmail: invitationDrafts[index]?.email,
            error:
              result.reason instanceof Error
                ? result.reason.message
                : "Unknown email error",
          });
        }
      });
    });

    return NextResponse.json(
      {
        circleId: circle.id,
        invitations: invitationDrafts.map((invitation) => ({
          email: invitation.email,
          shareUrl: getCircleInvitationPath(invitation.token),
          emailQueued: true,
        })),
      },
      { status: 201 },
    );
  } catch (error) {
    const failure = getCircleErrorResponse(error);
    return NextResponse.json(
      { error: failure.message },
      { status: failure.status },
    );
  }
}
