import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { deleteAccountsAndImportArtifacts } from "@/lib/account-deletion";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { assertWorkspaceAccess } from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

const resolveUserId = async () => {
  if (await isLocalDevHost()) {
    return "local-admin";
  }

  const { userId } = await requireAuth();
  return userId;
};

export async function DELETE(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const userId = await resolveUserId();
    const payload = (await request.json().catch(() => null)) as {
      workspaceId?: string;
      accountIds?: string[];
    } | null;
    const workspaceId = String(payload?.workspaceId ?? "").trim();
    const accountIds = Array.from(
      new Set((Array.isArray(payload?.accountIds) ? payload.accountIds : []).map((id) => String(id).trim()).filter(Boolean))
    );

    if (!workspaceId || accountIds.length === 0) {
      return NextResponse.json({ error: "This institution could not be identified." }, { status: 400 });
    }
    if (accountIds.length > 100) {
      return NextResponse.json({ error: "This institution has too many linked accounts to delete at once." }, { status: 400 });
    }

    await assertWorkspaceAccess(userId, workspaceId);
    const matchingAccounts = await prisma.account.findMany({
      where: { workspaceId, id: { in: accountIds } },
      select: { id: true },
    });
    if (matchingAccounts.length !== accountIds.length) {
      return NextResponse.json({ error: "One or more linked accounts are no longer available. Refresh and try again." }, { status: 409 });
    }

    const deletionResult = await prisma.$transaction(async (tx) =>
      deleteAccountsAndImportArtifacts(tx, {
        workspaceId,
        accountIds,
      })
    );

    return NextResponse.json({
      deleted: deletionResult.accountsDeleted,
      deletedTransactions: deletionResult.transactionsDeleted,
    });
  } catch (error) {
    console.error("[institution-delete]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete this institution." },
      { status: 400 }
    );
  }
}
