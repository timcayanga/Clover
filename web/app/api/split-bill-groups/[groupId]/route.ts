import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import { upsertSplitBillPeopleFromNames } from "@/lib/split-bill-people";
import { assertTrustedRequestOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";

const groupMemberSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1),
  sortOrder: z.number().int().optional().default(0),
});

const updateGroupSchema = z.object({
  name: z.string().trim().min(1),
  avatarUrl: z.string().trim().nullable().optional(),
  members: z.array(groupMemberSchema).default([]),
  archivedAt: z.string().nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    assertTrustedRequestOrigin(request);
    const user = await getSplitBillCurrentUser();
    const { groupId } = await params;
    const body = updateGroupSchema.parse(await request.json());

    const existing = await prisma.splitBillGroup.findFirst({
      where: {
        id: groupId,
        userId: user.id,
      },
      include: {
        members: { select: { name: true } },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const group = await prisma.$transaction(async (tx) => {
      await tx.splitBillGroup.update({
        where: { id: groupId },
        data: {
          name: body.name,
          avatarUrl:
            body.avatarUrl === undefined ? existing.avatarUrl ?? null : body.avatarUrl?.trim() || null,
          archivedAt: body.archivedAt === undefined ? existing.archivedAt : body.archivedAt ? new Date(body.archivedAt) : null,
        },
      });

      await tx.splitBillGroupMember.deleteMany({
        where: { groupId },
      });

      await tx.splitBillGroupMember.createMany({
        data: body.members.map((member, index) => ({
          groupId,
          name: member.name,
          sortOrder: member.sortOrder ?? index,
        })),
      });

      if (existing.circleId) {
        await tx.circle.update({
          where: { id: existing.circleId },
          data: {
            name: body.name,
            avatarUrl: body.avatarUrl === undefined ? existing.avatarUrl ?? null : body.avatarUrl?.trim() || null,
            archivedAt: body.archivedAt === undefined ? undefined : body.archivedAt ? new Date(body.archivedAt) : null,
          },
        });
        const guestMemberships = await tx.circleMembership.findMany({
          where: { circleId: existing.circleId, userId: null },
        });
        const previousGroupMemberNames = new Set(
          existing.members.map((member) => member.name.trim().toLowerCase()),
        );
        const retainedGuestIds = new Set<string>();
        for (const member of body.members) {
          const matched = guestMemberships.find(
            (entry) => entry.displayName.trim().toLowerCase() === member.name.trim().toLowerCase()
          );
          if (matched) {
            retainedGuestIds.add(matched.id);
            await tx.circleMembership.update({ where: { id: matched.id }, data: { status: "invited" } });
          } else {
            const created = await tx.circleMembership.create({
              data: { circleId: existing.circleId, displayName: member.name, role: "participant", status: "invited" },
            });
            retainedGuestIds.add(created.id);
          }
        }
        const removedGuestIds = guestMemberships
          .filter(
            (membership) =>
              previousGroupMemberNames.has(
                membership.displayName.trim().toLowerCase(),
              ) && !retainedGuestIds.has(membership.id),
          )
          .map((membership) => membership.id);
        if (removedGuestIds.length) {
          await tx.circleMembership.updateMany({
            where: { id: { in: removedGuestIds } },
            data: { status: "removed", leftAt: new Date() },
          });
        }
        await tx.circleActivity.create({
          data: {
            circleId: existing.circleId,
            actorUserId: user.id,
            action: "split_bill_group_updated",
            entityType: "circle",
            entityId: existing.circleId,
            summary: `${body.name} people and Split Bills settings were updated.`,
          },
        });
      }

      const people = await upsertSplitBillPeopleFromNames(
        tx,
        user.id,
        body.members.map((member) => member.name)
      );

      const group = await tx.splitBillGroup.findUniqueOrThrow({
        where: { id: groupId },
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

      return { group, people };
    });

    return NextResponse.json(group);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to update group",
      },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    assertTrustedRequestOrigin(request);
    const user = await getSplitBillCurrentUser();
    const { groupId } = await params;
    const existing = await prisma.splitBillGroup.findFirst({
      where: {
        id: groupId,
        userId: user.id,
      },
      select: { id: true, circleId: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const archivedAt = new Date();
    await prisma.$transaction([
      prisma.splitBillGroup.update({ where: { id: groupId }, data: { archivedAt } }),
      ...(existing.circleId ? [prisma.circle.update({ where: { id: existing.circleId }, data: { archivedAt } })] : []),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to delete group",
      },
      { status: 400 }
    );
  }
}
