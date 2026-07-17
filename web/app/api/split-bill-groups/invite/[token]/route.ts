import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import { assertTrustedRequestOrigin } from "@/lib/request-security";

const findGroup = (token: string) => prisma.splitBillGroup.findUnique({
  where: { shareToken: token },
  select: { id: true, userId: true, circleId: true, name: true, avatarUrl: true, members: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, name: true, sortOrder: true } } },
});

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const group = await findGroup((await params).token);
  if (!group) return NextResponse.json({ error: "Group invite not found" }, { status: 404 });
  return NextResponse.json({ group: { name: group.name, avatarUrl: group.avatarUrl, members: group.members } });
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  assertTrustedRequestOrigin(request);
  const user = await getSplitBillCurrentUser();
  const group = await findGroup((await params).token);
  if (!group) return NextResponse.json({ error: "Group invite not found" }, { status: 404 });
  if (group.userId !== user.id) {
    await prisma.$transaction(async (tx) => {
      await tx.splitBillGroupCollaborator.upsert({ where: { groupId_userId: { groupId: group.id, userId: user.id } }, update: {}, create: { groupId: group.id, userId: user.id } });
      if (group.circleId) {
        await tx.circleMembership.upsert({
          where: { circleId_userId: { circleId: group.circleId, userId: user.id } },
          update: { status: "active", joinedAt: new Date(), leftAt: null },
          create: {
            circleId: group.circleId,
            userId: user.id,
            displayName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email.split("@")[0],
            email: user.email,
            role: "member",
            status: "active",
            joinedAt: new Date(),
          },
        });
      }
    });
  }
  return NextResponse.json({ ok: true });
}
