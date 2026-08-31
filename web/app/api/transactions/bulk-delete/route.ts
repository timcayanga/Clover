import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { hasCompatibleTable } from "@/lib/data-engine";
import { capturePostHogServerEvent } from "@/lib/analytics";

export const dynamic = "force-dynamic";

const bulkDeleteSchema = z.object({
  workspaceId: z.string().min(1),
  transactionIds: z.array(z.string().min(1)).min(1).max(500),
});

const resolveTransactionsRouteUserId = async () => {
  if (await isLocalDevHost()) return "local-admin";
  const { userId } = await requireAuth();
  return userId;
};

export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const payload = bulkDeleteSchema.parse(await request.json());
    const transactionIds = Array.from(new Set(payload.transactionIds));
    const userId = await resolveTransactionsRouteUserId();

    await assertWorkspaceAccess(userId, payload.workspaceId);

    const transactions = await prisma.transaction.findMany({
      where: {
        workspaceId: payload.workspaceId,
        id: { in: transactionIds },
      },
      select: {
        id: true,
        accountId: true,
        importFileId: true,
        deletedAt: true,
        amount: true,
        currency: true,
        type: true,
        reviewStatus: true,
        account: { select: { source: true } },
      },
    });

    const activeTransactions = transactions.filter((transaction) => transaction.deletedAt === null);
    const alreadyDeletedIds = transactions
      .filter((transaction) => transaction.deletedAt !== null)
      .map((transaction) => transaction.id);
    const uploadAccountIds = Array.from(new Set(
      activeTransactions
        .filter((transaction) => transaction.account.source === "upload")
        .map((transaction) => transaction.accountId)
    ));
    const affectedAccountIds = Array.from(new Set(activeTransactions.map((transaction) => transaction.accountId)));
    const hasStatementCheckpoints = activeTransactions.length > 0 && await hasCompatibleTable("AccountStatementCheckpoint");
    const deletedAt = new Date();

    if (activeTransactions.length > 0) {
      await prisma.$transaction(async (tx) => {
        await tx.transaction.updateMany({
          where: {
            workspaceId: payload.workspaceId,
            id: { in: activeTransactions.map((transaction) => transaction.id) },
            deletedAt: null,
          },
          data: { deletedAt },
        });

        if (uploadAccountIds.length > 0) {
          await tx.account.updateMany({
            where: { workspaceId: payload.workspaceId, id: { in: uploadAccountIds } },
            data: { balance: null },
          });
        }

        if (hasStatementCheckpoints) {
          const checkpointScopes = activeTransactions.map((transaction) => ({
            accountId: transaction.accountId,
            ...(transaction.importFileId ? { importFileId: transaction.importFileId } : {}),
          }));
          await tx.accountStatementCheckpoint.updateMany({
            where: { workspaceId: payload.workspaceId, OR: checkpointScopes },
            data: {
              status: "mismatch",
              mismatchReason: "One or more transactions from this statement were deleted by the user.",
            },
          });
        }

        // A statement row can carry rolling balance evidence. Once any sibling
        // is removed, strip those stale balances in the same transaction so a
        // failed cleanup cannot leave a partially applied deletion.
        if (affectedAccountIds.length > 0) {
          await tx.$executeRaw`
            UPDATE "Transaction"
            SET "rawPayload" = "rawPayload" - 'balance'
            WHERE "accountId" IN (${Prisma.join(affectedAccountIds)})
              AND "deletedAt" IS NULL
              AND jsonb_typeof("rawPayload") = 'object'
              AND "rawPayload" ? 'balance'
              AND COALESCE(LOWER("rawPayload" ->> 'kind'), '') <> 'opening_balance'
              AND LOWER(TRIM("merchantRaw")) <> 'beginning balance'
          `;
        }

        await tx.auditLog.createMany({
          data: activeTransactions.map((transaction) => ({
            workspaceId: payload.workspaceId,
            actorUserId: userId,
            action: "transaction_deleted",
            entity: "Transaction",
            entityId: transaction.id,
            metadata: {
              amount: transaction.amount.toString(),
              currency: transaction.currency,
              transactionType: transaction.type,
              reviewStatus: transaction.reviewStatus,
              deletionMode: "bulk",
            },
          })),
        });
      });

      void capturePostHogServerEvent("transaction_deleted", userId, {
        workspace_id: payload.workspaceId,
        transaction_count: activeTransactions.length,
        deletion_mode: "bulk",
      });
      revalidateTag("admin-financial-totals");
    }

    const knownIds = new Set(transactions.map((transaction) => transaction.id));
    return NextResponse.json({
      ok: true,
      deletedIds: activeTransactions.map((transaction) => transaction.id),
      alreadyDeletedIds,
      unresolvedIds: transactionIds.filter((transactionId) => !knownIds.has(transactionId)),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Select between 1 and 500 transactions." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to delete the selected transactions." }, { status: 400 });
  }
}
