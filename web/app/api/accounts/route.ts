import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { NextResponse } from "next/server";
import { hasCompatibleTable, loadAccountRules, upsertAccountRule } from "@/lib/data-engine";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { userId } = await requireAuth();
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    await assertWorkspaceAccess(userId, workspaceId);

    const accounts = await prisma.account.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    });
    const accountRules = await loadAccountRules(workspaceId);

    const statementCheckpoints = await (async () => {
      if (!(await hasCompatibleTable("AccountStatementCheckpoint"))) {
        return [];
      }

      const checkpoints = await prisma.accountStatementCheckpoint.findMany({
        where: { workspaceId },
        orderBy: [
          { statementEndDate: "desc" },
          { createdAt: "desc" },
        ],
      });

      const latestByAccountId = new Map<string, (typeof checkpoints)[number]>();
      for (const checkpoint of checkpoints) {
        if (!checkpoint.accountId) {
          continue;
        }

        const current = latestByAccountId.get(checkpoint.accountId);
        const checkpointTime = Math.max(
          checkpoint.statementEndDate?.getTime() ?? 0,
          checkpoint.createdAt.getTime()
        );
        const currentTime = current
          ? Math.max(
              current.statementEndDate?.getTime() ?? 0,
              current.createdAt.getTime()
            )
          : -1;

        if (!current || checkpointTime >= currentTime) {
          latestByAccountId.set(checkpoint.accountId, checkpoint);
        }
      }

      return Array.from(latestByAccountId.values()).map((checkpoint) => ({
        ...checkpoint,
        openingBalance: checkpoint.openingBalance?.toString() ?? null,
        endingBalance: checkpoint.endingBalance?.toString() ?? null,
        statementStartDate: checkpoint.statementStartDate?.toISOString() ?? null,
        statementEndDate: checkpoint.statementEndDate?.toISOString() ?? null,
        createdAt: checkpoint.createdAt.toISOString(),
        updatedAt: checkpoint.updatedAt.toISOString(),
        sourceMetadata: checkpoint.sourceMetadata ?? null,
      }));
    })();

    return NextResponse.json({ accounts, accountRules, statementCheckpoints });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireAuth();
    const body = await request.json();
    const workspaceId = String(body?.workspaceId || "");
    const name = String(body?.name || "").trim();

    if (!workspaceId || !name) {
      return NextResponse.json({ error: "workspaceId and name are required" }, { status: 400 });
    }

    await assertWorkspaceAccess(userId, workspaceId);

    const account = await prisma.account.create({
      data: {
        workspaceId,
        name,
        institution: body?.institution ? String(body.institution) : null,
        type: body?.type || "bank",
        currency: body?.currency ? String(body.currency).toUpperCase() : "PHP",
        source: body?.source ? String(body.source) : "upload",
      },
    });

    void upsertAccountRule({
      workspaceId,
      accountId: account.id,
      accountName: account.name,
      institution: account.institution,
      accountType: account.type,
      source: "manual_account_creation",
      confidence: 100,
    }).catch(() => null);

    return NextResponse.json({ account });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
