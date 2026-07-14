import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";

export async function POST(_request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const user = await getSplitBillCurrentUser();
  const { groupId } = await params;
  const group = await prisma.splitBillGroup.findFirst({ where: { id: groupId, userId: user.id }, select: { id: true, shareToken: true } });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const shareToken = group.shareToken ?? randomUUID().replaceAll("-", "");
  if (!group.shareToken) await prisma.splitBillGroup.update({ where: { id: group.id }, data: { shareToken } });
  return NextResponse.json({ shareUrl: `/split-bill/group-invite/${shareToken}` });
}
