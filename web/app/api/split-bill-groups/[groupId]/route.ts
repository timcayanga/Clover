import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";

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
});

export async function PATCH(request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const user = await getSplitBillCurrentUser();
    const { groupId } = await params;
    const body = updateGroupSchema.parse(await request.json());

    const existing = await prisma.splitBillGroup.findFirst({
      where: {
        id: groupId,
        userId: user.id,
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
          avatarUrl: body.avatarUrl?.trim() || null,
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

      await Promise.all(
        body.members.map((member) =>
          tx.splitBillPerson.upsert({
            where: {
              userId_name: {
                userId: user.id,
                name: member.name,
              },
            },
            create: {
              userId: user.id,
              name: member.name,
            },
            update: {},
          })
        )
      );

      return tx.splitBillGroup.findUniqueOrThrow({
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
    });

    return NextResponse.json({ group });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to update group",
      },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const user = await getSplitBillCurrentUser();
    const { groupId } = await params;
    const existing = await prisma.splitBillGroup.findFirst({
      where: {
        id: groupId,
        userId: user.id,
      },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    await prisma.splitBillGroup.delete({
      where: { id: groupId },
    });

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
