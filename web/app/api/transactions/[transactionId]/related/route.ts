import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ transactionId: string }> },
) {
  try {
    const { userId } = await requireAuth(),
      { transactionId } = await params;
    const transaction = await prisma.transaction.findFirst({
      where: { id: transactionId, deletedAt: null },
      select: { workspaceId: true, category: { select: { name: true } } },
    });
    if (!transaction)
      return NextResponse.json(
        { error: "Transaction not found." },
        { status: 404 },
      );
    const requestedWorkspace = new URL(_request.url).searchParams.get(
      "workspaceId",
    );
    if (requestedWorkspace && requestedWorkspace !== transaction.workspaceId)
      return NextResponse.json(
        { error: "Transaction not found." },
        { status: 404 },
      );
    await assertWorkspaceAccess(userId, transaction.workspaceId);
    const [bill, circles, recurring] = await Promise.all([
      prisma.splitBill.findUnique({
        where: { transactionId },
        select: {
          id: true,
          title: true,
          participants: { select: { name: true } },
          userId: true,
        },
      }),
      prisma.circleSharedTransaction.findMany({
        where: {
          transactionId,
          circle: {
            archivedAt: null,
            OR: [
              { owner: { clerkUserId: userId } },
              {
                memberships: {
                  some: { user: { clerkUserId: userId }, status: "active" },
                },
              },
            ],
          },
        },
        select: {
          circle: { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
      prisma.financialCommitment.findMany({
        where: {
          transactionId,
          workspaceId: transaction.workspaceId,
          status: { not: "resolved" },
        },
        select: { id: true, title: true, categoryName: true },
      }),
    ]);
    const owner = bill
      ? await prisma.user.findUnique({
          where: { id: bill.userId },
          select: { clerkUserId: true },
        })
      : null;
    const people =
      bill && owner?.clerkUserId === userId
        ? await prisma.splitBillPerson.findMany({
            where: {
              userId: bill.userId,
              name: { in: bill.participants.map((p) => p.name) },
            },
            select: { name: true, avatarUrl: true },
          })
        : [];
    return NextResponse.json(
      {
        splitBill:
          bill && owner?.clerkUserId === userId
            ? {
                id: bill.id,
                title: bill.title,
                people: bill.participants.map((p) => ({
                  ...p,
                  avatarUrl:
                    people.find((x) => x.name === p.name)?.avatarUrl ?? null,
                })),
              }
            : null,
        circles: circles.map((e) => e.circle),
        recurring: recurring.map((item) => ({
          ...item,
          categoryName: item.categoryName ?? transaction.category?.name ?? null,
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to load linked items." },
      { status: 403 },
    );
  }
}
