import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminDataEnvironment, requireAdminAuth } from "@/lib/admin";
import { deleteAccountsAndImportArtifacts, deleteWorkspaceTransactions } from "@/lib/account-deletion";
import { wipeLocalUserData } from "@/lib/account-management";
import { capturePostHogServerEvent } from "@/lib/analytics";
import { prisma } from "@/lib/prisma";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { createAdminDataSnapshot, recordAdminSupportAction } from "@/lib/admin-support";

export const dynamic = "force-dynamic";

const confirmations = {
  transactions: "DELETE TRANSACTIONS",
  accounts: "DELETE ACCOUNTS",
  all: "DELETE ALL DATA",
} as const;

const schema = z.object({
  scope: z.enum(["transactions", "accounts", "all"]),
  confirmation: z.string(),
});

export async function DELETE(request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    assertTrustedRequestOrigin(request);
    const admin = await requireAdminAuth();
    const { userId } = await context.params;
    const payload = schema.parse(await request.json());
    if (payload.confirmation !== confirmations[payload.scope]) {
      return NextResponse.json({ error: `Type ${confirmations[payload.scope]} to confirm.` }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: { id: userId, environment: getAdminDataEnvironment() },
      select: {
        id: true,
        clerkUserId: true,
        workspaces: { select: { id: true, accounts: { select: { id: true } } } },
      },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const snapshot = await createAdminDataSnapshot(user.id, admin.userId);
    let deletedTransactions = 0;
    let deletedAccounts = 0;

    if (payload.scope === "all") {
      const wiped = await wipeLocalUserData(user.clerkUserId, { reseedStarterWorkspace: true });
      if (!wiped) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
    } else if (payload.scope === "transactions") {
      deletedTransactions = await prisma.$transaction((tx) =>
        deleteWorkspaceTransactions(tx, { workspaceId: { in: user.workspaces.map((workspace) => workspace.id) } })
      );
    } else {
      const result = await prisma.$transaction(async (tx) => {
        let accounts = 0;
        let transactions = 0;
        for (const workspace of user.workspaces) {
          const deletion = await deleteAccountsAndImportArtifacts(tx, {
            workspaceId: workspace.id,
            accountIds: workspace.accounts.map((account) => account.id),
            includeWorkspaceImportArtifacts: true,
          });
          accounts += deletion.accountsDeleted;
          transactions += deletion.transactionsDeleted;
        }
        return { accounts, transactions };
      });
      deletedAccounts = result.accounts;
      deletedTransactions = result.transactions;
    }

    await recordAdminSupportAction({
      actorUserId: admin.userId,
      targetUserId: user.id,
      targetClerkUserId: user.clerkUserId,
      action: `delete_${payload.scope}_data`,
      metadata: {
        snapshot_id: snapshot.id,
        deleted_accounts: deletedAccounts,
        deleted_transactions: deletedTransactions,
      },
    });
    void capturePostHogServerEvent("admin_support_action", admin.userId, {
      action: `delete_${payload.scope}_data`,
      target_user_id: user.id,
    });

    return NextResponse.json({
      success: true,
      scope: payload.scope,
      snapshotId: snapshot.id,
      deletedAccounts,
      deletedTransactions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete user data.";
    if (message === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid deletion request." }, { status: 400 });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
