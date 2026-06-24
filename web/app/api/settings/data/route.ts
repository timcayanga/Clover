import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { hasCompatibleTable } from "@/lib/data-engine";
import { deleteAccountsAndImportArtifacts, deleteOrphanedWorkspaceTransactions, deleteWorkspaceTransactions } from "@/lib/account-deletion";
import { assertTrustedRequestOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";

type DeleteScope = "transactions" | "balances" | "accounts";

export async function DELETE(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
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
      const result = await prisma.$transaction(async (tx) => {
        const deletedTransactionCount = await deleteWorkspaceTransactions(tx, {
          workspaceId,
          date: { lt: cutoff },
        });
        const deletedOrphanedTransactions = await deleteOrphanedWorkspaceTransactions(tx, workspaceId);

        return {
          deleted: deletedTransactionCount + deletedOrphanedTransactions,
          deletedTransactions: deletedTransactionCount,
          deletedOrphanedTransactions,
        };
      });

      return NextResponse.json(result);
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
        },
        select: { id: true },
      })
    ).map((account) => account.id);

    const deletionResult = await prisma.$transaction(async (tx) => {
      return deleteAccountsAndImportArtifacts(tx, {
        workspaceId,
        accountIds,
        includeWorkspaceImportArtifacts: true,
      });
    });

    return NextResponse.json({ deleted: deletionResult.accountsDeleted, deletedTransactions: deletionResult.transactionsDeleted });
  } catch (error) {
    console.error("[settings-data-delete]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete data." },
      { status: 400 }
    );
  }
}
