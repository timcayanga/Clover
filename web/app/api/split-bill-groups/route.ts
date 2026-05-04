import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";

export const dynamic = "force-dynamic";

const groupMemberSchema = z.object({
  name: z.string().trim().min(1),
  sortOrder: z.number().int().optional().default(0),
});

const createGroupSchema = z.object({
  name: z.string().trim().min(1),
  members: z.array(groupMemberSchema).default([]),
});

export async function GET() {
  try {
    const user = await getSplitBillCurrentUser();
    const groups = await prisma.splitBillGroup.findMany({
      where: { userId: user.id },
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
    const user = await getSplitBillCurrentUser();
    const body = createGroupSchema.parse(await request.json());

    const group = await prisma.splitBillGroup.create({
      data: {
        userId: user.id,
        name: body.name,
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

    return NextResponse.json({ group }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create group",
      },
      { status: 400 }
    );
  }
}
