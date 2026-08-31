import { Prisma } from "@prisma/client";
import { normalizeRegionalPreferences } from "@/lib/regional-preferences";

type EmptyCashAccountCleanupOptions = {
  workspaceId: string;
  accountIds?: readonly string[];
  actorUserId: string;
};

export const removeEmptyNonDefaultCashAccounts = async (
  tx: Prisma.TransactionClient,
  { workspaceId, accountIds, actorUserId }: EmptyCashAccountCleanupOptions
) => {
  const candidateAccountIds = accountIds ? Array.from(new Set(accountIds.filter(Boolean))) : null;
  if (!workspaceId || (candidateAccountIds && candidateAccountIds.length === 0)) {
    return [];
  }

  const workspace = await tx.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      user: {
        select: { regionalPreferences: true },
      },
    },
  });
  const defaultCurrency = normalizeRegionalPreferences(workspace?.user.regionalPreferences).baseCurrency;
  const removableAccounts = await tx.account.findMany({
    where: {
      workspaceId,
      ...(candidateAccountIds ? { id: { in: candidateAccountIds } } : {}),
      type: "cash",
      source: "manual",
      currency: { not: defaultCurrency },
      name: { equals: "Cash", mode: "insensitive" },
      OR: [
        { institution: null },
        { institution: { equals: "Cash", mode: "insensitive" } },
      ],
      nameCustomized: false,
      institutionCustomized: false,
      logoCustomized: false,
      AND: [
        {
          OR: [
            { balance: null },
            { balance: new Prisma.Decimal(0) },
          ],
        },
      ],
      transactions: {
        none: { deletedAt: null },
      },
      financialCommitments: { none: {} },
      budgets: { none: {} },
      accountRules: { none: {} },
      circleInvestmentShares: { none: {} },
      finverseAccountLink: null,
    },
    select: {
      id: true,
      name: true,
      currency: true,
    },
  });
  const removableAccountIds = removableAccounts.map((account) => account.id);
  if (removableAccountIds.length === 0) {
    return [];
  }

  await tx.auditLog.createMany({
    data: removableAccounts.map((account) => ({
      workspaceId,
      actorUserId,
      action: "empty_cash_account_removed",
      entity: "Account",
      entityId: account.id,
      metadata: {
        accountName: account.name,
        currency: account.currency,
        reason: "last_active_transaction_deleted",
      },
    })),
  });
  await tx.account.deleteMany({
    where: {
      workspaceId,
      id: { in: removableAccountIds },
    },
  });

  return removableAccountIds;
};
