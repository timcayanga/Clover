import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { hasCompatibleTable } from "@/lib/data-engine";

export const dynamic = "force-dynamic";

type DeleteScope = "transactions" | "balances";

export async function DELETE(request: Request) {
  try {
    const { userId } = await requireAuth();
    const payload = (await request.json().catch(() => null)) as {
      workspaceId?: string;
      beforeDate?: string;
      scope?: DeleteScope;
    } | null;

    const workspaceId = String(payload?.workspaceId ?? "");
    const beforeDate = String(payload?.beforeDate ?? "");
    const scope = payload?.scope;

    if (!workspaceId || !beforeDate || !scope) {
      return NextResponse.json({ error: "workspaceId, beforeDate, and scope are required" }, { status: 400 });
    }

    const cutoff = new Date(beforeDate);
    if (Number.isNaN(cutoff.getTime())) {
      return NextResponse.json({ error: "beforeDate must be a valid date" }, { status: 400 });
    }

    await assertWorkspaceAccess(userId, workspaceId);

    if (scope === "transactions") {
      const result = await prisma.transaction.deleteMany({
        where: {
          workspaceId,
          date: { lt: cutoff },
        },
      });

      return NextResponse.json({ deleted: result.count });
    }

    if (!(await hasCompatibleTable("AccountStatementCheckpoint"))) {
      return NextResponse.json({ deleted: 0 });
    }

    const result = await prisma.accountStatementCheckpoint.deleteMany({
      where: {
        workspaceId,
        OR: [
          { statementEndDate: { lt: cutoff } },
          {
            statementEndDate: null,
            createdAt: { lt: cutoff },
          },
        ],
      },
    });

    return NextResponse.json({ deleted: result.count });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
