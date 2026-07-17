import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import { pickSplitBillAvatarUrl } from "@/lib/split-bill-avatars";
import { upsertSplitBillPeopleFromNames } from "@/lib/split-bill-people";
import { getUserDisplayName } from "@/lib/user-display-name";
import { assertTrustedRequestOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";

const groupMemberSchema = z.object({
  name: z.string().trim().min(1),
  sortOrder: z.number().int().optional().default(0),
});

const createGroupSchema = z.object({
  name: z.string().trim().min(1),
  avatarUrl: z.string().trim().nullable().optional(),
  members: z.array(groupMemberSchema).default([]),
});

export async function GET() {
  try {
    const user = await getSplitBillCurrentUser();
    const groups = await prisma.splitBillGroup.findMany({
      where: { OR: [{ userId: user.id }, { collaborators: { some: { userId: user.id } } }], archivedAt: null },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      include: {
        members: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
        _count: {
          select: {
            bills: true,
          },
        },
      },
    });

    return NextResponse.json({ groups });
  } catch (error) {
    return NextResponse.json({ error: "Unable to load groups" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const user = await getSplitBillCurrentUser();
    const body = createGroupSchema.parse(await request.json());

    const { group, people } = await prisma.$transaction(async (tx) => {
      const avatarUrl = body.avatarUrl?.trim() || pickSplitBillAvatarUrl(body.name);
      const circle = await tx.circle.create({
        data: {
          ownerUserId: user.id,
          name: body.name,
          type: "custom",
          avatarUrl,
          memberships: {
            create: [
              {
                userId: user.id,
                displayName: getUserDisplayName(user),
                email: user.email,
                role: "organizer",
                status: "active",
                joinedAt: new Date(),
              },
              ...body.members.map((member) => ({
                displayName: member.name,
                role: "participant" as const,
                status: "invited" as const,
              })),
            ],
          },
        },
      });
      const group = await tx.splitBillGroup.create({
        data: {
          userId: user.id,
          circleId: circle.id,
          name: body.name,
          avatarUrl,
          members: {
            create: body.members.map((member) => ({
              name: member.name,
              sortOrder: member.sortOrder ?? 0,
            })),
          },
        },
        include: {
          members: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          },
          _count: {
            select: {
              bills: true,
            },
          },
        },
      });

      const people = await upsertSplitBillPeopleFromNames(
        tx,
        user.id,
        body.members.map((member) => member.name)
      );

      await tx.circleActivity.create({
        data: {
          circleId: circle.id,
          actorUserId: user.id,
          action: "circle_created_from_split_bills",
          entityType: "circle",
          entityId: circle.id,
          summary: `${getUserDisplayName(user)} created ${circle.name} from Split Bills.`,
        },
      });

      return { group, people };
    });

    return NextResponse.json({ group, people }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create group",
      },
      { status: 400 }
    );
  }
}
