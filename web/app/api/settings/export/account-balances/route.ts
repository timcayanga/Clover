import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { hasCompatibleTable } from "@/lib/data-engine";

export const dynamic = "force-dynamic";

const csvEscape = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) {
    return "";
  }

  return `"${String(value).replace(/"/g, '""')}"`;
};

export async function GET(request: Request) {
  try {
    const { userId } = await requireAuth();
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId") ?? "";

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    await assertWorkspaceAccess(userId, workspaceId);

    const accounts = await prisma.account.findMany({
      where: { workspaceId },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });

    const checkpoints = (await hasCompatibleTable("AccountStatementCheckpoint"))
      ? await prisma.accountStatementCheckpoint.findMany({
          where: { workspaceId },
          orderBy: [{ statementEndDate: "desc" }, { createdAt: "desc" }],
        })
      : [];

    const latestByAccountId = new Map<string, (typeof checkpoints)[number]>();
    for (const checkpoint of checkpoints) {
      if (!checkpoint.accountId) {
        continue;
      }

      const current = latestByAccountId.get(checkpoint.accountId);
      const checkpointTime = Math.max(checkpoint.statementEndDate?.getTime() ?? 0, checkpoint.createdAt.getTime());
      const currentTime = current ? Math.max(current.statementEndDate?.getTime() ?? 0, current.createdAt.getTime()) : -1;

      if (!current || checkpointTime >= currentTime) {
        latestByAccountId.set(checkpoint.accountId, checkpoint);
      }
    }

    const rows = [
      [
        "Account",
        "Institution",
        "Type",
        "Currency",
        "Current Balance",
        "Latest Statement End",
        "Latest Statement Balance",
      ],
      ...accounts.map((account) => {
        const latestCheckpoint = latestByAccountId.get(account.id) ?? null;
        return [
          account.name,
          account.institution ?? "",
          account.type,
          account.currency,
          account.balance?.toString() ?? "",
          latestCheckpoint?.statementEndDate ? latestCheckpoint.statementEndDate.toISOString().slice(0, 10) : "",
          latestCheckpoint?.endingBalance?.toString() ?? "",
        ];
      }),
    ];

    const body = rows.map((row) => row.map(csvEscape).join(",")).join("\n");

    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="clover-account-balances.csv"',
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
