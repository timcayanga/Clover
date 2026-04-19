import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { hasCompatibleTable } from "@/lib/data-engine";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const { userId } = await requireAuth();
    const { accountId } = await params;

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        workspaceId: true,
      },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, account.workspaceId);

    if (!(await hasCompatibleTable("AccountStatementCheckpoint"))) {
      return NextResponse.json({ checkpoints: [] });
    }

    const checkpoints = await prisma.accountStatementCheckpoint.findMany({
      where: { accountId },
      orderBy: [
        { statementEndDate: "desc" },
        { createdAt: "desc" },
      ],
    });

    return NextResponse.json({
      checkpoints: checkpoints.map((checkpoint) => ({
        ...checkpoint,
        openingBalance: checkpoint.openingBalance?.toString() ?? null,
        endingBalance: checkpoint.endingBalance?.toString() ?? null,
        statementStartDate: checkpoint.statementStartDate?.toISOString() ?? null,
        statementEndDate: checkpoint.statementEndDate?.toISOString() ?? null,
        createdAt: checkpoint.createdAt.toISOString(),
        updatedAt: checkpoint.updatedAt.toISOString(),
        sourceMetadata: checkpoint.sourceMetadata ?? null,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
