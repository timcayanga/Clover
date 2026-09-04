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
  const eligibleAccountWhere = {
    workspaceId,
    ...(candidateAccountIds ? { id: { in: candidateAccountIds } } : {}),
    type: "cash" as const,
    source: "manual",
    currency: { not: defaultCurrency },
    name: { equals: "Cash", mode: "insensitive" as const },
    OR: [
      { institution: null },
      { institution: { equals: "Cash", mode: "insensitive" as const } },
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
      {
        transactions: {
          some: {
            deletedAt: { not: null },
            importFileId: { not: null },
          },
        },
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
  } satisfies Prisma.AccountWhereInput;
  const candidateAccounts = await tx.account.findMany({
    where: eligibleAccountWhere,
    select: {
      id: true,
      name: true,
      currency: true,
    },
  });
  const candidateIds = candidateAccounts.map((account) => account.id);
  const candidateCurrencies = Array.from(new Set(candidateAccounts.map((account) => account.currency)));
  const retainedCurrencyAccounts = candidateCurrencies.length > 0
    ? await tx.account.findMany({
        where: {
          workspaceId,
          currency: { in: candidateCurrencies },
          ...(candidateIds.length > 0 ? { id: { notIn: candidateIds } } : {}),
        },
        select: { currency: true },
      })
    : [];
  const currenciesWithAnotherAccount = new Set(retainedCurrencyAccounts.map((account) => account.currency));
  const removableAccounts = candidateAccounts.filter(
    (account) => !currenciesWithAnotherAccount.has(account.currency)
  );
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
      ...eligibleAccountWhere,
      id: { in: removableAccountIds },
    },
  });

  return removableAccountIds;
};
