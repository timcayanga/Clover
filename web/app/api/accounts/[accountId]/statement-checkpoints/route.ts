import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { hasCompatibleTable } from "@/lib/data-engine";

export const dynamic = "force-dynamic";

const normalizeWhitespace = (value: string) => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

const extractLastFourDigits = (value?: string | null) => {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, "");
  if (digits.length < 4) return null;
  return digits.slice(-4);
};

const normalizeAccountKey = (accountName?: string | null, institution?: string | null) =>
  normalizeWhitespace(
    `${institution ?? ""} ${extractLastFourDigits(accountName) ?? normalizeWhitespace(String(accountName ?? ""))}`
  )
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export async function GET(_request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const { userId } = await requireAuth();
    const { accountId } = await params;

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        workspaceId: true,
        name: true,
        institution: true,
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
      where: { workspaceId: account.workspaceId },
      orderBy: [
        { statementEndDate: "desc" },
        { createdAt: "desc" },
      ],
    });

    const accountKey = normalizeAccountKey(account.name, account.institution);
    const filteredCheckpoints = checkpoints.filter((checkpoint) => {
      if (checkpoint.accountId === accountId) {
        return true;
      }

      const sourceMetadata =
        checkpoint.sourceMetadata && typeof checkpoint.sourceMetadata === "object" && !Array.isArray(checkpoint.sourceMetadata)
          ? (checkpoint.sourceMetadata as Record<string, unknown>)
          : null;
      const checkpointKey = normalizeAccountKey(
        typeof sourceMetadata?.accountName === "string" ? sourceMetadata.accountName : null,
        typeof sourceMetadata?.institution === "string" ? sourceMetadata.institution : null
      );
      return checkpointKey === accountKey;
    });

    return NextResponse.json({
      checkpoints: filteredCheckpoints.map((checkpoint) => ({
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
