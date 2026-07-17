import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { circleRoles, circleTypes } from "@/lib/circles";
import { getCircleCurrentUser } from "@/lib/circle-access";
import { loadCirclesWorkspaceData } from "@/lib/circle-loaders";
import { getUserDisplayName } from "@/lib/user-display-name";
import { pickSplitBillAvatarUrl } from "@/lib/split-bill-avatars";
import {
  assertContentLengthWithin,
  assertTrustedRequestOrigin,
} from "@/lib/request-security";
import { capturePostHogServerEvent } from "@/lib/analytics";

export const dynamic = "force-dynamic";

const memberSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254).nullable().optional(),
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

export async function GET() {
  try {
    const user = await getCircleCurrentUser();
    return NextResponse.json(await loadCirclesWorkspaceData(user));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to load Circles.",
      },
      { status: 400 },
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
        member.displayName.toLowerCase() !== ownerName.toLowerCase() &&
        members.findIndex(
          (candidate) =>
            candidate.displayName.toLowerCase() ===
            member.displayName.toLowerCase(),
        ) === index,
    );

    const circle = await prisma.$transaction(async (tx) => {
      const created = await tx.circle.create({
        data: {
          ownerUserId: user.id,
          name: body.name,
          type: body.type,
          description: body.description || null,
          avatarUrl: body.avatarUrl || pickSplitBillAvatarUrl(body.name),
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
              ...uniqueMembers.map((member) => ({
                displayName: member.displayName,
                email: member.email || null,
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
            create: uniqueMembers.map((member, index) => ({
              name: member.displayName,
              sortOrder: index,
            })),
          },
        },
      });

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
            memberCount: uniqueMembers.length + 1,
          },
        },
      });

      return created;
    });

    void capturePostHogServerEvent("circle_created", user.id, {
      circle_id: circle.id,
      circle_type: circle.type,
      initial_member_count: uniqueMembers.length + 1,
    });

    return NextResponse.json({ circleId: circle.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to create this Circle.",
      },
      { status: 400 },
    );
  }
}
