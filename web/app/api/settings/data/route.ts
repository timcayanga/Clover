import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { hasCompatibleTable } from "@/lib/data-engine";
import { deleteAccountsAndImportArtifacts } from "@/lib/account-deletion";

export const dynamic = "force-dynamic";

type DeleteScope = "transactions" | "balances" | "accounts";

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

    if (scope === "balances") {
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
    }

    const accountIds = (
      await prisma.account.findMany({
        where: {
          workspaceId,
          type: { not: "cash" },
        },
        select: { id: true },
      })
    ).map((account) => account.id);

    await prisma.$transaction(async (tx) => {
      await deleteAccountsAndImportArtifacts(tx, {
        workspaceId,
        accountIds,
        includeWorkspaceImportArtifacts: true,
      });
    });

    return NextResponse.json({ deleted: accountIds.length });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
