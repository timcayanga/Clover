import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";

const findGroup = (token: string) => prisma.splitBillGroup.findUnique({
  where: { shareToken: token },
  select: { id: true, userId: true, name: true, avatarUrl: true, members: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, name: true, sortOrder: true } } },
});

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const group = await findGroup((await params).token);
  if (!group) return NextResponse.json({ error: "Group invite not found" }, { status: 404 });
  return NextResponse.json({ group: { name: group.name, avatarUrl: group.avatarUrl, members: group.members } });
}

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const user = await getSplitBillCurrentUser();
  const group = await findGroup((await params).token);
  if (!group) return NextResponse.json({ error: "Group invite not found" }, { status: 404 });
  if (group.userId !== user.id) {
    await prisma.splitBillGroupCollaborator.upsert({ where: { groupId_userId: { groupId: group.id, userId: user.id } }, update: {}, create: { groupId: group.id, userId: user.id } });
  }
  return NextResponse.json({ ok: true });
}
