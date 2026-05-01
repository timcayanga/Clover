import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

const resolveUserId = async () => {
  if (await isLocalDevHost()) {
    return "local-admin";
  }

  const { userId } = await requireAuth();
  return userId;
};

export async function DELETE(_request: Request, { params }: { params: Promise<{ accountId: string; dividendId: string }> }) {
  try {
    const userId = await resolveUserId();
    const { accountId, dividendId } = await params;

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, workspaceId: true, type: true },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, account.workspaceId);

    if (account.type !== "investment") {
      return NextResponse.json({ error: "Only investment accounts can have dividends." }, { status: 400 });
    }

    const dividend = await prisma.investmentDividend.findFirst({
      where: {
        id: dividendId,
        accountId,
      },
    });

    if (!dividend) {
      return NextResponse.json({ error: "Dividend not found" }, { status: 404 });
    }

    await prisma.investmentDividend.delete({
      where: { id: dividendId },
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete dividend." }, { status: 400 });
  }
}
